/**
 * Codex-style `@` Plugin selector catalog, mention grammar, and on-demand capability routing.
 *
 * Exposes installed & enabled plugins (excluding disabled plugins, `user-mcp`, and
 * standalone/uploaded skills) for the DSH composer `@` trigger menu, reuses plugin
 * browse-card smart descriptions (`shortDescription || description || "by <author>"`)
 * and icons, and injects a compact Codex-style capability notice on `agent/pre-step`
 * so the model selectively loads only relevant skills via the native `skill` tool.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { dshHome, dshSkillsDir, installedDir, isSameOrInsidePath, readState, resolveOptionalService, slugify, statePath, stateRevision } from './store.js'
import {
  formatDisplayName,
  listAgents,
  listPrompts,
  listSkills,
  parserCacheRevision,
  readMarketplace,
  readPluginManifest,
  readPluginShortDescription,
} from './parser.js'
import {
  findDshMainNodeModules,
  getConnectorEntry,
  getPluginConnectors,
  installedPluginIconIdentity,
} from './install.js'
import { localIconCacheRevision } from './icons.js'
import { isUploadedSkillTarget } from './skill-uploads.js'

export const PLUGIN_MENTION_SCHEME = 'uph-plugin:'
export const AT_PLUGINS_BOOT_LIMIT = 128 * 1024

const SKILL_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WIRE_MENTION_RE = /@\[([^\]\n]+)\]\(uph-plugin:([^)\s]+)\)/uy
const WIRE_MENTION_TEXT_RE = /@\[([^\]\n]+)\]\(uph-plugin:([^)\s]+)\)/gu
const WIRE_MENTION_TRUNCATED_TAIL_RE = /@\[([^\]\n]+)\]\(uph-plugin:([^)\s]*)$/u
const TITLE_OSC_SEQUENCE_RE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu
const TITLE_CSI_SEQUENCE_RE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu
const TITLE_ESC_SEQUENCE_RE = /\u001B[@-_]/gu
const TITLE_CONTROL_CHARACTER_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu
const TITLE_DIRECTIONAL_CONTROL_RE = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu
const DEFAULT_TITLE_FALLBACK_MAX_WORDS = 5
const DEFAULT_TITLE_FALLBACK_MAX_BYTES = 40
const DEFAULT_TITLE_MAX_BYTES = 80
const RAW_AT_TOKEN_RE = /@([^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}，。；：、！？（）【】《》“”‘’」』]+)/uy
const LEFT_ALLOWED_RE = /[\s(\[{"'“‘（【《，。；：、！？\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const TRAILING_PUNCT_RE = /[.,;:!?，。；：！？)"'\]”’）】》]+$/u
const SUMMARY_MAX_CHARS = 180

let cacheEpoch = 0
let cachedCatalog = null // { home, stamp, plugins }
let cachedCreateUserMessage = null

export function invalidateAtPluginsCache() {
  cacheEpoch += 1
  cachedCatalog = null
}

function statSignature(path) {
  try {
    const st = statSync(path)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return 'missing'
  }
}

function computeCatalogStamp(state) {
  const plugins = Array.isArray(state?.plugins) ? state.plugins : []
  const parts = [
    String(cacheEpoch),
    String(stateRevision()),
    String(parserCacheRevision()),
    String(localIconCacheRevision()),
    statSignature(statePath()),
  ]
  for (const rec of plugins) {
    if (!rec?.name || rec.name === 'user-mcp' || rec.enabled === false) continue
    const dir = installedDir(rec.name)
    parts.push(
      `${rec.name}=${statSignature(dir)}`,
      statSignature(join(dir, 'plugin.json')),
      statSignature(join(dir, '.claude-plugin', 'plugin.json')),
      statSignature(join(dir, '.codex-plugin', 'plugin.json')),
      statSignature(join(dir, 'manifest.json')),
      statSignature(join(dir, '.well-known', 'agent-card.json')),
      statSignature(join(dir, '.claude-plugin')),
      statSignature(join(dir, '.codex-plugin')),
      statSignature(join(dir, 'icons')),
    )
  }
  return parts.join('|')
}

function summarizePlugin(shortDescription, description, author) {
  return shortDescription || description || (author ? `by ${author}` : '')
}

function buildMarketplaceLookup(plugins) {
  const bySource = new Map()
  for (const rec of plugins) {
    const sourceId = rec?.sourceId
    if (!sourceId || bySource.has(sourceId)) continue
    const map = new Map()
    try {
      for (const row of readMarketplace(sourceId)) {
        if (row?.name) map.set(row.name, row)
      }
    } catch {
      // Missing/uncloned source metadata gracefully falls back to installed manifest fields.
    }
    bySource.set(sourceId, map)
  }
  return bySource
}

function buildAtPluginEntry(rec, marketRow) {
  const target = installedDir(rec.name)
  if (!existsSync(target)) return null
  const manifest = readPluginManifest(target)
  const identity = installedPluginIconIdentity(rec, target, manifest, marketRow)
  const displayName = rec.displayName || manifest?.displayName || marketRow?.displayName || formatDisplayName(rec.name)
  const shortDescription = rec.shortDescription || readPluginShortDescription(target) || marketRow?.shortDescription || ''
  const description = rec.description || manifest?.description || marketRow?.description || ''
  const author = typeof identity.author === 'string' ? identity.author : (identity.author?.name || '')
  return {
    name: rec.name,
    displayName,
    shortDescription,
    description,
    summary: summarizePlugin(shortDescription, description, author),
    sourceId: rec.sourceId || '',
    author,
    homepage: identity.homepage,
    source: identity.source,
    icons: identity.icons,
  }
}

/**
 * Return currently installed & enabled plugins for the `@` selector popup.
 * Excludes disabled plugins, `user-mcp`, and standalone/uploaded skills.
 */
export function listAtPlugins() {
  const home = dshHome()
  const state = readState()
  const stamp = computeCatalogStamp(state)
  if (cachedCatalog && cachedCatalog.home === home && cachedCatalog.stamp === stamp) {
    return cachedCatalog.plugins
  }

  const rawPlugins = Array.isArray(state.plugins) ? state.plugins : []
  const marketLookup = buildMarketplaceLookup(rawPlugins)
  const items = []
  for (const rec of rawPlugins) {
    if (!rec || !rec.name || rec.name === 'user-mcp' || rec.enabled === false) continue
    const entry = buildAtPluginEntry(rec, marketLookup.get(rec.sourceId)?.get(rec.name) || null)
    if (entry) items.push(entry)
  }
  items.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name, undefined, { sensitivity: 'base' }))
  cachedCatalog = { home, stamp, plugins: items }
  return items
}

function compactAtPluginEntry(entry, { includePreviews = true, includeDescriptions = true } = {}) {
  const icons = entry.icons && typeof entry.icons === 'object'
    ? (includePreviews ? entry.icons : { light: entry.icons.light || [], dark: entry.icons.dark || [] })
    : undefined
  if (!includeDescriptions) {
    return {
      name: entry.name,
      displayName: entry.displayName,
      summary: entry.summary,
      sourceId: entry.sourceId,
      author: entry.author,
      homepage: entry.homepage,
      source: entry.source,
      ...(icons ? { icons } : {}),
    }
  }
  return {
    ...entry,
    ...(icons ? { icons } : {}),
  }
}

/** Build a 128 KB-bounded boot global payload so cold `@` popups render with zero HTTP round-trip. */
export function atPluginsBootPayload(limitBytes = AT_PLUGINS_BOOT_LIMIT) {
  const items = listAtPlugins()
  const profiles = [
    { includePreviews: true, includeDescriptions: true },
    { includePreviews: false, includeDescriptions: true },
    { includePreviews: false, includeDescriptions: false },
  ]
  for (const profile of profiles) {
    const candidate = items.map(item => compactAtPluginEntry(item, profile))
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') <= limitBytes) {
      return candidate
    }
  }
  const bounded = []
  let bytes = 2
  for (const item of items) {
    const compact = compactAtPluginEntry(item, { includePreviews: false, includeDescriptions: false })
    const size = Buffer.byteLength(JSON.stringify(compact), 'utf8') + (bounded.length ? 1 : 0)
    if (bytes + size > limitBytes) break
    bounded.push(compact)
    bytes += size
  }
  return bounded
}

/** Format a selected `@` plugin mention using durable markdown link wire syntax. */
export function formatPluginMention(pluginName, displayName) {
  const id = String(pluginName || '').trim()
  const label = String(displayName || id).replace(/[\r\n\[\]]+/g, ' ').trim() || id
  return `@[${label}](${PLUGIN_MENTION_SCHEME}${encodeURIComponent(id)})`
}

function isAtLeftBoundary(text, index) {
  return index === 0 || LEFT_ALLOWED_RE.test(text[index - 1])
}

/**
 * Scan text for explicit `@[Display](uph-plugin:name)` chips and single-token `@plugin-id` mentions.
 * Enforces strict token boundaries so `@computer use` never matches `computer-use` across spaces and
 * `@remotion/player` or `user@remotion.com` never falsely trigger `@remotion`.
 */
export function extractPluginMentions(text, knownByName) {
  if (typeof text !== 'string' || !text.includes('@') || !(knownByName instanceof Map) || knownByName.size === 0) {
    return []
  }
  const matches = []
  let cursor = 0
  while (cursor < text.length) {
    const at = text.indexOf('@', cursor)
    if (at < 0) break
    WIRE_MENTION_RE.lastIndex = at
    const wire = WIRE_MENTION_RE.exec(text)
    if (wire !== null) {
      if (isAtLeftBoundary(text, at)) {
        try {
          const decoded = decodeURIComponent(wire[2])
          const plugin = knownByName.get(decoded.toLowerCase())
          if (plugin) {
            matches.push({ start: at, end: at + wire[0].length, via: 'chip', plugin })
          }
        } catch {
          // Malformed percent encoding inside wire target stays ignored as ordinary text.
        }
      }
      cursor = at + wire[0].length
      continue
    }

    if (!isAtLeftBoundary(text, at)) {
      cursor = at + 1
      continue
    }

    RAW_AT_TOKEN_RE.lastIndex = at
    const raw = RAW_AT_TOKEN_RE.exec(text)
    if (raw !== null && !raw[1].startsWith('"')) {
      const cleaned = raw[1].replace(TRAILING_PUNCT_RE, '')
      if (cleaned.length > 0) {
        const plugin = knownByName.get(cleaned.toLowerCase())
        if (plugin) {
          matches.push({ start: at, end: at + 1 + cleaned.length, via: 'manual', plugin })
          cursor = at + 1 + cleaned.length
          continue
        }
      }
    }
    cursor = at + 1
  }
  return matches
}

function truncateOneLine(text, max = SUMMARY_MAX_CHARS) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function pluginOwnsSkillFile(target, installedRoot, mirrorRoot, file) {
  if (typeof file !== 'string' || !isAbsolute(file)) return false
  const nativeRoot = dshSkillsDir()
  const isInstalled = isSameOrInsidePath(file, target) || isSameOrInsidePath(file, installedRoot)
  const mirrorDir = dirname(file)
  const isMirror = basename(file).toLowerCase() === 'skill.md' &&
    [nativeRoot, mirrorRoot].some(root => isSameOrInsidePath(dirname(mirrorDir), root) && isSameOrInsidePath(root, dirname(mirrorDir)))
  if (!isInstalled && !isMirror) return false
  try {
    const canonical = realpathSync.native(file)
    if (isInstalled) return isSameOrInsidePath(canonical, installedRoot)
    if (isUploadedSkillTarget(join(nativeRoot, basename(mirrorDir)))) return false
    // Native discovery resolves the active copy. Its content must still match
    // this plugin's normalized mirror source, even when another plugin shares its folder name.
    const mirrorFile = mirrorRoot && join(mirrorRoot, basename(mirrorDir), basename(file))
    if (!isSameOrInsidePath(canonical, mirrorFile)) return false
    const original = join(target, 'skills', basename(mirrorDir), 'SKILL.md')
    return isSameOrInsidePath(realpathSync.native(original), installedRoot) &&
      readFileSync(original).equals(readFileSync(canonical))
  } catch {
    return false
  }
}

function resolveCallablePluginSkills(target, manifest, snapshotSkills) {
  const seen = new Set()
  const resolved = []
  if (Array.isArray(snapshotSkills)) {
    let installedRoot
    try { installedRoot = realpathSync.native(target) } catch { return [] }
    let mirrorRoot
    try { mirrorRoot = realpathSync.native(dshSkillsDir()) } catch {}
    for (const skill of snapshotSkills) {
      if (typeof skill?.name !== 'string' || !skill.name || skill.enabled === false ||
          skill.modelInvocable === false || skill.invocation?.modelInvocable === false) continue
      const lower = skill.name.toLowerCase()
      if (seen.has(lower) || !pluginOwnsSkillFile(target, installedRoot, mirrorRoot, skill.path)) continue
      seen.add(lower)
      resolved.push({
        name: skill.name,
        description: truncateOneLine(skill.description),
      })
    }
    return resolved
  }

  for (const item of listSkills(target, manifest)) {
    const name = SKILL_SLUG_RE.test(item.name || '')
      ? item.name
      : (SKILL_SLUG_RE.test(item.dirName || '') ? item.dirName : slugify(item.name || item.dirName || ''))
    if (!name) continue
    const lower = name.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    resolved.push({
      name,
      description: truncateOneLine(item.description),
    })
  }
  return resolved
}

/** Collect a plugin's loadable skills, enabled MCP servers, agents/subagents, and prompts. */
export function collectPluginCapabilities(pluginName, options = {}) {
  const target = installedDir(pluginName)
  if (!existsSync(target)) {
    return { skills: [], mcpServers: [], agents: [], prompts: [] }
  }
  const manifest = readPluginManifest(target)
  const snapshotSkills = Array.isArray(options.snapshotSkills) ? options.snapshotSkills : null
  const skills = resolveCallablePluginSkills(target, manifest, snapshotSkills)
  const connectors = getPluginConnectors(target, manifest)
  const mcpServers = []
  for (const connector of connectors) {
    if (!connector?.name) continue
    const entry = getConnectorEntry(pluginName, connector.name)
    if (!entry || entry.enabled === false) continue
    mcpServers.push({
      id: entry.id,
      name: connector.name,
      transport: connector.transport || entry.config?.type || 'stdio',
    })
  }
  const agents = listAgents(target, manifest).map((a) => ({
    name: a.name,
    description: truncateOneLine(a.description),
  }))
  const prompts = listPrompts(target, manifest)
    .map((p) => (typeof p === 'string'
      ? { name: p, description: '' }
      : { name: p?.name || '', description: truncateOneLine(p?.description) }))
    .filter((p) => p.name)
  return { skills, mcpServers, agents, prompts }
}

function escapeXmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Build the Codex-style on-demand capability routing reminder text for one or more referenced plugins. */
export function renderExplicitPluginInstructions(entries) {
  const sections = [
    '<system-reminder>',
    'The user explicitly referenced the following installed plugin(s). Prioritize their capabilities for this turn using Codex-style selective on-demand loading:',
    '',
  ]
  for (const { plugin, capabilities } of entries) {
    const attrs = [
      `name="${escapeXmlAttr(plugin.displayName || plugin.name)}"`,
      `id="${escapeXmlAttr(plugin.name)}"`,
      plugin.summary ? `summary="${escapeXmlAttr(truncateOneLine(plugin.summary))}"` : '',
    ].filter(Boolean).join(' ')
    sections.push(`<explicit_plugin ${attrs}>`)
    const hasAny = capabilities.skills.length || capabilities.mcpServers.length || capabilities.agents.length || capabilities.prompts.length
    if (!hasAny) {
      sections.push('No active skills or enabled MCP servers are currently available for this plugin (any MCP connectors may be disabled or awaiting authentication).')
    } else {
      if (capabilities.skills.length) {
        sections.push('Available skills (call the `skill` tool ONLY for the specific skill(s) relevant to the request):')
        for (const s of capabilities.skills) {
          sections.push(s.description ? `- ${s.name}: ${s.description}` : `- ${s.name}`)
        }
      }
      if (capabilities.mcpServers.length) {
        sections.push('Enabled MCP servers (use their exposed MCP tools directly when relevant; disabled connectors are excluded):')
        for (const m of capabilities.mcpServers) {
          sections.push(`- ${m.name} (${m.id})`)
        }
      }
      if (capabilities.agents.length) {
        sections.push('Available subagents / agents:')
        for (const a of capabilities.agents) {
          sections.push(a.description ? `- ${a.name}: ${a.description}` : `- ${a.name}`)
        }
      }
      if (capabilities.prompts.length) {
        sections.push('Available plugin prompts / commands:')
        for (const p of capabilities.prompts) {
          sections.push(p.description ? `- ${p.name}: ${p.description}` : `- ${p.name}`)
        }
      }
    }
    sections.push('</explicit_plugin>', '')
  }
  sections.push(
    'Routing rules:',
    '1. Select intelligently: call the `skill` tool (`{ "name": "<skill-name>" }`) ONLY for the skill(s) clearly needed for the user task — never load unrelated skills just because they share a plugin.',
    '2. Follow loaded skill instructions before taking action.',
    '3. Use the listed enabled MCP tools directly when helpful; do not assume disabled or unlisted MCP servers are active.',
    '</system-reminder>',
  )
  return sections.join('\n')
}

function getUserMessageCreator(resolveDshModules = findDshMainNodeModules) {
  if (cachedCreateUserMessage) return cachedCreateUserMessage
  try {
    const main = resolveDshModules?.()
    if (main) {
      const req = createRequire(join(main, '.universal-plugin-hub-resolve.cjs'))
      const llm = req('@deepseek-ai/dsh-llm')
      if (typeof llm?.createUserMessage === 'function') {
        cachedCreateUserMessage = llm.createUserMessage
        return cachedCreateUserMessage
      }
    }
  } catch {
    // Fall back when running outside a live DSH host tree (e.g. standalone unit tests).
  }
  const deepFreeze = (value) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
    return value
  }
  return (input) => deepFreeze(structuredClone({
    role: 'user',
    ...input,
    id: randomUUID(),
  }))
}

/**
 * Register the `agent/pre-step` waterfall interceptor on DSH's agent service.
 * Inspects only step-incoming user messages (`source.kind === 'user'`) for `@` plugin
 * references and appends a compact `notice`-form context injection after workspace rules.
 */
export function attachAtPluginsAgentHook(hostCtx, options = {}) {
  const listPluginsFn = options.listPlugins || listAtPlugins
  const collectCapsFn = options.collectCapabilities || collectPluginCapabilities
  const createMessageFn = options.createUserMessage || getUserMessageCreator(options.findDshMainNodeModules)

  if (typeof hostCtx?.on !== 'function') return () => {}
  return hostCtx.on('agent/pre-step', async ({ agent, messages, signal } = {}, next) => {
    const decision = await next()
    if (!decision || decision.kind === 'reject') return decision
    if (!Array.isArray(messages) || messages.length === 0) return decision

    const plugins = listPluginsFn()
    if (!plugins.length) return decision

    const knownByName = new Map(plugins.map((p) => [p.name.toLowerCase(), p]))
    const mentioned = []
    const seenNames = new Set()

    for (const msg of messages) {
      if (!msg || msg.source?.kind !== 'user' || !Array.isArray(msg.content)) continue
      for (const block of msg.content) {
        if (!block || block.type !== 'text' || typeof block.text !== 'string') continue
        for (const match of extractPluginMentions(block.text, knownByName)) {
          const lower = match.plugin.name.toLowerCase()
          if (seenNames.has(lower)) continue
          seenNames.add(lower)
          mentioned.push(match.plugin)
        }
      }
    }

    if (mentioned.length === 0) return decision
    if (Array.isArray(decision.messages) && decision.messages.some((m) => m?.source?.kind === 'plugin-routing')) {
      return decision
    }
    signal?.throwIfAborted?.()

    let snapshotSkills = null
    try {
      const skillsService = resolveOptionalService(hostCtx, 'skills')
      if (typeof skillsService?.snapshot === 'function') {
        const workingDirectory = resolveOptionalService(hostCtx, 'workingDirectory')
        const cwd = agent !== undefined
          ? (typeof workingDirectory?.ensure === 'function'
            ? await workingDirectory.ensure(agent, signal)
            : (agent?.session && typeof workingDirectory?.get === 'function'
              ? workingDirectory.get(agent.session)
              : undefined))
          : undefined
        signal?.throwIfAborted?.()
        const snapshot = await skillsService.snapshot({ cwd, signal, scope: agent })
        if (snapshot && Array.isArray(snapshot.skills)) {
          snapshotSkills = snapshot.skills
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) throw err
      // Snapshot lookup failed cleanly; fall back to local plugin skill manifest scan.
    }
    signal?.throwIfAborted?.()

    const entries = mentioned.map((plugin) => ({
      plugin,
      capabilities: collectCapsFn(plugin.name, { snapshotSkills }),
    }))
    const injection = createMessageFn({
      content: [{ type: 'text', text: renderExplicitPluginInstructions(entries) }],
      source: {
        kind: 'plugin-routing',
        form: 'notice',
      },
    })

    return {
      ...decision,
      messages: [...(Array.isArray(decision.messages) ? decision.messages : []), injection],
    }
  })
}

function safeDecodePluginTarget(rawTarget) {
  try {
    return decodeURIComponent(rawTarget)
  } catch {
    return rawTarget
  }
}

function cleanDshTitleText(input) {
  if (typeof input !== 'string') return ''
  return input
    .replace(TITLE_OSC_SEQUENCE_RE, '')
    .replace(TITLE_CSI_SEQUENCE_RE, '')
    .replace(TITLE_ESC_SEQUENCE_RE, '')
    .replace(TITLE_CONTROL_CHARACTER_RE, '')
    .replace(TITLE_DIRECTIONAL_CONTROL_RE, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function truncateTitleUtf8(input, maxBytes) {
  let used = 0
  let out = ''
  for (const character of input) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > maxBytes) break
    used += bytes
    out += character
  }
  return out
}

function normalizeDshTitle(input, maxBytes) {
  return truncateTitleUtf8(cleanDshTitleText(input), maxBytes).trimEnd()
}

function fallbackDshTitle(input, maxWords, maxBytes) {
  return truncateTitleUtf8(
    cleanDshTitleText(input).split(' ').filter(Boolean).slice(0, maxWords).join(' '),
    maxBytes,
  ).trimEnd()
}

/**
 * Replace `@[DisplayName](uph-plugin:id)` wire mentions (including truncated
 * trailing `uph-plugin:` fragments) with readable plugin display names.
 */
export function stripPluginMentionsFromTitle(text) {
  if (typeof text !== 'string') return ''
  if (!text.includes('@[')) return text
  const replaceMention = (_full, displayName, rawId) => {
    if (cleanDshTitleText(displayName).length > 0) return displayName
    return rawId ? safeDecodePluginTarget(rawId) : ''
  }
  return text
    .replace(WIRE_MENTION_TEXT_RE, replaceMention)
    .replace(WIRE_MENTION_TRUNCATED_TAIL_RE, replaceMention)
}

function resolvePositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function resolveTitleLimits(sessionTitle) {
  const cfg = sessionTitle && typeof sessionTitle === 'object' ? sessionTitle.config : null
  return {
    fallbackMaxWords: resolvePositiveInt(cfg?.fallbackMaxWords, DEFAULT_TITLE_FALLBACK_MAX_WORDS),
    fallbackMaxBytes: resolvePositiveInt(cfg?.fallbackMaxBytes, DEFAULT_TITLE_FALLBACK_MAX_BYTES),
    maxTitleBytes: resolvePositiveInt(cfg?.maxTitleBytes, DEFAULT_TITLE_MAX_BYTES),
  }
}

function extractUserMessageText(event) {
  if (!event || event.type !== 'user/message' || event.data?.source?.kind !== 'user') return undefined
  const content = Array.isArray(event.data.content) ? event.data.content : []
  const text = content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
  return normalizeDshTitle(text, Number.MAX_SAFE_INTEGER).length > 0 ? text : undefined
}

function isLiveSession(sessions, session) {
  if (!session || typeof session.append !== 'function') return false
  if (sessions && typeof sessions.get === 'function') {
    return sessions.get(session.id) === session
  }
  return true
}

function readSessionEvent(session, seq) {
  if (typeof seq !== 'number') return undefined
  if (typeof session.eventAt === 'function') {
    return session.eventAt(seq)
  }
  if (typeof session.snapshotEvents === 'function') {
    return session.snapshotEvents().find((item) => item?.seq === seq)
  }
  return undefined
}

function readFirstTitleUserMessage(session) {
  if (typeof session?.snapshotEvents !== 'function') return undefined
  for (const item of session.snapshotEvents()) {
    const text = extractUserMessageText(item)
    if (text !== undefined) {
      return { seq: item.seq, text }
    }
  }
  return undefined
}

function readCurrentTitleSnapshot(sessionTitle, session) {
  if (typeof sessionTitle?.get === 'function') {
    return sessionTitle.get(session)
  }
  if (typeof session?.snapshotEvents === 'function') {
    const events = session.snapshotEvents()
    for (let i = events.length - 1; i >= 0; i--) {
      const item = events[i]
      if (item?.type === 'session/title') {
        return {
          title: item.data?.title,
          messageSeqs: item.data?.messageSeqs,
          source: item.data?.source,
          eventSeq: item.seq,
        }
      }
    }
  }
  return undefined
}

function cloneTitleSource(source) {
  if (source?.kind === 'provider') {
    const cloned = {
      kind: 'provider',
      provider: source.provider,
    }
    if (source.model && typeof source.model === 'object') {
      cloned.model = {
        provider: source.model.provider,
        model: source.model.model,
      }
    }
    return cloned
  }
  return { kind: 'fallback' }
}

function safeAppendCleanedTitle(session, payload) {
  if (!payload?.title) return
  try {
    session.append('session/title', payload)
  } catch {
    // Ignore store detachment or concurrent disposal races.
  }
}

/**
 * Subscribe to DSH `session/event` so fallback and LLM provider session titles
 * strip `@[DisplayName](uph-plugin:id)` wire markup while preserving the raw
 * `user/message` events used by `@` routing and chat chips.
 */
export function attachAtPluginsSessionTitleHook(hostCtx) {
  if (typeof hostCtx?.on !== 'function') return () => {}
  let disposed = false

  const handleUserMessage = (session, event) => {
    const sessionTitle = resolveOptionalService(hostCtx, 'sessionTitle')
    if (!sessionTitle) return
    const rawText = extractUserMessageText(event)
    if (rawText === undefined || !rawText.includes('uph-plugin:')) return

    // 1-hop microtask beats DSH SessionTitleService's 2-hop defer -> ensureFallback
    // while keeping onUserMessage's synchronous state.pending scheduling intact.
    queueMicrotask(() => {
      if (disposed) return
      const liveSessions = resolveOptionalService(hostCtx, 'sessions')
      const liveTitleService = resolveOptionalService(hostCtx, 'sessionTitle')
      if (!liveTitleService || !isLiveSession(liveSessions, session)) return
      if (readCurrentTitleSnapshot(liveTitleService, session) !== undefined) return

      const first = readFirstTitleUserMessage(session)
      if (!first) return
      const limits = resolveTitleLimits(liveTitleService)
      const nativeFallback = fallbackDshTitle(first.text, limits.fallbackMaxWords, limits.fallbackMaxBytes)
      const cleanedFallback = fallbackDshTitle(
        stripPluginMentionsFromTitle(first.text),
        limits.fallbackMaxWords,
        limits.fallbackMaxBytes,
      )
      if (!cleanedFallback || cleanedFallback === nativeFallback) return

      safeAppendCleanedTitle(session, {
        title: cleanedFallback,
        messageSeqs: [first.seq],
        source: { kind: 'fallback' },
      })
    })
  }

  const handleSessionTitle = (session, event) => {
    const source = event?.data?.source
    if (!source || source.kind === 'user') return
    if (source.kind !== 'fallback' && source.kind !== 'provider') return
    const rawTitle = event?.data?.title
    if (typeof rawTitle !== 'string' || rawTitle.length === 0) return

    const sessionTitle = resolveOptionalService(hostCtx, 'sessionTitle')
    if (!sessionTitle) return
    if (source.kind === 'provider' && !rawTitle.includes('uph-plugin:')) return

    queueMicrotask(() => {
      if (disposed) return
      const liveSessions = resolveOptionalService(hostCtx, 'sessions')
      const liveTitleService = resolveOptionalService(hostCtx, 'sessionTitle')
      if (!liveTitleService || !isLiveSession(liveSessions, session)) return

      const current = readCurrentTitleSnapshot(liveTitleService, session)
      if (!current || current.eventSeq !== event.seq || current.source?.kind === 'user') return

      const limits = resolveTitleLimits(liveTitleService)
      const messageSeqs = Array.isArray(event.data.messageSeqs) ? [...event.data.messageSeqs] : []
      let cleanedTitle = ''

      if (source.kind === 'fallback') {
        const firstSeq = messageSeqs[0]
        const firstEvent = firstSeq !== undefined ? readSessionEvent(session, firstSeq) : undefined
        const sourceText = extractUserMessageText(firstEvent)
        if (sourceText !== undefined) {
          if (!sourceText.includes('uph-plugin:')) return
          cleanedTitle = fallbackDshTitle(
            stripPluginMentionsFromTitle(sourceText),
            limits.fallbackMaxWords,
            limits.fallbackMaxBytes,
          )
        } else if (rawTitle.includes('uph-plugin:')) {
          cleanedTitle = fallbackDshTitle(
            stripPluginMentionsFromTitle(rawTitle),
            limits.fallbackMaxWords,
            limits.fallbackMaxBytes,
          )
        } else {
          return
        }
      } else {
        if (!rawTitle.includes('uph-plugin:')) return
        cleanedTitle = normalizeDshTitle(stripPluginMentionsFromTitle(rawTitle), limits.maxTitleBytes)
      }

      if (!cleanedTitle || cleanedTitle === rawTitle) return

      safeAppendCleanedTitle(session, {
        title: cleanedTitle,
        messageSeqs,
        source: cloneTitleSource(source),
      })
    })
  }

  const off = hostCtx.on('session/event', (session, event) => {
    if (disposed || !event || typeof event !== 'object') return
    if (event.type === 'user/message') {
      handleUserMessage(session, event)
    } else if (event.type === 'session/title') {
      handleSessionTitle(session, event)
    }
  })

  return () => {
    disposed = true
    if (typeof off === 'function') off()
  }
}
