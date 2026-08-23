/**
 * Install / uninstall / toggle / update lifecycle for plugins.
 *
 * On install the plugin directory is copied into the hub's own
 * `installed/` tree and its `skills/` directory is registered in the
 * dsh-agent-skills scan state (`$DSH_HOME/agent-skills/state.json`), so the
 * next DSH restart (or registry re-scan) exposes the plugin's skills to
 * agents.
 */
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, renameSync, readdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import * as yaml from 'js-yaml'
import { installedDir, readState, writeState, slugify, dshHome } from './store.js'
import { materializePlugin, pullSource } from './market.js'
import { copyDir, listSkills, listAgents, listPrompts, listConnectors, listHooks, readPluginManifest, invalidateParserCaches } from './parser.js'
import { parseAgentDefinition, compileSubagentsHubSkill, cleanupLegacyPresets } from './agents-map.js'

/** cordis.patch.yml path (prefers profiles/web/cordis.patch.yml). */
export function cordisPatchPath() {
  const profilePatch = join(dshHome(), 'profiles', 'web', 'cordis.patch.yml')
  if (existsSync(profilePatch)) return profilePatch
  const homePatch = join(dshHome(), 'cordis.patch.yml')
  if (existsSync(homePatch)) return homePatch
  return profilePatch
}

export function readCordisPatch() {
  const file = cordisPatchPath()
  if (!existsSync(file)) return []
  try {
    const parsed = yaml.load(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeCordisPatch(patch) {
  const file = cordisPatchPath()
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
  const isHttp = (cfg.type === 'http' || cfg.type === 'sse' || (!cfg.command && (!!cfg.url || !cfg.args?.length)))
  
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
  const entry = getConnectorEntry(pluginName, connectorName)
  const cfg = entry?.config || found || {}

  const isHttp = (entry?.config?.transport === 'streamable-http' || found?.type === 'http' || found?.type === 'sse' || (!found?.command && (found?.url || cfg.url)) || (!found?.command && !found?.args?.length))
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

export function isConnectorActive(pluginName, connectorName) {
  const entry = getConnectorEntry(pluginName, connectorName)
  if (!entry) return false
  return isConnectorAuthenticated(pluginName, connectorName)
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

  const isHttp = resolvedConfig.type === 'http' || resolvedConfig.type === 'sse' || (!resolvedConfig.command && (!!resolvedConfig.url || !resolvedConfig.args?.length))
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

export function unregisterConnector(pluginName, connectorName) {
  const patch = readCordisPatch()
  const id = getConnectorId(pluginName, connectorName)

  for (const item of patch) {
    if (item && Array.isArray(item.insert)) {
      item.insert = item.insert.filter((entry) => entry && entry.id !== id)
    }
  }

  const cleaned = patch.filter((item) => !item || !Array.isArray(item.insert) || item.insert.length > 0)
  writeCordisPatch(cleaned)
  return { ok: true, connected: false }
}

export function toggleConnector(pluginName, connectorName, enabled) {
  const target = installedDir(pluginName)
  const connectors = getPluginConnectors(target)
  const found = connectors.find((c) => c.name === connectorName) || { name: connectorName }

  if (enabled) {
    if (connectorRequiresAuth(found) && !isConnectorAuthenticated(pluginName, connectorName)) {
      throw new Error(`请先验证并配置 ${connectorName} 的授权访问 Token`)
    }
    return registerConnector(pluginName, connectorName, found)
  } else {
    return unregisterConnector(pluginName, connectorName)
  }
}

export async function verifyConnectorAuth(pluginName, connectorName, payload) {
  const target = installedDir(pluginName)
  const connectors = getPluginConnectors(target)
  const found = connectors.find((c) => c.name === connectorName)

  const token = typeof payload === 'string' ? payload : (payload?.token || '')
  const customHeaders = (typeof payload === 'object' && payload?.headers) ? { ...payload.headers } : {}
  const transport = (typeof payload === 'object' && payload?.transport) ? payload.transport : (found?.type || 'http')
  const url = (typeof payload === 'object' && payload?.url) || found?.url || (connectorName === 'notion' ? 'https://mcp.notion.com/mcp' : null)

  if (transport === 'stdio') {
    if (found && found.url && !found.command) {
      return {
        ok: false,
        status: 400,
        message: `${connectorName} 仅支持远程 HTTP 连接，未提供本地可执行程序`,
        server: connectorName,
        transport: 'stdio',
        endpoint: 'local stdio',
        errorDetails: 'Remote-only MCP server does not support stdio transport',
        duration: 5,
      }
    }
    if (!found?.command) {
      return {
        ok: false,
        status: 400,
        message: '未配置有效的 stdio 启动命令 (command)',
        server: connectorName,
        transport: 'stdio',
        endpoint: 'local stdio',
        errorDetails: 'Missing executable command in connector configuration',
        duration: 5,
      }
    }
    return {
      ok: true,
      message: '本地 Connector (stdio) 服务已就绪',
      server: connectorName,
      transport: 'stdio',
      endpoint: `${found.command} ${(found.args || []).join(' ')}`.trim(),
      duration: 10,
    }
  }
  if (!url) {
    return {
      ok: false,
      message: '请输入有效的服务 URL',
      server: connectorName,
      transport,
      endpoint: '',
    }
  }

  const reqHeaders = {
    'Content-Type': 'application/json',
    ...customHeaders,
  }
  if (token && token.trim()) {
    if (!reqHeaders.Authorization && !reqHeaders.authorization) {
      reqHeaders['Authorization'] = token.trim().startsWith('Bearer ') ? token.trim() : `Bearer ${token.trim()}`
    }
  }

  const startTime = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }).finally(() => clearTimeout(timer))

    const duration = Date.now() - startTime
    if (res.status === 200) {
      return {
        ok: true,
        message: '验证成功！已连接到 MCP 远程服务并激活权限。',
        server: connectorName,
        transport: transport === 'sse' ? 'sse' : 'http',
        endpoint: url,
        status: 200,
        duration,
      }
    } else {
      const body = await res.json().catch(() => ({}))
      const desc = body.error_description || body.error?.message || body.error || `HTTP 错误状态码 ${res.status}`
      const authHeader = res.headers.get('www-authenticate') || ''
      let userFriendly = `认证未通过：${desc}`
      if ((res.status === 401 || res.status === 403) && !reqHeaders.Authorization && !/[?&](api_key|apiKey|token|key)=/i.test(url)) {
        if (authHeader.includes('Bearer') || authHeader.includes('oauth') || /token|oauth|unauthorized|access token/i.test(String(desc))) {
          userFriendly = `认证未通过：缺少访问令牌 (Access Token) 或需要 OAuth 授权`
        }
      }
      return {
        ok: false,
        message: userFriendly,
        server: connectorName,
        transport: transport === 'sse' ? 'sse' : 'http',
        endpoint: url,
        status: res.status,
        errorDetails: String(desc),
        duration,
      }
    }
  } catch (e) {
    const duration = Date.now() - startTime
    if (e.name === 'AbortError') {
      return {
        ok: false,
        message: '连接超时（8 秒未响应），请检查服务 URL 与网络',
        server: connectorName,
        transport,
        endpoint: url,
        errorDetails: 'Connection timed out (8s limit)',
        duration,
      }
    }
    return {
      ok: false,
      message: `连接异常：${e.message}`,
      server: connectorName,
      transport,
      endpoint: url,
      errorDetails: e.message,
      duration,
    }
  }
}

export function saveConnectorAuth(pluginName, connectorName, payload) {
  const target = installedDir(pluginName)
  const connectors = getPluginConnectors(target)
  const found = connectors.find((c) => c.name === connectorName) || { name: connectorName }

  let token = typeof payload === 'string' ? payload : (payload?.token || '')
  let url = (typeof payload === 'object' && payload?.url) || found.url || null
  let transport = (typeof payload === 'object' && payload?.transport) || found.type || (url ? 'http' : 'stdio')
  let customHeaders = typeof payload === 'object' && payload?.headers ? { ...payload.headers } : {}
  let customEnv = typeof payload === 'object' && payload?.env ? { ...payload.env } : { ...(found.env || {}) }
  let customArgs = typeof payload === 'object' && Array.isArray(payload?.args) ? payload.args : (found.args || [])
  let oauth = typeof payload === 'object' && payload?.oauth ? payload.oauth : 'none'

  if (token && token.trim()) {
    const authVal = token.trim().startsWith('Bearer ') ? token.trim() : `Bearer ${token.trim()}`
    customHeaders['Authorization'] = authVal
  }

  const baseHeaders = { ...(found.headers || {}) }
  for (const [k, v] of Object.entries(baseHeaders)) {
    if (typeof v === 'string' && v.includes('${')) delete baseHeaders[k]
  }

  const baseEnv = { ...(found.env || {}) }
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === 'string' && v.includes('${')) delete baseEnv[k]
  }

  const isStdio = (transport === 'stdio')
  registerConnector(pluginName, connectorName, {
    ...found,
    type: isStdio ? 'stdio' : (transport === 'sse' ? 'sse' : 'http'),
    url: isStdio ? null : (url || found.url || null),
    command: found.command || null,
    args: customArgs,
    env: { ...baseEnv, ...customEnv },
    headers: { ...baseHeaders, ...customHeaders },
    oauth: isStdio ? 'none' : oauth,
  })
  return { ok: true }
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

export function writeMcpToolsState(state) {
  try {
    const file = MCP_TOOLS_STATE_PATH()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch {}
}

export function getDisabledTools(pluginName, connectorName) {
  const state = readMcpToolsState()
  const key = `${pluginName}::${connectorName}`
  return Array.isArray(state[key]?.disabledTools) ? state[key].disabledTools : []
}

export function setToolDisabled(pluginName, connectorName, toolName, disabled) {
  const state = readMcpToolsState()
  const key = `${pluginName}::${connectorName}`
  if (!state[key]) state[key] = { disabledTools: [], cachedTools: [] }
  const list = new Set(Array.isArray(state[key].disabledTools) ? state[key].disabledTools : [])
  if (disabled) {
    list.add(toolName)
  } else {
    list.delete(toolName)
  }
  state[key].disabledTools = Array.from(list)
  writeMcpToolsState(state)

  // Immediately synchronize in-memory cache
  if (MEMORY_TOOLS_CACHE.has(key)) {
    const mem = MEMORY_TOOLS_CACHE.get(key)
    MEMORY_TOOLS_CACHE.set(key, { ...mem, disabledTools: state[key].disabledTools })
  } else {
    MEMORY_TOOLS_CACHE.set(key, { tools: state[key].cachedTools || [], disabledTools: state[key].disabledTools })
  }

  return state[key].disabledTools
}

function queryStdioToolsList(cmd, args, extraEnv = {}) {
  return new Promise((resolve) => {
    let cp
    try {
      cp = spawn(cmd, args, {
        shell: true,
        env: { ...process.env, ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      return resolve([])
    }

    let output = ''
    let resolved = false

    const cleanup = () => {
      if (!resolved) {
        resolved = true
        try {
          cp.kill()
        } catch {}
      }
    }

    cp.stdout.on('data', (d) => {
      output += d.toString()
      const lines = output.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line.trim())
          if (json.id === 1 && Array.isArray(json.result?.tools)) {
            resolved = true
            cleanup()
            return resolve(json.result.tools)
          }
        } catch {}
      }
    })

    const initReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'claude-market', version: '1.0' } }
    }) + '\n'

    const toolsReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }) + '\n'

    try {
      cp.stdin.write(initReq)
      setTimeout(() => {
        if (!resolved) {
          try {
            cp.stdin.write(toolsReq)
          } catch {}
        }
      }, 300)
    } catch {}

    setTimeout(() => {
      if (!resolved) {
        cleanup()
        resolve([])
      }
    }, 25000)
  })
}

const MEMORY_TOOLS_CACHE = new Map()

export async function fetchConnectorTools(pluginName, connectorName, forceFresh = false) {
  const key = `${pluginName}::${connectorName}`
  const state = readMcpToolsState()
  const disabledTools = Array.isArray(state[key]?.disabledTools) ? state[key].disabledTools : []

  if (!forceFresh && MEMORY_TOOLS_CACHE.has(key)) {
    const mem = MEMORY_TOOLS_CACHE.get(key)
    return { ok: true, tools: mem.tools || [], disabledTools }
  }

  const target = installedDir(pluginName)
  const connectors = existsSync(target) ? getPluginConnectors(target) : []
  const found = connectors.find((c) => c.name === connectorName)
  const entry = getConnectorEntry(pluginName, connectorName)
  const entryCfg = entry?.config || {}

  const cached = state[key]?.cachedTools || []

  // If cached tools exist, cache in memory and return immediately (0ms instant response)
  if (!forceFresh && cached.length > 0) {
    MEMORY_TOOLS_CACHE.set(key, { tools: cached, disabledTools })
    return { ok: true, tools: cached, disabledTools }
  }

  const transport = entryCfg.transport === 'stdio' ? 'stdio' : (found?.type === 'stdio' ? 'stdio' : 'http')
  const url = entryCfg.url || found?.url
  const headers = entryCfg.headers || found?.headers || {}

  // 1. HTTP / SSE fetch
  if (transport !== 'stdio' && url) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }).finally(() => clearTimeout(timer))

      if (res.status === 200) {
        const text = await res.text()
        let tools = []
        try {
          const data = JSON.parse(text)
          if (Array.isArray(data.result?.tools)) tools = data.result.tools
        } catch {
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5).trim())
                if (Array.isArray(data.result?.tools)) {
                  tools = data.result.tools
                  break
                }
              } catch {}
            }
          }
        }

        if (tools.length > 0) {
          if (!state[key]) state[key] = { disabledTools, cachedTools: [] }
          state[key].cachedTools = tools
          writeMcpToolsState(state)
          return { ok: true, tools, disabledTools }
        }
      }
    } catch {}
  }

  // 2. Stdio fetch
  if (transport === 'stdio') {
    const cmd = entryCfg.command || found?.command
    const args = entryCfg.args || found?.args || []
    if (cmd) {
      try {
        const tools = await queryStdioToolsList(cmd, args, entryCfg.env || found?.env || {})
        if (tools.length > 0) {
          if (!state[key]) state[key] = { disabledTools, cachedTools: [] }
          state[key].cachedTools = tools
          writeMcpToolsState(state)
          return { ok: true, tools, disabledTools }
        }
      } catch {}
    }
  }

  // 3. Return cached fallback
  if (cached.length > 0) {
    return { ok: true, tools: cached, disabledTools }
  }

  return { ok: true, tools: [], disabledTools }
}

/** dsh-agent-skills scan state path + shape (version 1). */
function agentSkillsStatePath() {
  return join(dshHome(), 'agent-skills', 'state.json')
}

function readAgentSkillsState() {
  try {
    const parsed = JSON.parse(readFileSync(agentSkillsStatePath(), 'utf8'))
    if (parsed && parsed.version === 1 && Array.isArray(parsed.dirs)) return parsed
  } catch { /* fall through */ }
  return { version: 1, dirs: [], disabledSkills: [], disabledDirs: [] }
}

function writeAgentSkillsState(state) {
  const path = agentSkillsStatePath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.state.${process.pid}.${Date.now().toString(36)}.tmp`)
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmp, path)
}

function normalizePathForCompare(p) {
  return p ? p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '') : ''
}

/** Register a scan dir (absolute path) as enabled; dedupe by resolved path. */
function registerScanDir(path, skillNames = []) {
  const state = readAgentSkillsState()
  const resolved = normalizePathForCompare(path)
  const existing = state.dirs.find((d) => normalizePathForCompare(d.path) === resolved)
  if (existing) {
    existing.enabled = true
  } else {
    state.dirs.push({ path, enabled: true })
  }
  if (Array.isArray(state.disabledSkills) && skillNames.length > 0) {
    const toEnable = new Set(skillNames.map((s) => String(s).toLowerCase()))
    state.disabledSkills = state.disabledSkills.filter((s) => !toEnable.has(String(s).toLowerCase()))
  }
  writeAgentSkillsState(state)
}

/** Disable a scan dir (keeps the entry, flips enabled). */
function disableScanDir(path) {
  const state = readAgentSkillsState()
  const resolved = normalizePathForCompare(path)
  const entry = state.dirs.find((d) => normalizePathForCompare(d.path) === resolved)
  if (entry) entry.enabled = false
  writeAgentSkillsState(state)
}

/** Remove a scan dir entry entirely. */
function unregisterScanDir(path) {
  const state = readAgentSkillsState()
  const resolved = normalizePathForCompare(path)
  state.dirs = state.dirs.filter((d) => normalizePathForCompare(d.path) !== resolved)
  writeAgentSkillsState(state)
}

export function isScanDirRegistered(path) {
  const state = readAgentSkillsState()
  const resolved = normalizePathForCompare(path)
  const entry = state.dirs.find((d) => normalizePathForCompare(d.path) === resolved)
  return entry?.enabled !== false
}

function ensureSkillFrontmatter(content, skillName) {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3)
    if (end > 0) {
      const yaml = content.slice(3, end)
      if (!/^\s*name\s*:/m.test(yaml)) {
        return `---\nname: ${skillName}\n${yaml.trim()}\n---` + content.slice(end + 3)
      }
      return content
    }
  }
  return `---\nname: ${skillName}\ndescription: ${skillName}\n---\n\n` + content
}

/**
 * Install a plugin from the marketplace into the installed tree.
 * Returns a result summary for the UI.
 */
export async function installPlugin({ sourceId, pluginName, convertAgents = true }) {
  const state = readState()
  const source = state.sources.find((s) => s.id === sourceId)
  if (!source) throw new Error(`unknown source: ${sourceId}`)

  const row = await findMarketRow(sourceId, pluginName)
  if (!row) throw new Error(`plugin not found in marketplace: ${pluginName}`)

  const { dir } = await materializePlugin(sourceId, pluginName, row.source)
  const target = installedDir(pluginName)

  // Idempotent reinstall: clear the previous copy first.
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  copyDir(dir, target)

  // Ensure skills/ directory exists
  const skillsDir = join(target, 'skills')
  mkdirSync(skillsDir, { recursive: true })

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
  const rootSkillMd = join(target, 'SKILL.md')
  if (existsSync(rootSkillMd)) {
    const rootSkillDir = join(skillsDir, pluginName)
    if (!existsSync(rootSkillDir)) {
      mkdirSync(rootSkillDir, { recursive: true })
      const rawContent = readFileSync(rootSkillMd, 'utf8')
      const formatted = ensureSkillFrontmatter(rawContent, pluginName)
      writeFileSync(join(rootSkillDir, 'SKILL.md'), formatted, 'utf8')
    }
  }

  // 2.5. If the plugin repository has skill directories directly under root, mirror into skills/
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

  // Register the skills directory for scanning (now includes all skills + subagent delegates).
  if (existsSync(skillsDir)) {
    registerScanDir(skillsDir, skills.map((s) => s.command || s.name || pluginName))
  }

  // Auto-register and connect any MCP connectors defined in the plugin that do NOT require auth and have valid URLs/commands.
  const pluginConnectors = getPluginConnectors(target)
  for (const c of pluginConnectors) {
    if (!connectorRequiresAuth(c)) {
      const isHttp = (c.type === 'http' || c.type === 'sse' || (!c.command && (!!c.url || !c.args?.length)))
      if (isHttp && (!c.url || !c.url.trim() || !/^https?:\/\//i.test(c.url.trim()))) {
        continue
      }
      registerConnector(pluginName, c.name, c)
    }
  }

  const record = {
    id: `${sourceId}/${pluginName}`,
    sourceId,
    name: pluginName,
    displayName: row.displayName || pluginName,
    description: row.description || '',
    author: row.author ?? null,
    enabled: true,
    installedAt: Date.now(),
    convertAgents: false,
    skillCount: skills.length,
    agentCount: agents.length,
    promptCount: prompts.length,
    connectorCount: connectors.length,
    hookCount: hooks.length,
    version: readInstalledVersion(target) ?? row.version ?? null,
  }
  const existing = state.plugins.findIndex((p) => p.name === pluginName && p.sourceId === sourceId)
  if (existing >= 0) state.plugins.splice(existing, 1)
  state.plugins.push(record)
  writeState(state)
  invalidateParserCaches()

  // Proactively warm up and cache tools for local stdio/npx MCP servers in the background
  for (const c of pluginConnectors) {
    if (c.command === 'npx' || (c.args && c.args.some((a) => typeof a === 'string' && a.includes('@')))) {
      setTimeout(() => {
        fetchConnectorTools(pluginName, c.name, true).catch(() => {});
      }, 500);
    }
  }

  return {
    ok: true,
    plugin: record,
    skills: skills.map((s) => s.command),
    subagents: validAgents,
    converted: validAgents,
    subagentsHub,
    connectors: connectors.map((c) => c.name),
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
export function uninstallPlugin(pluginName) {
  const state = readState()
  const target = installedDir(pluginName)
  if (existsSync(target)) {
    const pluginConnectors = getPluginConnectors(target)
    for (const c of pluginConnectors) {
      unregisterConnector(pluginName, c.name)
    }
  }
  if (existsSync(join(target, 'skills'))) unregisterScanDir(join(target, 'skills'))
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  
  // Clean any legacy preset directories left by prior versions
  cleanupLegacyPresets(pluginName)

  // Clean MCP tools state and memory cache for this plugin
  const mcpToolsState = readMcpToolsState()
  let mcpToolsStateChanged = false
  for (const k of Object.keys(mcpToolsState)) {
    if (k.startsWith(`${pluginName}::`)) {
      delete mcpToolsState[k]
      mcpToolsStateChanged = true
      MEMORY_TOOLS_CACHE.delete(k)
    }
  }
  if (mcpToolsStateChanged) {
    writeMcpToolsState(mcpToolsState)
  }

  state.plugins = state.plugins.filter((p) => p.name !== pluginName)
  writeState(state)
  invalidateParserCaches()
  return { ok: true }
}

/** Toggle a plugin's skills scanning and connectors on/off. */
export function togglePlugin(pluginName, enabled) {
  const state = readState()
  const rec = state.plugins.find((p) => p.name === pluginName)
  if (!rec) throw new Error(`plugin not installed: ${pluginName}`)
  const target = installedDir(pluginName)
  const skillsDir = join(target, 'skills')
  const skills = listSkills(target)
  const skillNames = skills.map((s) => s.command || s.name || pluginName)
  const pluginConnectors = getPluginConnectors(target)

  if (enabled) {
    if (existsSync(skillsDir)) registerScanDir(skillsDir, skillNames)
    for (const c of pluginConnectors) {
      registerConnector(pluginName, c.name, c)
    }
  } else {
    if (existsSync(skillsDir)) disableScanDir(skillsDir)
    for (const c of pluginConnectors) {
      unregisterConnector(pluginName, c.name)
    }
  }
  rec.enabled = enabled
  writeState(state)
  return { ok: true, enabled }
}

/**
 * Update: pull the source (for local sources) or re-clone the remote, then
 * reinstall the plugin copy and re-run conversions.
 */
export async function updatePlugin(pluginName) {
  const state = readState()
  const rec = state.plugins.find((p) => p.name === pluginName)
  if (!rec) throw new Error(`plugin not installed: ${pluginName}`)
  const source = state.sources.find((s) => s.id === rec.sourceId)
  if (source && typeof source.url === 'string') {
    const cacheDir = join(dshHome(), 'agent-skills', 'claude-plugin-market', 'market', rec.sourceId)
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

  // Freshly materialized install (re-copies, re-registers, re-converts).
  return installPlugin({ sourceId: rec.sourceId, pluginName, convertAgents: rec.convertAgents })
}

/** Find one marketplace row by name. */
export async function findMarketRow(sourceId, pluginName) {
  const { readMarketplace } = await import('./parser.js')
  const rows = readMarketplace(sourceId)
  return rows.find((r) => r.name === pluginName) ?? null
}

/** Re-exported for routes: list installed plugins with details. */
export function installedDetails() {
  const state = readState()
  return state.plugins.map((rec) => {
    const target = installedDir(rec.name)
    if (existsSync(target)) {
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
    const connectors = existsSync(target) ? getPluginConnectors(target).map((c) => {
      const needsAuth = connectorRequiresAuth(c)
      const authenticated = isConnectorAuthenticated(rec.name, c.name)
      const connected = isConnectorActive(rec.name, c.name)
      const savedEntry = getConnectorEntry(rec.name, c.name)
      const savedConfig = savedEntry?.config || {}
      const savedHeaders = (savedConfig.headers && Object.keys(savedConfig.headers).length > 0) ? savedConfig.headers : c.headers
      const savedEnv = (savedConfig.env && Object.keys(savedConfig.env).length > 0) ? savedConfig.env : c.env
      const savedUrl = savedConfig.url || c.url
      const savedArgs = (savedConfig.args && savedConfig.args.length > 0) ? savedConfig.args : c.args
      const savedTransport = savedConfig.transport ? (savedConfig.transport === 'streamable-http' ? 'http' : (savedConfig.transport === 'stdio' ? 'stdio' : c.type)) : c.type

      return {
        ...c,
        type: savedTransport,
        url: savedUrl,
        headers: savedHeaders,
        env: savedEnv,
        args: savedArgs,
        oauth: savedConfig.oauth || c.oauth || 'none',
        needsAuth,
        authenticated,
        connected,
      }
    }) : []
    const detail = existsSync(target) ? {
      skills: listSkills(target),
      agents: listAgents(target),
      prompts: listPrompts(target),
      connectors,
      hooks: listHooks(target),
      version: readInstalledVersion(target) ?? null,
    } : { skills: [], agents: [], prompts: [], connectors: [], hooks: [], version: null }
    return {
      ...rec,
      ...detail,
      skillCount: detail.skills.length,
      agentCount: detail.agents.length,
      promptCount: detail.prompts.length,
      connectorCount: connectors.length,
      hookCount: detail.hooks.length,
      dir: target,
    }
  })
}
