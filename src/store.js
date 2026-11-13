/**
 * Shared paths + state persistence for the plugin hub.
 *
 * Layout (all under DSH_HOME / agent-skills):
 *   state.json          — sources + install records
 *   market/<sourceId>/  — per-source git clone cache
 *   installed/<name>/   — installed plugin copies
 */
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, lstatSync, rmSync, rmdirSync, unlinkSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

let TRASH_SEQ = 0
let TRASH_SWEEP_TIMER = null
const PENDING_TRASH_PATHS = new Set()
let STATE_TMP_SEQ = 0

function canonicalComparePath(p) {
  const resolved = resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function isSameOrInsidePath(child, parent) {
  if (!child || !parent) return false
  const c = canonicalComparePath(child)
  const p = canonicalComparePath(parent)
  if (c === p) return true
  const rel = relative(p, c)
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
}

function scheduleTrashSweep(trashed) {
  if (trashed) PENDING_TRASH_PATHS.add(trashed)
  if (TRASH_SWEEP_TIMER) return
  TRASH_SWEEP_TIMER = setTimeout(() => {
    TRASH_SWEEP_TIMER = null
    try { sweepTrash() } catch {}
  }, 5000)
  TRASH_SWEEP_TIMER.unref?.()
}

function unlinkReparsePointsSync(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const child = join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      try { unlinkSync(child) } catch { try { rmdirSync(child) } catch {} }
    } else if (entry.isDirectory()) {
      unlinkReparsePointsSync(child)
    }
  }
}

/** Robust directory deletion handling Windows readonly/locked files. */
export function safeRmDir(dir, { allowTrash = true, quarantineRoot = trashRoot() } = {}) {
  if (!dir) return
  // A dangling junction is invisible to existsSync. Unlink junctions directly
  // so the Windows directory fallbacks never operate on their targets.
  let entry
  let lstatErr = null
  try { entry = lstatSync(dir, { throwIfNoEntry: false }) } catch (err) { lstatErr = err }
  if (entry?.isSymbolicLink()) {
    try {
      unlinkSync(dir)
    } catch {
      try { rmdirSync(dir) } catch {
        try { rmSync(dir, { recursive: true, force: true }) } catch {}
      }
    }
    return
  }
  if (!entry && !lstatErr && !existsSync(dir)) return
  if (entry && !entry.isDirectory()) {
    try {
      rmSync(dir, { force: true })
      return
    } catch {}
  }
  try {
    rmSync(dir, { recursive: true, force: true })
    return
  } catch (err) {
    if (allowTrash && quarantineRoot && !isSameOrInsidePath(dir, quarantineRoot) && !isSameOrInsidePath(quarantineRoot, dir)) {
      try {
        mkdirSync(quarantineRoot, { recursive: true })
        const seq = (TRASH_SEQ = (TRASH_SEQ + 1) & 0xffffff).toString(36)
        const trashed = join(quarantineRoot, `${basename(dir) || 'dir'}-${process.pid}-${Date.now().toString(36)}-${seq}`)
        renameSync(dir, trashed)
        scheduleTrashSweep(trashed)
        return
      } catch {}
    }
    if (process.platform === 'win32') {
      // Never let attrib.exe or rd traverse into a junction target outside `dir`.
      unlinkReparsePointsSync(dir)
      const isPermErr = err?.code === 'EPERM' || err?.code === 'EACCES'
      if (isPermErr) {
        try {
          execFileSync('attrib.exe', ['-r', '-s', '-h', dir], { stdio: 'ignore', windowsHide: true })
        } catch {}
        try {
          execFileSync('attrib.exe', ['-r', '-s', '-h', join(dir, '*'), '/s', '/d'], { stdio: 'ignore', windowsHide: true })
          rmSync(dir, { recursive: true, force: true })
          return
        } catch {}
      }
      if (err?.code !== 'EBUSY') {
        try {
          execFileSync('cmd.exe', ['/d', '/s', '/c', `rd /s /q "${dir}"`], { stdio: 'ignore', windowsHide: true })
          let remaining = null
          try { remaining = lstatSync(dir, { throwIfNoEntry: false }) } catch { remaining = true }
          if (!remaining) return
        } catch {}
      }
    }
  }
}

/** Remove managed files before forgetting the record needed to retry cleanup. */
export function removeManagedDir(dir, { allowTrash = false } = {}) {
  safeRmDir(dir, { allowTrash })
  let remaining = null
  let lstatErr = null
  try {
    remaining = lstatSync(dir, { throwIfNoEntry: false })
  } catch (err) {
    lstatErr = err
  }
  if (remaining || lstatErr) {
    throw Object.assign(new Error(`无法清理目录：${dir}`), {
      code: lstatErr?.code || 'EBUSY',
      syscall: lstatErr?.syscall || 'rmdir',
      path: dir,
    })
  }
}

let STATE_CACHE = null
let STATE_CACHE_MTIME = 0

export const ROOT_DIR_NAME = 'universal-plugin-hub'

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function dshSkillsDir() {
  return join(dshHome(), 'skills')
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

/** Persistent per-plugin data directory (${PLUGIN_DATA} / ${CLAUDE_PLUGIN_DATA}). */
export function pluginDataDir(name) {
  return join(marketRoot(), 'plugin-data', name)
}

/** Compiled normalized JSON hook file used when hooks need compilation/expansion. */
export function compiledHooksPath(name) {
  return join(marketRoot(), 'compiled-hooks', `${name}.json`)
}

/** Original copies of skills imported directly into the Skills tab. */
export function uploadedSkillsDir() {
  return join(marketRoot(), 'uploaded')
}

export function trashRoot() {
  return join(marketRoot(), '.trash')
}

export function sweepTrash() {
  for (const trashed of Array.from(PENDING_TRASH_PATHS)) {
    try { safeRmDir(trashed, { allowTrash: false }) } catch {}
    try {
      if (!lstatSync(trashed, { throwIfNoEntry: false })) {
        PENDING_TRASH_PATHS.delete(trashed)
        const parent = dirname(trashed)
        try { if (readdirSync(parent).length === 0) rmdirSync(parent) } catch {}
      }
    } catch {}
  }
  const root = trashRoot()
  if (existsSync(root)) {
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        try { safeRmDir(join(root, entry.name), { allowTrash: false }) } catch {}
      }
      if (readdirSync(root).length === 0) {
        try { rmdirSync(root) } catch {}
      }
    } catch {}
  }
  const legacyParents = [
    dshSkillsDir(),
    join(marketRoot(), 'installed'),
    join(marketRoot(), 'market'),
    join(marketRoot(), 'plugin-data'),
    uploadedSkillsDir(),
  ]
  for (const parent of legacyParents) {
    if (!existsSync(parent)) continue
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (/\.trash-\d+$/.test(entry.name)) {
          try { safeRmDir(join(parent, entry.name), { allowTrash: false }) } catch {}
        }
      }
    } catch {}
  }
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
    return structuredClone(fresh)
  }
  try {
    const stat = statSync(path)
    if (STATE_CACHE && STATE_CACHE_MTIME === stat.mtimeMs) {
      return structuredClone(STATE_CACHE)
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
    return structuredClone(merged)
  } catch {
    return defaultState()
  }
}

export function writeState(state) {
  const file = statePath()
  mkdirSync(dirname(file), { recursive: true })
  const seq = (STATE_TMP_SEQ = (STATE_TMP_SEQ + 1) & 0xffffff).toString(36)
  const tmp = join(dirname(file), `.state.${process.pid}.${Date.now().toString(36)}.${seq}.tmp`)
  const snapshot = structuredClone(state)
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
  renameSync(tmp, file)
  STATE_CACHE = snapshot
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

  if (ownerLower === 'anthropics' && repoLower === 'knowledge-work-plugins') return 'Knowledge Work'
  if (repoLower === 'claude-plugins-official') return 'Anthropic'
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

