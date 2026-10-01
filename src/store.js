/**
 * Shared paths + state persistence for the plugin hub.
 *
 * Layout (all under DSH_HOME / agent-skills):
 *   state.json          — sources + install records
 *   market/<sourceId>/  — per-source git clone cache
 *   installed/<name>/   — installed plugin copies
 */
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

/** Robust directory deletion handling Windows readonly/locked files. */
export function safeRmDir(dir) {
  if (!dir || !existsSync(dir)) return
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  } catch (err) {
    if (process.platform === 'win32') {
      try {
        execFileSync('cmd.exe', ['/c', `attrib -r -s -h "${dir}\\*" /s /d`], { stdio: 'ignore', windowsHide: true })
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
        return
      } catch {}
      try {
        execFileSync('cmd.exe', ['/c', `rd /s /q "${dir}"`], { stdio: 'ignore', windowsHide: true })
        return
      } catch {}
    }
    throw err
  }
}

let STATE_CACHE = null
let STATE_CACHE_MTIME = 0

export const ROOT_DIR_NAME = 'universal-plugin-hub'

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function marketRoot() {
  return join(dshHome(), 'agent-skills', ROOT_DIR_NAME)
}

export function statePath() {
  return join(marketRoot(), 'state.json')
}

export function sourceCacheDir(sourceId) {
  return join(marketRoot(), 'market', sourceId)
}

export function installedDir(name) {
  return join(marketRoot(), 'installed', name)
}

/** Default state: the built-in Anthropic source. */
export function defaultState() {
  return {
    version: 1,
    sources: [
      {
        id: 'anthropic',
        name: 'Anthropic',
        url: 'https://github.com/anthropics/claude-plugins-official.git',
        builtin: true,
        addedAt: Date.now(),
      },
    ],
    plugins: [],
  }
}

/** Read state.json with 0ms in-memory cache and mtime invalidation. */
export function readState() {
  const path = statePath()
  if (!existsSync(path)) {
    const fresh = defaultState()
    writeState(fresh)
    return fresh
  }
  try {
    const stat = statSync(path)
    if (STATE_CACHE && STATE_CACHE_MTIME === stat.mtimeMs) {
      return STATE_CACHE
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    const base = defaultState()
    const merged = {
      ...base,
      ...parsed,
      sources: Array.isArray(parsed.sources) ? parsed.sources : base.sources,
      plugins: Array.isArray(parsed.plugins) ? parsed.plugins : [],
    }
    STATE_CACHE = merged
    STATE_CACHE_MTIME = stat.mtimeMs
    return merged
  } catch {
    return defaultState()
  }
}

export function writeState(state) {
  const file = statePath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = join(dirname(file), `.state.${process.pid}.${Date.now().toString(36)}.tmp`)
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmp, file)
  STATE_CACHE = state
  try {
    STATE_CACHE_MTIME = statSync(file).mtimeMs
  } catch {
    STATE_CACHE_MTIME = Date.now()
  }
}

/** Safe slug: only [a-z0-9-], lowercased; used for ids and directory names. */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Normalize shorthand (e.g. anthropics/claude-plugins-community) and various git URL formats to standard https */
export function normalizeGitRepoUrl(raw) {
  let s = String(raw || '').trim().replace(/^['"]|['"]$/g, '')
  if (!s) return ''

  // 1. SSH format: git@github.com:owner/repo.git -> https://github.com/owner/repo.git
  const sshMatch = s.match(/^git@([^:]+):([^/]+)\/(.+?)(\.git)?$/)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}/${sshMatch[3]}.git`
  }

  // 2. Full HTTP(S) URL
  if (/^https?:\/\//i.test(s)) {
    // Handle GitHub tree/blob URLs: https://github.com/owner/repo/tree/main -> https://github.com/owner/repo.git
    const treeMatch = s.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/(?:tree|blob)\/.+$/i)
    if (treeMatch) {
      s = treeMatch[1]
    }
    if (!s.endsWith('.git') && /github\.com|gitlab\.com|gitee\.com/i.test(s)) {
      s = `${s}.git`
    }
    return s
  }

  // 3. Domain prefix without protocol: github.com/owner/repo
  const domainMatch = s.match(/^([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\/([^/]+)\/([^/]+?)(\.git)?$/)
  if (domainMatch) {
    return `https://${domainMatch[1]}/${domainMatch[2]}/${domainMatch[3]}.git`
  }

  // 4. Shorthand owner/repo: anthropics/claude-plugins-community
  const shorthandMatch = s.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(\.git)?$/)
  if (shorthandMatch) {
    return `https://github.com/${shorthandMatch[1]}/${shorthandMatch[2]}.git`
  }

  return s
}

/** Parse a git URL into { owner, repo } when possible. */
export function parseGitUrl(url) {
  const norm = normalizeGitRepoUrl(url)
  const match = norm.match(/(?:github\.com|gitlab\.com|gitee\.com)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (match) {
    return { owner: match[1], repo: match[2] }
  }
  const genericMatch = norm.match(/https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (genericMatch) {
    return { owner: genericMatch[1], repo: genericMatch[2] }
  }
  return null
}

/** Suggested display name for a source: repo name simplified & capitalized; official repo → "Anthropic". */
export function suggestSourceName(url) {
  const parsed = parseGitUrl(url)
  if (!parsed) {
    const raw = String(url).split('/').pop()?.replace(/\.git$/, '') || 'Custom'
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }
  const { owner, repo } = parsed
  const ownerLower = (owner || '').toLowerCase()
  const repoLower = (repo || '').toLowerCase()

  if (repoLower === 'claude-plugins-official' || ownerLower === 'anthropics') return 'Anthropic'
  if (repoLower === 'claude-plugins-community') return 'Community'

  const genericRepoNames = new Set([
    'skills', 'plugins', 'agents', 'tools', 'marketplace', 'hub',
    'claude-skills', 'claude-plugins', 'claude-agents', 'dsh-plugins', 'extensions', 'packages',
  ])

  // If repo is generic (e.g. "skills", "plugins", "tools"), use capitalized owner (e.g. Mattpocock)
  if (genericRepoNames.has(repoLower) && owner) {
    return owner.charAt(0).toUpperCase() + owner.slice(1)
  }

  const simplified = repo
    .replace(/^(claude|dsh|anthropic)[-_]?(plugins?)?[-_]?/i, '')
    .replace(/[-_]?(plugins?|skills?|agents?|official|marketplace)$/i, '')
  const name = simplified || repo
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Find an existing source that duplicates the given id, normalized URL, or git repo. */
export function findDuplicateSource(state, id, url) {
  if (!state || !Array.isArray(state.sources)) return null
  const normUrl = normalizeGitRepoUrl(url).toLowerCase()
  const parsed = parseGitUrl(normUrl)
  const normId = slugify(id || '').toLowerCase()

  for (const s of state.sources) {
    if (!s) continue
    // 1. Exact or case-insensitive ID match
    if (s.id && normId && s.id.toLowerCase() === normId) return s

    // 2. Normalized Git URL match
    const sNormUrl = normalizeGitRepoUrl(s.url).toLowerCase()
    if (sNormUrl && normUrl && sNormUrl === normUrl) return s

    // 3. Same Git owner & repo
    if (parsed && s.url) {
      const sParsed = parseGitUrl(s.url)
      if (
        sParsed &&
        sParsed.owner.toLowerCase() === parsed.owner.toLowerCase() &&
        sParsed.repo.toLowerCase() === parsed.repo.toLowerCase()
      ) {
        return s
      }
    }
  }
  return null
}

