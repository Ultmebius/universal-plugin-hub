import { createHash } from 'node:crypto'

export function isOAuthMode(mode) {
  return mode === 'auto_register' || mode === 'custom'
}

export function oauthCredentialKey(pluginName, connectorName, serverUrl, mode = 'auto_register') {
  return createHash('sha256').update(`${pluginName}::${connectorName}\n${serverUrl}\n${isOAuthMode(mode) ? mode : 'auto_register'}`).digest('hex')
}

export function encodeOAuthConfig(config) {
  return Buffer.from(JSON.stringify(config), 'utf8').toString('base64url')
}

export function decodeOAuthConfig(encoded) {
  if (!encoded) return null
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    return parsed && isOAuthMode(parsed.oauth?.mode) && typeof parsed.url === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function oauthRuntimeConfig(config) {
  return {
    url: config.url,
    headers: Object.fromEntries(Object.entries(config.headers || {}).filter(([key]) => key.toLowerCase() !== 'authorization')),
    oauth: {
      mode: config.oauth.mode,
      clientId: config.oauth.clientId || '',
      callbackPort: config.oauth.callbackPort || null,
      scope: config.oauth.scope || '',
    },
    credentialKey: config.credentialKey,
  }
}

export function remoteConfigFromEntry(config = {}) {
  const remote = decodeOAuthConfig(config.env?.UPH_MCP_REMOTE_CONFIG)
  if (!remote) return null
  return {
    type: 'http', transport: 'http', url: remote.url, headers: remote.headers,
    oauth: remote.oauth.mode, oauthClientId: remote.oauth.clientId,
    oauthCallbackPort: remote.oauth.callbackPort, oauthScope: remote.oauth.scope,
    credentialKey: remote.credentialKey,
  }
}
