import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer as createNetServer } from 'node:net'
import { once } from 'node:events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { encodeOAuthConfig, oauthCredentialKey, oauthRuntimeConfig, remoteConfigFromEntry } from '../src/oauth-config.js'
import { readOAuthRecord, saveOAuthClientCredentials, oauthCredentialPath } from '../src/oauth-store.js'
import { beginOAuthVerification, completeOAuthVerification, getOAuthVerification, cancelOAuthVerification } from '../src/oauth.js'

const root = mkdtempSync(join(tmpdir(), 'hub-oauth-flow-'))
const credentialRoot = join(root, 'credentials')
process.env.UPH_OAUTH_STORE_DIR = credentialRoot
process.env.DSH_HOME = join(root, 'dsh')
const { installedDir, writeState } = await import('../src/store.js')
const { saveConnectorAuth, isConnectorActive, toggleConnector, getConnectorEntry, readMcpToolsState, queryStdioToolsList, verifyConnectorAuth, installedDetails } = await import('../src/install.js')

async function body(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value))
}
async function startFixture() {
  const state = {
    clients: new Map(), codes: new Map(), tokens: new Map(), registration: null,
    authorization: null, tokenRequests: [], refreshes: 0, mcpCalls: 0, accepts: [],
  }
  const mcp = new Server({ name: 'oauth-test-mcp', version: '1.0.0' }, { capabilities: { tools: {} } })
  mcp.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [{ name: 'echo', description: 'Echo input', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }))
  mcp.setRequestHandler(CallToolRequestSchema, (request) => ({ content: [{ type: 'text', text: `echo:${request.params.arguments.text}` }] }))
  state.clients.set('different-client', { client_id: 'different-client', token_endpoint_auth_method: 'none', redirect_uris: [] })
  async function handleMcp(req, res, parsedBody) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const server = new Server({ name: 'oauth-test-mcp', version: '1.0.0' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [{ name: 'echo', description: 'Echo input', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }))
    server.setRequestHandler(CallToolRequestSchema, (request) => ({ content: [{ type: 'text', text: `echo:${request.params.arguments.text}` }] }))
    await server.connect(transport)
    res.on('close', () => { void server.close() })
    await transport.handleRequest(req, res, parsedBody)
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    try {
      if (url.pathname === '/.well-known/oauth-protected-resource') {
        return json(res, 200, { resource: `http://127.0.0.1:${server.address().port}/mcp`, authorization_servers: [`http://127.0.0.1:${server.address().port}`] })
      }
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        const issuer = `http://127.0.0.1:${server.address().port}`
        return json(res, 200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, registration_endpoint: `${issuer}/register`, code_challenge_methods_supported: ['S256'], grant_types_supported: ['authorization_code', 'refresh_token'], response_types_supported: ['code'], token_endpoint_auth_methods_supported: ['none', 'client_secret_post'] })
      }
      if (url.pathname === '/register' && req.method === 'POST') {
        const registration = JSON.parse(await body(req))
        state.registration = registration
        const client = { client_id: `dynamic-${randomUUID()}`, ...registration }
        state.clients.set(client.client_id, client)
        return json(res, 201, client)
      }
      if (url.pathname === '/authorize') {
        state.authorization = Object.fromEntries(url.searchParams)
        const code = randomUUID()
        state.codes.set(code, { clientId: url.searchParams.get('client_id'), challenge: url.searchParams.get('code_challenge'), redirect: url.searchParams.get('redirect_uri'), resource: url.searchParams.get('resource') })
        const target = new URL(url.searchParams.get('redirect_uri'))
        target.searchParams.set('code', code)
        target.searchParams.set('state', url.searchParams.get('state'))
        res.writeHead(302, { Location: target }).end()
        return
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const params = new URLSearchParams(await body(req))
        state.tokenRequests.push(params)
        if (params.get('grant_type') === 'authorization_code') {
          const grant = state.codes.get(params.get('code'))
          state.codes.delete(params.get('code'))
          const expected = createHash('sha256').update(params.get('code_verifier') || '').digest('base64url')
          if (!grant || grant.clientId !== params.get('client_id') || grant.challenge !== expected || grant.redirect !== params.get('redirect_uri') || grant.resource !== params.get('resource')) return json(res, 400, { error: 'invalid_grant' })
          const client = state.clients.get(params.get('client_id'))
          if (client?.client_secret && client.client_secret !== params.get('client_secret')) return json(res, 401, { error: 'invalid_client' })
        } else if (params.get('grant_type') === 'refresh_token') {
          state.refreshes += 1
          if (params.get('refresh_token') === 'expired-refresh') return json(res, 400, { error: 'invalid_grant' })
          if (!state.tokens.has(params.get('refresh_token'))) return json(res, 400, { error: 'invalid_grant' })
        } else return json(res, 400, { error: 'unsupported_grant_type' })
        const accessToken = `access-${state.refreshes}-${randomUUID()}`
        const refreshToken = `refresh-${state.refreshes}-${randomUUID()}`
        state.tokens.set(accessToken, true)
        state.tokens.set(refreshToken, true)
        return json(res, 200, { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 3600 })
      }
      if (url.pathname === '/mcp') {
        if (!state.tokens.has((req.headers.authorization || '').replace(/^Bearer /, ''))) {
          res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="http://127.0.0.1:${server.address().port}/.well-known/oauth-protected-resource"` }).end()
          return
        }
        state.mcpCalls += 1
        state.accepts.push(req.headers.accept)
        if (req.method === 'DELETE') { res.writeHead(200).end(); return }
        await handleMcp(req, res, req.method === 'POST' ? JSON.parse(await body(req)) : undefined)
        return
      }
      json(res, 404, { error: 'not_found' })
    } catch (error) {
      json(res, 500, { error: error.message })
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { state, server, url: `http://127.0.0.1:${server.address().port}/mcp`, close: async () => { await new Promise((resolve) => server.close(resolve)) } }
}
async function waitFor(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error('Timed out waiting for OAuth state')
}
function config(url, mode = 'auto_register', extra = {}) {
  return oauthRuntimeConfig({ url, oauth: { mode, ...extra }, credentialKey: oauthCredentialKey('test-plugin', 'remote', url, mode) })
}
async function bridgeClient(remote, extraEnv = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('../src/oauth-bridge.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], env: { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '', UPH_MCP_REMOTE_CONFIG: encodeOAuthConfig(remote), UPH_OAUTH_STORE_DIR: credentialRoot, ...extraEnv }, stderr: 'pipe' })
  const client = new Client({ name: 'oauth-test-client', version: '1.0.0' })
  let stderr = ''
  transport.stderr?.on('data', (chunk) => { stderr += chunk })
  try {
    await client.connect(transport)
    return { client, transport, getStderr: () => stderr }
  } catch (error) {
    await client.close().catch(() => {})
    throw new Error(`${error.message}; ${stderr.split('\n').slice(-2).join(' ')}`)
  }
}
async function approve(url, badState = false) {
  const response = await fetch(url, { redirect: 'manual' })
  const location = new URL(response.headers.get('location'))
  if (badState) location.searchParams.set('state', 'wrong-state')
  const callback = await fetch(location)
  return { callback, location }
}

test('OAuth bridge performs discovery, PKCE, real MCP calls and token rotation', { timeout: 60000 }, async (t) => {
  const fixture = await startFixture()
  t.after(() => fixture.close())
  const remote = config(fixture.url)
  const session = beginOAuthVerification('test-plugin', 'remote', { url: fixture.url, oauth: 'auto_register' }, { noBrowser: true, callbackTimeout: 10000 })
  const waiting = await waitFor(() => getOAuthVerification(session.id).authorizationUrl && getOAuthVerification(session.id))
  const first = await approve(waiting.authorizationUrl, true)
  assert.equal(first.callback.status, 400)
  const cancelled = await completeOAuthVerification(session)
  assert.equal(cancelled.ok, false)

  const retry = beginOAuthVerification('test-plugin', 'remote', { url: fixture.url, oauth: 'auto_register' }, { noBrowser: true, callbackTimeout: 10000 })
  const authorization = await waitFor(() => getOAuthVerification(retry.id).authorizationUrl)
  assert.equal((await approve(authorization)).callback.status, 200)
  const result = await completeOAuthVerification(retry)
  assert.equal(result.ok, true, result.message)
  assert.equal(result.tools[0].name, 'echo')
  assert.equal(fixture.state.registration.application_type, 'native')
  assert.equal(fixture.state.authorization.code_challenge_method, 'S256')
  assert.ok(fixture.state.authorization.state.length >= 32)
  assert.equal(fixture.state.authorization.resource, fixture.url)
  assert.ok(fixture.state.accepts.includes('application/json, text/event-stream'))
  assert.equal(getOAuthVerification(retry.id, { pluginName: 'another-plugin' }).found, false)

  const bridge = await bridgeClient(remote)
  const listed = await bridge.client.listTools()
  assert.equal(listed.tools[0].name, 'echo')
  assert.equal((await bridge.client.callTool({ name: 'echo', arguments: { text: 'working' } })).content[0].text, 'echo:working')
  const record = readOAuthRecord(remote.credentialKey)
  fixture.state.tokens.delete(record.tokens.access_token)
  assert.equal((await bridge.client.callTool({ name: 'echo', arguments: { text: 'refreshed' } })).content[0].text, 'echo:refreshed')
  assert.equal(fixture.state.refreshes, 1)
  const refreshed = readOAuthRecord(remote.credentialKey)
  assert.notEqual(refreshed.tokens.refresh_token, record.tokens.refresh_token)
  await bridge.client.close()

  const reopened = await bridgeClient(remote)
  assert.equal((await reopened.client.callTool({ name: 'echo', arguments: { text: 'restarted' } })).content[0].text, 'echo:restarted')
  assert.equal(fixture.state.refreshes, 1)
  await reopened.client.close()

  const reuse = beginOAuthVerification('test-plugin', 'remote', { url: fixture.url, oauth: 'auto_register' }, { noBrowser: true, callbackTimeout: 10000 })
  assert.equal((await completeOAuthVerification(reuse)).ok, true)
  assert.equal(getOAuthVerification(reuse.id).authorizationUrl, undefined)

  fixture.state.tokens.delete(readOAuthRecord(remote.credentialKey).tokens.access_token)
  fixture.state.tokens.delete(readOAuthRecord(remote.credentialKey).tokens.refresh_token)
  await assert.rejects(bridgeClient(remote), /授权已失效/)
  assert.equal(fixture.state.refreshes, 2)
  const recovered = beginOAuthVerification('test-plugin', 'remote', { url: fixture.url, oauth: 'auto_register' }, { noBrowser: true, callbackTimeout: 10000 })
  const recoveryUrl = await waitFor(() => getOAuthVerification(recovered.id).authorizationUrl)
  assert.equal((await approve(recoveryUrl)).callback.status, 200)
  assert.equal((await completeOAuthVerification(recovered)).ok, true)

  const timeoutSession = beginOAuthVerification('test-plugin', 'timeout', { url: fixture.url, oauth: 'auto_register' }, { noBrowser: true, callbackTimeout: 300 })
  const timeoutResult = await completeOAuthVerification(timeoutSession)
  assert.equal(timeoutResult.ok, false)
  assert.match(timeoutResult.message, /超时/)
  await waitFor(() => timeoutSession.child.exitCode !== null || timeoutSession.child.signalCode !== null)
})

test('custom clients, cancellation and configuration transitions stay isolated', { timeout: 30000 }, async (t) => {
  const fixture = await startFixture()
  t.after(() => fixture.close())
  const key = oauthCredentialKey('test-plugin', 'remote', fixture.url, 'custom')
  saveOAuthClientCredentials(key, { clientId: 'private-client', clientSecret: 'test-client-secret' })
  saveOAuthClientCredentials(key, { clientId: 'private-client' })
  assert.equal(readOAuthRecord(key).customClient.client_secret, 'test-client-secret')
  saveOAuthClientCredentials(key, { clientId: 'different-client' })
  assert.equal(readOAuthRecord(key).tokens, undefined)
  assert.equal(oauthCredentialPath(key).includes('test-client-secret'), false)
  assert.notEqual(key, oauthCredentialKey('test-plugin', 'remote', fixture.url, 'auto_register'))
  const stored = readFileSync(oauthCredentialPath(key), 'utf8')
  if (process.platform === 'win32') assert.equal(stored.includes('test-client-secret'), false)

  const session = beginOAuthVerification('test-plugin', 'remote', { url: fixture.url, oauth: 'custom', oauthClientId: 'different-client' }, { noBrowser: true, callbackTimeout: 10000 })
  const waitingUrl = await waitFor(() => {
    const status = getOAuthVerification(session.id)
    if (status.authorizationUrl) return status.authorizationUrl
    if (status.status === 'error') throw new Error(status.message)
  })
  assert.equal(cancelOAuthVerification(session.id), true)
  assert.equal((await completeOAuthVerification(session)).ok, false)
  const cancelledPort = new URL(new URL(waitingUrl).searchParams.get('redirect_uri')).port
  await assert.rejects(fetch(`http://127.0.0.1:${cancelledPort}/callback`))

  fixture.state.clients.set('private-client', { client_id: 'private-client', client_secret: 'test-client-secret', token_endpoint_auth_method: 'client_secret_post' })
  saveOAuthClientCredentials(key, { clientId: 'private-client', clientSecret: 'test-client-secret' })
  const portProbe = createNetServer()
  portProbe.listen(0, '127.0.0.1')
  await once(portProbe, 'listening')
  const callbackPort = portProbe.address().port
  await new Promise((resolve) => portProbe.close(resolve))
  const custom = beginOAuthVerification('test-plugin', 'remote', { url: fixture.url, oauth: 'custom', oauthClientId: 'private-client', oauthScope: 'tools.read tools.execute', oauthCallbackPort: callbackPort }, { noBrowser: true, callbackTimeout: 10000 })
  const customUrl = await waitFor(() => getOAuthVerification(custom.id).authorizationUrl)
  const parsed = new URL(customUrl)
  assert.equal(parsed.searchParams.get('client_id'), 'private-client')
  assert.equal(parsed.searchParams.get('scope'), 'tools.read tools.execute')
  assert.equal(new URL(parsed.searchParams.get('redirect_uri')).port, String(callbackPort))
  assert.equal((await approve(customUrl)).callback.status, 200)
  assert.equal((await completeOAuthVerification(custom)).ok, true)
  assert.equal(fixture.state.tokenRequests.at(-1).get('client_secret'), 'test-client-secret')

  writeFileSync(join(root, 'unused'), '')
  mkdirSync(installedDir('test-plugin'), { recursive: true })
  writeFileSync(join(installedDir('test-plugin'), '.mcp.json'), JSON.stringify({ mcpServers: { remote: { type: 'http', url: fixture.url } } }))
  writeState({ sources: [], plugins: [{ name: 'test-plugin', sourceId: 'local' }] })
  const payload = { transport: 'http', url: fixture.url, oauth: 'auto_register' }
  process.env.UPH_MCP_NO_BROWSER = '1'
  const initial = beginOAuthVerification('test-plugin', 'remote', payload, { noBrowser: true, callbackTimeout: 10000 })
  const initialUrl = await waitFor(() => getOAuthVerification(initial.id).authorizationUrl)
  assert.equal((await approve(initialUrl)).callback.status, 200)
  assert.equal((await completeOAuthVerification(initial)).ok, true)
  const verified = await verifyConnectorAuth('test-plugin', 'remote', payload)
  const verifiedResult = verified.pending ? await waitFor(() => {
    const status = getOAuthVerification(verified.sessionId)
    return status.pending ? null : status
  }) : verified
  assert.equal(verifiedResult.ok, true, verifiedResult.message)
  saveConnectorAuth('test-plugin', 'remote', payload)
  assert.equal(isConnectorActive('test-plugin', 'remote'), true)
  const bridgeEntry = getConnectorEntry('test-plugin', 'remote')
  assert.ok(remoteConfigFromEntry(bridgeEntry.config))
  assert.equal(toggleConnector('test-plugin', 'remote', false).ok, true)
  assert.ok(readMcpToolsState()['test-plugin::remote'].savedOAuthRemoteConfig)
  assert.equal(toggleConnector('test-plugin', 'remote', true).ok, true)
  assert.ok(remoteConfigFromEntry(getConnectorEntry('test-plugin', 'remote').config))
  saveConnectorAuth('test-plugin', 'remote', { ...payload, oauth: 'none' })
  assert.equal(remoteConfigFromEntry(getConnectorEntry('test-plugin', 'remote').config), null)
  assert.equal(isConnectorActive('test-plugin', 'remote'), false)
  toggleConnector('test-plugin', 'remote', false)
  toggleConnector('test-plugin', 'remote', true)
  assert.equal(remoteConfigFromEntry(getConnectorEntry('test-plugin', 'remote').config), null)
  for (const file of readdirSync(credentialRoot)) assert.equal(readFileSync(join(credentialRoot, file), 'utf8').includes('test-client-secret') && process.platform !== 'win32', false)
})

test('connector tool list and OAuth status routes always answer', async () => {
  const { mountRoutes } = await import('../src/routes.js')
  const server = createServer()
  let handler
  mountRoutes({ register: ({ handler: h }) => { handler = h; return () => {} } })
  server.on('request', (req, res) => handler(req, res))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/universal-plugin-hub/api`
  try {
    const tools = await fetch(`${base}/plugins/nonexistent/connectors/${encodeURIComponent('missing')}/tools`)
    assert.equal(tools.status, 200)
    assert.equal(typeof (await tools.json()).ok, 'boolean')
    const status = await fetch(`${base}/plugins/nonexistent/connectors/missing/oauth-status?sessionId=unknown`)
    assert.equal(status.status, 200)
    assert.equal((await status.json()).found, false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('ordinary stdio waits for initialize without duplicate tools/list requests', async () => {
  const log = join(root, 'slow-stdio.log')
  const result = await queryStdioToolsList(process.execPath, [new URL('./fixtures/slow-stdio-server.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { TEST_STDIO_LOG: log })
  assert.equal(result.error, null)
  assert.deepEqual(result.tools.map((tool) => tool.name), ['slow'])
  assert.equal(readFileSync(log, 'utf8'), '1 true\n')
})

test('manifest transports normalize and saved OAuth settings survive the detail route', { timeout: 30000 }, async (t) => {
  const { mountRoutes } = await import('../src/routes.js')
  const { readState } = await import('../src/store.js')
  const target = installedDir('manifest-plugin')
  mkdirSync(join(target, '.claude-plugin'), { recursive: true })
  writeFileSync(join(target, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'manifest-plugin', version: '1.0.0' }))
  writeFileSync(join(target, '.mcp.json'), JSON.stringify({ mcpServers: {
    remote: { type: 'streamable-http', url: 'https://mcp.manifest.test/mcp', headers: { 'x-source': 'manifest' } },
    legacySse: { type: 'sse', url: 'https://mcp.manifest.test/sse' },
    local: { type: 'stdio', command: 'node' },
  } }))
  const state = readState()
  state.plugins = [...state.plugins.filter((p) => p.name !== 'manifest-plugin'), { name: 'manifest-plugin', sourceId: 'local' }]
  writeState(state)

  const connectors = installedDetails().find((p) => p.name === 'manifest-plugin').connectors
  const byName = Object.fromEntries(connectors.map((c) => [c.name, c]))
  // `streamable-http` and `sse` are both remote. Left as-is they fell through
  // the editor's two-mode check and rendered an empty stdio command form.
  assert.equal(byName.remote.type, 'http')
  assert.equal(byName.legacySse.type, 'http')
  assert.equal(byName.local.type, 'stdio')

  saveConnectorAuth('manifest-plugin', 'remote', {
    transport: 'http', url: 'https://mcp.manifest.test/mcp', headers: { 'x-source': 'manifest' },
    oauth: 'auto_register', oauthScope: 'tools.read',
  })

  const server = createServer()
  let handler
  mountRoutes({ register: ({ handler: registered }) => { handler = registered; return () => {} } })
  server.on('request', (req, res) => handler(req, res))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/universal-plugin-hub/api`

  // The marketplace copy of a plugin knows nothing about what the user saved.
  // Letting it win overwrote the OAuth mode, so the edit dialog reopened on
  // `None` immediately after a successful sign-in.
  const detail = await (await fetch(`${base}/plugins/local/manifest-plugin`)).json()
  const routed = Object.fromEntries((detail.plugin.detail.connectors || []).map((c) => [c.name, c]))
  assert.equal(routed.remote.oauth, 'auto_register')
  assert.equal(routed.remote.type, 'http')
  assert.equal(routed.remote.oauthScope, 'tools.read')
  assert.equal(routed.remote.url, 'https://mcp.manifest.test/mcp')
  assert.equal(routed.local.oauth, 'none')
})

test.after(() => rmSync(root, { recursive: true, force: true }))
