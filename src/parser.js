/**
 * Universal Agent Plugin Marketplace Parser.
 *
 * Supports multiple AI Agent ecosystem plugin & marketplace specifications:
 * 1. Claude Code Marketplace (.claude-plugin/marketplace.json, marketplace.json, claude-plugins.json)
 * 2. MCP Server Registries & Catalogs (mcp-servers.json, servers.json, server.json, mcp.json)
 * 3. Agent Skills / Agent Card Specifications (.well-known/agent-card.json, registry.json, catalog.json, plugins.json)
 * 4. Multi-plugin Monorepos (plugins/*, skills/*, packages/*, tools/*, extensions/*)
 * 5. Single-plugin Standalone Repositories (root SKILL.md, plugin.json, skills/, commands/, agents/, .cursorrules)
 */
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, basename, dirname, isAbsolute } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { sourceCacheDir, installedDir } from './store.js'
import { safeSegment, pluginPath, sourceRepositoryDir } from './market.js'
import { parseAgentDefinition } from './agents-map.js'
import { buildPluginIcons, touchLru, setLru } from './icons.js'

const DIR_PARSER_CACHE = new Map()
const DIR_PARSER_CACHE_TTL = 20000 // 20s TTL for file scanning
const VALID_PLUGIN_NAME = /^[a-z0-9][a-z0-9._-]*$/i
const MANIFEST_CANDIDATE_PARTS = [
  ['.claude-plugin', 'marketplace.json'],
  ['.agents', 'plugins', 'marketplace.json'],
  ['marketplace.json'],
  ['claude-plugins.json'],
  ['registry.json'],
  ['plugins.json'],
  ['catalog.json'],
  ['market.json'],
  ['mcp-servers.json'],
  ['servers.json'],
  ['index.json'],
  ['.well-known', 'agent-card.json'],
]
const MONO_DIRS = ['plugins', 'skills', 'packages', 'tools', 'extensions']
const ROOT_PLUGIN_MARKER_PARTS = [
  ['SKILL.md'],
  ['skills'],
  ['commands'],
  ['agents'],
  ['hooks'],
  ['mcp.json'],
  ['.mcp.json'],
  ['server.json'],
  ['.claude-plugin', 'plugin.json'],
  ['.codex-plugin', 'plugin.json'],
  ['plugin.json'],
  ['.cursor', 'rules'],
  ['.cursorrules'],
  ['package.json'],
]

export function invalidateParserCaches() {
  DIR_PARSER_CACHE.clear()
}

export function formatDisplayName(name) {
  if (!name) return ''
  return name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function extractMdDescription(text) {
  if (!text) return ''
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    try {
      const parsed = parseYaml(fmMatch[1])
      if (parsed && typeof parsed === 'object') {
        const desc = parsed.description || parsed.desc || parsed.summary || parsed.about
        if (typeof desc === 'string' && desc.trim()) {
          return desc.trim().replace(/\r?\n+/g, ' ').slice(0, 300)
        }
      }
    } catch {}
    const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m)
    if (descMatch) {
      const val = descMatch[1].trim().replace(/^["']|["']$/g, '')
      if (val && val !== '>' && val !== '|' && val !== '>-' && val !== '|-') {
        return val.slice(0, 300)
      }
    }
  }
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('---') &&
      !trimmed.startsWith('![') &&
      !trimmed.startsWith('>') &&
      !trimmed.startsWith('```')
    ) {
      return trimmed.slice(0, 300)
    }
  }
  return ''
}

// Presentation only: read Codex's card copy without changing which manifest
// owns the plugin's description, components, or installation behavior.
function readPluginShortDescription(dir) {
  if (!dir) return ''
  const text = value => typeof value === 'string' ? value.trim() : ''
  try {
    const root = JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf8'))
    const openai = root?.extensions?.['com.openai']
    // An inline OpenAI extension replaces the compatibility overlay entirely.
    if (openai && typeof openai === 'object' && !Array.isArray(openai)) return text(openai.interface?.shortDescription)
  } catch {}
  try {
    const codex = JSON.parse(readFileSync(join(dir, '.codex-plugin', 'plugin.json'), 'utf8'))
    return text(codex?.interface?.shortDescription)
  } catch { return '' }
}

function normalizeRow(row, sourceId, dir, { skipIcons = false } = {}) {
  if (!row) return null
  const name = typeof row.name === 'string' ? row.name : (typeof row.identifier === 'string' ? row.identifier : '')
  if (!name || !VALID_PLUGIN_NAME.test(name)) return null
  const cleanName = name.toLowerCase()

  const author = row.author && typeof row.author === 'object'
    ? row.author.name
    : (typeof row.author === 'string' ? row.author : undefined)

  const meta = row.meta || {}
  const displayName = row.displayName || row.interface?.displayName || meta.title || formatDisplayName(name)
  const description = typeof row.description === 'string'
    ? row.description
    : (row.interface?.shortDescription || meta.description || '')
  const shortDescription = readPluginShortDescription(dir)
    || (typeof row.interface?.shortDescription === 'string' ? row.interface.shortDescription.trim() : '')

  const source = row.source?.source === 'local' ? row.source.path : (row.source || './')
  if (row.source?.source === 'local' && (typeof source !== 'string' || !source.startsWith('./'))) return null

  return {
    id: `${sourceId}/${cleanName}`,
    sourceId,
    name: cleanName,
    displayName,
    description,
    ...(shortDescription ? { shortDescription } : {}),
    author: typeof author === 'string' ? author : (meta.author || undefined),
    version: typeof row.version === 'string' ? row.version : (meta.version || undefined),
    category: typeof row.category === 'string' ? row.category : (meta.category || undefined),
    homepage: typeof row.homepage === 'string' ? row.homepage : (meta.homepage || undefined),
    source,
    local: typeof source === 'string' && (source === './' || source.startsWith('./')),
    lspServers: row.lspServers || undefined,
    ...(skipIcons ? {} : { icons: buildPluginIcons(row, { sourceId, name: cleanName, dir, source }) }),
  }
}

const MARKETPLACE_CACHE = new Map()
const MARKETPLACE_SELECTION_CACHE = new Map()
const PLUGIN_DIR_INDEX_CACHE = new Map()
const PLUGIN_DIR_INDEX_LIMIT = 64
const MARKETPLACE_CACHE_TTL = 30000 // 30 seconds

export function invalidateMarketplaceCache(sourceId) {
  if (sourceId) {
    MARKETPLACE_CACHE.delete(sourceId)
    MARKETPLACE_SELECTION_CACHE.delete(sourceId)
    PLUGIN_DIR_INDEX_CACHE.delete(sourceId)
  } else {
    MARKETPLACE_CACHE.clear()
    MARKETPLACE_SELECTION_CACHE.clear()
    PLUGIN_DIR_INDEX_CACHE.clear()
  }
}

/**
 * Universal Marketplace Reader.
 * Inspects a source repository cache and extracts all discoverable plugins.
 */
export function readMarketplace(sourceId, names) {
  safeSegment(sourceId, 'source id')
  const cache = sourceCacheDir(sourceId)
  if (!existsSync(cache)) return []

  const now = Date.now()
  const cached = MARKETPLACE_CACHE.get(sourceId)
  if (cached && (now - cached.time < MARKETPLACE_CACHE_TTL)) {
    return names ? cached.data.filter(row => names.has(row.name)) : cached.data
  }

  if (names) {
    const key = JSON.stringify([...names].sort())
    const selection = MARKETPLACE_SELECTION_CACHE.get(sourceId)
    if (selection?.key === key && now - selection.time < MARKETPLACE_CACHE_TTL) return selection.data
    const data = parseMarketplaceFromDisk(sourceId, cache, names).filter(row => names.has(row.name))
    MARKETPLACE_SELECTION_CACHE.set(sourceId, { key, time: now, data })
    return data
  }
  const rows = parseMarketplaceFromDisk(sourceId, cache)
  MARKETPLACE_CACHE.set(sourceId, { time: now, data: rows })
  return rows
}

function resolveMcpDict(content) {
  if (!content || typeof content !== 'object') return null
  if (content.mcpServers && typeof content.mcpServers === 'object') return content.mcpServers
  if (content.servers && typeof content.servers === 'object') return content.servers
  return null
}

function resolveCaseAEntryDir(sourceId, cache, r) {
  const source = r.source?.source === 'local' ? r.source.path : r.source
  let dir = typeof source === 'string' && source.startsWith('./') ? pluginPath(cache, source) : null
  if (source && typeof source === 'object' && r.name) {
    dir = sourceRepositoryDir(cache, source) || pluginContentDir(sourceId, r.name, source, false)
  }
  return { source, dir }
}

function hasExplicitRootPlugin(cache) {
  return existsSync(join(cache, '.codex-plugin', 'plugin.json'))
    || existsSync(join(cache, '.claude-plugin', 'plugin.json'))
    || existsSync(join(cache, 'SKILL.md'))
    || existsSync(join(cache, 'skill.md'))
}

function resolveDirPluginInfo(entryDir, fallbackName, { includeMetadata = true } = {}) {
  const rootSkill = existsSync(join(entryDir, 'SKILL.md')) || existsSync(join(entryDir, 'skill.md'))
  const hasSkill = rootSkill || existsSync(join(entryDir, 'skills')) || existsSync(join(entryDir, 'commands'))
  const hasManifest = existsSync(join(entryDir, '.codex-plugin', 'plugin.json')) || existsSync(join(entryDir, '.claude-plugin', 'plugin.json')) || existsSync(join(entryDir, 'plugin.json')) || existsSync(join(entryDir, 'package.json'))
  const hasMcp = existsSync(join(entryDir, 'mcp.json')) || existsSync(join(entryDir, '.mcp.json')) || existsSync(join(entryDir, 'server.json'))
  const hasAgents = existsSync(join(entryDir, 'agents'))
  if (!hasSkill && !hasManifest && !hasMcp && !hasAgents) return null

  let displayName = includeMetadata ? formatDisplayName(fallbackName) : ''
  let description = ''
  let version = '1.0.0'
  let author = undefined
  let name = fallbackName

  const manifest = readPluginManifest(entryDir, false)
  if (manifest) {
    if (manifest.name) name = manifest.name
    if (includeMetadata) {
      displayName = manifest.displayName || formatDisplayName(name)
      if (manifest.description) description = manifest.description
      if (manifest.version) version = manifest.version
      if (manifest.author) author = typeof manifest.author === 'string' ? manifest.author : manifest.author?.name
    }
  } else if (rootSkill) {
    try {
      const raw = readFileSync(join(entryDir, existsSync(join(entryDir, 'SKILL.md')) ? 'SKILL.md' : 'skill.md'), 'utf8')
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      const meta = match ? parseYaml(match[1]) : null
      if (typeof meta?.name === 'string') name = meta.name
      if (includeMetadata) {
        displayName = formatDisplayName(name)
        description = extractMdDescription(raw)
      }
    } catch {}
  } else if (includeMetadata && existsSync(join(entryDir, 'README.md'))) {
    try { description = extractMdDescription(readFileSync(join(entryDir, 'README.md'), 'utf8')) } catch {}
  }

  return { name, displayName, description, version, author, manifest }
}

function resolveStandaloneRootInfo(cache, sourceId, { includeMetadata = true } = {}) {
  if (!ROOT_PLUGIN_MARKER_PARTS.some((parts) => existsSync(join(cache, ...parts)))) return null
  let name = sourceId
  let displayName = includeMetadata ? formatDisplayName(sourceId) : ''
  let description = ''
  let version = '1.0.0'
  let author = undefined

  const manifest = readPluginManifest(cache)
  if (manifest) {
    if (manifest.name) name = manifest.name
    if (includeMetadata) {
      if (manifest.displayName) displayName = manifest.displayName
      if (manifest.description) description = manifest.description
      if (manifest.version) version = manifest.version
      if (manifest.author) author = typeof manifest.author === 'string' ? manifest.author : manifest.author.name
    }
  } else if (includeMetadata && existsSync(join(cache, 'SKILL.md'))) {
    try {
      description = extractMdDescription(readFileSync(join(cache, 'SKILL.md'), 'utf8'))
    } catch {}
  } else if (includeMetadata && existsSync(join(cache, 'README.md'))) {
    try {
      description = extractMdDescription(readFileSync(join(cache, 'README.md'), 'utf8'))
    } catch {}
  }
  return { name, displayName, description, version, author, manifest }
}

export function parsePluginRowFromDir(entryDir, fallbackName, sourceId, options = {}) {
  const info = resolveDirPluginInfo(entryDir, fallbackName, { includeMetadata: true })
  if (!info) return null

  return normalizeRow({
    ...info.manifest,
    name: info.name,
    displayName: info.displayName,
    description: info.description,
    version: info.version,
    author: info.author,
    source: `./${fallbackName}`,
  }, sourceId, entryDir, options)
}

function indexManifestPluginDirs(sourceId, cache, content) {
  if (!content || typeof content !== 'object') return null
  if (Array.isArray(content.plugins)) {
    const entries = new Map()
    for (const r of content.plugins) {
      if (!r || typeof r !== 'object') continue
      if (r.source?.source === 'local' && (typeof r.source.path !== 'string' || !r.source.path.startsWith('./'))) continue
      const { dir } = resolveCaseAEntryDir(sourceId, cache, r)
      let rawName = ''
      if (typeof r.name === 'string') {
        rawName = r.name
      } else {
        const manifest = r.name === undefined && dir ? readPluginManifest(dir, false) : null
        if (r.name === undefined && typeof manifest?.name === 'string') rawName = manifest.name
        else rawName = typeof r.identifier === 'string' ? r.identifier : ''
      }
      if (!rawName || !VALID_PLUGIN_NAME.test(rawName)) continue
      const cleanName = rawName.toLowerCase()
      if (!entries.has(cleanName)) entries.set(cleanName, dir)
    }
    if (entries.size > 0) return entries
  }
  if (Array.isArray(content)) {
    const entries = new Map()
    for (const r of content) {
      if (!r || typeof r !== 'object') continue
      const rawName = typeof r.name === 'string' ? r.name : (typeof r.identifier === 'string' ? r.identifier : '')
      if (!rawName || !VALID_PLUGIN_NAME.test(rawName)) continue
      const source = r.source?.source === 'local' ? r.source.path : (r.source || './')
      if (r.source?.source === 'local' && (typeof source !== 'string' || !source.startsWith('./'))) continue
      const cleanName = rawName.toLowerCase()
      if (!entries.has(cleanName)) entries.set(cleanName, pluginContentDir(sourceId, cleanName, source, false))
    }
    if (entries.size > 0) return entries
  }
  const mcpDict = resolveMcpDict(content)
  if (mcpDict) {
    const entries = new Map()
    for (const srvName of Object.keys(mcpDict)) {
      if (!VALID_PLUGIN_NAME.test(srvName)) continue
      const cleanName = srvName.toLowerCase()
      if (!entries.has(cleanName)) entries.set(cleanName, cache)
    }
    if (entries.size > 0) return entries
  }
  return null
}

function monoSubRootStamp(cache) {
  return MONO_DIRS.map((sub) => {
    try {
      const info = statSync(join(cache, sub))
      return info.isDirectory() ? String(info.mtimeMs) : ''
    } catch { return '' }
  }).join('|')
}

function indexMonoPluginDirs(cache) {
  const entries = new Map()
  for (const sub of MONO_DIRS) {
    const subRoot = join(cache, sub)
    if (!existsSync(subRoot)) continue
    try {
      for (const entry of readdirSync(subRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dir = join(subRoot, entry.name)
        const info = resolveDirPluginInfo(dir, entry.name, { includeMetadata: false })
        if (info && typeof info.name === 'string' && VALID_PLUGIN_NAME.test(info.name)) {
          const cleanName = info.name.toLowerCase()
          if (!entries.has(cleanName)) entries.set(cleanName, dir)
        }
      }
    } catch {}
  }
  return entries
}

/**
 * Resolve one plugin's directory in O(1) sharing the exact manifest/directory
 * discovery precedence of `parseMarketplaceFromDisk` without scanning sibling
 * artwork (`buildPluginIcons`) or unrelated plugins.
 */
export function resolveMarketplacePluginDir(sourceId, pluginName) {
  safeSegment(sourceId, 'source id')
  const targetName = safeSegment(pluginName, 'plugin name').toLowerCase()
  const cache = sourceCacheDir(sourceId)
  if (!existsSync(cache)) {
    PLUGIN_DIR_INDEX_CACHE.delete(sourceId)
    return null
  }

  const cached = PLUGIN_DIR_INDEX_CACHE.get(sourceId)
  if (cached) {
    if (cached.manifestPath) {
      try {
        const info = statSync(cached.manifestPath)
        if (info.isFile() && info.mtimeMs === cached.mtimeMs && info.size === cached.size) {
          touchLru(PLUGIN_DIR_INDEX_CACHE, sourceId, cached)
          return cached.entries.get(targetName) || null
        }
      } catch {}
      PLUGIN_DIR_INDEX_CACHE.delete(sourceId)
    } else if (cached.monoStamp !== undefined) {
      if (monoSubRootStamp(cache) === cached.monoStamp) {
        touchLru(PLUGIN_DIR_INDEX_CACHE, sourceId, cached)
        return cached.entries.get(targetName) || null
      }
      PLUGIN_DIR_INDEX_CACHE.delete(sourceId)
    }
  }

  // 1. Check Multi-Plugin Manifest Candidates
  for (const parts of MANIFEST_CANDIDATE_PARTS) {
    const manifestPath = join(cache, ...parts)
    let info
    try { info = statSync(manifestPath) } catch { continue }
    if (!info.isFile()) continue
    try {
      const content = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const entries = indexManifestPluginDirs(sourceId, cache, content)
      if (entries) {
        setLru(PLUGIN_DIR_INDEX_CACHE, PLUGIN_DIR_INDEX_LIMIT, sourceId, {
          manifestPath, mtimeMs: info.mtimeMs, size: info.size, entries,
        })
        return entries.get(targetName) || null
      }
    } catch {}
  }

  // 2. Local source direct subdirectories discovery
  if (sourceId === 'local') {
    const direct = join(cache, targetName)
    if (existsSync(direct)) {
      const info = resolveDirPluginInfo(direct, targetName, { includeMetadata: false })
      if (info && typeof info.name === 'string' && VALID_PLUGIN_NAME.test(info.name) && info.name.toLowerCase() === targetName) return direct
    }
    try {
      for (const entry of readdirSync(cache, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const dir = join(cache, entry.name)
          const info = resolveDirPluginInfo(dir, entry.name, { includeMetadata: false })
          if (info && typeof info.name === 'string' && VALID_PLUGIN_NAME.test(info.name) && info.name.toLowerCase() === targetName) return dir
        }
      }
    } catch {}
    return null
  }

  // 3. Explicit root plugin manifests / SKILL.md
  if (hasExplicitRootPlugin(cache)) {
    const info = resolveDirPluginInfo(cache, sourceId, { includeMetadata: false })
    if (info && typeof info.name === 'string' && VALID_PLUGIN_NAME.test(info.name)) {
      return info.name.toLowerCase() === targetName ? cache : null
    }
  }

  // 4. Monorepo subdirectories (direct path check first, then indexed scan)
  for (const sub of MONO_DIRS) {
    const direct = join(cache, sub, targetName)
    if (existsSync(direct)) {
      const info = resolveDirPluginInfo(direct, targetName, { includeMetadata: false })
      if (info && typeof info.name === 'string' && VALID_PLUGIN_NAME.test(info.name) && info.name.toLowerCase() === targetName) return direct
    }
  }
  const monoEntries = indexMonoPluginDirs(cache)
  if (monoEntries.size > 0) {
    setLru(PLUGIN_DIR_INDEX_CACHE, PLUGIN_DIR_INDEX_LIMIT, sourceId, {
      monoStamp: monoSubRootStamp(cache), entries: monoEntries,
    })
    return monoEntries.get(targetName) || null
  }

  // 5. Single Standalone Root Plugin Repository
  const rootInfo = resolveStandaloneRootInfo(cache, sourceId, { includeMetadata: false })
  if (rootInfo && typeof rootInfo.name === 'string' && VALID_PLUGIN_NAME.test(rootInfo.name)) {
    return rootInfo.name.toLowerCase() === targetName ? cache : null
  }
  return null
}

export function parseMarketplaceFromDisk(sourceId, cache, names, options = {}) {
  // 1. Check Multi-Plugin Manifest Candidates
  for (const parts of MANIFEST_CANDIDATE_PARTS) {
    const manifestPath = join(cache, ...parts)
    if (existsSync(manifestPath)) {
      try {
        const content = JSON.parse(readFileSync(manifestPath, 'utf8'))
        // Case A: Claude / standard manifest with plugins array
        if (Array.isArray(content.plugins)) {
          let skipped = false
          const rows = content.plugins.map((r) => {
            const { dir } = resolveCaseAEntryDir(sourceId, cache, r)
            if (names && typeof r.name === 'string' && !names.has(r.name.toLowerCase())) {
              skipped = true
              return null
            }
            const manifest = dir ? readPluginManifest(dir, false) : null
            return normalizeRow({ ...manifest, ...r,
              displayName: r.displayName || r.interface?.displayName || manifest?.displayName,
              description: r.description || r.interface?.shortDescription || manifest?.description,
            }, sourceId, dir, options)
          }).filter(Boolean)
          if (rows.length > 0) return rows
          // Preserve manifest precedence and discovery fallbacks on a miss.
          if (skipped) return parseMarketplaceFromDisk(sourceId, cache, undefined, options)
        }
        // Case B: Direct array of plugin descriptors
        if (Array.isArray(content)) {
          const rows = content.map((r) => normalizeRow(r, sourceId, undefined, options)).filter(Boolean)
          if (rows.length > 0) return rows
        }
        // Case C: MCP Servers dictionary (mcpServers or servers object)
        const mcpDict = resolveMcpDict(content)
        if (mcpDict) {
          const rows = []
          for (const [srvName, srvCfg] of Object.entries(mcpDict)) {
            rows.push(normalizeRow({
              name: srvName,
              displayName: srvCfg.title || formatDisplayName(srvName),
              description: srvCfg.description || `MCP Server: ${srvName}`,
              author: srvCfg.author || content.author || 'MCP',
              category: 'mcp',
              source: './',
            }, sourceId, undefined, options))
          }
          if (rows.filter(Boolean).length > 0) return rows.filter(Boolean)
        }
      } catch {
        // Continue fallback search on malformed JSON
      }
    }
  }

  // 2. Local source direct subdirectories discovery
  if (sourceId === 'local') {
    const localRows = []
    if (existsSync(cache)) {
      try {
        for (const entry of readdirSync(cache, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const row = parsePluginRowFromDir(join(cache, entry.name), entry.name, 'local', options)
            if (row) localRows.push(row)
          }
        }
      } catch {}
    }
    return localRows
  }

  // Explicit plugin manifests describe the whole package, including its skills.
  if (hasExplicitRootPlugin(cache)) {
    const row = parsePluginRowFromDir(cache, sourceId, sourceId, options)
    if (row) return [{ ...row, source: './' }]
  }

  // 3. Monorepo subdirectories auto-discovery (plugins/*, skills/*, packages/*, tools/*, extensions/*)
  const monoRows = []
  for (const sub of MONO_DIRS) {
    const subRoot = join(cache, sub)
    if (existsSync(subRoot)) {
      try {
        for (const entry of readdirSync(subRoot, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const row = parsePluginRowFromDir(join(subRoot, entry.name), entry.name, sourceId, options)
            if (row) {
              row.source = `./${sub}/${entry.name}`
              monoRows.push(row)
            }
          }
        }
      } catch {}
    }
  }
  if (monoRows.filter(Boolean).length > 0) return monoRows.filter(Boolean)

  // 3. Single Standalone Root Plugin Repository
  const rootInfo = resolveStandaloneRootInfo(cache, sourceId, { includeMetadata: true })
  if (rootInfo) {
    return [normalizeRow({
      ...rootInfo.manifest,
      name: rootInfo.name,
      displayName: rootInfo.displayName,
      description: rootInfo.description,
      version: rootInfo.version,
      author: rootInfo.author,
      source: './',
    }, sourceId, cache, options)].filter(Boolean)
  }

  return []
}

/** Resolve the directory that holds a plugin's content (cache or remote checkout). */
export function pluginContentDir(sourceId, pluginName, source, preferInstalled = true) {
  safeSegment(sourceId, 'source id')
  safeSegment(pluginName, 'plugin name')

  // Check if already installed (installed/ tree, not the market/ cache)
  const installed = installedDir(pluginName)
  if (preferInstalled && existsSync(installed)) return installed

  // Check if in local source cache (root or subdir)
  if (typeof source === 'string' && (source === './' || source === '.' || source === '')) {
    const dir = sourceCacheDir(sourceId)
    return existsSync(dir) ? dir : null
  }
  if (typeof source === 'string' && source.startsWith('./')) {
    const rel = source.replace(/^\.\//, '')
    const dir = pluginPath(sourceCacheDir(sourceId), `./${rel}`)
    return existsSync(dir) ? dir : null
  }

  // Check if in remote git cache
  if (source && typeof source === 'object' && (source.source === 'url' || source.source === 'git-subdir')) {
    if (typeof source.url === 'string') {
      const ownDir = sourceRepositoryDir(sourceCacheDir(sourceId), source)
      if (ownDir) return ownDir
      const clean = String(source.url).replace(/^https?:\/\//, '').replace(/\.git$/, '')
      const remoteKey = clean.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'repo'
      const checkout = join(sourceCacheDir('remote'), remoteKey)
      const dir = source.path ? pluginPath(checkout, source.path) : checkout
      return existsSync(dir) ? dir : null
    }
  }

  // Fallback check in source root
  const fallback = sourceCacheDir(sourceId)
  return existsSync(fallback) ? fallback : null
}

/** Read plugin metadata with Claude precedence when multiple formats coexist. */
export function readPluginManifest(dir, includeParent = true) {
  const rootManifest = join(dir, 'plugin.json')
  let portable = false
  if (existsSync(rootManifest)) {
    try {
      const root = JSON.parse(readFileSync(rootManifest, 'utf8'))
      portable = /^https:\/\/agent-plugins\.org\//.test(root.$schema || '') || Boolean(root.extensions?.['com.openai'])
    } catch {}
  }
  const candidates = [
    join(dir, '.claude-plugin', 'plugin.json'),
    ...(portable ? [rootManifest] : []),
    join(dir, '.codex-plugin', 'plugin.json'),
    join(dir, '.claude-plugin', 'marketplace.json'),
    rootManifest,
    join(dir, 'manifest.json'),
    join(dir, 'server.json'),
    join(dir, 'package.json'),
    ...(includeParent ? [join(dir, '..', '.claude-plugin', 'plugin.json'),
    join(dir, '..', '.claude-plugin', 'marketplace.json'),
    join(dir, '..', 'plugin.json'),
    join(dir, '..', 'manifest.json')] : []),
  ]

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8'))
        if (p.endsWith('package.json')) {
          if (raw['claude-plugin']) return raw['claude-plugin']
          return {
            name: raw.name,
            displayName: raw.displayName || formatDisplayName(raw.name),
            description: raw.description,
            version: raw.version,
            author: raw.author,
            mcpServers: raw.mcpServers,
            lspServers: raw.lspServers,
          }
        }
        if (raw && Array.isArray(raw.plugins) && raw.plugins.length > 0) {
          const matched = raw.plugins.find((x) => x.name === basename(dir) || x.name === basename(join(dir, '..'))) || raw.plugins[0]
          return {
            name: matched.name || raw.name,
            displayName: matched.displayName || formatDisplayName(matched.name || raw.name),
            description: matched.description || raw.metadata?.description || '',
            version: matched.version || raw.metadata?.version || undefined,
            author: matched.author || raw.owner?.name || undefined,
            skills: matched.skills,
            commands: matched.commands,
            agents: matched.agents,
            mcpServers: matched.mcpServers,
            lspServers: matched.lspServers,
          }
        }
        const openai = raw.extensions?.['com.openai']
        const settings = openai && typeof openai === 'object' ? openai : raw
        return {
          ...raw,
          ...settings,
          name: raw.name,
          version: raw.version,
          displayName: raw.displayName || settings.interface?.displayName,
          description: raw.description || settings.interface?.shortDescription || settings.interface?.longDescription || '',
          author: raw.author || settings.interface?.developerName,
          homepage: raw.homepage || settings.interface?.websiteURL,
        }
      } catch {}
    }
  }
  return null
}

/** List skill & command directories/files (skills/*, commands/*, root SKILL.md, .cursor/rules). */
export function listSkills(dir, manifest = readPluginManifest(dir)) {
  const out = []
  const seen = new Set()

  const addSkill = (name, skillMdPath) => {
    if (!name || seen.has(name)) return
    let description = ''
    if (skillMdPath) {
      try {
        description = extractMdDescription(readFileSync(skillMdPath, 'utf8'))
      } catch {}
    }
    out.push({ name, command: `/${name}`, description })
    seen.add(name)
  }

  // 1. Check skills/ subdirectory
  const declaredSkills = typeof manifest?.skills === 'string' ? [manifest.skills] : (Array.isArray(manifest?.skills) ? manifest.skills.filter((s) => typeof s === 'string' && s.startsWith('./')) : [])
  const candidateSkillRoots = [...declaredSkills.map((p) => pluginPath(dir, p)), join(dir, 'skills'), join(dir, '..', 'skills')]
  for (const sRoot of candidateSkillRoots) {
    if (existsSync(sRoot)) {
      try {
        if (statSync(sRoot).isFile()) {
          if (/^skill\.md$/i.test(basename(sRoot))) addSkill(basename(dirname(sRoot)), sRoot)
          continue
        }
        const rootMd = ['SKILL.md', 'skill.md'].map((f) => join(sRoot, f)).find(existsSync)
        if (rootMd) addSkill(basename(sRoot), rootMd)
        for (const entry of readdirSync(sRoot, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (['node_modules', '.git', '.agents', 'agents', 'commands', 'prompts', 'hooks', '.cursor', 'docs', 'assets', 'eval', 'staging', 'walkthroughs'].includes(entry.name)) continue
            const skillMd = join(sRoot, entry.name, 'SKILL.md')
            const altMd = join(sRoot, entry.name, 'skill.md')
            if (existsSync(skillMd)) {
              addSkill(entry.name, skillMd)
            } else if (existsSync(altMd)) {
              addSkill(entry.name, altMd)
            }
          } else if (entry.isFile() && entry.name.endsWith('.md') && !['README.md', 'CONTRIBUTING.md', 'LICENSE.md', 'CHANGELOG.md'].includes(entry.name)) {
            const name = entry.name.replace(/\.md$/, '')
            addSkill(name, join(sRoot, entry.name))
          }
        }
      } catch {}
    }
  }

  // 2. Check commands/ and .claude/commands/ (Claude Code slash commands)
  const candidateCmdRoots = [
    join(dir, 'commands'),
    join(dir, '..', 'commands'),
    join(dir, '.claude', 'commands'),
    join(dir, '..', '.claude', 'commands'),
  ]
  for (const cRoot of candidateCmdRoots) {
    if (existsSync(cRoot)) {
      try {
        for (const entry of readdirSync(cRoot, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            addSkill(entry.name.replace(/\.md$/, ''), join(cRoot, entry.name))
          } else if (entry.isDirectory()) {
            const skillMd = join(cRoot, entry.name, 'SKILL.md')
            const directMd = join(cRoot, `${entry.name}.md`)
            const targetMd = existsSync(skillMd) ? skillMd : (existsSync(directMd) ? directMd : null)
            if (targetMd) {
              addSkill(entry.name, targetMd)
            }
          }
        }
      } catch {}
    }
  }



  // 4. Single-skill repository fallback: if no skills/ or commands/ exist, check root SKILL.md
  if (out.length === 0) {
    const rootSkillMd = ['SKILL.md', 'skill.md'].map((f) => join(dir, f)).find(existsSync)
    if (rootSkillMd) {
      let skillName = basename(dir)
      try {
        const raw = readFileSync(rootSkillMd, 'utf8')
        const nameMatch = raw.match(/^name:\s*(.+)$/m)
        if (nameMatch) skillName = nameMatch[1].trim().replace(/^["']|["']$/g, '')
      } catch {}
      addSkill(skillName, rootSkillMd)
    }
  }

  // 5. Check manifest (plugin.json / package.json / marketplace.json "skills" / "commands")
  if (manifest && out.length === 0) {
    if (Array.isArray(manifest.skills)) {
      for (const item of manifest.skills) {
        const rawName = typeof item === 'string' ? item : item?.name
        if (rawName) {
          const name = basename(rawName).replace(/\.(md|mdc)$/i, '')
          if (name && !['skills', 'commands'].includes(name.toLowerCase()) && !seen.has(name)) {
            seen.add(name)
            out.push({
              name,
              command: `/${name}`,
              description: typeof item === 'object' ? item.description || '' : '',
            })
          }
        }
      }
    }
    if (Array.isArray(manifest.commands)) {
      for (const item of manifest.commands) {
        const rawName = typeof item === 'string' ? item : item?.name
        if (rawName) {
          const name = basename(rawName).replace(/\.md$/i, '')
          if (name && !['skills', 'commands'].includes(name.toLowerCase()) && !seen.has(name)) {
            seen.add(name)
            out.push({
              name,
              command: `/${name}`,
              description: typeof item === 'object' ? item.description || '' : '',
            })
          }
        }
      }
    }
  }

  return out
}

/** List agent definition files (agents/*.yaml|yml|md|json, .well-known/agent-card.json, agent.json). */
export function listAgents(dir, manifest = readPluginManifest(dir)) {
  const out = []
  const seen = new Set()

  const candidateAgentRoots = [
    join(dir, 'agents'),
    join(dir, '.agents'),
    join(dir, '..', 'agents'),
    join(dir, '..', '.agents'),
    join(dir, '.claude-plugin', 'agents'),
    join(dir, '..', '.claude-plugin', 'agents'),
  ]

  const pluginName = basename(dir)

  for (const agentsRoot of candidateAgentRoots) {
    if (existsSync(agentsRoot)) {
      try {
        for (const entry of readdirSync(agentsRoot, { withFileTypes: true })) {
          if (!entry.isFile()) continue
          if (!/\.(ya?ml|md|json)$/i.test(entry.name)) continue
          if (seen.has(entry.name)) continue

          try {
            const raw = readFileSync(join(agentsRoot, entry.name), 'utf8')
            if (raw) {
              const parsed = parseAgentDefinition(pluginName, entry.name, raw)
              if (parsed && !parsed.error) {
                seen.add(entry.name)
                out.push({
                  file: entry.name,
                  name: parsed.name,
                  displayName: parsed.displayName || parsed.name,
                  description: parsed.description,
                  tools: parsed.tools,
                  model: parsed.model,
                  instructions: parsed.instructions,
                  raw,
                })
                continue
              }
            }
          } catch { /* skip */ }

          // Fallback if parsing failed
          seen.add(entry.name)
          const fallbackName = entry.name.replace(/\.[^.]+$/, '')
          out.push({
            file: entry.name,
            name: fallbackName,
            displayName: formatDisplayName(fallbackName),
            description: 'Autonomous sub-agent workflow',
            tools: null,
            model: null,
            instructions: '',
            raw: null,
          })
        }
      } catch {}
    }
  }

  // Check Agent Card format (.well-known/agent-card.json or agent.json)
  for (const agentCardPath of [join(dir, '.well-known', 'agent-card.json'), join(dir, 'agent.json')]) {
    if (existsSync(agentCardPath) && !seen.has(basename(agentCardPath))) {
      try {
        const raw = readFileSync(agentCardPath, 'utf8')
        const parsed = parseAgentDefinition(pluginName, basename(agentCardPath), raw)
        seen.add(basename(agentCardPath))
        if (parsed && !parsed.error) {
          out.push({
            file: basename(agentCardPath),
            name: parsed.name,
            displayName: parsed.displayName || parsed.name,
            description: parsed.description,
            tools: parsed.tools,
            model: parsed.model,
            instructions: parsed.instructions,
            raw,
          })
        } else {
          const jsonDoc = JSON.parse(raw)
          out.push({
            file: basename(agentCardPath),
            name: jsonDoc.name || basename(dir),
            displayName: jsonDoc.displayName || formatDisplayName(jsonDoc.name || basename(dir)),
            description: jsonDoc.description || '',
            tools: jsonDoc.tools || null,
            model: jsonDoc.model || null,
            instructions: jsonDoc.instructions || '',
            raw,
          })
        }
      } catch {}
    }
  }

  // Check manifest "agents" array
  if (manifest && Array.isArray(manifest.agents)) {
    for (const item of manifest.agents) {
      const rawName = typeof item === 'string' ? item : item?.name
      if (rawName && !seen.has(rawName)) {
        seen.add(rawName)
        const name = typeof item === 'string' ? item : (item.name || rawName)
        const displayName = typeof item === 'object' && item.displayName ? item.displayName : (typeof item === 'object' && item.name ? item.name : formatDisplayName(name))
        out.push({
          file: typeof item === 'object' && item.file ? item.file : `${name}.md`,
          name,
          displayName,
          description: typeof item === 'object' ? item.description || '' : '',
          tools: typeof item === 'object' ? item.tools || null : null,
          model: typeof item === 'object' ? item.model || null : null,
          instructions: '',
          raw: null,
        })
      }
    }
  }

  return out
}

/** Prompt-ish entries: prompts/*.md|txt|yaml or plugin.json "prompts". */
export function listPrompts(dir, manifest = readPluginManifest(dir)) {
  const prompts = []
  const pRoots = [join(dir, 'prompts'), join(dir, '..', 'prompts')]
  for (const pRoot of pRoots) {
    if (existsSync(pRoot)) {
      try {
        for (const entry of readdirSync(pRoot, { withFileTypes: true })) {
          if (entry.isFile() && /\.(md|txt|ya?ml|json)$/i.test(entry.name) && !['README.md', 'CONTRIBUTING.md', 'LICENSE.md'].includes(entry.name)) {
            prompts.push(entry.name.replace(/\.[^.]+$/, ''))
          }
        }
      } catch {}
    }
  }
  if (manifest && Array.isArray(manifest.prompts)) {
    prompts.push(...manifest.prompts.map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean))
  }
  return [...new Set(prompts)]
}

function formatHookEventName(evt) {
  const map = {
    'PreToolUse': 'Pre-tool use',
    'PostToolUse': 'Post-tool use',
    'PreCompact': 'Pre-compact',
    'PostCompact': 'Post-compact',
    'SessionStart': 'SessionStart',
    'SessionEnd': 'SessionEnd',
    'Stop': 'Stop',
    'PostToolUseFailure': 'PostToolUseFailure',
    'Notification': 'Notification',
  }
  return map[evt] || evt
}

/**
 * Parse hook event names from a Claude/Codex hook config file's content.
 * Accepts `{ hooks: {...} }`, a doubly-nested `{ hooks: { hooks: {...} } }`,
 * or a bare event map. Never treats implementation scripts as hooks.
 */
export function parseHookConfig(raw, isJson) {
  const out = []
  let parsed
  try {
    parsed = isJson ? JSON.parse(raw) : parseYaml(raw)
  } catch {
    return out
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out
  let hookObj = (parsed.hooks && typeof parsed.hooks === 'object' && !Array.isArray(parsed.hooks)) ? parsed.hooks : parsed
  if (hookObj && typeof hookObj === 'object' && !Array.isArray(hookObj) && typeof hookObj.hooks === 'object' && !Array.isArray(hookObj.hooks)) {
    hookObj = hookObj.hooks
  }
  for (const [eventName, val] of Object.entries(hookObj)) {
    const formattedEvent = formatHookEventName(eventName)
    if (Array.isArray(val)) {
      for (const item of val) {
        const matcher = item && typeof item === 'object' && item.matcher ? `: ${item.matcher}` : ''
        out.push(`${formattedEvent}${matcher}`)
      }
    } else if (val && typeof val === 'object') {
      const matcher = val.matcher ? `: ${val.matcher}` : ''
      out.push(`${formattedEvent}${matcher}`)
    } else {
      out.push(formattedEvent)
    }
  }
  return out
}

/**
 * Resolve the plugin's Claude/Codex hook config file path: the manifest `hooks`
 * path first, then `hooks/hooks.json|yaml|yml`, then `*-hooks.{json,yaml}` files.
 * Returns null when the plugin declares no hook config (e.g. only scripts).
 */
export function resolveHookConfigPath(dir, manifest = readPluginManifest(dir)) {
  if (manifest && typeof manifest.hooks === 'string') {
    const p = isAbsolute(manifest.hooks) ? manifest.hooks : join(dir, manifest.hooks)
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  const hooksRoot = join(dir, 'hooks')
  if (existsSync(hooksRoot)) {
    const fixed = ['hooks.json', 'hooks.yaml', 'hooks.yml'].map((n) => join(hooksRoot, n)).find((p) => existsSync(p) && statSync(p).isFile())
    if (fixed) return fixed
    try {
      const dialect = readdirSync(hooksRoot)
        .filter((n) => /-hooks\.(json|ya?ml)$/i.test(n) && statSync(join(hooksRoot, n)).isFile())
        .sort((a, b) => {
          const score = (n) => (/claude/i.test(n) ? 0 : (/codex/i.test(n) ? 1 : 2))
          return score(a) - score(b)
        })
      if (dialect.length > 0) return join(hooksRoot, dialect[0])
    } catch {}
  }
  return null
}

/** Hook entries: follow the plugin manifest's `hooks` config, then hooks/ config files. */
export function listHooks(dir, manifest = readPluginManifest(dir)) {
  const hooks = []
  const seen = new Set()
  const add = (h) => { if (h && !seen.has(h)) { seen.add(h); hooks.push(h) } }

  const cfg = resolveHookConfigPath(dir, manifest)
  if (cfg) {
    try {
      const raw = readFileSync(cfg, 'utf8')
      for (const h of parseHookConfig(raw, /\.json$/i.test(cfg))) add(h)
    } catch {}
  }

  // Manifest `hooks` as inline object/array (no file path to follow).
  if (hooks.length === 0) {
    if (manifest && manifest.hooks) {
      if (Array.isArray(manifest.hooks)) {
        for (const h of manifest.hooks) add(typeof h === 'string' ? h : (h && h.name))
      } else if (typeof manifest.hooks === 'object') {
        for (const h of parseHookConfig(JSON.stringify({ hooks: manifest.hooks }), true)) add(h)
      }
    }
  }

  return hooks
}

/**
 * Collapse every remote transport spelling a manifest may use into the two
 * values the editor and the host understand. Marketplaces write
 * `streamable-http`, `.mcp.json` files write `http`, some older servers write
 * `sse`; a `type` the editor does not recognise would fall back to stdio and
 * show an empty local-command form for a remote URL.
 *
 * This is the single source of truth for that mapping — the host's connector
 * checks and the browser editor call it instead of keeping their own copy of
 * the whitelist, so a new spelling only has to be taught once.
 */
export function connectorTransport(type, url, command) {
  if (type === 'stdio') return 'stdio'
  if (type === 'http' || type === 'sse' || type === 'streamable-http' || type === 'streamableHttp') return 'http'
  return command && !url ? 'stdio' : 'http'
}

/** True when a transport name is one of the remote spellings. */
export function isRemoteTransportName(type) {
  return type === 'http' || type === 'sse' || type === 'streamable-http' || type === 'streamableHttp'
}

/** Connector-ish entries: .mcp.json, mcp.json, server.json, or plugin.json "mcp" / "connectors". */
export function listConnectors(dir, manifest = readPluginManifest(dir)) {
  const connectors = []
  const seen = new Set()

  for (const mcpFile of ['.mcp.json', 'mcp.json', 'server.json', 'mcp-servers.json']) {
    const mcpPath = join(dir, mcpFile)
    if (existsSync(mcpPath)) {
      try {
        const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'))
        let dict = null
        if (mcp && typeof mcp === 'object' && !Array.isArray(mcp)) {
          if (mcp.mcpServers && typeof mcp.mcpServers === 'object') {
            dict = mcp.mcpServers
          } else if (mcp.servers && typeof mcp.servers === 'object') {
            dict = mcp.servers
          } else if (mcp.name && (mcp.url || mcp.command || mcp.type)) {
            dict = { [mcp.name]: mcp }
          } else {
            const direct = {}
            for (const [k, v] of Object.entries(mcp)) {
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                if (v.url || v.command || v.type || v.args || v.headers || v.env) {
                  direct[k] = v
                }
              }
            }
            if (Object.keys(direct).length > 0) dict = direct
          }
        }
        if (dict && typeof dict === 'object') {
          for (const [name, cfg] of Object.entries(dict)) {
            if (!seen.has(name)) {
              seen.add(name)
              connectors.push({
                name,
                type: connectorTransport(cfg.type, cfg.url, cfg.command),
                url: cfg.url || null,
                command: cfg.command || null,
                args: cfg.args || [],
                env: cfg.env || {},
                headers: cfg.headers || {},
              })
            }
          }
        }
      } catch { /* ignore malformed */ }
    }
  }

  if (manifest) {
    let dict = null
    if (manifest.mcpServers && typeof manifest.mcpServers === 'object') {
      dict = manifest.mcpServers
    } else if (manifest.servers && typeof manifest.servers === 'object') {
      dict = manifest.servers
    } else if (manifest.mcp && typeof manifest.mcp === 'object') {
      dict = manifest.mcp.mcpServers || manifest.mcp
    }
    if (dict && typeof dict === 'object') {
      for (const [name, cfg] of Object.entries(dict)) {
        if (!seen.has(name)) {
          seen.add(name)
          connectors.push({
            name,
            type: connectorTransport(cfg.type, cfg.url, cfg.command),
            url: cfg.url || null,
            command: cfg.command || null,
            args: cfg.args || [],
            env: cfg.env || {},
            headers: cfg.headers || {},
          })
        }
      }
    }
    if (Array.isArray(manifest.connectors)) {
      for (const c of manifest.connectors) {
        const name = typeof c === 'string' ? c : c.name
        if (name && !seen.has(name)) {
          seen.add(name)
          connectors.push({
            name,
            type: connectorTransport(c.type, c.url, c.command),
            url: c.url || null,
            command: c.command || null,
            args: c.args || [],
            env: c.env || {},
            headers: c.headers || {},
          })
        }
      }
    }
  }
  return connectors
}

/**
 * List LSP server definitions from a plugin's manifest (`lspServers` record).
 *
 * Accepts either a directory path (reads the on-disk manifest via
 * `readPluginManifest`) or a pre-resolved marketplace row object (uses
 * `row.lspServers` directly). The fallback path lets the plugin detail
 * surface LSP servers in browse mode, where the plugin directory itself
 * is only a README placeholder and the lspServers live in marketplace.json.
 */
export function listLspServers(input) {
  let raw
  if (typeof input === 'string') {
    raw = readPluginManifest(input)?.lspServers
  } else if (input && typeof input === 'object' && !Array.isArray(input)) {
    raw = input.lspServers
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const out = []
  for (const [name, cfg] of Object.entries(raw)) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
    out.push({
      name,
      command: cfg.command || null,
      args: Array.isArray(cfg.args) ? cfg.args : [],
      env: (cfg.env && typeof cfg.env === 'object') ? cfg.env : {},
      extensionToLanguage: (cfg.extensionToLanguage && typeof cfg.extensionToLanguage === 'object') ? cfg.extensionToLanguage : {},
      initializationOptions: cfg.initializationOptions ?? null,
      configuration: cfg.configuration ?? null,
      startupTimeout: cfg.startupTimeout ?? null,
    })
  }
  return out
}

/** Full detail view for one plugin (installed copy or cache). */
export function pluginDetail(sourceId, pluginName, source, rowFallback) {
  const dir = pluginContentDir(sourceId, pluginName, source)
  if (!dir) return null
  const manifest = readPluginManifest(dir)
  // LSP servers: prefer the on-disk manifest (post-install writes `lspServers`
  // into `installed/<name>/.claude-plugin/plugin.json`); if absent — e.g. when
  // browsing an uninstalled plugin whose directory is only a README placeholder
  // — fall back to the `lspServers` field carried by the marketplace row.
  let lspServers = listLspServers(dir)
  if (lspServers.length === 0 && rowFallback) {
    lspServers = listLspServers(rowFallback)
  }
  return {
    name: pluginName,
    displayName: manifest?.displayName || rowFallback?.displayName || formatDisplayName(pluginName),
    description: manifest?.description || rowFallback?.description || '',
    author: manifest?.author?.name || (typeof manifest?.author === 'string' ? manifest.author : rowFallback?.author),
    version: manifest?.version || rowFallback?.version,
    icons: buildPluginIcons(manifest, { sourceId, name: pluginName, dir, source }),
    skills: listSkills(dir),
    agents: listAgents(dir).map((a) => ({
      file: a.file,
      name: a.name,
      displayName: a.displayName || a.name,
      description: a.description,
      tools: a.tools || null,
      model: a.model || null,
    })),
    prompts: listPrompts(dir),
    connectors: listConnectors(dir),
    hooks: listHooks(dir),
    lspServers,
  }
}

/** Recursively copy a directory (plain JS; avoids shell dependency). */
export function copyDir(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const src = join(from, entry)
    const dest = join(to, entry)
    if (statSync(src).isDirectory()) {
      copyDir(src, dest)
    } else {
      copyFileSync(src, dest)
    }
  }
}
