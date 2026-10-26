import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { encodeOAuthConfig, oauthCredentialKey, oauthRuntimeConfig, remoteConfigFromEntry } from './oauth-config.js'
import { readOAuthRecord, oauthStoreDir, saveOAuthClientCredentials } from './oauth-store.js'

const sessions = new Map()
const bridgePath = fileURLToPath(new URL('./oauth-bridge.js', import.meta.url))
const CALLBACK_TIMEOUT = 5 * 60 * 1000

function safeError(error) {
  const raw = String(error?.message || error || 'OAuth connection failed')
  const firstLine = raw.split('\n').find((line) => line.trim()) || raw
  return firstLine.replace(/(access_token|refresh_token|client_secret|code_verifier)[=:]\s*[^\s&]+/gi, '$1=[redacted]').slice(0, 700)
}

export function saveCustomOAuthClient(pluginName, connectorName, payload) {
  if (payload?.oauth !== 'custom' || !payload?.url) return
  if (!String(payload.oauthClientId || '').trim()) throw new Error('使用自有 OAuth 客户端时必须填写 Client ID')
  saveOAuthClientCredentials(oauthCredentialKey(pluginName, connectorName, payload.url, 'custom'), {
    clientId: payload.oauthClientId,
    clientSecret: payload.oauthClientSecret,
  })
}

export function connectorOauthSettings(pluginName, connectorName, payload) {
  return {
    mode: payload.oauth,
    clientId: payload.oauthClientId || '',
    callbackPort: Number(payload.oauthCallbackPort) || null,
    scope: payload.oauthScope || '',
  }
}

function publicSession(session) {
  return {
    found: true, ok: session.status === 'success', pending: session.status === 'waiting' || session.status === 'starting',
    sessionId: session.id, status: session.status, statusCode: session.statusCode,
    message: session.message, authorizationUrl: session.authorizationUrl,
    duration: session.duration, tools: session.tools,
  }
}

function finish(session, result) {
  if (session.done) return
  session.done = true
  clearTimeout(session.timeout)
  try { session.child?.stdin.end() } catch {}
  session.status = result.ok ? 'success' : 'error'
  session.statusCode = result.status
  session.message = result.message
  session.duration = result.duration
  session.tools = result.tools
  try { session.onFinished?.(result) } catch {}
  session.resolve(result)
  setTimeout(() => sessions.delete(session.id), 60000).unref?.()
}

function startProcess(session) {
  let stderrBuffer = ''
  const env = {
    ...process.env,
    UPH_MCP_REMOTE_CONFIG: encodeOAuthConfig(session.config),
    UPH_OAUTH_STORE_DIR: oauthStoreDir(),
    UPH_MCP_INTERACTIVE: '1',
    UPH_MCP_VERIFY: '1',
    ...(session.noBrowser ? { UPH_MCP_NO_BROWSER: '1' } : {}),
    ...(session.callbackTimeout ? { UPH_OAUTH_CALLBACK_TIMEOUT_MS: String(session.callbackTimeout) } : {}),
  }
  const child = spawn(process.execPath, [bridgePath], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  session.child = child
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    if (stdout.length > 4 * 1024 * 1024) session.child.kill()
  })
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-16000)
    stderrBuffer += chunk
    const lines = stderrBuffer.split('\n')
    stderrBuffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('UPH_OAUTH_EVENT ')) continue
      try {
        const event = JSON.parse(line.slice('UPH_OAUTH_EVENT '.length))
        if (session.done) return
        if (event.status === 'waiting') {
          session.status = 'waiting'
          session.authorizationUrl = event.authorizationUrl
          session.message = '请在浏览器中完成授权，完成后会在这里自动继续。'
        }
      } catch {}
    }
  })
  child.on('error', (error) => finish(session, { ok: false, message: safeError(error) }))
  child.on('close', (code) => {
    if (session.cancelled) return finish(session, { ok: false, message: '已取消授权' })
    try {
      const result = JSON.parse(stdout.trim())
      finish(session, result.ok ? result : { ...result, message: safeError(result.message) })
    } catch {
      const diagnostic = stderr.split('\n').filter((line) => line && !line.startsWith('UPH_OAUTH_EVENT ')).slice(-2).join(' ')
      finish(session, { ok: false, message: safeError(diagnostic || `OAuth bridge exited (${code})`) })
    }
  })
}

export function beginOAuthVerification(pluginName, connectorName, payload, options = {}) {
  const credentialKey = oauthCredentialKey(pluginName, connectorName, payload.url, payload.oauth)
  const config = oauthRuntimeConfig({
    url: payload.url, headers: payload.headers,
    oauth: connectorOauthSettings(pluginName, connectorName, payload), credentialKey,
  })
  const previous = [...sessions.values()].find((item) => item.credentialKey === credentialKey && !item.done)
  if (previous) cancelOAuthVerification(previous.id)
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  let resolve
  const completion = new Promise((r) => { resolve = r })
  const session = {
    id, pluginName, connectorName, credentialKey, config, status: 'starting', startedAt: Date.now(), resolve, completion,
    noBrowser: options.noBrowser || process.env.UPH_MCP_NO_BROWSER === '1', callbackTimeout: options.callbackTimeout, onFinished: options.onFinished,
    timeout: setTimeout(() => cancelOAuthVerification(id, '授权等待超时，请重新测试'), options.callbackTimeout || CALLBACK_TIMEOUT),
  }
  session.timeout.unref?.()
  sessions.set(id, session)
  startProcess(session)
  return session
}

export async function completeOAuthVerification(session) {
  const result = await session.completion
  return { ...result, sessionId: session.id }
}

export function getOAuthVerification(id, owner = {}) {
  const session = id ? sessions.get(id) : [...sessions.values()].find((item) => !item.done && (!owner.pluginName || item.pluginName === owner.pluginName) && (!owner.connectorName || item.connectorName === owner.connectorName))
  const found = !!session && (!owner.pluginName || session.pluginName === owner.pluginName) && (!owner.connectorName || session.connectorName === owner.connectorName)
  return found ? publicSession(session) : { found: false, ok: false, status: 'error', message: '授权会话已结束，请重新测试' }
}

export function cancelOAuthVerification(id, message = '已取消授权', owner = {}) {
  const session = id ? sessions.get(id) : [...sessions.values()].find((item) => !item.done && (!owner.pluginName || item.pluginName === owner.pluginName) && (!owner.connectorName || item.connectorName === owner.connectorName))
  if (!session || session.done) return false
  session.cancelled = true
  try { session.child?.kill() } catch {}
  finish(session, { ok: false, message })
  return true
}

export function cancelAllOAuthVerifications() {
  for (const session of sessions.values()) if (!session.done) cancelOAuthVerification(session.id)
}

export function oauthSessionStatusUrl(pluginName, connectorName, sessionId, userMcp = false) {
  return userMcp
    ? `/mcps/oauth-status?sessionId=${encodeURIComponent(sessionId)}`
    : `/plugins/${encodeURIComponent(pluginName)}/connectors/${encodeURIComponent(connectorName)}/oauth-status?sessionId=${encodeURIComponent(sessionId)}`
}

export function readSavedOAuthClient(pluginName, connectorName, serverUrl, mode = 'custom') {
  const record = readOAuthRecord(oauthCredentialKey(pluginName, connectorName, serverUrl, mode))
  return { clientId: record.customClient?.client_id || '', hasClientSecret: !!record.customClient?.client_secret }
}

export { remoteConfigFromEntry }
