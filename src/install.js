/**
 * Install / uninstall / toggle / update lifecycle for plugins.
 *
 * On install the plugin directory is copied into the hub's own
 * `installed/` tree and its `skills/` directory is registered in the
 * dsh-agent-skills scan state (`$DSH_HOME/agent-skills/state.json`), so the
 * next DSH restart (or registry re-scan) exposes the plugin's skills to
 * agents.
 */
import { existsSync, lstatSync, mkdirSync, rmSync, readFileSync, writeFileSync, renameSync, readdirSync, copyFileSync, statSync, accessSync, constants as fsConstants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename, isAbsolute, resolve, extname, delimiter } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { setImmediate as yieldToHost, setTimeout as delay } from 'node:timers/promises'
import * as yaml from 'js-yaml'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { installedDir, readState, writeState, slugify, dshHome, dshSkillsDir, safeRmDir, removeManagedDir, sourceCacheDir } from './store.js'
import { materializePlugin, pullSource, pluginPath } from './market.js'
import { copyDir, listSkills, listAgents, listPrompts, listConnectors, listHooks, listLspServers, readPluginManifest, resolveHookConfigPath, invalidateParserCaches, invalidateMarketplaceCache, readMarketplace, connectorTransport, isRemoteTransportName } from './parser.js'
import { parseAgentDefinition, compileSubagentsHubSkill, cleanupLegacyPresets } from './agents-map.js'
import { isUploadedSkillTarget } from './skill-uploads.js'
import { buildPluginIcons } from './icons.js'
import { beginOAuthVerification, completeOAuthVerification, cancelPluginOAuthVerifications, standaloneOAuthConnectorNames, saveCustomOAuthClient, readSavedOAuthClient } from './oauth.js'
import { encodeOAuthConfig, isOAuthMode, oauthCredentialKey, oauthRuntimeConfig, remoteConfigFromEntry } from './oauth-config.js'
import { oauthStoreDir, readOAuthRecord, writeOAuthRecord, deleteOAuthRecord } from './oauth-store.js'

const OAUTH_BRIDGE_PATH = fileURLToPath(new URL('./oauth-bridge.js', import.meta.url))

/** Active profile name: env DSH_PROFILE -> desktop (if present) -> web. */
export function resolveActiveProfileName() {
  if (process.env.DSH_PROFILE) return process.env.DSH_PROFILE
  const desktopDir = join(dshHome(), 'profiles', 'desktop')
  if (existsSync(desktopDir)) return 'desktop'
  return 'web'
}

/** cordis.patch.yml path (auto-detects desktop or web profile). */
export function cordisPatchPath() {
  const profileName = resolveActiveProfileName()
  const profilePatch = join(dshHome(), 'profiles', profileName, 'cordis.patch.yml')
  if (existsSync(profilePatch)) return profilePatch
  const homePatch = join(dshHome(), 'cordis.patch.yml')
  if (existsSync(homePatch)) return homePatch
  return profilePatch
}

function loadCordisPatch(file) {
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new Error(`无法读取 ${file}，已中止写入以保护现有配置。`, { cause: error })
  }
  // js-yaml can reject an empty stream. An explicit null value is still a document.
  if (source.replace(/^\uFEFF/, '').split(/\r\n?|\n/).every((line) => /^[ \t]*(?:#.*)?$/.test(line))) return []

  let parsed
  try {
    parsed = yaml.load(source)
  } catch (error) {
    throw new Error(`无法解析 ${file}，已中止写入以保护现有配置。请通过 DSH 配置文件手动修改。`, { cause: error })
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} 的顶层必须是数组，已中止写入以保护现有配置。`)
  }
  return parsed
}

export function readCordisPatch() {
  try {
    return loadCordisPatch(cordisPatchPath())
  } catch {
    return []
  }
}

export function writeCordisPatch(patch) {
  const file = cordisPatchPath()
  // A tolerant read can return [] for a DSH-specific or damaged document.
  // Check the on-disk document before any mutation can replace it.
  loadCordisPatch(file)
  mkdirSync(dirname(file), { recursive: true })
  const content = yaml.dump(patch, { indent: 2, lineWidth: -1 })
  const tmp = join(dirname(file), `.cordis.patch.${process.pid}.${Date.now().toString(36)}.tmp`)
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

export function getConnectorId(pluginName, connectorName) {
  return `mcp-${slugify(pluginName)}-${slugify(connectorName)}`
}

export function getConnectorEntry(pluginName, connectorName) {
  const patch = readCordisPatch()
  const id = getConnectorId(pluginName, connectorName)
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      const found = block.insert.find((item) => item && item.id === id)
      if (found) return found
    }
  }
  return null
}

export function connectorRequiresAuth(cfg) {
  if (!cfg) return true
  const isHttp = (connectorTransport(cfg.type, cfg.url, cfg.command) === 'http')
  
  // 1. If HTTP / SSE connector has NO valid URL or empty placeholder URL, it ALWAYS requires configuration/auth!
  if (isHttp) {
    if (!cfg.url || typeof cfg.url !== 'string' || !cfg.url.trim() || !/^https?:\/\//i.test(cfg.url.trim())) {
      return true
    }
  } else {
    // Stdio connector with NO command ALWAYS requires configuration/auth!
    if (!cfg.command || typeof cfg.command !== 'string' || !cfg.command.trim()) {
      return true
    }
  }

  // 2. If URL explicitly embeds a concrete API key / token query parameter (e.g. Tavily: ?api_key=tvly-...)
  if (cfg.url && typeof cfg.url === 'string' && /[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i.test(cfg.url)) {
    const match = cfg.url.match(/[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i)
    if (match && !match[2].includes('${') && match[2].trim().length > 3) {
      return false // Ready to connect directly without separate header
    }
  }
  // 3. Explicit template placeholders in headers (e.g. ${GITHUB_PERSONAL_ACCESS_TOKEN})
  if (cfg.headers && typeof cfg.headers === 'object') {
    if (Object.values(cfg.headers).some((v) => typeof v === 'string' && v.includes('${'))) return true
    if (Object.keys(cfg.headers).some((k) => /auth|token|key|secret/i.test(k) && !cfg.headers[k])) return true
  }
  // 4. Explicit template placeholders in env (e.g. ${NOTION_API_KEY} or ${API_KEY})
  if (cfg.env && typeof cfg.env === 'object') {
    if (Object.values(cfg.env).some((v) => typeof v === 'string' && v.includes('${'))) return true
    if (Object.keys(cfg.env).some((k) => /auth|token|key|secret|password/i.test(k) && !cfg.env[k])) return true
  }
  // 5. Known cloud MCP services that mandate authentication tokens
  const nameLower = String(cfg.name || '').toLowerCase()
  if (['github', 'notion', 'discord', 'gitlab', 'figma', 'linear', 'slack', 'sentry', 'atlassian', 'box', 'gong', 'granola', 'jira', 'confluence', 'hubspot', 'salesforce', 'zendesk', 'stripe', 'intercom', 'airtable', 'asana', 'clickup', 'trello', 'benchling'].includes(nameLower)) {
    return true
  }
  // 6. Headers with auth/token keywords
  if (cfg.headers && typeof cfg.headers === 'object' && Object.keys(cfg.headers).some((k) => /auth|token|key|secret/i.test(k))) {
    return true
  }
  // 7. Remote HTTP / SSE MCP services (public cloud endpoints require authentication unless local or public)
  if (isHttp) {
    if (cfg.url && /^https?:\/\//i.test(cfg.url) && !/localhost|127\.0\.0\.1/i.test(cfg.url)) {
      const authHeader = cfg.headers?.Authorization || cfg.headers?.authorization
      if (!authHeader || authHeader.includes('${')) {
        return true
      }
    }
  }
  return false
}

export function isConnectorAuthenticated(pluginName, connectorName) {
  const target = installedDir(pluginName)
  const connectors = existsSync(target) ? getPluginConnectors(target) : []
  const found = connectors.find((c) => c.name === connectorName)
  return connectorAuthenticated(found, getConnectorEntry(pluginName, connectorName))
}

function connectorAuthenticated(found, entry) {
  const cfg = entry?.config || found || {}

  const isHttp = (isRemoteTransportName(entry?.config?.transport) || isRemoteTransportName(found?.type) || (!found?.command && (found?.url || cfg.url)) || (!found?.command && !found?.args?.length))
  if (isHttp) {
    const url = cfg.url || found?.url || ''
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
      return false
    }
  } else {
    const cmd = cfg.command || found?.command || ''
    if (!cmd || typeof cmd !== 'string' || !cmd.trim()) {
      return false
    }
  }

  if (!found || !connectorRequiresAuth(found)) {
    return true
  }
  if (!entry) return false

  // Check embedded URL token
  const url = cfg.url || found.url || ''
  if (url && typeof url === 'string' && /[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i.test(url)) {
    const match = url.match(/[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i)
    if (match && !match[2].includes('${') && match[2].trim().length > 3) {
      return true
    }
  }
  const authHeader = cfg.headers?.Authorization || cfg.headers?.authorization || ''
  if (authHeader && !authHeader.includes('${') && authHeader.trim().length > 0) {
    return true
  }
  if (cfg.headers && Object.values(cfg.headers).some((v) => typeof v === 'string' && !v.includes('${') && v.trim().length > 0)) {
    return true
  }
  if (cfg.env && Object.values(cfg.env).some((v) => typeof v === 'string' && !v.includes('${') && v.trim().length > 0)) {
    return true
  }
  return false
}

function isRemoteConnector(config = {}) {
  return isRemoteTransportName(config.transport) || isRemoteTransportName(config.type) || (!config.command && (!!config.url || !config.args?.length))
}

function remoteConfigFingerprint(config = {}) {
  const usesOAuth = isOAuthMode(config.oauth)
  const normalized = {
    transport: 'http',
    url: String(config.url || '').trim(),
    headers: Object.fromEntries(Object.entries(config.headers || {}).filter(([key]) => {
      const name = key.toLowerCase()
      return name !== 'content-type' && (!usesOAuth || name !== 'authorization')
    }).sort(([a], [b]) => a.localeCompare(b))),
    oauth: usesOAuth ? config.oauth : 'none',
    oauthClientId: usesOAuth ? config.oauthClientId || '' : '',
    oauthScope: usesOAuth ? config.oauthScope || '' : '',
    oauthCallbackPort: usesOAuth ? Number(config.oauthCallbackPort) || null : null,
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

function setRemoteVerification(pluginName, connectorName, payload, verified) {
  const fingerprint = remoteConfigFingerprint(payload)
  const live = getConnectorEntry(pluginName, connectorName)?.config
  if (live && remoteConfigFingerprint(remoteConfigFromEntry(live) || live) !== fingerprint) return
  const key = `${pluginName}::${connectorName}`
  const state = readMcpToolsState()
  state[key] = {
    ...(state[key] || {}),
    verifiedRemoteConfig: verified ? fingerprint : null,
  }
  writeMcpToolsState(state)
}

export function isConnectorActive(pluginName, connectorName) {
  const entry = getConnectorEntry(pluginName, connectorName)
  return connectorActive(entry, () => isConnectorAuthenticated(pluginName, connectorName),
    () => readMcpToolsState()[`${pluginName}::${connectorName}`])
}

function connectorActive(entry, authenticated, toolState) {
  if (!entry) return false
  const remote = remoteConfigFromEntry(entry.config)
  if (!remote && !isRemoteConnector(entry.config)) return authenticated()
  return toolState()?.verifiedRemoteConfig === remoteConfigFingerprint(remote || entry.config)
}

export const getPluginConnectors = listConnectors

export function substitutePluginRoot(val, pluginRoot) {
  if (typeof val === 'string') {
    const normalizedRoot = pluginRoot.replace(/\\/g, '/')
    return val
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, normalizedRoot)
      .replace(/\$CLAUDE_PLUGIN_ROOT\b/g, normalizedRoot)
  }
  if (Array.isArray(val)) {
    return val.map((item) => substitutePluginRoot(item, pluginRoot))
  }
  if (val && typeof val === 'object') {
    const res = {}
    for (const [k, v] of Object.entries(val)) {
      res[k] = substitutePluginRoot(v, pluginRoot)
    }
    return res
  }
  return val
}

export function registerConnector(pluginName, connectorName, connectorConfig) {
  const patch = readCordisPatch()
  const id = getConnectorId(pluginName, connectorName)
  const pluginRoot = installedDir(pluginName)
  const resolvedConfig = substitutePluginRoot(connectorConfig, pluginRoot)

  let insertBlock = patch.find((item) => item && Array.isArray(item.insert))
  if (!insertBlock) {
    insertBlock = { insert: [] }
    patch.push(insertBlock)
  }

  insertBlock.insert = insertBlock.insert.filter((item) => item && item.id !== id)

  const isHttp = connectorTransport(resolvedConfig.type || resolvedConfig.transport, resolvedConfig.url, resolvedConfig.command) === 'http'
  if (isHttp && (!resolvedConfig.url || !resolvedConfig.url.trim() || !/^https?:\/\//i.test(resolvedConfig.url.trim()))) {
    return { ok: false, connected: false, error: '缺少有效的服务 URL' }
  }

  const clientConfig = {
    serverName: connectorName,
    transport: isHttp ? 'streamable-http' : 'stdio',
  }

  if (resolvedConfig.url) clientConfig.url = resolvedConfig.url
  if (resolvedConfig.headers && Object.keys(resolvedConfig.headers).length > 0) {
    clientConfig.headers = resolvedConfig.headers
  }
  if (resolvedConfig.command) clientConfig.command = resolvedConfig.command
  if (resolvedConfig.args && resolvedConfig.args.length > 0) clientConfig.args = resolvedConfig.args
  if (resolvedConfig.env && Object.keys(resolvedConfig.env).length > 0) clientConfig.env = resolvedConfig.env

  insertBlock.insert.push({
    id,
    name: '@deepseek-ai/dsh-mcp-client',
    config: clientConfig,
  })

  writeCordisPatch(patch)
  return { ok: true, connected: true }
}

export function unregisterConnector(pluginName, connectorName, { keepDefinition = false } = {}) {
  const key = `${pluginName}::${connectorName}`
  MCP_ACTIVATIONS.delete(key)
  MCP_TOOLS_INFLIGHT.delete(key)
  MEMORY_TOOLS_CACHE.delete(key)
  const patch = readCordisPatch()
  const id = getConnectorId(pluginName, connectorName)
  const config = getConnectorEntry(pluginName, connectorName)?.config
  const remote = remoteConfigFromEntry(config)
  if (remote || (keepDefinition && config)) {
    const state = readMcpToolsState()
    const saved = state[key] ||= {}
    if (remote) saved.savedOAuthRemoteConfig = remote
    else {
      saved.savedConnectorDefinition = { ...saved.savedConnectorDefinition, ...config }
      saved.pluginConnectorOwned = true
    }
    writeMcpToolsState(state, { required: keepDefinition })
  }

  for (const item of patch) {
    if (item && Array.isArray(item.insert)) {
      item.insert = item.insert.filter((entry) => entry && entry.id !== id)
    }
  }

  const cleaned = patch.filter((item) => !item || !Array.isArray(item.insert) || item.insert.length > 0)
  writeCordisPatch(cleaned)
  return { ok: true, connected: false }
}

/**
 * Delete a user-added MCP server completely: registration, saved definition,
 * per-tool state and any OAuth credentials. `unregisterConnector` alone is the
 * "turn it off" path and deliberately keeps the saved remote config so the
 * server can be switched back on; a delete must leave nothing behind, or
 * re-adding the same name would silently inherit the old sign-in.
 */
export function removeUserMcp(connectorName) {
  const state = readState()
  const saved = (Array.isArray(state.userMcps) ? state.userMcps : []).find((x) => x && x.name === connectorName)
  if (!saved) throw new Error(`MCP 不存在：${connectorName}`)

  // Credential keys cover both OAuth modes; the mode the server was saved with
  // decides which file exists, and deleting a missing one is a no-op.
  const remote = remoteConfigFromEntry(getConnectorEntry('user-mcp', connectorName)?.config) || saved
  // A server can have been edited to a new URL since it signed in, so clear the
  // record for every URL it is known to have used — the live one and the stored
  // one — or the old sign-in survives the delete and is inherited on re-add.
  const urls = new Set([remote?.url, saved.url, ...(Array.isArray(saved.usedUrls) ? saved.usedUrls : [])]
    .filter((u) => typeof u === 'string' && u.trim()))
  const credentialKeys = [...urls].flatMap((u) =>
    ['auto_register', 'custom'].map((mode) => oauthCredentialKey('user-mcp', connectorName, u, mode)))
  const url = remote?.url || saved.url || null

  unregisterConnector('user-mcp', connectorName)

  const toolsKey = `user-mcp::${connectorName}`
  const toolsState = readMcpToolsState()
  if (Object.prototype.hasOwnProperty.call(toolsState, toolsKey)) {
    delete toolsState[toolsKey]
    writeMcpToolsState(toolsState)
  }
  MEMORY_TOOLS_CACHE.delete(toolsKey)
  for (const key of credentialKeys) {
    try { deleteOAuthRecord(key) } catch {}
  }

  state.userMcps = (Array.isArray(state.userMcps) ? state.userMcps : []).filter((x) => x && x.name !== connectorName)
  writeState(state)
  return { ok: true, name: connectorName }
}

/**
 * Normalize one saved user MCP definition. `fallback` supplies the previous
 * record, so a body that omits a field inherits the stored value instead of
 * resetting it.
 */
export function userMcpConfig(name, body = {}, fallback = {}) {
  // Only a *missing* field inherits the stored value. An explicit empty string
  // is the user clearing the field; treating it as "keep previous" would make
  // the editor unable to remove a callback port, scope or client id.
  const pick = (value, previous) => (value === undefined ? previous : value)
  // Remember every URL this server has used. A credential file is named by a
  // hash of its URL, so once a server is edited to a new URL the old sign-in is
  // unreachable unless its URL was recorded here.
  const usedUrls = new Set(Array.isArray(fallback.usedUrls) ? fallback.usedUrls : [])
  for (const candidate of [fallback.url, body.url]) {
    if (typeof candidate === 'string' && candidate.trim()) usedUrls.add(candidate)
  }
  return {
    name,
    usedUrls: [...usedUrls],
    transport: connectorTransport(body.transport || fallback.transport, body.url ?? fallback.url, body.command ?? fallback.command),
    url: pick(body.url, fallback.url ?? null),
    command: pick(body.command, fallback.command ?? null),
    args: Array.isArray(body.args) ? body.args : (fallback.args || []),
    env: body.env && typeof body.env === 'object' ? body.env : (fallback.env || {}),
    headers: body.headers && typeof body.headers === 'object' ? body.headers : (fallback.headers || {}),
    oauth: body.oauth || fallback.oauth || 'none',
    oauthClientId: pick(body.oauthClientId, fallback.oauthClientId || ''),
    oauthCallbackPort: pick(body.oauthCallbackPort, fallback.oauthCallbackPort ?? null),
    oauthScope: pick(body.oauthScope, fallback.oauthScope || ''),
  }
}

/**
 * Rename a user-added MCP. Everything that is keyed by the server name has to
 * move with it: the cordis registration id, the saved OAuth record (its file
 * name is a hash of the name, so a rename without this copy would look like a
 * fresh, unauthenticated server), and per-tool state. OAuth records are copied
 * before the re-registration so the new registration reuses the existing
 * sign-in instead of starting a new browser handshake.
 */
export function renameUserMcp(oldName, newName, payload, { enable = false, probe } = {}) {
  if (oldName === newName) {
    return saveConnectorAuth('user-mcp', newName, payload)
  }
  const state = readState()
  if (!Array.isArray(state.userMcps)) state.userMcps = []
  const idx = state.userMcps.findIndex((x) => x && x.name === oldName)
  if (idx < 0) throw new Error(`MCP 不存在：${oldName}`)
  if (state.userMcps.some((x) => x && x.name === newName)) throw new Error(`已存在同名 MCP：${newName}`)

  const saved = state.userMcps[idx]
  // One lookup for both facts: `readCordisPatch` re-reads and re-parses the
  // patch file on every call, and this runs inside a user-visible action.
  const entry = getConnectorEntry('user-mcp', oldName)
  const wasEnabled = !!entry
  const remote = remoteConfigFromEntry(entry?.config)
  const url = remote?.url || saved.url || payload?.url || null
  const modes = ['auto_register', 'custom']
  // Carry every URL this server has used, exactly as `removeUserMcp` clears
  // them: the sign-in may belong to a URL the server has since been edited
  // away from, and copying only the current one would strand it.
  const urls = [...new Set([url, saved.url, ...(Array.isArray(saved.usedUrls) ? saved.usedUrls : [])]
    .filter((u) => typeof u === 'string' && u.trim()))]

  const copiedRecords = new Map()
  for (const source of urls) {
    for (const mode of modes) {
      const from = oauthCredentialKey('user-mcp', oldName, source, mode)
      const to = oauthCredentialKey('user-mcp', newName, source, mode)
      const record = readOAuthRecord(from)
      const existing = readOAuthRecord(to)
      if (Object.keys(record).length > 0 && !existing.tokens) {
        writeOAuthRecord(to, record)
        copiedRecords.set(to, existing)
      }
    }
  }

  if (wasEnabled || enable) {
    const clientId = url ? readSavedOAuthClient('user-mcp', newName, url, 'custom').clientId : ''
    // `saveConnectorAuth` reports failure both by returning `{ok:false}` and by
    // throwing (e.g. a missing OAuth client id), so the rollback lives in one
    // place that both paths reach.
    const rollback = () => {
      for (const [key, record] of copiedRecords) {
        if (Object.keys(record).length > 0) writeOAuthRecord(key, record)
        else deleteOAuthRecord(key)
      }
    }
    let result
    try {
      result = saveConnectorAuth('user-mcp', newName, {
        ...payload,
        // A cleared field stays cleared: falling back to the stored id would put
        // the old client back into the live registration while the definition
        // says empty, and the next toggle would fail on the mismatch.
        oauthClientId: payload?.oauthClientId !== undefined ? payload.oauthClientId : (clientId || ''),
      }, { probe })
    } catch (error) {
      // Leave the old server untouched: a failed rename must not strand the
      // user with neither name registered.
      rollback()
      throw error
    }
    if (!result || !result.ok) {
      rollback()
      return result
    }
    // Only drop the old registration when it is a different entry. Names are
    // normalized but ids are slugified, so `a.dot` and `a-dot` share one id —
    // unregistering by the old name would delete the entry just written and
    // leave the server silently disabled.
    if (wasEnabled && getConnectorId('user-mcp', oldName) !== getConnectorId('user-mcp', newName)) {
      unregisterConnector('user-mcp', oldName)
    }
  }

  const toolsState = readMcpToolsState()
  const oldKey = `user-mcp::${oldName}`
  const newKey = `user-mcp::${newName}`
  if (toolsState[oldKey] || toolsState[newKey]) {
    const merged = { ...(toolsState[oldKey] || {}), ...(toolsState[newKey] || {}) }
    if (Array.isArray(toolsState[oldKey]?.disabledTools)) merged.disabledTools = toolsState[oldKey].disabledTools
    if (!probe?.ok) {
      delete merged.cachedTools
      delete merged.cachedToolsResolved
    }
    toolsState[newKey] = merged
    delete toolsState[oldKey]
    writeMcpToolsState(toolsState)
  }
  MEMORY_TOOLS_CACHE.delete(oldKey)
  MEMORY_TOOLS_CACHE.delete(newKey)
  for (const source of urls) for (const mode of modes) deleteOAuthRecord(oauthCredentialKey('user-mcp', oldName, source, mode))

  // Keep the whole edited form, not just the name: `/mcps/update` routes a
  // rename here with the same body a plain save sends, so a rename that also
  // edits command/url/args/env/headers must persist those edits — and on an
  // enabled server the patch was already written from them, so storing the old
  // record would silently revert the edit on the next toggle.
  state.userMcps[idx] = userMcpConfig(newName, payload, saved)
  writeState(state)
  return { ok: true, name: newName, previousName: oldName }
}

// ── LSP server registration (cordis.patch.yml → @deepseek-ai/dsh-lsp-stdio) ──
//
// DSH exposes LSP as a capability seam with three packages:
//   @deepseek-ai/dsh-lsp         (service definition, mounted once)
//   @deepseek-ai/dsh-lsp-stdio   (stdio provider, one instance per server)
//   @deepseek-ai/dsh-tool-lsp    (model-facing tool, mounted once)
// Claude plugin marketplaces declare these in the `lspServers` field, whose
// shape (command/args/extensionToLanguage/env) matches dsh-lsp-stdio's
// `servers` table directly, so registration is a straight pass-through.

/**
 * Replicate @deepseek-ai/dsh-subprocess-local's `resolveExecutable` check to
 * test whether a bare command name would be resolvable at DSH load time.
 *
 * Returns the resolved absolute path, or null when no PATH entry satisfies
 * `stat.isFile()` + `X_OK` — the same probe DSH runs when wiring up a
 * stdio LSP provider. Without this pre-flight, registering a server whose
 * binary is missing poisons `cordis.patch.yml`: the loader resolves the
 * package fine, then `lsp-stdio.apply()` rejects the command at load time
 * and the entire DSH plugin tree fails to come up.
 */
export function resolveCommandPath(command, env = process.env) {
  if (typeof command !== 'string') return null
  const trimmed = command.trim()
  if (!trimmed) return null
  if (isAbsolute(trimmed)) {
    try {
      if (!statSync(trimmed).isFile()) return null
      accessSync(trimmed, fsConstants.X_OK)
      return trimmed
    } catch {
      return null
    }
  }
  if (trimmed.includes('/') || (process.platform === 'win32' && trimmed.includes('\\'))) {
    return null
  }
  const pathEnv = (env && (env.PATH || env.Path)) || ''
  if (!pathEnv) return null
  const exts = process.platform === 'win32' && !extname(trimmed)
    ? String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : ['']
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = resolve(dir, trimmed + ext)
      try {
        if (!statSync(candidate).isFile()) continue
        accessSync(candidate, fsConstants.X_OK)
        return candidate
      } catch {
        // not a match, try next candidate
      }
    }
  }
  return null
}

export const LSP_CORE_ID = 'lsp-core'
export const LSP_TOOL_ID = 'lsp-tool'
const LSP_DEF_PKG = '@deepseek-ai/dsh-lsp'
const LSP_STDIO_PKG = '@deepseek-ai/dsh-lsp-stdio'
const LSP_TOOL_PKG = '@deepseek-ai/dsh-tool-lsp'

/** Host-side packages that LSP registration depends on (installed into the DSH installation). */
export const LSP_HOST_PACKAGES = [LSP_DEF_PKG, LSP_STDIO_PKG, LSP_TOOL_PKG]

/** DSH's Claude Code hook bridge + its wire-protocol peer, provisioned like LSP packages. */
const HOOK_BRIDGE_PKG = '@deepseek-ai/dsh-hooks-claude-code'
const HOOK_PROTOCOL_PKG = '@deepseek-ai/dsh-hook-protocol'
export const HOOK_HOST_PACKAGES = [HOOK_BRIDGE_PKG, HOOK_PROTOCOL_PKG]

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * Locate the running DSH installation's node_modules.
 *
 * A user-started `dsh web` (npx) boots the cordis loader without a
 * `bareModuleBaseUrl`, so bare package names in cordis.patch.yml resolve from
 * the loader's own location — the DSH installation's node_modules, which npm
 * puts under the npx cache (`~/.npm/_npx/<hash>/node_modules` on POSIX,
 * `%LocalAppData%\npm-cache\_npx\<hash>\node_modules` on Windows). We also
 * accept profile and global install trees so other install modes provision
 * host packages (hooks bridge, LSP) into the tree DSH actually loads from.
 */
/** Candidate base installation directories for DeepSeek Harness Desktop across platforms. */
function resolveDesktopCandidateDirs() {
  const dirs = [
    dirname(process.execPath),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness'),
    join(homedir(), 'AppData', 'Local', 'Programs', 'DeepSeek Harness'),
    '/Applications/DeepSeek Harness.app/Contents/Resources',
    '/opt/DeepSeek Harness/resources',
  ]
  if (process.platform === 'win32') {
    try {
      const regOut = String(execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'DeepSeek Harness'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }))
      const match = regOut.match(/InstallLocation\s+REG_SZ\s+(.+)/i)
      if (match && match[1]) dirs.unshift(match[1].trim())
    } catch {}
  }
  return dirs.filter(Boolean)
}

/**
 * Locate the `node_modules` root containing `@deepseek-ai/dsh-app-boot`.
 *
 * Scans in priority order:
 *   1) $DSH_HOME/profiles/node_modules (shared runtime directory)
 *   2) $DSH_HOME/profiles/<profile>/node_modules (per-profile directory)
 *   2.5) Desktop application bundle resources (Electron app)
 *   3) NODE_PATH (set by npx exec)
 *   4) npm npx cache (_npx/<hash>/node_modules)
 *   5) Global npm install (`npm root -g`)
 */
export function findDshMainNodeModules() {
  const hasLoader = (nm) => existsSync(join(nm, '@deepseek-ai', 'dsh-app-boot'))

  // 1) $DSH_HOME/profiles/node_modules — the DSH runtime tree the loader
  //    resolves from when running a profile (e.g. `dsh web`). Survives
  //    `npx` cache wipes; the npx cache is transient and must not be the
  //    primary target for host packages we want to persist across starts.
  const profilesShared = join(dshHome(), 'profiles', 'node_modules')
  if (hasLoader(profilesShared)) return profilesShared

  // 2) Per-profile node_modules ($DSH_HOME/profiles/<profile>/node_modules)
  const profilesRoot = join(dshHome(), 'profiles')
  try {
    if (existsSync(profilesRoot)) {
      for (const entry of readdirSync(profilesRoot)) {
        const nm = join(profilesRoot, entry, 'node_modules')
        if (hasLoader(nm)) return nm
      }
    }
  } catch {}

  // 2.5) Desktop application bundle resources (Electron app)
  for (const base of resolveDesktopCandidateDirs()) {
    for (const sub of [
      join(base, 'resources', 'app.asar.unpacked', 'dsh', 'node_modules'),
      join(base, 'resources', 'app.asar', 'dsh', 'node_modules'),
    ]) {
      try {
        if (existsSync(sub) && hasLoader(sub)) return sub
      } catch {}
    }
  }
  // 3) NODE_PATH (npx exec sets it to the cached install for bin scripts)
  const np = process.env.NODE_PATH
  if (np) {
    for (const p of np.split(/[;:]/).filter(Boolean)) {
      if (hasLoader(p)) return p
    }
  }
  // 4) npm npx cache scan (Windows then POSIX) — transient, last resort.
  const cacheRoots = []
  if (process.platform === 'win32') {
    cacheRoots.push(join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx'))
  } else {
    cacheRoots.push(join(homedir(), '.npm', '_npx'))
  }
  for (const cacheRoot of cacheRoots) {
    try {
      if (!existsSync(cacheRoot)) continue
      for (const hash of readdirSync(cacheRoot)) {
        const nm = join(cacheRoot, hash, 'node_modules')
        if (hasLoader(nm)) return nm
      }
    } catch {
      // keep scanning
    }
  }
  // 5) Global npm install (`npm i -g @deepseek-ai/dsh`)
  try {
    const g = globalNpmRoot()
    if (g && hasLoader(g)) return g
  } catch {}
  return null
}

/** `npm root -g` (sync; used by the install-tree discovery fallback). */
function globalNpmRoot() {
  const args = ['root', '-g']
  if (process.platform === 'win32') {
    return String(execFileSync('cmd', ['/c', NPM_BIN, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })).trim()
  }
  return String(execFileSync(NPM_BIN, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim()
}

function execFileP(bin, args, cwd) {
  // Windows: npm ships as a .cmd shim, which execFile cannot spawn directly
  // (EINVAL) — route through `cmd /c`. POSIX spawns the binary as-is.
  const useCmd = process.platform === 'win32'
  const realBin = useCmd ? 'cmd' : bin
  const realArgs = useCmd ? ['/c', bin, ...args] : args
  return new Promise((resolve, reject) => {
    execFile(realBin, realArgs, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || err.message || '').trim().split('\n').filter(Boolean).slice(-3).join(' | ')
        reject(Object.assign(new Error(tail || `${bin} ${args[0]} 失败 (${err.message})`), { code: err.code }))
        return
      }
      resolve(String(stdout))
    })
  })
}

function runNpm(args, cwd) {
  // npm may exist as `npm.cmd` (native Windows install) or as a bare script
  // (nvm / managed shims); probe the candidates when the first is missing.
  const bins = [NPM_BIN, ...(NPM_BIN === 'npm' ? [] : ['npm'])]
  const attempt = (i) => {
    if (i >= bins.length) return Promise.reject(new Error(`npm 命令不可用（尝试了 ${bins.join(', ')}）`))
    return execFileP(bins[i], args, cwd).catch((e) => {
      if (e.code === 'ENOENT') return attempt(i + 1)
      throw e
    })
  }
  return attempt(0)
}

/** Major.minor line of a semver string (e.g. "1.2.3-rc.1" -> "1.2"). */
function versionLine(v) {
  return String(v).split('-')[0].split('.').slice(0, 2).join('.')
}

/** Read the running DSH release version from its installation, or '' when unknown. */
export function findDshVersion(main = findDshMainNodeModules()) {
  if (main) {
    for (const anchor of ['dsh-app-boot', 'dsh-session', 'dsh']) {
      try {
        const pkg = JSON.parse(readFileSync(join(main, '@deepseek-ai', anchor, 'package.json'), 'utf8'))
        if (typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim()
      } catch {}
    }
  }
  // Desktop runtime metadata fallback (reads Electron runtime manifest)
  for (const desktopDir of resolveDesktopCandidateDirs()) {
    try {
      const runtimeJsonPath = join(desktopDir, 'resources', 'runtime', 'primary-runtime', 'runtime.json')
      if (existsSync(runtimeJsonPath)) {
        const meta = JSON.parse(readFileSync(runtimeJsonPath, 'utf8'))
        if (typeof meta.desktopVersion === 'string' && meta.desktopVersion.trim()) return meta.desktopVersion.trim()
      }
    } catch {}
  }
  return ''
}

/**
 * Highest published version of a package whose major.minor line matches the
 * running DSH release — the host bridge packages the hub provisions
 * (@deepseek-ai/dsh-hooks-claude-code, dsh-lsp-stdio, ...) are published in
 * lockstep with DSH, so the same line is the compatible one. Falls back to the
 * highest overall when the running DSH's line has no published match. This is
 * deliberately neither the `latest` dist-tag (which can lag behind — e.g. the
 * hooks bridge latest=0.0.1-rc.5 while 0.1.1-rc.2 exists) nor a hard pin (which
 * would break once the user's DSH moves to a new line).
 */
export async function matchingPublishedVersion(packageName, dshVersion) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, { headers: { accept: 'application/json' } })
    let versions = []
    if (res.ok) {
      const data = await res.json()
      versions = Object.keys(data.versions || {})
    } else {
      const out = await runNpm(['view', packageName, 'versions', '--json'], dirname(cordisPatchPath()))
      const parsed = JSON.parse(out)
      if (Array.isArray(parsed)) versions = parsed.filter((v) => typeof v === 'string')
    }
    if (versions.length === 0) return ''
    const line = versionLine(dshVersion ?? findDshVersion())
    const pool = line ? versions.filter((v) => versionLine(v) === line) : []
    const candidates = pool.length > 0 ? pool : versions
    let best = ''
    for (const v of candidates) {
      if (semverGt(v, best)) best = v
    }
    return best
  } catch {
    return ''
  }
}

/** Compare two semver strings (prerelease-aware). */
function semverGt(a, b) {
  if (!b) return true
  const parse = (v) => {
    const [core, pre] = String(v).split('-')
    const [maj, min, pat] = core.split('.').map((n) => parseInt(n, 10) || 0)
    return { maj, min, pat, pre: pre || '' }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (const k of ['maj', 'min', 'pat']) {
    if (pa[k] !== pb[k]) return pa[k] > pb[k]
  }
  if (!pa.pre && !pb.pre) return false
  if (!pa.pre) return true
  if (!pb.pre) return false
  return pa.pre > pb.pre
}

/**
 * Provision host-side packages into the DSH installation's node_modules,
 * pinned to the newest published version. Packages already present are left
 * untouched. This mirrors what installing a forum plugin does — the plugin
 * brings its host dependencies with it, and DSH picks them up on restart.
 */
export async function installProfilePackages(packageNames) {
  const names = Array.from(new Set((packageNames || []).filter((n) => typeof n === 'string' && n.trim())))
  if (names.length === 0) return { ok: true, installed: [] }

  const runtimeModules = findDshMainNodeModules()
  let main = runtimeModules
  if (!main) {
    const sharedNm = join(dshHome(), 'profiles', 'node_modules')
    const activeNm = join(dshHome(), 'profiles', resolveActiveProfileName(), 'node_modules')
    // The shared tree is the loader's primary runtime directory; prefer it
    // whenever it exists. `findDshMainNodeModules` can miss it when its
    // dsh-app-boot probe is a dangling symlink (e.g. left by an npx cache wipe).
    main = existsSync(sharedNm) ? sharedNm : activeNm
    try { mkdirSync(main, { recursive: true }) } catch {}
  }

  // A host package from a different major.minor line than the running DSH
  // release is stale: skipping it because the directory exists left the hooks
  // and LSP bridges pinned to whatever line was current at first provision.
  const dshVersion = findDshVersion(runtimeModules)
  const dshLine = versionLine(dshVersion)
  const need = new Map()
  for (const name of names) {
    const installedManifest = join(main, name, 'package.json')
    if (!existsSync(installedManifest)) {
      need.set(name, '')
      continue
    }
    if (!dshLine) continue
    try {
      const present = JSON.parse(readFileSync(installedManifest, 'utf8')).version
      if (typeof present !== 'string' || versionLine(present) === dshLine) continue
      // Re-provision only when a build for the running line actually exists;
      // otherwise the same mismatched version would be reinstalled every start.
      const version = await matchingPublishedVersion(name, dshVersion)
      if (versionLine(version) === dshLine) need.set(name, version)
    } catch {}
  }
  if (need.size === 0) return { ok: true, installed: [] }

  // Install each package by downloading its tarball and extracting it into the
  // installation's node_modules. Do NOT run `npm install` against the DSH
  // installation root: npm's reify re-resolves the whole tree and prunes
  // packages that are not in the manifest, which has deleted DSH runtime
  // packages in the wild. A raw tarball extract has zero side effects.
  const installed = []
  for (const [name, version] of need) {
    try {
      // Resolve a version compatible with the running DSH release (same major.minor
      // line as the installed DSH), not the `latest` dist-tag which can lag behind.
      const ver = version || await matchingPublishedVersion(name, dshVersion)
      if (!ver) return { ok: false, error: `无法确定 ${name} 的匹配版本`, installed }
      let url = null
      try {
        const resMeta = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { headers: { accept: 'application/json' } })
        if (resMeta.ok) {
          const meta = await resMeta.json()
          url = meta.versions?.[ver]?.dist?.tarball
        }
      } catch {}
      if (!url) {
        try {
          const tarballOut = await runNpm(['view', `${name}@${ver}`, 'dist.tarball'], dirname(main))
          url = tarballOut.trim().split('\n').pop()?.trim()
        } catch {}
      }
      if (!url) return { ok: false, error: `无法获取 ${name} 的 tarball 地址`, installed }
      const res = await fetch(url)
      if (!res.ok) throw new Error(`tarball 下载失败 (HTTP ${res.status})`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const dest = join(main, name)
      mkdirSync(dirname(dest), { recursive: true })
      // Extract beside the target and swap only once the tarball is verified:
      // replacing a stale version must not destroy the working one on failure.
      const staging = `${dest}.staging-${process.pid}-${Date.now()}`
      safeRmDir(staging)
      untarStripFirst(buffer, staging)
      // Verify the tarball actually unpacked a usable package — `untarStripFirst`
      // walks the UStar header stream and silently exits on any malformed input
      // (e.g. a 404 HTML page mistakenly returned as a gzipped stream), which
      // would leave the package directory empty and downstream gates blind.
      if (!existsSync(join(staging, 'package.json'))) {
        safeRmDir(staging)
        return { ok: false, error: `${name} 解包后缺少 package.json（tarball 可能不完整）`, installed }
      }
      safeRmDir(dest)
      try {
        renameSync(staging, dest)
      } catch {
        copyDir(staging, dest)
        safeRmDir(staging)
      }
      installed.push(name)
    } catch (error) {
      return { ok: false, error: `${name} 安装失败: ${error.message}`, installed }
    }
  }
  return { ok: true, installed }
}

/** Minimal UStar tar extractor that strips the leading `package/` component. */
function untarStripFirst(tgz, dest) {
  const data = gunzipSync(tgz)
  let offset = 0
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0
    const type = header[156] || 0x30
    const body = data.subarray(offset + 512, offset + 512 + size)
    if ((type === 0x30 || type === 0) && name) { // regular file
      const rel = name.split('/').slice(1).join('/')
      if (rel) {
        const file = join(dest, rel)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, body)
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
}

export function getLspServerId(pluginName, serverName) {
  return `lsp-${slugify(pluginName)}-${slugify(serverName)}`
}

function getLspEntry(pluginName, serverName) {
  const patch = readCordisPatch()
  const id = getLspServerId(pluginName, serverName)
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      const found = block.insert.find((item) => item && item.id === id)
      if (found) return found
    }
  }
  return null
}

function hasLspEntryWithName(patch, pkgName) {
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      if (block.insert.some((item) => item && item.name === pkgName)) return true
    }
  }
  return false
}

function ensureInsertBlock(patch) {
  let block = patch.find((item) => item && Array.isArray(item.insert))
  if (!block) {
    block = { insert: [] }
    patch.push(block)
  }
  return block
}

/** Mount the shared LSP service definition + model tool once (idempotent). */
function ensureLspInfra(patch) {
  const block = ensureInsertBlock(patch)
  if (!hasLspEntryWithName(patch, LSP_DEF_PKG)) {
    block.insert.push({ id: LSP_CORE_ID, name: LSP_DEF_PKG })
  }
  if (!hasLspEntryWithName(patch, LSP_TOOL_PKG)) {
    block.insert.push({ id: LSP_TOOL_ID, name: LSP_TOOL_PKG })
  }
}

/** Read LSP servers declared by an installed plugin (from its manifest copy). */
export function getPluginLspServers(pluginName) {
  const target = installedDir(pluginName)
  if (!existsSync(target)) return []
  return listLspServers(target)
}

/** Register one LSP server into cordis.patch.yml (idempotent). */
export function registerLspServer(pluginName, serverName, serverConfig) {
  const patch = readCordisPatch()
  const id = getLspServerId(pluginName, serverName)
  const pluginRoot = installedDir(pluginName)
  const resolved = substitutePluginRoot(serverConfig || {}, pluginRoot)

  if (!resolved.command || typeof resolved.command !== 'string' || !resolved.command.trim()) {
    return { ok: false, active: false, error: `LSP server ${serverName} 缺少有效的 command` }
  }
  if (!resolved.extensionToLanguage || typeof resolved.extensionToLanguage !== 'object' || Object.keys(resolved.extensionToLanguage).length === 0) {
    return { ok: false, active: false, error: `LSP server ${serverName} 缺少 extensionToLanguage 映射` }
  }

  // Pre-flight: refuse to write the patch entry when the binary cannot be
  // resolved. DSH's lsp-stdio provider calls `resolveExecutable` at load
  // time and throws if the command is missing — that exception aborts the
  // entire plugin tree. Returning here keeps DSH bootable and surfaces a
  // concrete remediation hint to the caller (UI / install result).
  if (!resolveCommandPath(resolved.command)) {
    return {
      ok: false,
      active: false,
      error: `LSP server ${serverName} 注册失败：未找到可执行文件 "${resolved.command}"。` +
        `请先安装并确保其在 PATH 中（常见做法：npm install -g ${resolved.command}），` +
        `然后在管理页点击「更新」重新注册。`,
    }
  }

  ensureLspInfra(patch)

  const block = ensureInsertBlock(patch)
  block.insert = block.insert.filter((item) => item && item.id !== id)

  const serverEntry = {
    command: resolved.command,
    extensionToLanguage: resolved.extensionToLanguage,
  }
  if (Array.isArray(resolved.args) && resolved.args.length > 0) serverEntry.args = resolved.args
  if (resolved.env && typeof resolved.env === 'object' && Object.keys(resolved.env).length > 0) serverEntry.env = resolved.env
  if (resolved.initializationOptions != null) serverEntry.initializationOptions = resolved.initializationOptions
  if (resolved.configuration != null) serverEntry.configuration = resolved.configuration

  block.insert.push({
    id,
    name: LSP_STDIO_PKG,
    config: { servers: { [serverName]: serverEntry } },
  })

  writeCordisPatch(patch)
  return { ok: true, active: true }
}

/** Remove a plugin's LSP server entries; reclaim shared infra when unused. */
export function unregisterPluginLsp(pluginName) {
  const patch = readCordisPatch()
  const prefix = `lsp-${slugify(pluginName)}-`
  let changed = false
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      const before = block.insert.length
      block.insert = block.insert.filter((item) => !(item && item.id && item.id.startsWith(prefix)))
      if (block.insert.length !== before) changed = true
    }
  }

  if (changed) {
    const hasAnyServer = patch.some((block) => block && Array.isArray(block.insert) && block.insert.some((item) => item && item.name === LSP_STDIO_PKG))
    if (!hasAnyServer) {
      for (const block of patch) {
        if (block && Array.isArray(block.insert)) {
          block.insert = block.insert.filter((item) => !(item && (item.id === LSP_CORE_ID || item.id === LSP_TOOL_ID)))
        }
      }
    }
  }

  const cleaned = patch.filter((item) => !item || !Array.isArray(item.insert) || item.insert.length > 0)
  writeCordisPatch(cleaned)
  return { ok: true, active: false }
}

/** Register every LSP server of an installed plugin. */
export function registerPluginLsp(pluginName) {
  const servers = getPluginLspServers(pluginName)
  const results = []
  for (const s of servers) {
    results.push(registerLspServer(pluginName, s.name, s))
  }
  return results
}

/** Patch id of a plugin's Claude hooks bridge entry. */
export function getHookBridgeId(pluginName) {
  return `hooks-${slugify(pluginName)}`
}

/**
 * Register an installed plugin's Claude/Codex hooks into DSH by inserting a
 * `@deepseek-ai/dsh-hooks-claude-code` bridge entry into cordis.patch.yml. The
 * bridge runs an unmodified Claude Code hooks.json on DSH's interception points
 * (SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop /
 * SubagentStart / SubagentStop), with `${CLAUDE_PLUGIN_ROOT}` substituted from
 * `pluginRoot`. DSH's HMR re-applies the tree within ~1s, no restart needed.
 *
 * The bridge and its hook-protocol peer are pre-provisioned by the hub's
 * `apply()` on DSH startup, so a per-plugin install is a single patch write.
 */
export async function registerPluginHooks(pluginName) {
  const target = installedDir(pluginName)
  const configPath = resolveHookConfigPath(target)
  // A version that dropped its hooks must also lose the previous bridge entry,
  // otherwise the old hooks keep firing after reinstall.
  if (!configPath) {
    unregisterPluginHooks(pluginName)
    return { ok: true, registered: [] }
  }

  const patch = readCordisPatch()
  const id = getHookBridgeId(pluginName)
  const block = ensureInsertBlock(patch)
  block.insert = block.insert.filter((item) => item && item.id !== id)
  block.insert.push({
    id,
    name: HOOK_BRIDGE_PKG,
    config: {
      configPath,
      pluginRoot: target,
    },
  })
  writeCordisPatch(patch)
  return { ok: true, registered: [configPath] }
}

/** Remove a plugin's hooks bridge entry from cordis.patch.yml. */
export function unregisterPluginHooks(pluginName) {
  const patch = readCordisPatch()
  const id = getHookBridgeId(pluginName)
  for (const item of patch) {
    if (item && Array.isArray(item.insert)) {
      item.insert = item.insert.filter((entry) => entry && entry.id !== id)
    }
  }
  const cleaned = patch.filter((item) => !item || !Array.isArray(item.insert) || item.insert.length > 0)
  writeCordisPatch(cleaned)
  return { ok: true }
}

/** Active state for one LSP server of an installed plugin. */
export function isLspActive(pluginName, serverName) {
  return !!getLspEntry(pluginName, serverName)
}

/**
 * LSP servers this process has already auto-activated via `installedDetails`.
 * Once a server is auto-registered, we never auto-register it again, even if
 * it later disappears from the patch — the user manually removing the entry
 * (e.g. to disable the LSP without uninstalling the plugin) must be honored.
 */
const autoActivatedLspServers = new Set()

export function toggleConnector(pluginName, connectorName, enabled) {
  return enabled
    ? enableConnector(pluginName, connectorName, undefined, { pluginOwned: true })
    : unregisterConnector(pluginName, connectorName, { keepDefinition: true })
}

function savedConnectorDefinition(pluginName, connectorName) {
  const entry = getConnectorEntry(pluginName, connectorName)
  const state = readMcpToolsState()[`${pluginName}::${connectorName}`]
  const saved = state?.savedConnectorDefinition
  if (entry) return remoteConfigFromEntry(entry.config) || { ...saved, ...entry.config }
  return saved || state?.savedOAuthRemoteConfig
}

function connectorEnvironment(found, payload) {
  const base = Object.fromEntries(Object.entries(found?.env || {}).filter(([, value]) =>
    typeof value !== 'string' || !value.includes('${')))
  const overrides = payload?.env || found?.env || {}
  return { ...base, ...overrides }
}

export async function verifyConnectorAuth(pluginName, connectorName, payload, { pluginOwned = pluginName !== 'user-mcp' } = {}) {
  const definition = connectorDefinition(pluginName, connectorName, payload, pluginOwned)
  const { transport, url } = definition
  if (transport !== 'stdio' && url && isOAuthMode(definition.oauth)) {
    payload = { ...payload, ...definition }
    try {
      if (pluginOwned) rememberPluginOAuthUrls(pluginName, connectorName, url)
      setRemoteVerification(pluginName, connectorName, payload, false)
      saveCustomOAuthClient(pluginName, connectorName, payload)
      const session = beginOAuthVerification(pluginName, connectorName, { ...payload, url }, {
        pluginOwned,
        onFinished: (result) => setRemoteVerification(pluginName, connectorName, payload, result.ok === true),
      })
      const result = await Promise.race([
        completeOAuthVerification(session),
        new Promise((resolve) => setTimeout(() => resolve({ pending: true, sessionId: session.id, status: session.status, message: session.message || '正在准备 OAuth 授权…' }), 250)),
      ])
      if (!session.cancelled && !result.pending) setRemoteVerification(pluginName, connectorName, payload, result.ok === true)
      return { ...result, server: connectorName, transport: 'http', endpoint: url, statusCode: result.statusCode ?? result.status }
    } catch (error) {
      return { ok: false, message: error.message, server: connectorName, transport: 'http', endpoint: url }
    }
  }

  const started = Date.now()
  const probe = await probeConnectorDefinition(pluginName, connectorName, definition, MCP_AUTH_TIMEOUT_MS)
  setRemoteVerification(pluginName, connectorName, definition, !probe.error)
  return {
    ok: !probe.error,
    message: probe.error || 'MCP 连接和工具列表验证通过',
    server: connectorName,
    transport,
    endpoint: url || definition.command || '',
    status: probe.status,
    duration: Date.now() - started,
  }
}

function connectorDefinition(pluginName, connectorName, payload = {}, pluginOwned = pluginName !== 'user-mcp') {
  const target = installedDir(pluginName)
  const found = (pluginOwned && getPluginConnectors(target).find(c => c.name === connectorName)) || {}
  const transport = connectorTransport(payload.transport || payload.type || found.type, payload.url ?? found.url, payload.command ?? found.command)
  const headers = new Map()
  for (const [key, value] of Object.entries(found.headers || {})) {
    if (typeof value === 'string' && !value.includes('${')) headers.set(key.toLowerCase(), [key, value])
  }
  for (const [key, value] of Object.entries(payload.headers || {})) {
    headers.set(key.toLowerCase(), [key, value])
  }
  const token = (typeof payload === 'string' ? payload : payload.token)?.trim()
  const oauth = transport === 'stdio' ? 'none' : (payload.oauth || 'none')
  if (token && !isOAuthMode(oauth) && !headers.has('authorization')) {
    headers.set('authorization', ['Authorization', token.startsWith('Bearer ') ? token : `Bearer ${token}`])
  }
  return substitutePluginRoot({
    transport,
    type: transport,
    url: transport === 'http' ? (payload.url ?? found.url ?? (connectorName === 'notion' ? 'https://mcp.notion.com/mcp' : null))?.trim() : null,
    command: payload.command ?? found.command ?? null,
    args: Array.isArray(payload.args) ? payload.args : (found.args || []),
    env: connectorEnvironment(found, payload),
    headers: Object.fromEntries(headers.values()),
    oauth,
    oauthClientId: String(payload.oauthClientId || '').trim(),
    oauthCallbackPort: payload.oauthCallbackPort,
    oauthScope: payload.oauthScope || '',
  }, target)
}

function oauthConnectorRegistration(pluginName, connectorName, definition) {
  const { url, headers, oauth, oauthClientId, oauthCallbackPort, oauthScope } = definition
  const remote = oauthRuntimeConfig({
    url, headers, credentialKey: oauthCredentialKey(pluginName, connectorName, url, oauth),
    oauth: { mode: oauth, clientId: oauthClientId, callbackPort: Number(oauthCallbackPort) || null, scope: oauthScope },
  })
  return {
    type: 'stdio', command: process.execPath, args: [OAUTH_BRIDGE_PATH],
    env: { UPH_MCP_REMOTE_CONFIG: encodeOAuthConfig(remote), UPH_OAUTH_STORE_DIR: oauthStoreDir() },
  }
}

async function probeConnectorDefinition(pluginName, connectorName, definition, timeout) {
  if (definition.transport === 'stdio') {
    return definition.command
      ? queryStdioToolsList(definition.command, definition.args, definition.env)
      : { tools: [], error: '未配置有效的 stdio 启动命令 (command)' }
  }
  if (!/^https?:\/\//i.test(definition.url || '')) return { tools: [], error: '缺少有效的服务 URL' }
  if (isOAuthMode(definition.oauth)) {
    const registration = oauthConnectorRegistration(pluginName, connectorName, definition)
    return queryStdioToolsList(registration.command, registration.args, {
      ...registration.env, UPH_MCP_INTERACTIVE: '0', UPH_MCP_VERIFY: '0',
    })
  }
  return queryHttpToolsList(definition.url, definition.headers, timeout)
}

export async function probeConnectorAuth(pluginName, connectorName, payload, { pluginOwned } = {}) {
  const definition = connectorDefinition(pluginName, connectorName, payload, pluginOwned)
  if (definition.oauth === 'custom' && definition.url) {
    const key = oauthCredentialKey(pluginName, connectorName, definition.url, 'custom')
    const client = readOAuthRecord(key)?.customClient
    if (!client || client.client_id !== definition.oauthClientId ||
      (payload.oauthClientSecret && client.client_secret !== payload.oauthClientSecret)) {
      return { ok: false, error: '请先点击「测试连接」完成 OAuth 授权' }
    }
  }
  const probe = await probeConnectorDefinition(pluginName, connectorName, definition, MCP_AUTH_TIMEOUT_MS)
  return { ...probe, definition, ok: !probe.error }
}

export function probeUserMcpUpdate(oldName, newName, payload) {
  // The editor may have just authorized the renamed draft. Otherwise an
  // unchanged sign-in still belongs to the existing name until rename commits.
  const newRecord = oldName !== newName && isOAuthMode(payload.oauth) && payload.url
    ? readOAuthRecord(oauthCredentialKey('user-mcp', newName, payload.url.trim(), payload.oauth))
    : null
  return probeConnectorAuth('user-mcp', newRecord?.tokens ? newName : oldName, payload)
}

const MCP_ACTIVATIONS = new Map()

export async function enableConnector(pluginName, connectorName, payload, options = {}) {
  const key = `${pluginName}::${connectorName}`
  const attempt = Symbol()
  MCP_ACTIVATIONS.set(key, attempt)
  const input = payload ?? savedConnectorDefinition(pluginName, connectorName) ?? {}
  try {
    const probe = await probeConnectorAuth(pluginName, connectorName, input, options)
    if (!probe.ok) return { ok: false, error: probe.error }
    if (MCP_ACTIVATIONS.get(key) !== attempt || options.canEnable?.() === false) {
      return { ok: false, error: 'MCP 配置或开关已变更，请刷新后重试' }
    }
    return saveConnectorAuth(pluginName, connectorName, input, { ...options, probe })
  } finally {
    if (MCP_ACTIVATIONS.get(key) === attempt) MCP_ACTIVATIONS.delete(key)
  }
}

export function saveConnectorAuth(pluginName, connectorName, payload, { pluginOwned = pluginName !== 'user-mcp', rememberDefinition = true, probe } = {}) {
  const definition = probe?.definition || connectorDefinition(pluginName, connectorName, payload, pluginOwned)
  const { transport, url, oauth } = definition
  const isStdio = transport === 'stdio'
  let registration = definition
  if (pluginOwned) {
    const previousRemote = remoteConfigFromEntry(getConnectorEntry(pluginName, connectorName)?.config)
    rememberPluginOAuthUrls(pluginName, connectorName, !isStdio && isOAuthMode(oauth) ? url : null, previousRemote?.url)
  }
  if (!isStdio && isOAuthMode(oauth)) {
    saveCustomOAuthClient(pluginName, connectorName, payload)
    registration = oauthConnectorRegistration(pluginName, connectorName, definition)
  }
  const result = registerConnector(pluginName, connectorName, registration)
  if (result.ok) {
    const key = `${pluginName}::${connectorName}`
    const state = readMcpToolsState()
    const saved = state[key] ||= {}
    if (pluginOwned && !isOAuthMode(oauth)) {
      if (rememberDefinition) saved.savedConnectorDefinition = definition
      saved.pluginConnectorOwned = true
    }
    else delete saved.savedConnectorDefinition
    const remote = remoteConfigFromEntry(registration)
    if (remote) saved.savedOAuthRemoteConfig = remote
    else delete saved.savedOAuthRemoteConfig
    if (!isStdio) {
      const fingerprint = remoteConfigFingerprint(remote || definition)
      if (probe?.ok) saved.verifiedRemoteConfig = fingerprint
      else if (saved.verifiedRemoteConfig !== fingerprint) saved.verifiedRemoteConfig = null
    }
    if (probe?.ok) {
      saved.cachedTools = probe.tools
      saved.cachedToolsResolved = true
    } else {
      delete saved.cachedTools
      delete saved.cachedToolsResolved
    }
    writeMcpToolsState(state)
    MEMORY_TOOLS_CACHE.delete(key)
    // A probe still running against the old configuration must not be reused.
    MCP_TOOLS_INFLIGHT.delete(key)
  }
  return result
}

/** MCP Tools Cache & State store */
const MCP_TOOLS_STATE_PATH = () => join(dshHome(), '.mcp-tools-state.json')

export function readMcpToolsState() {
  const file = MCP_TOOLS_STATE_PATH()
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')) || {}
  } catch {
    return {}
  }
}

export function writeMcpToolsState(state, { required = false } = {}) {
  try {
    const file = MCP_TOOLS_STATE_PATH()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    if (required) throw error
  }
}

function rememberPluginOAuthUrls(pluginName, connectorName, ...urls) {
  const key = `${pluginName}::${connectorName}`
  const state = readMcpToolsState()
  const entry = state[key] || {}
  const history = new Set(Array.isArray(entry.oauthUrls) ? entry.oauthUrls : [])
  const size = history.size
  for (const url of [...urls, entry.savedOAuthRemoteConfig?.url]) {
    if (typeof url === 'string' && url.trim()) history.add(url)
  }
  if (history.size !== size) {
    state[key] = { ...entry, oauthUrls: [...history], ...(pluginName === 'user-mcp' ? { pluginOAuthOwned: true } : {}) }
    // Record ownership before a verification child can write the credential.
    writeMcpToolsState(state, { required: true })
  }
}

export function getDisabledTools(pluginName, connectorName) {
  const state = readMcpToolsState()
  const key = `${pluginName}::${connectorName}`
  return Array.isArray(state[key]?.disabledTools) ? state[key].disabledTools : []
}

export function setToolDisabled(pluginName, connectorName, toolName, disabled) {
  const state = readMcpToolsState()
  const key = `${pluginName}::${connectorName}`
  if (!state[key]) state[key] = {}
  const list = new Set(Array.isArray(state[key].disabledTools) ? state[key].disabledTools : [])
  if (disabled) {
    list.add(toolName)
  } else {
    list.delete(toolName)
  }
  state[key].disabledTools = Array.from(list)
  writeMcpToolsState(state)

  return state[key].disabledTools
}

const MCP_STARTUP_TIMEOUT_MS = 180000
const MCP_TOOLS_TIMEOUT_MS = 60000
const MCP_AUTH_TIMEOUT_MS = 8000
const STDERR_TAIL_BYTES = 8192

/** Use the same MCP transport as DSH, including Windows command shim resolution. */
export async function queryStdioToolsList(cmd, args, extraEnv = {}) {
  // Windows treats env names case-insensitively. Normalize before merging so
  // an explicit Path/PATH overrides both the parent and the SDK default.
  const env = process.platform === 'win32'
    ? Object.fromEntries([...Object.entries(process.env), ...Object.entries(extraEnv)].map(([key, value]) => [key.toUpperCase(), value]))
    : { ...process.env, ...extraEnv }
  const transport = new StdioClientTransport({ command: cmd, args: Array.isArray(args) ? args : [], env, stderr: 'pipe' })
  const client = new Client({ name: 'universal-plugin-hub', version: '1.0.0' })
  // The SDK starts cleanup itself if initialization fails. Wait for the same
  // close operation in finally before returning the probe result.
  const close = transport.close.bind(transport)
  let closing
  transport.close = () => closing ??= close()

  let stderr = ''
  transport.stderr?.setEncoding('utf8').on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-STDERR_TAIL_BYTES)
  })

  let phase = '启动'
  let timeout = MCP_STARTUP_TIMEOUT_MS
  let signal = AbortSignal.timeout(timeout)
  try {
    await client.connect(transport, { timeout, signal })
    phase = '工具解析'
    timeout = MCP_TOOLS_TIMEOUT_MS
    signal = AbortSignal.timeout(timeout)
    return { tools: await listMcpTools(client, { timeout, signal }), error: null }
  } catch (error) {
    const message = error?.message || String(error)
    const detail = stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ')
    const reason = signal.aborted || error?.code === ErrorCode.RequestTimeout
      ? `MCP ${phase}超时（${timeout / 1000} 秒）`
      : phase === '启动' ? `无法启动 ${cmd}: ${message}` : message
    return { tools: [], error: detail ? `${reason}：${detail}` : reason }
  } finally {
    await transport.close()
  }
}

async function listMcpTools(client, options) {
  const tools = []
  if (!client.getServerCapabilities()?.tools) return tools
  const cursors = new Set()
  let cursor
  do {
    const result = await client.listTools(cursor === undefined ? undefined : { cursor }, options)
    tools.push(...result.tools)
    cursor = result.nextCursor
    if (cursor === undefined) return tools
    if (cursors.has(cursor)) throw new Error('MCP 服务返回了重复的工具分页游标')
    cursors.add(cursor)
  } while (true)
}

async function queryHttpToolsList(url, headers, timeout = MCP_TOOLS_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeout)
  let transport
  try {
    transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
      fetch: (input, init) => fetch(input, {
        ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
      }),
    })
    const client = new Client({ name: 'universal-plugin-hub', version: '1.0.0' })
    await client.connect(transport, { timeout, signal })
    const tools = await listMcpTools(client, { timeout, signal })
    return { tools, error: null, status: 200 }
  } catch (error) {
    const status = Number.isInteger(error.code) && error.code >= 400 && error.code <= 599 ? error.code : undefined
    const message = signal.aborted || error.code === ErrorCode.RequestTimeout
      ? `连接或解析 MCP 工具超时（${timeout / 1000} 秒）`
      : status === 401 || status === 403 ? `MCP 服务返回 HTTP ${status}，请检查 Headers 或 OAuth 授权`
        : status ? `MCP 服务返回 HTTP ${status}`
        : `连接或解析 MCP 工具失败：${error.message}`
    return { tools: [], error: message, status }
  } finally {
    if (transport?.sessionId && !signal.aborted) await transport.terminateSession().catch(() => {})
    await transport?.close().catch(() => {})
  }
}

const MEMORY_TOOLS_CACHE = new Map()
const MCP_TOOLS_INFLIGHT = new Map()

export async function fetchConnectorTools(pluginName, connectorName, forceFresh = false) {
  const key = `${pluginName}::${connectorName}`
  const inflight = MCP_TOOLS_INFLIGHT.get(key)
  // A caller asking for a fresh probe must never be served a background
  // probe's stale answer (e.g. right after the user fixed a bad URL).
  if (inflight && !(forceFresh && !inflight.forceFresh)) return inflight.promise
  const entry = { forceFresh, promise: null }
  entry.promise = discoverConnectorTools(pluginName, connectorName, forceFresh, () => MCP_TOOLS_INFLIGHT.get(key) === entry)
  MCP_TOOLS_INFLIGHT.set(key, entry)
  try {
    const result = await entry.promise
    // A failure is transient; remembering it with no expiry pinned the UI to
    // "解析失败" until the process restarted.
    if (MCP_TOOLS_INFLIGHT.get(key) === entry) {
      if (result.ok === false || result.stale) MEMORY_TOOLS_CACHE.delete(key)
      else MEMORY_TOOLS_CACHE.set(key, { tools: result.tools || [], ok: result.ok, message: result.message })
    }
    return result
  } finally {
    if (MCP_TOOLS_INFLIGHT.get(key) === entry) MCP_TOOLS_INFLIGHT.delete(key)
  }
}

async function discoverConnectorTools(pluginName, connectorName, forceFresh, isCurrent) {
  const key = `${pluginName}::${connectorName}`
  const state = readMcpToolsState()
  const disabledTools = Array.isArray(state[key]?.disabledTools) ? state[key].disabledTools : []

  if (!forceFresh && MEMORY_TOOLS_CACHE.has(key)) {
    const mem = MEMORY_TOOLS_CACHE.get(key)
    return { ok: mem.ok !== false, tools: mem.tools || [], disabledTools, ...(mem.message ? { message: mem.message } : {}) }
  }

  const entry = getConnectorEntry(pluginName, connectorName)
  const cached = state[key]?.cachedTools || []
  const hasCachedTools = cached.length > 0 || state[key]?.cachedToolsResolved === true
  const inactiveStandalone = pluginName === 'user-mcp' && !entry
  if (hasCachedTools && (!forceFresh || inactiveStandalone)) return { ok: true, tools: cached, disabledTools }
  if (inactiveStandalone) return { ok: false, tools: [], disabledTools, message: 'MCP 服务未启用' }

  const definition = connectorDefinition(pluginName, connectorName,
    entry ? { ...entry.config, ...remoteConfigFromEntry(entry.config) } : savedConnectorDefinition(pluginName, connectorName))
  const probe = await probeConnectorDefinition(pluginName, connectorName, definition)
  const probeError = probe.error
  // A response from the previous registration must not replace the current cache.
  const sameRegistration = isCurrent() && JSON.stringify(getConnectorEntry(pluginName, connectorName)) === JSON.stringify(entry)
  if (!probeError) {
    if (sameRegistration) {
      cacheConnectorTools(key, probe.tools)
      if (entry && definition.transport === 'http') setRemoteVerification(pluginName, connectorName, definition, true)
    }
    return { ok: true, tools: probe.tools, disabledTools }
  }
  if (entry && definition.transport === 'http' && sameRegistration) {
    setRemoteVerification(pluginName, connectorName, definition, false)
  }

  // A probe that never reached the server is an error, not an empty tool list;
  // reporting ok:true with an empty list made the UI claim the server exposes
  // no tools. A cached list is different: it is still usable, and surfacing it
  // as an error replaced the whole row (and its toggles) with a failure notice.
  if (hasCachedTools) return { ok: true, stale: true, tools: cached, disabledTools, message: probeError }
  return { ok: false, tools: [], disabledTools, message: probeError }
}

function cacheConnectorTools(key, tools) {
  // A probe started before an uninstall can finish afterwards; writing then
  // resurrects the removed plugin's tool table for the next install of the
  // same name.
  const owner = key.slice(0, key.indexOf('::'))
  if (owner !== 'user-mcp' && !readState().plugins.some((p) => p.name === owner)) return
  const state = readMcpToolsState()
  state[key] = { ...state[key], cachedTools: tools, cachedToolsResolved: true }
  writeMcpToolsState(state)
  MEMORY_TOOLS_CACHE.set(key, { tools })
}

function warmInstalledConnectorTools(pluginName, connectors, record) {
  const canEnable = () => readState().plugins.some(item =>
    item.name === pluginName && item.sourceId === record.sourceId && item.installedAt === record.installedAt && item.enabled !== false)
  for (const connector of connectors) {
    const entry = getConnectorEntry(pluginName, connector.name)
    const saved = readMcpToolsState()[`${pluginName}::${connector.name}`]
    if (!connectorRequiresAuth(connector) && !saved?.savedConnectorDefinition && !saved?.savedOAuthRemoteConfig) {
      // Installation stays responsive. DSH watches the profile patch and loads
      // the connector once its background probe succeeds.
      void enableConnector(pluginName, connector.name, connector, { pluginOwned: true, rememberDefinition: false, canEnable }).catch(() => {})
    } else if (entry) {
      void fetchConnectorTools(pluginName, connector.name, true).catch(() => {})
    }
  }
}

export function isScanDirRegistered(path) {
  const state = readState()
  const target = (path || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
  const plugin = state.plugins.find((p) => {
    const pPath = join(installedDir(p.name), 'skills').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    return pPath === target
  })
  return plugin ? plugin.enabled !== false : existsSync(path)
}

function ensureSkillFrontmatter(content, skillName, description) {
  const desc = description || skillName
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3)
    if (end > 0) {
      const yamlStr = content.slice(3, end)
      let extra = ''
      if (!/^\s*name\s*:/m.test(yamlStr)) {
        extra += `name: ${skillName}\n`
      }
      if (!/^\s*description\s*:/m.test(yamlStr)) {
        extra += `description: ${desc}\n`
      }
      if (!/^\s*user-invocable\s*:/m.test(yamlStr)) {
        extra += `user-invocable: true\n`
      }
      if (extra) {
        return `---\n${extra}${yamlStr.trim()}\n---` + content.slice(end + 3)
      }
      return content
    }
  }
  return `---\nname: ${skillName}\ndescription: ${desc}\nuser-invocable: true\n---\n\n` + content
}

/**
 * Synchronize all skills from an installed plugin into $DSH_HOME/skills.
 * This ensures DSH Desktop's @deepseek-ai/dsh-skill-filesystem discovers them
 * natively and hot-reloads them into the composer's "/" slash command menu.
 */
export async function syncPluginSkillsToDsh(pluginName, shouldSync = () => true, { repairOnly = false } = {}) {
  const target = installedDir(pluginName)
  const pluginSkillsDir = join(target, 'skills')
  if (!existsSync(pluginSkillsDir)) return []

  const dshSkills = dshSkillsDir()
  mkdirSync(dshSkills, { recursive: true })

  const synced = []
  for (const entry of readdirSync(pluginSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const srcSkillDir = join(pluginSkillsDir, entry.name)
    if (!existsSync(join(srcSkillDir, 'SKILL.md'))) continue
    const destSkillDir = join(dshSkills, entry.name)
    // Direct uploads own their native paths, including during a retry.
    const keepExisting = path => !shouldSync() || isUploadedSkillTarget(path)
    if (await replaceManagedDir(srcSkillDir, destSkillDir, keepExisting, repairOnly)) {
      synced.push(entry.name)
    }
    if (repairOnly) await yieldToHost()
  }
  return synced
}

function hasMatchingSkillCopy(source, destination) {
  try {
    // A link must still be repaired, even if its target currently matches.
    if (!lstatSync(destination, { throwIfNoEntry: false })?.isDirectory()) return false
    const entries = readdirSync(source, { withFileTypes: true })
    const existing = new Map(readdirSync(destination, { withFileTypes: true }).map(entry => [entry.name, entry]))
    if (entries.length !== existing.size) return false
    return entries.every(entry => {
      const other = existing.get(entry.name)
      const from = join(source, entry.name)
      const to = join(destination, entry.name)
      if (entry.isDirectory()) return other?.isDirectory() && hasMatchingSkillCopy(from, to)
      if (!entry.isFile() || !other?.isFile()) return false
      if (process.platform !== 'win32' && (statSync(from).mode & 0o777) !== (statSync(to).mode & 0o777)) return false
      return readFileSync(from).equals(readFileSync(to))
    })
  } catch {
    return false
  }
}

async function retryManagedDirOperation(operation, destination) {
  for (let attempt = 0; ; attempt++) {
    try {
      return operation()
    } catch (err) {
      // Windows can keep a deleted directory name reserved until the last
      // handle closes. Keep retries scoped to directory cleanup and creation.
      if (process.platform !== 'win32' || attempt >= 5 || (destination && err.path !== destination) ||
        ![undefined, 'lstat', 'unlink', 'mkdir'].includes(err.syscall) ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err
      await delay(50 * 2 ** attempt)
    }
  }
}

function replaceManagedDir(from, to, keepExisting, repairOnly = false) {
  return retryManagedDirOperation(() => {
    if (keepExisting?.(to)) return false
    if (repairOnly && hasMatchingSkillCopy(from, to)) return true
    removeManagedDir(to)
    copyDir(from, to)
    return true
  }, to)
}

/**
 * Remove a plugin's skills from $DSH_HOME/skills upon uninstall or disabling.
 */
export function removePluginSkillsFromDsh(pluginName) {
  const target = installedDir(pluginName)
  const pluginSkillsDir = join(target, 'skills')
  const dshSkills = dshSkillsDir()
  if (!existsSync(dshSkills)) return

  // 1. If installed copy exists, remove matching skill directories
  if (existsSync(pluginSkillsDir)) {
    for (const entry of readdirSync(pluginSkillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const destSkillDir = join(dshSkills, entry.name)
        if (isUploadedSkillTarget(destSkillDir)) continue
        removeManagedDir(destSkillDir)
      }
    }
  }

  // Older installs may have exposed the compiled subagent hub separately.
  const subagentHubDir = join(dshSkills, `${pluginName}-agents`)
  if (!isUploadedSkillTarget(subagentHubDir)) removeManagedDir(subagentHubDir)
}

/**
 * Sync all installed and enabled plugins into $DSH_HOME/skills.
 * Called at boot or after configuration change.
 */
export async function syncAllInstalledSkillsToDsh() {
  const state = readState()
  const dshSkills = dshSkillsDir()
  mkdirSync(dshSkills, { recursive: true })

  const results = {}
  for (const plugin of state.plugins || []) {
    const stillEnabled = () => readState().plugins.some(current =>
      current.name === plugin.name && current.installedAt === plugin.installedAt && current.enabled !== false)
    if (plugin.enabled !== false) {
      results[plugin.name] = await syncPluginSkillsToDsh(plugin.name, stillEnabled, { repairOnly: true })
    }
  }
  return results
}

/**
 * Install a plugin from the marketplace into the installed tree.
 * Returns a result summary for the UI.
 */
const marketplaceInstalls = new Set()

export async function installPlugin(options) {
  const { pluginName } = options
  if (marketplaceInstalls.has(pluginName)) throw new Error(`插件 ${pluginName} 正在安装`)
  marketplaceInstalls.add(pluginName)
  try {
    return await installMarketplacePlugin(options)
  } finally {
    marketplaceInstalls.delete(pluginName)
  }
}

async function installMarketplacePlugin({ sourceId, pluginName, refresh = false }) {
  const state = readState()
  const source = state.sources.find((s) => s.id === sourceId)
  if (!source) throw new Error(`unknown source: ${sourceId}`)
  const installed = state.plugins.find(plugin => plugin.name === pluginName)
  if (installed && installed.sourceId !== sourceId) {
    const owner = state.sources.find(item => item.id === installed.sourceId)
    throw new Error(`插件 ${pluginName} 已从 ${owner?.name || installed.sourceId} 安装，请在管理页操作`)
  }

  const row = await findMarketRow(sourceId, pluginName)
  if (!row) throw new Error(`plugin not found in marketplace: ${pluginName}`)

  const { dir } = await materializePlugin(sourceId, pluginName, row.source, { refresh })
  const target = installedDir(pluginName)

  // Reinstalling must not inherit the previous copy's registrations: skills it
  // no longer ships and MCP servers it dropped would otherwise stay visible.
  const prevConnectors = existsSync(target) ? getPluginConnectors(target).map((c) => c.name) : []
  if (existsSync(target)) await retryManagedDirOperation(() => removePluginSkillsFromDsh(pluginName))

  // Idempotent reinstall: clear the previous copy first.
  await replaceManagedDir(dir, target)

  // Persist marketplace-declared LSP servers into the installed copy's
  // manifest, so installedDetails / detail views can read them back even when
  // the plugin directory itself is only a README placeholder (official LSP
  // plugins declare `lspServers` in marketplace.json, not in the plugin tree).
  if (row.lspServers && typeof row.lspServers === 'object' && !Array.isArray(row.lspServers)) {
    const manifestDir = join(target, '.claude-plugin')
    mkdirSync(manifestDir, { recursive: true })
    const manifestPath = join(manifestDir, 'plugin.json')
    let installedManifest = {}
    try {
      if (existsSync(manifestPath)) installedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      // ignore malformed existing manifest
    }
    installedManifest.lspServers = row.lspServers
    writeFileSync(manifestPath, JSON.stringify(installedManifest, null, 2), 'utf8')
  }

  // Ensure skills/ directory exists
  const skillsDir = join(target, 'skills')
  mkdirSync(skillsDir, { recursive: true })

  // Codex manifests may point at a skills collection outside the default skills/.
  const declaredSkills = readPluginManifest(target)?.skills
  const skillPaths = typeof declaredSkills === 'string' ? [declaredSkills] : (Array.isArray(declaredSkills) ? declaredSkills.filter((p) => typeof p === 'string' && p.startsWith('./')) : [])
  for (const path of skillPaths) {
    let root = pluginPath(target, path)
    if (!existsSync(root) || resolve(root) === resolve(skillsDir)) continue
    if (statSync(root).isFile()) root = dirname(root)
    const dirs = existsSync(join(root, 'SKILL.md')) || existsSync(join(root, 'skill.md')) ? [root] : readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(root, e.name))
    for (const dir of dirs) {
      if (resolve(dir) === resolve(target)) continue // handled as a root skill below
      if (!existsSync(join(dir, 'SKILL.md')) && !existsSync(join(dir, 'skill.md'))) continue
      const dest = join(skillsDir, basename(dir))
      if (resolve(dest) !== resolve(dir)) copyDir(dir, dest)
    }
  }

  // 1. If the plugin uses commands/ (Claude Code slash commands), mirror them into skills/
  const commandsDir = join(target, 'commands')
  if (existsSync(commandsDir)) {
    for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const cmdName = entry.name.replace(/\.md$/, '')
        const cmdSkillDir = join(skillsDir, cmdName)
        mkdirSync(cmdSkillDir, { recursive: true })
        const rawContent = readFileSync(join(commandsDir, entry.name), 'utf8')
        const formatted = ensureSkillFrontmatter(rawContent, cmdName)
        writeFileSync(join(cmdSkillDir, 'SKILL.md'), formatted, 'utf8')
      } else if (entry.isDirectory()) {
        const subSkillDir = join(skillsDir, entry.name)
        mkdirSync(subSkillDir, { recursive: true })
        copyDir(join(commandsDir, entry.name), subSkillDir)
      }
    }
  }

  // 2. If the plugin has a root SKILL.md, mirror it into skills/<pluginName>/SKILL.md
  const rootSkillMd = ['SKILL.md', 'skill.md'].map((f) => join(target, f)).find(existsSync)
  if (rootSkillMd) {
    const rootSkillDir = join(skillsDir, pluginName)
    if (!existsSync(rootSkillDir)) {
      mkdirSync(rootSkillDir, { recursive: true })
      // Keep relative scripts/references/assets usable when DSH copies the skill.
      for (const entry of readdirSync(target, { withFileTypes: true })) {
        if (entry.isDirectory() && !['skills', '.git', 'node_modules'].includes(entry.name)) copyDir(join(target, entry.name), join(rootSkillDir, entry.name))
        else if (entry.isFile()) copyFileSync(join(target, entry.name), join(rootSkillDir, entry.name))
      }
      const rawContent = readFileSync(rootSkillMd, 'utf8')
      const formatted = ensureSkillFrontmatter(rawContent, pluginName)
      writeFileSync(join(rootSkillDir, 'SKILL.md'), formatted, 'utf8')
    }
  }

  // 2.5. Skill directories beside a root SKILL.md belong to that one skill.
  // Only expand them when the package has no root skill of its own.
  try {
    if (!rootSkillMd) for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        entry.name !== 'skills' &&
        entry.name !== 'commands' &&
        entry.name !== 'agents' &&
        entry.name !== '.agents' &&
        entry.name !== 'node_modules' &&
        entry.name !== '.git'
      ) {
        const sMd = join(target, entry.name, 'SKILL.md')
        if (existsSync(sMd) && !existsSync(join(skillsDir, entry.name))) {
          const subDir = join(skillsDir, entry.name)
          mkdirSync(subDir, { recursive: true })
          copyDir(join(target, entry.name), subDir)
        }
      }
    }
  } catch {}

  // 4. Compile Claude Agents into a clean Subagents Hub Skill (task-level specialized delegates)
  const agents = listAgents(target)
  const validAgents = []
  const convertErrors = []

  for (const agent of agents) {
    const text = readAgentYaml(target, agent.file)
    const parsed = parseAgentDefinition(pluginName, agent.file, text)
    if (parsed?.error) {
      convertErrors.push(parsed.error)
    } else if (parsed) {
      validAgents.push(parsed)
      // Also generate individual skill for direct user invocation and model task-delegation
      const agentSkillDir = join(skillsDir, parsed.name)
      mkdirSync(agentSkillDir, { recursive: true })
      const agentSkillContent = ensureSkillFrontmatter(
        `# ${parsed.displayName || parsed.name}\n\n` +
        `Specialized subagent from **${pluginName}**.\n\n` +
        `${parsed.description}\n\n` +
        `## Autonomous Subagent Delegation\n` +
        `When delegating a task to this specialized agent using the \`subagent\` tool:\n\n` +
        '```markdown\n' +
        parsed.instructions + '\n' +
        '```\n',
        parsed.name,
        parsed.description
      )
      writeFileSync(join(agentSkillDir, 'SKILL.md'), agentSkillContent, 'utf8')
    }
  }

  let subagentsHub = null
  if (validAgents.length > 0) {
    subagentsHub = compileSubagentsHubSkill(pluginName, row.displayName || pluginName, validAgents, skillsDir)
  }

  // Ensure all SKILL.md in skills/ have valid frontmatter with name:
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const skillFile = join(skillsDir, entry.name, 'SKILL.md')
      const altSkillFile = join(skillsDir, entry.name, 'skill.md')
      if (!existsSync(skillFile) && existsSync(altSkillFile)) copyFileSync(altSkillFile, skillFile)
      if (existsSync(skillFile)) {
        const raw = readFileSync(skillFile, 'utf8')
        const fixed = ensureSkillFrontmatter(raw, entry.name)
        if (fixed !== raw) {
          writeFileSync(skillFile, fixed, 'utf8')
        }
      }
    }
  }

  // Clean any legacy preset directories left by prior versions
  cleanupLegacyPresets(pluginName)

  const skills = listSkills(target)
  const prompts = listPrompts(target)
  const connectors = listConnectors(target)
  const hooks = listHooks(target)

  // Sync skills and subagent delegates to DSH native skills directory.
  if (existsSync(skillsDir)) {
    await syncPluginSkillsToDsh(pluginName)
  }

  // Auto-register and connect any MCP connectors defined in the plugin that do NOT require auth and have valid URLs/commands.
  const pluginConnectors = getPluginConnectors(target)
  for (const name of prevConnectors) {
    if (!pluginConnectors.some((c) => c.name === name)) unregisterConnector(pluginName, name)
  }

  // Auto-register LSP servers declared by the plugin. The host packages
  // (dsh-lsp / dsh-lsp-stdio / dsh-tool-lsp) were pre-provisioned by the
  // hub's `apply()` at DSH startup — this step is a single, race-free
  // patch write. `lspErrors` still surface other failures (the user-installed
  // language server binary not on PATH, missing extensionToLanguage, etc.).
  // Drop the previous version's server entries; the loop re-adds the ones this
  // version still declares, so removed servers stop loading.
  unregisterPluginLsp(pluginName)
  const lspServers = listLspServers(target)
  const lspErrors = []
  for (const r of registerPluginLsp(pluginName)) {
    if (!r.ok && r.error) lspErrors.push(r.error)
  }

  // Register the plugin's Claude/Codex hooks into DSH via the hooks bridge.
  // The bridge package was pre-provisioned by the hub's `apply()`; this is a
  // single patch write.
  await registerPluginHooks(pluginName)

  const record = {
    id: `${sourceId}/${pluginName}`,
    sourceId,
    name: pluginName,
    displayName: row.displayName || pluginName,
    description: row.description || '',
    author: row.author ?? null,
    enabled: true,
    installedAt: Date.now(),
    skillCount: skills.length,
    agentCount: agents.length,
    promptCount: prompts.length,
    connectorCount: connectors.length,
    hookCount: hooks.length,
    lspServerCount: lspServers.length,
    version: readInstalledVersion(target) ?? row.version ?? null,
  }
  // Materialization can overlap edits to other plugins and to standalone MCPs.
  const latest = readState()
  latest.plugins = [...latest.plugins.filter((p) => p.name !== pluginName), record]
  writeState(latest)
  invalidateParserCaches()

  warmInstalledConnectorTools(pluginName, pluginConnectors, record)

  return {
    ok: true,
    plugin: record,
    skills: skills.map((s) => s.command),
    subagents: validAgents,
    converted: validAgents,
    subagentsHub,
    connectors: connectors.map((c) => c.name),
    lspServers: lspServers.map((s) => s.name),
    lspErrors: lspErrors.length > 0 ? lspErrors : undefined,
    convertErrors,
    droppedFields: [],
    restartRequired: false,
  }
}

function readAgentYaml(target, file) {
  const candidates = [
    join(target, 'agents', file),
    join(target, file),
    join(target, '.well-known', file),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf8')
      } catch {}
    }
  }
  return ''
}

function readInstalledVersion(target) {
  const manifest = readPluginManifest(target)
  return manifest?.version
}

/** Uninstall: remove copy, unregister scan dir, clean legacy presets and connectors. */
export async function uninstallPlugin(pluginName) {
  const sharedNamespace = pluginName === 'user-mcp'
  const standaloneIds = () => new Set([
    ...(readState().userMcps || []).map(mcp => mcp.name),
    ...standaloneOAuthConnectorNames(),
  ].map(name => getConnectorId(pluginName, name)))
  const stopVerifications = () => {
    const claimed = sharedNamespace ? standaloneIds() : new Set()
    return cancelPluginOAuthVerifications(pluginName, name => !claimed.has(getConnectorId(pluginName, name)))
  }
  let stopping = stopVerifications()
  while (stopping) {
    await stopping
    stopping = stopVerifications()
  }
  const state = readState()
  const target = installedDir(pluginName)
  removePluginSkillsFromDsh(pluginName)
  const prefix = `${pluginName}::`
  const priorToolsState = readMcpToolsState()
  const declared = new Map((existsSync(target) ? getPluginConnectors(target) : []).map(c => [c.name, c.url]))
  // Standalone definitions and in-flight sign-ins take precedence in the
  // shared namespace. Other cached entries are eligible only with provenance.
  const claimed = sharedNamespace ? standaloneIds() : new Set()
  const cachedNames = Object.entries(priorToolsState)
    .filter(([key, saved]) => key.startsWith(prefix) && (!sharedNamespace || saved?.pluginOAuthOwned || saved?.pluginConnectorOwned))
    .map(([key]) => key.slice(prefix.length))
  const ownedNames = new Set()
  for (const name of new Set([...declared.keys(), ...cachedNames])) {
    if (claimed.has(getConnectorId(pluginName, name))) continue
    const saved = priorToolsState[prefix + name]
    const entry = getConnectorEntry(pluginName, name)
    if (sharedNamespace && entry && entry.config?.serverName !== name) continue
    const remote = remoteConfigFromEntry(entry?.config)
    const ownsRegistration = remote && remote.credentialKey === oauthCredentialKey(pluginName, name, remote.url, remote.oauth)
    if (sharedNamespace && remote && !ownsRegistration) continue
    if (sharedNamespace && !entry && !saved?.pluginOAuthOwned && !saved?.pluginConnectorOwned) continue
    ownedNames.add(name)
    MCP_ACTIVATIONS.delete(prefix + name)
    if (remote ? ownsRegistration : declared.has(name)) unregisterConnector(pluginName, name)
    const oauthUrls = new Set([
      ...(Array.isArray(saved?.oauthUrls) ? saved.oauthUrls : []),
      saved?.savedOAuthRemoteConfig?.url,
      ownsRegistration ? remote.url : null,
    ])
    for (const url of new Set([declared.get(name), ...oauthUrls])) {
      if (typeof url !== 'string' || !url.trim()) continue
      for (const mode of ['auto_register', 'custom']) {
        deleteOAuthRecord(oauthCredentialKey(pluginName, name, url, mode), {
          required: true,
          ifPresent: !oauthUrls.has(url),
        })
      }
    }
  }
  if (existsSync(target)) {
    unregisterPluginLsp(pluginName)
    unregisterPluginHooks(pluginName)
  }
  removeManagedDir(target)

  // Clean any legacy preset directories left by prior versions
  cleanupLegacyPresets(pluginName)

  // Clean MCP tools state and memory cache for this plugin
  const mcpToolsState = readMcpToolsState()
  let mcpToolsStateChanged = false
  for (const k of Object.keys(mcpToolsState)) {
    if (k.startsWith(prefix) && ownedNames.has(k.slice(prefix.length))) {
      delete mcpToolsState[k]
      mcpToolsStateChanged = true
      MEMORY_TOOLS_CACHE.delete(k)
      MCP_TOOLS_INFLIGHT.delete(k)
    }
  }
  if (mcpToolsStateChanged) {
    writeMcpToolsState(mcpToolsState, { required: true })
  }

  state.plugins = state.plugins.filter((p) => p.name !== pluginName)
  writeState(state)
  invalidateParserCaches()
  return { ok: true }
}

/** Toggle a plugin's skills scanning and connectors on/off. */
export async function togglePlugin(pluginName, enabled) {
  const state = readState()
  const rec = state.plugins.find((p) => p.name === pluginName)
  if (!rec) throw new Error(`plugin not installed: ${pluginName}`)
  const target = installedDir(pluginName)
  const skillsDir = join(target, 'skills')
  const skills = listSkills(target)
  const skillNames = skills.map((s) => s.command || s.name || pluginName)
  const pluginConnectors = getPluginConnectors(target)
  const lspErrors = []

  if (enabled) {
    if (existsSync(skillsDir)) {
      await syncPluginSkillsToDsh(pluginName)
    }
    for (const r of registerPluginLsp(pluginName)) {
      if (!r.ok && r.error) lspErrors.push(r.error)
    }
    await registerPluginHooks(pluginName)
  } else {
    removePluginSkillsFromDsh(pluginName)
    for (const c of pluginConnectors) {
      toggleConnector(pluginName, c.name, false)
    }
    unregisterPluginLsp(pluginName)
    unregisterPluginHooks(pluginName)
  }
  const latest = readState()
  const sameInstall = (item) => item.name === pluginName && item.sourceId === rec.sourceId && item.installedAt === rec.installedAt
  if (!latest.plugins.some(sameInstall)) return { ok: false, error: '插件已变更，请刷新后重试' }
  writeState({ ...latest, plugins: latest.plugins.map(item => sameInstall(item) ? { ...item, enabled } : item) })
  if (enabled) {
    const canEnable = () => readState().plugins.some(item => sameInstall(item) && item.enabled !== false)
    await Promise.all(pluginConnectors.map(async (c) => {
      if (!getConnectorEntry(pluginName, c.name) && (savedConnectorDefinition(pluginName, c.name) || !connectorRequiresAuth(c))) {
        await enableConnector(pluginName, c.name, undefined, { pluginOwned: true, canEnable })
      }
    }))
  }
  return { ok: true, enabled, lspErrors: lspErrors.length > 0 ? lspErrors : undefined }
}

/**
 * Update: pull the source (for local sources) or re-clone the remote, then
 * reinstall the plugin copy and re-run conversions.
 */
export async function updatePlugin(pluginName) {
  const state = readState()
  const rec = state.plugins.find((p) => p.name === pluginName)
  if (!rec) throw new Error(`plugin not installed: ${pluginName}`)
  if (rec.sourceId === 'local' && !readMarketplace('local').some(row => row.name === pluginName)) {
    throw new Error('本地插件的原始来源不可用，请重新导入后再更新')
  }
  const source = state.sources.find((s) => s.id === rec.sourceId)
  if (source && typeof source.url === 'string') {
    const cacheDir = sourceCacheDir(rec.sourceId)
    if (existsSync(join(cacheDir, '.git'))) {
      await pullSource(rec.sourceId)
    }
  }

  // Clear memory cache so fresh MCP tool lists can be queried
  for (const k of Array.from(MEMORY_TOOLS_CACHE.keys())) {
    if (k.startsWith(`${pluginName}::`)) {
      MEMORY_TOOLS_CACHE.delete(k)
    }
  }

  // The marketplace rows are cached for 30s; without this the install below
  // re-reads the pre-pull catalog and installs the old revision.
  invalidateMarketplaceCache(rec.sourceId)

  // Freshly materialized install (re-copies, re-registers, re-converts).
  return installPlugin({ sourceId: rec.sourceId, pluginName, refresh: true })
}

/**
 * Re-materialize already-installed plugins belonging to `sourceId` whose names
 * appear in `pluginNames`, clearing cached metadata/tools while preserving any
 * prior disabled (`enabled === false`) state. Plugins from other sources stay
 * untouched so local overwrites never hijack foreign installs.
 */
export async function refreshInstalledPluginsFromSource(sourceId, pluginNames) {
  const names = new Set(Array.from(pluginNames || []).map((n) => String(n || '').toLowerCase()).filter(Boolean))
  if (!names.size) return []
  const targets = readState().plugins.filter(
    (rec) => rec && rec.sourceId === sourceId && names.has(String(rec.name || '').toLowerCase()),
  )
  const refreshed = []
  for (const rec of targets) {
    for (const k of Array.from(MEMORY_TOOLS_CACHE.keys())) {
      if (k.startsWith(`${rec.name}::`)) MEMORY_TOOLS_CACHE.delete(k)
    }
    invalidateMarketplaceCache(sourceId)
    invalidateParserCaches()
    const wasDisabled = rec.enabled === false
    await installPlugin({ sourceId, pluginName: rec.name, refresh: true })
    if (wasDisabled) {
      await togglePlugin(rec.name, false)
    }
    refreshed.push(rec.name)
  }
  return refreshed
}

/** Find one marketplace row by name. */
export async function findMarketRow(sourceId, pluginName) {
  const { readMarketplace } = await import('./parser.js')
  const rows = readMarketplace(sourceId)
  return rows.find((r) => r.name === pluginName) ?? null
}

/**
 * The source's live marketplace row, read synchronously. Used as the last
 * fallback for installed records written before the reader merged each
 * plugin's own manifest, and as the identity source (`homepage`, `source`,
 * `icons`) the browse grid and connector rows render from. Null when absent.
 */
function findMarketRowSync(sourceId, pluginName) {
  try {
    return readMarketplace(sourceId).find((r) => r.name === pluginName) ?? null
  } catch {
    return null
  }
}

function installedPluginIconIdentity(rec, target, manifest, marketRow) {
  const author = typeof manifest?.author === 'string' ? manifest.author : manifest?.author?.name
  const declared = buildPluginIcons(manifest, { sourceId: rec.sourceId, name: rec.name, dir: target, source: marketRow?.source })
  return {
    name: rec.name,
    sourceId: rec.sourceId,
    author: rec.author || author || marketRow?.author || rec.author,
    homepage: rec.homepage || marketRow?.homepage,
    source: rec.source || marketRow?.source,
    icons: declared.light.length || declared.dark.length ? declared : (marketRow?.icons || declared),
  }
}

/** Match the DSH MCP client's public name, including lossy or long raw names. */
function mcpPublicToolName(server, rawName) {
  const name = `mcp__${server}__${rawName}`
  const normalized = name.replace(/[^A-Za-z0-9_-]/g, '_')
  if (name === normalized && name.length <= 64) return name
  const hash = createHash('sha256').update(`${server}\0${rawName}`).digest('hex').slice(0, 12)
  return `${normalized.slice(0, 51)}_${hash}`
}

/** Public branding only. Connector configuration and tool arguments stay out of this response. */
export function toolCallIconGroups() {
  const registrations = readCordisPatch().flatMap(block => block?.insert || [])
    .filter(entry => entry?.name === '@deepseek-ai/dsh-mcp-client' && /^[A-Za-z0-9_-]{1,32}$/.test(entry.config?.serverName || ''))
  const byServer = new Map()
  for (const entry of registrations) {
    const server = entry.config.serverName
    byServer.set(server, byServer.has(server) ? null : entry.id)
  }
  if (!byServer.size) return []
  const toolsState = readMcpToolsState()
  const owners = new Set()
  for (const [key, state] of Object.entries(toolsState)) {
    if (!state?.cachedTools?.length) continue
    const separator = key.lastIndexOf('::')
    if (separator < 0) continue
    const owner = key.slice(0, separator)
    const server = key.slice(separator + 2)
    if (byServer.get(server) === getConnectorId(owner, server)) owners.add(owner)
  }
  const installed = readState().plugins.filter(rec =>
    rec.enabled !== false && rec.name !== 'user-mcp' && owners.has(rec.name))
  const namesBySource = new Map()
  for (const rec of installed) {
    if (!namesBySource.has(rec.sourceId)) namesBySource.set(rec.sourceId, new Set())
    namesBySource.get(rec.sourceId).add(rec.name)
  }
  const rowsBySource = new Map()
  const claimedTools = new Map()
  const groups = []
  for (const rec of installed) {
    const target = installedDir(rec.name)
    if (!existsSync(target)) continue
    const manifest = readPluginManifest(target)
    const tools = new Map()
    for (const { name } of getPluginConnectors(target, manifest)) {
      if (byServer.get(name) !== getConnectorId(rec.name, name)) continue
      for (const tool of toolsState[`${rec.name}::${name}`]?.cachedTools || []) {
        if (typeof tool?.name !== 'string' || !tool.name) continue
        const publicName = mcpPublicToolName(name, tool.name)
        // Double underscores can also occur inside a DSH server name.
        if (hasOverlappingToolPrefix(publicName, name, byServer)) continue
        tools.set(publicName, tool.name)
      }
    }
    if (!tools.size) continue
    if (!rowsBySource.has(rec.sourceId)) {
      const rows = new Map()
      // Keep the first matching descriptor, as the full lookup does.
      try {
        for (const row of readMarketplace(rec.sourceId, namesBySource.get(rec.sourceId))) {
          if (!rows.has(row.name)) rows.set(row.name, row)
        }
      } catch {}
      rowsBySource.set(rec.sourceId, rows)
    }
    for (const name of tools.keys()) claimedTools.set(name, (claimedTools.get(name) || 0) + 1)
    groups.push({
      plugin: {
        ...installedPluginIconIdentity(rec, target, manifest, rowsBySource.get(rec.sourceId).get(rec.name)),
        displayName: rec.displayName || rec.name,
      },
      tools: Array.from(tools, ([name, rawName]) => ({ name, rawName })),
    })
  }
  return groups.map(group => ({ ...group, tools: group.tools.filter(tool => claimedTools.get(tool.name) === 1) }))
    .filter(group => group.tools.length)
}

function hasOverlappingToolPrefix(publicName, name, servers) {
  for (let end = publicName.indexOf('__', 5); end !== -1; end = publicName.indexOf('__', end + 1)) {
    const server = publicName.slice(5, end)
    if (server !== name && servers.has(server)) return true
  }
  return false
}

/** Re-exported for routes: list installed plugins with details. */
export function installedDetails() {
  const state = readState()
  let connectorEntries
  let toolsState
  return state.plugins.map((rec) => {
    const target = installedDir(rec.name)
    const installed = existsSync(target)
    if (installed) {
      const skillsDir = join(target, 'skills')
      if (!existsSync(skillsDir)) {
        try { mkdirSync(skillsDir, { recursive: true }) } catch {}
      }
      try {
        for (const entry of readdirSync(target, { withFileTypes: true })) {
          if (
            entry.isDirectory() &&
            entry.name !== 'skills' &&
            entry.name !== 'commands' &&
            entry.name !== 'agents' &&
            entry.name !== '.agents' &&
            entry.name !== 'node_modules' &&
            entry.name !== '.git'
          ) {
            const sMd = join(target, entry.name, 'SKILL.md')
            if (existsSync(sMd) && !existsSync(join(skillsDir, entry.name))) {
              const subDir = join(skillsDir, entry.name)
              mkdirSync(subDir, { recursive: true })
              copyDir(join(target, entry.name), subDir)
            }
          }
        }
      } catch {}
    }
    const targetManifest = installed ? readPluginManifest(target) : null
    const connectors = installed ? getPluginConnectors(target, targetManifest).map((c) => {
      if (!connectorEntries) {
        connectorEntries = new Map()
        for (const block of readCordisPatch()) {
          if (!Array.isArray(block?.insert)) continue
          for (const entry of block.insert) {
            if (entry && !connectorEntries.has(entry.id)) connectorEntries.set(entry.id, entry)
          }
        }
      }
      const needsAuth = connectorRequiresAuth(c)
      const savedEntry = connectorEntries.get(getConnectorId(rec.name, c.name))
      const toolState = () => (toolsState ??= readMcpToolsState())[`${rec.name}::${c.name}`]
      const authenticated = connectorAuthenticated(c, savedEntry)
      const connected = connectorActive(savedEntry, () => authenticated, toolState)
      const savedConfig = savedEntry?.config || toolState()?.savedConnectorDefinition || {}
      const remote = remoteConfigFromEntry(savedConfig) || (!savedEntry ? toolState()?.savedOAuthRemoteConfig : null)
      const storedDefinition = toolState()?.savedConnectorDefinition
      const savedHeaders = remote ? remote.headers : (savedConfig.headers ?? storedDefinition?.headers ?? c.headers)
      const savedEnv = remote ? {} : (savedConfig.env ?? storedDefinition?.env ?? c.env)
      const savedUrl = remote ? remote.url : (savedConfig.url ?? c.url)
      const savedArgs = remote ? [] : (savedConfig.args ?? storedDefinition?.args ?? c.args)
      const savedTransport = remote ? 'http' : connectorTransport(savedConfig.transport || savedConfig.type, savedUrl, savedConfig.command || c.command)
      const savedClient = remote?.oauth === 'custom' ? readSavedOAuthClient(rec.name, c.name, savedUrl, remote.oauth) : null

      return {
        ...c,
        type: savedTransport,
        command: remote ? null : (savedConfig.command ?? c.command),
        url: savedUrl,
        headers: savedHeaders,
        env: savedEnv,
        args: savedArgs,
        oauth: remote?.oauth || savedConfig.oauth || c.oauth || 'none',
        oauthClientId: savedClient?.clientId || '',
        oauthHasClientSecret: savedClient?.hasClientSecret || false,
        oauthCallbackPort: remote?.oauthCallbackPort || '',
        oauthScope: remote?.oauthScope || '',
        configured: !!(savedEntry || storedDefinition || remote),
        needsAuth,
        authenticated,
        enabled: !!savedEntry,
        connected,
      }
    }) : []
    let lspServers = listLspServers(targetManifest)
    // Auto-activate: if an LSP server's binary is now on PATH but the entry
    // hasn't been written to cordis.patch.yml yet (e.g. the user installed the
    // binary after the plugin — registration was previously skipped because the
    // command was missing), register it on the spot. Registration is idempotent
    // and only writes the patch; it does not require a manual "Update" click.
    // DSH's HMR watches this patch file and re-applies the plugin tree within
    // ~1s, so the newly registered server becomes truly active immediately —
    // no DSH restart needed (verified against @deepseek-ai/dsh-app-boot's
    // `watchUserPatches`, which registers cordis.patch.yml with Cordis HMR).
    if (lspServers.length > 0) {
      const autoRegistered = lspServers.filter((s) => {
        if (isLspActive(rec.name, s.name)) return false
        // Honor an explicit removal: if we already auto-activated this server
        // once but it is no longer in the patch, the user (or a manual patch
        // edit) removed it deliberately — do not silently re-add it.
        if (autoActivatedLspServers.has(`${rec.name}::${s.name}`)) return false
        // Host packages must actually be in DSH's node_modules — otherwise
        // auto-registering would write a patch entry that DSH can't load.
        return !!s.command
          && resolveCommandPath(s.command)
          && Object.keys(s.extensionToLanguage || {}).length > 0
      })
      if (autoRegistered.length > 0) {
        for (const s of autoRegistered) {
          try {
            const r = registerLspServer(rec.name, s.name, s)
            if (r.ok) autoActivatedLspServers.add(`${rec.name}::${s.name}`)
          } catch {}
        }
        lspServers = listLspServers(target)
      }
    }
    lspServers = lspServers.map((s) => {
      const active = isLspActive(rec.name, s.name)
      // For inactive servers, surface *why*: a missing command is the only
      // reason registration fails that the UI can help the user resolve
      // (install the binary, then hit Update). Other reasons (missing
      // extensionToLanguage) are manifest bugs and don't need this hint.
      const missingCommand = !active && !!s.command && !resolveCommandPath(s.command)
      return { ...s, active, missingCommand }
    })
    // Author: the state record is written at install time, so installs made
    // before the marketplace reader learned to merge a plugin's own manifest
    // carry `author: null` forever. Fall back to the installed copy's manifest,
    // then to the live marketplace row, so those records self-heal on read.
    const marketRow = findMarketRowSync(rec.sourceId, rec.name)
    // The browse list and the connector rows render the same plugin through the
    // same icon component, so they must be handed the same identity fields the
    // detail page merges in. Without these a plugin whose manifest declares no
    // icon falls back to "author name as a GitHub handle" and shows a stranger's
    // avatar while its own page shows the real logo.
    const identity = installedPluginIconIdentity(rec, installed ? target : undefined, targetManifest, marketRow)
    const detail = installed ? {
      icons: identity.icons,
      skills: listSkills(target, targetManifest),
      agents: listAgents(target, targetManifest),
      prompts: listPrompts(target, targetManifest),
      connectors,
      hooks: listHooks(target, targetManifest),
      lspServers,
      version: targetManifest?.version ?? null,
    } : { skills: [], agents: [], prompts: [], connectors: [], hooks: [], lspServers: [], version: null }
    return {
      ...rec,
      ...detail,
      description: rec.description || targetManifest?.description || marketRow?.description || '',
      author: identity.author,
      // Identity fields the icon chain reads. The detail page already merges
      // these from the marketplace row before rendering, which is why the same
      // plugin showed one icon inline and another on its own page.
      homepage: identity.homepage,
      source: identity.source,
      skillCount: detail.skills.length,
      agentCount: detail.agents.length,
      promptCount: detail.prompts.length,
      connectorCount: connectors.length,
      hookCount: detail.hooks.length,
      lspServerCount: lspServers.length,
      dir: target,
    }
  })
}
