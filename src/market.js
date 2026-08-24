/**
 * git operations for market sources and remote plugins.
 *
 * Every command runs through execFile (no shell), and every path argument
 * is derived from a slug validated with `safeSegment`. Errors carry a
 * user-facing message; network/git failures are retryable at the UI level.
 */
import { execFile } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { sourceCacheDir } from './store.js'

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

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = formatGitError(stderr, error.message)
        reject(new Error(detail))
        return
      }
      resolve(String(stdout))
    })
  })
}

/** Clone a source repository into its cache dir (idempotent, concurrency-safe). */
export async function ensureSourceCloned(sourceId, url) {
  safeSegment(sourceId, 'source id')
  const dir = sourceCacheDir(sourceId)
  if (existsSync(join(dir, '.git'))) return dir

  return withGitLock(`src:${sourceId}`, async () => {
    // Another request may have completed the clone while we waited on the lock.
    if (existsSync(join(dir, '.git'))) return dir

    // Clean incomplete cache if previous clone failed
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore rm error
      }
    }

    try {
      await runGit(['clone', '--depth', '1', url, dir])
    } catch (err) {
      if (existsSync(dir) && !existsSync(join(dir, '.git'))) {
        try {
          rmSync(dir, { recursive: true, force: true })
        } catch {
          // ignore rm error
        }
      }
      throw err
    }
    return dir
  })
}

/** git pull in a source cache dir (waits for any in-flight clone of the same source). */
export async function pullSource(sourceId) {
  safeSegment(sourceId, 'source id')
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
export async function materializePlugin(sourceId, pluginName, source) {
  safeSegment(sourceId, 'source id')
  safeSegment(pluginName, 'plugin name')

  if (typeof source === 'string' && (source === './' || source === '.' || source === '' || source.startsWith('./'))) {
    const cache = sourceCacheDir(sourceId)
    const rel = source.replace(/^\.\/?/, '')
    if (rel && !/^[a-z0-9][a-z0-9/_-]*$/.test(rel)) throw new Error(`unsafe plugin path: ${source}`)
    const dir = rel ? join(cache, rel) : cache
    if (!existsSync(dir)) throw new Error(`plugin ${pluginName} not found in cache (${rel || 'root'})`)
    return { dir }
  }

  if (source && typeof source === 'object') {
    if (source.source === 'url' || source.source === 'git-subdir') {
      if (typeof source.url !== 'string' || !/^https?:\/\//.test(source.url)) {
        throw new Error(`plugin ${pluginName}: unsupported remote url`)
      }
      const remoteKey = slugFromUrl(source.url)
      const checkout = join(sourceCacheDir('remote'), remoteKey)
      await withGitLock(`remote:${remoteKey}`, async () => {
        if (!existsSync(join(checkout, '.git'))) {
          // --depth 1 keeps clones small; `ref` (branch/tag) is honored when
          // the marketplace pins one. Exact sha checkout needs a full clone;
          // first version installs the pinned ref's head.
          const args = ['clone', '--depth', '1']
          if (source.ref) args.push('--branch', String(source.ref))
          args.push(source.url, checkout)
          await runGit(args)
        }
      })
      const dir = source.path ? join(checkout, String(source.path)) : checkout
      if (!existsSync(dir)) throw new Error(`plugin ${pluginName}: path ${source.path} not found in remote repo`)
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
