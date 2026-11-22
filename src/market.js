/**
 * git operations for market sources and remote plugins.
 *
 * Every command runs through execFile (no shell), and every path argument
 * is derived from a slug validated with `safeSegment`. Errors carry a
 * user-facing message; network/git failures are retryable at the UI level.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { sourceCacheDir, removeManagedDir, safeRmDir, readState } from './store.js'

const SEGMENT_RE = /^[a-z0-9][a-z0-9._-]*$/i

/** In-flight git operations per cache key, so concurrent requests share one clone. */
const GIT_LOCKS = new Map()

async function withGitLock(key, fn) {
  const prev = GIT_LOCKS.get(key) || Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  GIT_LOCKS.set(key, next)
  try {
    return await next
  } finally {
    if (GIT_LOCKS.get(key) === next) GIT_LOCKS.delete(key)
  }
}

export function safeSegment(value, label) {
  if (typeof value !== 'string' || !SEGMENT_RE.test(value)) {
    throw new Error(`invalid ${label}: ${JSON.stringify(value)}`)
  }
  return value
}

/** Resolve a marketplace-relative path while keeping it inside its repository. */
export function pluginPath(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /^[a-z]:|^\\/i.test(path)) throw new Error(`unsafe plugin path: ${path}`)
  const dir = resolve(root, path)
  const rel = relative(resolve(root), dir)
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error(`unsafe plugin path: ${path}`)
  return dir
}

const SHORTHAND_REPO_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\.git)?$/i

/** Normalize remote plugin source objects (Claude `github` / `git-subdir` / `url`). */
export function normalizeRemotePluginSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source
  if (source.source === 'github') {
    const repo = typeof source.repo === 'string' ? source.repo.trim().replace(/^\/+|\.git$/gi, '') : ''
    let url = ''
    if (typeof source.url === 'string' && source.url.trim()) url = source.url.trim()
    else if (SHORTHAND_REPO_RE.test(repo)) url = `https://github.com/${repo}.git`
    return { ...source, ...(url ? { url } : {}) }
  }
  if (source.source === 'git-subdir' && typeof source.url === 'string') {
    const rawUrl = source.url.trim()
    if (SHORTHAND_REPO_RE.test(rawUrl)) {
      return { ...source, url: `https://github.com/${rawUrl.replace(/\.git$/i, '')}.git` }
    }
  }
  return source
}

function readCheckoutOrigin(dir) {
  try {
    const config = readFileSync(join(dir, '.git', 'config'), 'utf8')
    return config.match(/(?:^|\r?\n)\[remote "origin"\][^\n]*\r?\n([\s\S]*?)(?=\r?\n\[|$)/)?.[1]
      .match(/^\s*url\s*=\s*(.+)$/m)?.[1].trim()
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    return undefined
  }
}

/** A marketplace can point back to its own checkout (including a subdirectory). */
export function sourceRepositoryDir(cache, source) {
  const resolved = normalizeRemotePluginSource(source)
  if (!resolved || !['url', 'git-subdir', 'github'].includes(resolved.source) || typeof resolved.url !== 'string') return null
  const repoKey = (value) => {
    try {
      const url = new URL(value)
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase()}`
    } catch { return null }
  }
  try {
    const origin = readCheckoutOrigin(cache)
    if (!origin || !repoKey(resolved.url) || repoKey(origin) !== repoKey(resolved.url)) return null
    const head = readFileSync(join(cache, '.git', 'HEAD'), 'utf8').trim()
    // Reuse only the requested revision; another branch is a different plugin snapshot.
    if (resolved.ref && head !== `ref: refs/heads/${resolved.ref}` && head !== resolved.ref) return null
    if (resolved.sha) {
      const commit = head.startsWith('ref: ') ? readFileSync(join(cache, '.git', head.slice(5)), 'utf8').trim() : head
      if (commit !== resolved.sha) return null
    }
    const dir = resolved.path ? pluginPath(cache, resolved.path) : cache
    return existsSync(dir) ? dir : null
  } catch { return null }
}

function formatGitError(stderr, errorMsg) {
  const text = String(stderr || errorMsg || '').toLowerCase()
  if (text.includes('repository not found') || text.includes('not found')) {
    return 'Git 仓库未找到，请检查名称是否拼写正确或为私有仓库'
  }
  if (text.includes('could not resolve host') || text.includes('unable to access')) {
    return '网络连接失败，无法访问 Git 远程仓库'
  }
  if (text.includes('could not read username') || text.includes('authentication failed')) {
    return '无访问权限，请确认仓库是否为公开仓库'
  }
  const lines = String(stderr || errorMsg || '').trim().split('\n').filter(Boolean)
  const last = lines.pop() || 'Git 操作失败'
  return last.length > 50 ? last.slice(0, 48) + '…' : last
}

function runGit(args, cwd, timeout) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = error.killed && timeout ? 'Git 操作超时，请检查网络后重试' : formatGitError(stderr, error.message)
        reject(new Error(detail))
        return
      }
      resolve(String(stdout))
    })
  })
}

function hasSourceCheckout(dir) {
  const git = join(dir, '.git')
  // Legacy clones wrote their first index after checking out the worktree.
  return existsSync(join(git, 'uph-clone-complete')) || existsSync(join(git, 'index'))
}

function safeSparsePath(root, pathValue) {
  if (typeof pathValue !== 'string' || !pathValue) return ''
  const resolved = pluginPath(root, pathValue)
  const rel = relative(resolve(root), resolved).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return rel === '.' ? '' : rel
}

async function cloneRepoToCache(dir, url, { branch, timeoutMs, sparsePath } = {}) {
  const hadCheckout = hasSourceCheckout(dir)
  if (hadCheckout && readCheckoutOrigin(dir) === url) return false

  if (!hadCheckout) removeManagedDir(dir, { allowTrash: true })
  const parent = dirname(dir)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(join(parent, '.clone-'))
  try {
    const normalizedSparse = safeSparsePath(staging, sparsePath)
    const args = ['clone', '--depth', '1', '--single-branch']
    if (branch) args.push('--branch', String(branch))
    args.push(url, staging)

    let cloned = false
    if (normalizedSparse && /^https?:\/\//i.test(String(url))) {
      try {
        const sparseArgs = ['clone', '--depth', '1', '--single-branch', '--filter=blob:none', '--no-checkout']
        if (branch) sparseArgs.push('--branch', String(branch))
        sparseArgs.push(url, staging)
        await runGit(sparseArgs, undefined, timeoutMs)
        await runGit(['sparse-checkout', 'set', '--cone', '--', normalizedSparse], staging, timeoutMs)
        await runGit(['checkout'], staging, timeoutMs)
        cloned = true
      } catch {
        safeRmDir(staging)
        mkdirSync(staging, { recursive: true })
      }
    }
    if (!cloned) {
      await runGit(args, undefined, timeoutMs)
    }
    // Empty repositories can be cloned successfully without an index.
    writeFileSync(join(staging, '.git', 'uph-clone-complete'), '')
    // The slug can collide with an abandoned preview from another repository.
    // Keep that checkout until the requested clone has completed successfully.
    if (hadCheckout) removeManagedDir(dir, { deferCleanup: true })
    renameSync(staging, dir)
    return true
  } finally {
    safeRmDir(staging)
  }
}

/** Derive a collision-free cache key for a remote plugin repository checkout. */
export function remoteCheckoutKey(url, ref = '') {
  const identity = ref ? `${url}\0${ref}` : String(url)
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 8)
  return `${slugFromUrl(url)}-${digest}`
}

/** Resolve the cache directory for a materialized remote plugin repository. */
export function remoteCheckoutDir(url, ref = '') {
  return join(sourceCacheDir('remote'), remoteCheckoutKey(url, ref))
}

/** Clone a source repository into its cache dir (idempotent, concurrency-safe). */
export async function ensureSourceCloned(sourceId, url, { onCloned } = {}) {
  safeSegment(sourceId, 'source id')
  const dir = sourceCacheDir(sourceId)
  if (sourceId === 'local' || /^local-(?:upload|market):\/\//i.test(String(url || ''))) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }
  if (hasSourceCheckout(dir) && readCheckoutOrigin(dir) === url) return dir

  return withGitLock(`src:${sourceId}`, async () => {
    if (await cloneRepoToCache(dir, url, { timeoutMs: 120_000 })) onCloned?.()
    return dir
  })
}

/** git pull in a source cache dir (waits for any in-flight clone of the same source). */
export async function pullSource(sourceId) {
  safeSegment(sourceId, 'source id')
  if (sourceId === 'local' || /^local-(?:upload|market):\/\//i.test(String(readState().sources.find(source => source.id === sourceId)?.url || ''))) return
  const dir = sourceCacheDir(sourceId)
  const inFlight = GIT_LOCKS.get(`src:${sourceId}`)
  if (inFlight) {
    try { await inFlight } catch { /* clone failure surfaces on the pull's own git call */ }
  }
  if (!existsSync(join(dir, '.git'))) throw new Error('插件源尚未克隆')
  await runGit(['pull', '--ff-only'], dir)
}

/**
 * Materialize a plugin directory for installation.
 *
 * The official marketplace lists three source shapes:
 *   "./plugins/x" | "./external_plugins/x"  → already inside the cache clone
 *   { source: "url", url }                  → clone the repo, use its root
 *   { source: "git-subdir", url, path }     → clone the repo, use a subdir
 *
 * Returns { dir } of a materialized checkout for the plugin, or throws with
 * a user-facing message.
 */
export async function materializePlugin(sourceId, pluginName, source, { refresh = false, sourcePulled = false, allowStaleFallback = false } = {}) {
  safeSegment(sourceId, 'source id')
  safeSegment(pluginName, 'plugin name')

  if (sourceId === 'local') {
    const dir = join(sourceCacheDir('local'), pluginName)
    if (!existsSync(dir)) throw new Error(`本地插件 ${pluginName} 不存在`)
    return { dir }
  }

  if (typeof source === 'string' && (source === './' || source === '.' || source === '' || source.startsWith('./'))) {
    const cache = sourceCacheDir(sourceId)
    const rel = source.replace(/^\.\/?/, '')
    const dir = pluginPath(cache, source)
    if (!existsSync(dir)) throw new Error(`plugin ${pluginName} not found in cache (${rel || 'root'})`)
    return { dir }
  }

  const normalized = normalizeRemotePluginSource(source)
  if (normalized && typeof normalized === 'object') {
    if (['url', 'git-subdir', 'github'].includes(normalized.source)) {
      if (typeof normalized.url !== 'string' || !/^https?:\/\//.test(normalized.url)) {
        throw new Error(`plugin ${pluginName}: unsupported remote url`)
      }
      const sourceCache = sourceCacheDir(sourceId)
      const ownDir = sourceRepositoryDir(sourceCache, normalized)
      if (ownDir) {
        if (refresh && !sourcePulled && existsSync(join(sourceCache, '.git'))) {
          try {
            await pullSource(sourceId)
          } catch (err) {
            if (!allowStaleFallback) throw err
          }
          const refreshedDir = sourceRepositoryDir(sourceCache, normalized)
          if (refreshedDir) return { dir: refreshedDir }
        } else {
          return { dir: ownDir }
        }
      }
      const remoteKey = remoteCheckoutKey(normalized.url, normalized.ref)
      const checkout = join(sourceCacheDir('remote'), remoteKey)
      await withGitLock(`remote:${remoteKey}`, async () => {
        const sparsePath = normalized.source === 'git-subdir' ? normalized.path : undefined
        const cloned = await cloneRepoToCache(checkout, normalized.url, { branch: normalized.ref, sparsePath })
        if (!cloned && refresh) {
          // The cached checkout is otherwise reused forever, so updates would
          // reinstall the first clone's commit. Re-fetch the tracked ref.
          try {
            const args = ['fetch', '--depth', '1', 'origin']
            if (normalized.ref) args.push(String(normalized.ref))
            await runGit(args, checkout)
            await runGit(['reset', '--hard', 'FETCH_HEAD'], checkout)
          } catch (err) {
            if (!allowStaleFallback) throw err
          }
        }
        if (normalized.sha && /^[0-9a-f]{7,64}$/i.test(String(normalized.sha))) {
          try {
            const headSha = (await runGit(['rev-parse', 'HEAD'], checkout)).trim()
            if (headSha !== normalized.sha) {
              await runGit(['fetch', '--depth', '1', 'origin', String(normalized.sha)], checkout)
              await runGit(['checkout', '--detach', String(normalized.sha)], checkout)
            }
          } catch {}
        }
        if (!cloned && existsSync(join(checkout, '.git', 'info', 'sparse-checkout'))) {
          const posixPath = safeSparsePath(checkout, normalized.path)
          if (posixPath) {
            const targetPath = pluginPath(checkout, posixPath)
            if (!existsSync(targetPath)) {
              await runGit(['sparse-checkout', 'add', '--', posixPath], checkout)
            }
          } else {
            await runGit(['sparse-checkout', 'disable'], checkout)
          }
        }
      })
      const dir = normalized.path ? pluginPath(checkout, normalized.path) : checkout
      if (!existsSync(dir)) throw new Error(`plugin ${pluginName}: path ${normalized.path} not found in remote repo`)
      return { dir }
    }
  }

  throw new Error(`plugin ${pluginName}: unsupported source shape`)
}

function slugFromUrl(url) {
  const clean = String(url).replace(/^https?:\/\//, '').replace(/\.git$/, '')
  const slug = clean.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return slug || 'repo'
}
