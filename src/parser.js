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
import { join, basename } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { sourceCacheDir } from './store.js'
import { safeSegment } from './market.js'
import { parseAgentDefinition } from './agents-map.js'

const DIR_PARSER_CACHE = new Map()
const DIR_PARSER_CACHE_TTL = 20000 // 20s TTL for file scanning

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

function normalizeRow(row, sourceId) {
  if (!row) return null
  const name = typeof row.name === 'string' ? row.name : (typeof row.identifier === 'string' ? row.identifier : '')
  if (!name || !/^[a-z0-9][a-z0-9._-]*$/i.test(name)) return null
  const cleanName = name.toLowerCase()

  const author = row.author && typeof row.author === 'object'
    ? row.author.name
    : (typeof row.author === 'string' ? row.author : undefined)

  const meta = row.meta || {}
  const displayName = row.displayName || meta.title || formatDisplayName(name)
  const description = typeof row.description === 'string'
    ? row.description
    : (typeof meta.description === 'string' ? meta.description : '')

  const source = row.source || './'

  return {
    id: `${sourceId}/${cleanName}`,
    sourceId,
    name: cleanName,
    displayName,
    description,
    author: typeof author === 'string' ? author : (meta.author || undefined),
    version: typeof row.version === 'string' ? row.version : (meta.version || undefined),
    category: typeof row.category === 'string' ? row.category : (meta.category || undefined),
    homepage: typeof row.homepage === 'string' ? row.homepage : (meta.homepage || undefined),
    source,
    local: typeof source === 'string' && (source === './' || source.startsWith('./')),
  }
}

const MARKETPLACE_CACHE = new Map()
const MARKETPLACE_CACHE_TTL = 30000 // 30 seconds

export function invalidateMarketplaceCache(sourceId) {
  if (sourceId) {
    MARKETPLACE_CACHE.delete(sourceId)
  } else {
    MARKETPLACE_CACHE.clear()
  }
}

/**
 * Universal Marketplace Reader.
 * Inspects a source repository cache and extracts all discoverable plugins.
 */
export function readMarketplace(sourceId) {
  safeSegment(sourceId, 'source id')
  const cache = sourceCacheDir(sourceId)
  if (!existsSync(cache)) return []

  const now = Date.now()
  const cached = MARKETPLACE_CACHE.get(sourceId)
  if (cached && (now - cached.time < MARKETPLACE_CACHE_TTL)) {
    return cached.data
  }

  const rows = parseMarketplaceFromDisk(sourceId, cache)
  MARKETPLACE_CACHE.set(sourceId, { time: now, data: rows })
  return rows
}

function parseMarketplaceFromDisk(sourceId, cache) {
  // 1. Check Multi-Plugin Manifest Candidates
  const manifestCandidates = [
    join(cache, '.claude-plugin', 'marketplace.json'),
    join(cache, 'marketplace.json'),
    join(cache, 'claude-plugins.json'),
    join(cache, 'registry.json'),
    join(cache, 'plugins.json'),
    join(cache, 'catalog.json'),
    join(cache, 'market.json'),
    join(cache, 'mcp-servers.json'),
    join(cache, 'servers.json'),
    join(cache, 'index.json'),
    join(cache, '.well-known', 'agent-card.json'),
  ]

  for (const manifestPath of manifestCandidates) {
    if (existsSync(manifestPath)) {
      try {
        const content = JSON.parse(readFileSync(manifestPath, 'utf8'))
        // Case A: Claude / standard manifest with plugins array
        if (Array.isArray(content.plugins)) {
          const rows = content.plugins.map((r) => normalizeRow(r, sourceId)).filter(Boolean)
          if (rows.length > 0) return rows
        }
        // Case B: Direct array of plugin descriptors
        if (Array.isArray(content)) {
          const rows = content.map((r) => normalizeRow(r, sourceId)).filter(Boolean)
          if (rows.length > 0) return rows
        }
        // Case C: MCP Servers dictionary (mcpServers or servers object)
        const mcpDict = (content.mcpServers && typeof content.mcpServers === 'object')
          ? content.mcpServers
          : ((content.servers && typeof content.servers === 'object') ? content.servers : null)
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
            }, sourceId))
          }
          if (rows.filter(Boolean).length > 0) return rows.filter(Boolean)
        }
      } catch {
        // Continue fallback search on malformed JSON
      }
    }
  }

  // 2. Monorepo subdirectories auto-discovery (plugins/*, skills/*, packages/*, tools/*, extensions/*)
  const monoDirs = ['plugins', 'skills', 'packages', 'tools', 'extensions']
  const monoRows = []
  for (const sub of monoDirs) {
    const subRoot = join(cache, sub)
    if (existsSync(subRoot)) {
      try {
        for (const entry of readdirSync(subRoot, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const entryDir = join(subRoot, entry.name)
            const hasSkill = existsSync(join(entryDir, 'SKILL.md')) || existsSync(join(entryDir, 'skills')) || existsSync(join(entryDir, 'commands'))
            const hasManifest = existsSync(join(entryDir, '.claude-plugin', 'plugin.json')) || existsSync(join(entryDir, 'plugin.json')) || existsSync(join(entryDir, 'package.json'))
            const hasMcp = existsSync(join(entryDir, 'mcp.json')) || existsSync(join(entryDir, '.mcp.json')) || existsSync(join(entryDir, 'server.json'))
            const hasAgents = existsSync(join(entryDir, 'agents'))

            if (hasSkill || hasManifest || hasMcp || hasAgents) {
              let displayName = formatDisplayName(entry.name)
              let description = ''
              let version = '1.0.0'
              let author = undefined

              const manifest = readPluginManifest(entryDir)
              if (manifest) {
                if (manifest.displayName) displayName = manifest.displayName
                if (manifest.description) description = manifest.description
                if (manifest.version) version = manifest.version
                if (manifest.author) author = typeof manifest.author === 'string' ? manifest.author : manifest.author.name
              } else if (existsSync(join(entryDir, 'SKILL.md'))) {
                try {
                  description = extractMdDescription(readFileSync(join(entryDir, 'SKILL.md'), 'utf8'))
                } catch {}
              } else if (existsSync(join(entryDir, 'README.md'))) {
                try {
                  description = extractMdDescription(readFileSync(join(entryDir, 'README.md'), 'utf8'))
                } catch {}
              }

              monoRows.push(normalizeRow({
                name: entry.name,
                displayName,
                description,
                version,
                author,
                source: `./${sub}/${entry.name}`,
              }, sourceId))
            }
          }
        }
      } catch {}
    }
  }
  if (monoRows.filter(Boolean).length > 0) return monoRows.filter(Boolean)

  // 3. Single Standalone Root Plugin Repository
  const rootSkillMd = join(cache, 'SKILL.md')
  const rootSkillsDir = join(cache, 'skills')
  const rootCommandsDir = join(cache, 'commands')
  const rootAgentsDir = join(cache, 'agents')
  const rootHooksDir = join(cache, 'hooks')
  const rootMcp = join(cache, 'mcp.json')
  const rootDotMcp = join(cache, '.mcp.json')
  const rootServerJson = join(cache, 'server.json')
  const rootPluginJson = join(cache, '.claude-plugin', 'plugin.json')
  const rootDirectPluginJson = join(cache, 'plugin.json')
  const rootCursorRules = join(cache, '.cursor', 'rules')
  const rootCursorRulesFile = join(cache, '.cursorrules')
  const rootPkgJson = join(cache, 'package.json')

  const isRootPlugin = existsSync(rootSkillMd)
    || existsSync(rootSkillsDir)
    || existsSync(rootCommandsDir)
    || existsSync(rootAgentsDir)
    || existsSync(rootHooksDir)
    || existsSync(rootMcp)
    || existsSync(rootDotMcp)
    || existsSync(rootServerJson)
    || existsSync(rootPluginJson)
    || existsSync(rootDirectPluginJson)
    || existsSync(rootCursorRules)
    || existsSync(rootCursorRulesFile)
    || existsSync(rootPkgJson)

  if (isRootPlugin) {
    let name = sourceId
    let displayName = formatDisplayName(sourceId)
    let description = ''
    let version = '1.0.0'
    let author = undefined

    const manifest = readPluginManifest(cache)
    if (manifest) {
      if (manifest.name) name = manifest.name
      if (manifest.displayName) displayName = manifest.displayName
      if (manifest.description) description = manifest.description
      if (manifest.version) version = manifest.version
      if (manifest.author) author = typeof manifest.author === 'string' ? manifest.author : manifest.author.name
    } else if (existsSync(rootSkillMd)) {
      try {
        description = extractMdDescription(readFileSync(rootSkillMd, 'utf8'))
      } catch {}
    } else if (existsSync(join(cache, 'README.md'))) {
      try {
        description = extractMdDescription(readFileSync(join(cache, 'README.md'), 'utf8'))
      } catch {}
    }

    return [normalizeRow({
      name,
      displayName,
      description,
      version,
      author,
      source: './',
    }, sourceId)].filter(Boolean)
  }

  return []
}

/** Resolve the directory that holds a plugin's content (cache or remote checkout). */
function pluginContentDir(sourceId, pluginName, source) {
  safeSegment(sourceId, 'source id')
  safeSegment(pluginName, 'plugin name')

  // Check if already installed
  const installed = join(sourceCacheDir('installed'), pluginName)
  if (existsSync(installed)) return installed

  // Check if in local source cache (root or subdir)
  if (typeof source === 'string' && (source === './' || source === '.' || source === '')) {
    const dir = sourceCacheDir(sourceId)
    return existsSync(dir) ? dir : null
  }
  if (typeof source === 'string' && source.startsWith('./')) {
    const rel = source.replace(/^\.\//, '')
    const dir = join(sourceCacheDir(sourceId), rel)
    return existsSync(dir) ? dir : null
  }

  // Check if in remote git cache
  if (source && typeof source === 'object' && (source.source === 'url' || source.source === 'git-subdir')) {
    if (typeof source.url === 'string') {
      const clean = String(source.url).replace(/^https?:\/\//, '').replace(/\.git$/, '')
      const remoteKey = clean.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'repo'
      const checkout = join(sourceCacheDir('remote'), remoteKey)
      const dir = source.path ? join(checkout, String(source.path)) : checkout
      return existsSync(dir) ? dir : null
    }
  }

  // Fallback check in source root
  const fallback = sourceCacheDir(sourceId)
  return existsSync(fallback) ? fallback : null
}

/** Read manifest descriptor from candidate paths in a plugin directory. */
export function readPluginManifest(dir) {
  const candidates = [
    join(dir, '.claude-plugin', 'plugin.json'),
    join(dir, '.claude-plugin', 'marketplace.json'),
    join(dir, 'plugin.json'),
    join(dir, 'manifest.json'),
    join(dir, 'server.json'),
    join(dir, 'package.json'),
    join(dir, '..', '.claude-plugin', 'plugin.json'),
    join(dir, '..', '.claude-plugin', 'marketplace.json'),
    join(dir, '..', 'plugin.json'),
    join(dir, '..', 'manifest.json'),
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
          }
        }
        return raw
      } catch {}
    }
  }
  return null
}

/** List skill & command directories/files (skills/*, commands/*, root SKILL.md, .cursor/rules). */
export function listSkills(dir) {
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
  const candidateSkillRoots = [join(dir, 'skills'), join(dir, '..', 'skills')]
  for (const sRoot of candidateSkillRoots) {
    if (existsSync(sRoot)) {
      try {
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
    const rootSkillMd = join(dir, 'SKILL.md')
    if (existsSync(rootSkillMd)) {
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
  const manifest = readPluginManifest(dir)
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
export function listAgents(dir) {
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
  const manifest = readPluginManifest(dir)
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
export function listPrompts(dir) {
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
  const manifest = readPluginManifest(dir)
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

/** Hook entries: hooks/ or plugin.json "hooks". */
export function listHooks(dir) {
  const hooks = []
  const hooksRoot = join(dir, 'hooks')
  if (existsSync(hooksRoot)) {
    const mainHooksJson = join(hooksRoot, 'hooks.json')
    const mainHooksYaml = join(hooksRoot, 'hooks.yaml')
    const mainHooksYml = join(hooksRoot, 'hooks.yml')
    const configFile = existsSync(mainHooksJson) ? mainHooksJson : (existsSync(mainHooksYaml) ? mainHooksYaml : (existsSync(mainHooksYml) ? mainHooksYml : null))

    if (configFile) {
      try {
        const raw = readFileSync(configFile, 'utf8')
        const parsed = configFile.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw)
        const hookObj = parsed?.hooks || parsed
        if (hookObj && typeof hookObj === 'object') {
          for (const [eventName, val] of Object.entries(hookObj)) {
            const formattedEvent = formatHookEventName(eventName)
            if (Array.isArray(val)) {
              for (const item of val) {
                const matcher = item && typeof item === 'object' && item.matcher ? `: ${item.matcher}` : ''
                hooks.push(`${formattedEvent}${matcher}`)
              }
            } else if (val && typeof val === 'object') {
              const matcher = val.matcher ? `: ${val.matcher}` : ''
              hooks.push(`${formattedEvent}${matcher}`)
            } else {
              hooks.push(formattedEvent)
            }
          }
        }
      } catch {}
    } else {
      for (const entry of readdirSync(hooksRoot, { withFileTypes: true })) {
        if (entry.isFile() && !entry.name.startsWith('.') && !entry.name.endsWith('.md')) {
          hooks.push(entry.name)
        }
      }
    }
  }
  const manifest = readPluginManifest(dir)
  if (manifest && manifest.hooks && hooks.length === 0) {
    if (Array.isArray(manifest.hooks)) {
      hooks.push(...manifest.hooks.map((h) => (typeof h === 'string' ? h : h.name)).filter(Boolean))
    } else if (typeof manifest.hooks === 'object') {
      for (const [eventName, val] of Object.entries(manifest.hooks)) {
        const formattedEvent = formatHookEventName(eventName)
        if (Array.isArray(val)) {
          for (const item of val) {
            const matcher = item && typeof item === 'object' && item.matcher ? `: ${item.matcher}` : ''
            hooks.push(`${formattedEvent}${matcher}`)
          }
        } else {
          hooks.push(formattedEvent)
        }
      }
    }
  }
  return hooks
}

/** Connector-ish entries: .mcp.json, mcp.json, server.json, or plugin.json "mcp" / "connectors". */
export function listConnectors(dir) {
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
                type: cfg.type || (cfg.url ? 'http' : 'stdio'),
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

  const manifest = readPluginManifest(dir)
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
            type: cfg.type || (cfg.url ? 'http' : 'stdio'),
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
            type: c.type || (c.url ? 'http' : 'stdio'),
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

/** Full detail view for one plugin (installed copy or cache). */
export function pluginDetail(sourceId, pluginName, source) {
  const dir = pluginContentDir(sourceId, pluginName, source)
  if (!dir) return null
  const manifest = readPluginManifest(dir)
  return {
    name: pluginName,
    displayName: manifest?.displayName || manifest?.name || formatDisplayName(pluginName),
    description: manifest?.description || '',
    author: manifest?.author?.name || (typeof manifest?.author === 'string' ? manifest.author : undefined),
    version: manifest?.version,
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
