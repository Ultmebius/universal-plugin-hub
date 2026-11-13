import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse } from 'acorn'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const root = mkdtempSync(join(tmpdir(), 'uph-mcp-toggle-perf-'))
const credentialRoot = join(root, 'oauth-creds')
const prevHome = process.env.DSH_HOME
const prevProfile = process.env.DSH_PROFILE
const prevOauthDir = process.env.UPH_OAUTH_STORE_DIR
process.env.DSH_HOME = join(root, 'dsh')
process.env.DSH_PROFILE = 'desktop'
process.env.UPH_OAUTH_STORE_DIR = credentialRoot

after(() => {
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome
  if (prevProfile === undefined) delete process.env.DSH_PROFILE
  else process.env.DSH_PROFILE = prevProfile
  if (prevOauthDir === undefined) delete process.env.UPH_OAUTH_STORE_DIR
  else process.env.UPH_OAUTH_STORE_DIR = prevOauthDir
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const store = await import('../src/store.js')
const install = await import('../src/install.js')
const oauthConfig = await import('../src/oauth-config.js')
const oauthStore = await import('../src/oauth-store.js')
const { mountRoutes } = await import('../src/routes.js')

const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const clientAst = parse(clientSource, { ecmaVersion: 'latest', sourceType: 'script' })

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value))
}

async function listenServer(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

async function startOAuthMcpFixture() {
  const state = {
    clients: new Map(),
    tokens: new Set(),
    refreshTokens: new Set(),
    refreshes: 0,
    initializeCalls: 0,
    listToolsCalls: 0,
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    try {
      const port = server.address().port
      const issuer = `http://127.0.0.1:${port}`
      if (url.pathname === '/.well-known/oauth-protected-resource') {
        return sendJson(res, 200, { resource: `${issuer}/mcp`, authorization_servers: [issuer] })
      }
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        return sendJson(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          registration_endpoint: `${issuer}/register`,
          code_challenge_methods_supported: ['S256'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          response_types_supported: ['code'],
          token_endpoint_auth_methods_supported: ['none'],
        })
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const params = new URLSearchParams(await readBody(req))
        if (params.get('grant_type') === 'refresh_token') {
          state.refreshes += 1
          const oldRefresh = params.get('refresh_token')
          if (!state.refreshTokens.has(oldRefresh)) {
            return sendJson(res, 400, { error: 'invalid_grant' })
          }
          state.refreshTokens.delete(oldRefresh)
          const accessToken = `access-${state.refreshes}-${randomUUID()}`
          const refreshToken = `refresh-${state.refreshes}-${randomUUID()}`
          state.tokens.add(accessToken)
          state.refreshTokens.add(refreshToken)
          return sendJson(res, 200, { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 3600 })
        }
        return sendJson(res, 400, { error: 'unsupported_grant_type' })
      }
      if (url.pathname === '/mcp') {
        const bearer = (req.headers.authorization || '').replace(/^Bearer /, '')
        if (!state.tokens.has(bearer)) {
          res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"` }).end()
          return
        }
        if (req.method === 'DELETE') {
          res.writeHead(200).end()
          return
        }
        const parsed = req.method === 'POST' ? JSON.parse(await readBody(req)) : undefined
        const messages = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : [])
        for (const msg of messages) {
          if (msg?.method === 'initialize') state.initializeCalls += 1
          if (msg?.method === 'tools/list') state.listToolsCalls += 1
        }
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        const mcp = new Server({ name: 'oauth-perf-mcp', version: '1.0.0' }, { capabilities: { tools: {} } })
        mcp.setRequestHandler(ListToolsRequestSchema, () => ({
          tools: [{ name: 'search_docs', description: 'Search docs', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }],
        }))
        await mcp.connect(transport)
        res.on('close', () => { void mcp.close() })
        await transport.handleRequest(req, res, parsed)
        return
      }
      sendJson(res, 404, { error: 'not_found' })
    } catch (err) {
      sendJson(res, 500, { error: err.message })
    }
  })
  const port = await listenServer(server)
  return {
    state,
    issuer: `http://127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}/mcp`,
    close: () => {
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}

async function startBearerMcpFixture() {
  const state = {
    expectedToken: 'valid-token',
    initializeCalls: 0,
    listToolsCalls: 0,
  }
  const server = createServer(async (req, res) => {
    if (req.url !== '/mcp') return sendJson(res, 404, { error: 'not_found' })
    if (req.headers.authorization !== `Bearer ${state.expectedToken}`) {
      res.writeHead(401).end('unauthorized')
      return
    }
    if (req.method === 'DELETE') {
      res.writeHead(200).end()
      return
    }
    const parsed = req.method === 'POST' ? JSON.parse(await readBody(req)) : undefined
    const messages = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : [])
    for (const msg of messages) {
      if (msg?.method === 'initialize') state.initializeCalls += 1
      if (msg?.method === 'tools/list') state.listToolsCalls += 1
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const mcp = new Server({ name: 'bearer-perf-mcp', version: '1.0.0' }, { capabilities: { tools: {} } })
    mcp.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [{ name: 'ping_tool', description: 'Ping', inputSchema: { type: 'object', properties: {} } }],
    }))
    await mcp.connect(transport)
    res.on('close', () => { void mcp.close() })
    await transport.handleRequest(req, res, parsed)
  })
  const port = await listenServer(server)
  return {
    state,
    url: `http://127.0.0.1:${port}/mcp`,
    close: () => {
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}

function writeCounterStdioServer(filePath) {
  write(filePath, `
import { appendFileSync } from 'node:fs'
import { Server } from ${JSON.stringify(new URL('../node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js', import.meta.url).href)}
import { StdioServerTransport } from ${JSON.stringify(new URL('../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js', import.meta.url).href)}
import { ListToolsRequestSchema } from ${JSON.stringify(new URL('../node_modules/@modelcontextprotocol/sdk/dist/esm/types.js', import.meta.url).href)}
if (process.env.TEST_SPAWN_LOG) appendFileSync(process.env.TEST_SPAWN_LOG, 'spawn\\n')
const delayMs = Number(process.env.TEST_DELAY_MS || '0')
if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
const server = new Server({ name: 'stdio-counter', version: '1.0.0' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [{ name: 'stdio_ping', description: 'Stdio ping', inputSchema: { type: 'object', properties: {} } }],
}))
await server.connect(new StdioServerTransport())
`)
}

function setupLocalSourcePlugin(sourceId, pluginName, { skills = [], connectors = null, lspServers = null } = {}) {
  const srcRoot = store.sourceCacheDir(sourceId)
  const pluginDir = join(srcRoot, 'plugins', pluginName)
  for (const skill of skills) {
    write(join(pluginDir, 'skills', skill, 'SKILL.md'), `---\nname: ${skill}\ndescription: test skill\n---\n# ${skill}\n`)
  }
  if (connectors) write(join(pluginDir, '.mcp.json'), { mcpServers: connectors })
  if (lspServers) write(join(pluginDir, '.lsp.json'), lspServers)
  write(join(pluginDir, '.claude-plugin', 'plugin.json'), { name: pluginName, version: '1.0.0', description: 'perf test plugin' })
  write(join(srcRoot, '.claude-plugin', 'marketplace.json'), {
    name: sourceId,
    plugins: [{ name: pluginName, source: `./plugins/${pluginName}`, version: '1.0.0' }],
  })
  const state = store.readState()
  if (!state.sources.some((s) => s.id === sourceId)) {
    store.writeState({ ...state, sources: [...state.sources, { id: sourceId, name: sourceId, url: srcRoot }] })
  }
  return { pluginDir }
}

function createApiHarness(applyProfile) {
  const srv = createServer()
  let handler
  mountRoutes({ register: ({ handler: h }) => { handler = h; return () => {} } }, null, applyProfile)
  srv.on('request', (req, res) => handler(req, res))
  return {
    srv,
    async start() {
      const port = await listenServer(srv)
      return `http://127.0.0.1:${port}/universal-plugin-hub/api`
    },
    close: () => {
      srv.closeAllConnections?.()
      return new Promise((resolve) => srv.close(resolve))
    },
  }
}

async function postJson(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function findAstNode(name) {
  let found = null
  function walk(node) {
    if (!node || typeof node !== 'object' || found) return
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) {
      found = node
      return
    }
    if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init) {
      found = node.init
      return
    }
    if (node.type === 'Property' && (node.key?.name === name || node.key?.value === name)) {
      found = node.value
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue
      const val = node[key]
      if (Array.isArray(val)) val.forEach(walk)
      else if (val && typeof val === 'object') walk(val)
    }
  }
  walk(clientAst)
  return found
}

test('oauth-bridge proxyCapabilities does not issue an eager tools/list request on connect', { timeout: 20000 }, async (t) => {
  const fixture = await startOAuthMcpFixture()
  t.after(() => fixture.close())

  const key = oauthConfig.oauthCredentialKey('bridge-perf', 'remote', fixture.url, 'auto_register')
  oauthStore.allowOAuthRecordWrites(key)
  fixture.state.tokens.add('bridge-access')
  fixture.state.refreshTokens.add('bridge-refresh')
  oauthStore.writeOAuthRecord(key, {
    clientInformation: { client_id: 'dyn-bridge', issuer: fixture.issuer },
    tokens: { access_token: 'bridge-access', refresh_token: 'bridge-refresh', token_type: 'Bearer', issuer: fixture.issuer },
  })

  const remote = oauthConfig.oauthRuntimeConfig({
    url: fixture.url,
    oauth: { mode: 'auto_register', clientId: '', callbackPort: null, scope: '' },
    credentialKey: key,
  })
  const bridgePath = new URL('../src/oauth-bridge.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridgePath],
    env: {
      PATH: process.env.PATH || '',
      SystemRoot: process.env.SystemRoot || '',
      UPH_MCP_REMOTE_CONFIG: oauthConfig.encodeOAuthConfig(remote),
      UPH_OAUTH_STORE_DIR: credentialRoot,
    },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'bridge-perf-test', version: '1.0.0' })
  t.after(() => client.close().catch(() => {}))

  await client.connect(transport)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(fixture.state.initializeCalls, 1)
  assert.equal(fixture.state.listToolsCalls, 0, 'proxyCapabilities must not call client.listTools eagerly during bridge startup')

  const listed = await client.listTools()
  assert.equal(listed.tools[0].name, 'search_docs')
  assert.equal(fixture.state.listToolsCalls, 1)
})

test('in-process OAuth probe refreshes rotated tokens, detects expired auth, and respects .revoked markers', { timeout: 20000 }, async (t) => {
  const fixture = await startOAuthMcpFixture()
  t.after(() => fixture.close())

  const pluginName = 'oauth-inproc-plug'
  setupLocalSourcePlugin('oauth-inproc-src', pluginName, {
    connectors: { remote: { type: 'http', url: fixture.url } },
  })
  await install.installPlugin({ sourceId: 'oauth-inproc-src', pluginName })
  t.after(() => install.uninstallPlugin(pluginName).catch(() => {}))

  const key = oauthConfig.oauthCredentialKey(pluginName, 'remote', fixture.url, 'auto_register')
  oauthStore.allowOAuthRecordWrites(key)
  fixture.state.tokens.add('access-0')
  fixture.state.refreshTokens.add('refresh-0')
  oauthStore.writeOAuthRecord(key, {
    clientInformation: { client_id: 'dyn-inproc', issuer: fixture.issuer },
    tokens: { access_token: 'access-0', refresh_token: 'refresh-0', token_type: 'Bearer', issuer: fixture.issuer },
  })

  const enabled1 = await install.enableConnector(pluginName, 'remote', { transport: 'http', url: fixture.url, oauth: 'auto_register' }, { pluginOwned: true })
  assert.equal(enabled1.ok, true, enabled1.error)
  assert.equal(fixture.state.listToolsCalls, 1)

  install.toggleConnector(pluginName, 'remote', false)
  fixture.state.tokens.delete('access-0')
  fixture.state.initializeCalls = 0
  fixture.state.listToolsCalls = 0

  const enabled2 = await install.enableConnector(pluginName, 'remote', undefined, { pluginOwned: true })
  assert.equal(enabled2.ok, true, enabled2.error)
  assert.equal(fixture.state.refreshes, 1, 'expired access token should refresh in-process')
  assert.equal(fixture.state.initializeCalls, 1, 're-enable must verify connectivity/auth via initialize')
  assert.equal(fixture.state.listToolsCalls, 0, 're-enable with cached matching config should skip tools/list')
  const updatedRecord = oauthStore.readOAuthRecord(key)
  assert.notEqual(updatedRecord?.tokens?.refresh_token, 'refresh-0', 'rotated refresh token must be persisted')

  install.toggleConnector(pluginName, 'remote', false)
  fixture.state.tokens.clear()
  fixture.state.refreshTokens.clear()
  const expired = await install.enableConnector(pluginName, 'remote', undefined, { pluginOwned: true })
  assert.equal(expired.ok, false)
  assert.match(expired.error || '', /授权已失效/)

  oauthStore.deleteOAuthRecord(key, { required: true })
  const probedAfterRevoke = await install.probeConnectorAuth(pluginName, 'remote', { transport: 'http', url: fixture.url, oauth: 'auto_register' }, { pluginOwned: true })
  assert.equal(probedAfterRevoke.ok, false)
  assert.equal(existsSync(oauthStore.oauthCredentialPath(key)), false, 'revoked credential file must never be recreated')
})

test('bridgeRuntimeEnv injects ELECTRON_RUN_AS_NODE=1 under Electron', () => {
  assert.equal(typeof oauthConfig.bridgeRuntimeEnv, 'function', 'oauth-config must export bridgeRuntimeEnv helper')
  const nodeEnv = oauthConfig.bridgeRuntimeEnv({ UPH_TEST: '1' }, { node: '24.0.0' })
  assert.equal(nodeEnv.ELECTRON_RUN_AS_NODE, undefined)
  const electronEnv = oauthConfig.bridgeRuntimeEnv({ UPH_TEST: '1' }, { node: '22.0.0', electron: '35.0.0' })
  assert.equal(electronEnv.ELECTRON_RUN_AS_NODE, '1')
  assert.equal(electronEnv.UPH_TEST, '1')
})

test('HTTP and stdio toggles reuse verified cache safely while respecting auth failures and config edits', { timeout: 20000 }, async (t) => {
  const bearer = await startBearerMcpFixture()
  t.after(() => bearer.close())

  const pluginName = 'bearer-perf-plug'
  setupLocalSourcePlugin('bearer-perf-src', pluginName, {
    connectors: { remote: { type: 'http', url: bearer.url, headers: { Authorization: 'Bearer ${API_TOKEN}' } } },
  })
  await install.installPlugin({ sourceId: 'bearer-perf-src', pluginName })
  t.after(() => install.uninstallPlugin(pluginName).catch(() => {}))

  const harness = createApiHarness(() => {})
  const base = await harness.start()
  t.after(() => harness.close())

  // 1. User HTTP Bearer MCP toggle ON skips tools/list after initial verify, still catches 401
  const createdHttp = await postJson(base, '/mcps', {
    name: 'bearer-user',
    transport: 'http',
    url: bearer.url,
    headers: { Authorization: 'Bearer valid-token' },
    enable: true,
  })
  assert.equal(createdHttp.ok, true, createdHttp.error)
  assert.equal(bearer.state.initializeCalls, 1)
  assert.equal(bearer.state.listToolsCalls, 1)

  await postJson(base, '/mcps/toggle', { name: 'bearer-user', enabled: false })
  bearer.state.initializeCalls = 0
  bearer.state.listToolsCalls = 0
  const reEnabledHttp = await postJson(base, '/mcps/toggle', { name: 'bearer-user', enabled: true })
  assert.equal(reEnabledHttp.ok, true, reEnabledHttp.error)
  assert.equal(bearer.state.initializeCalls, 1, 'cached HTTP toggle ON must still verify remote auth via initialize')
  assert.equal(bearer.state.listToolsCalls, 0, 'cached HTTP toggle ON must skip duplicate tools/list')

  await postJson(base, '/mcps/toggle', { name: 'bearer-user', enabled: false })
  bearer.state.expectedToken = 'rotated-secret'
  const rejectedHttp = await postJson(base, '/mcps/toggle', { name: 'bearer-user', enabled: true })
  assert.equal(rejectedHttp.ok, false, '401 must still fail HTTP toggle ON')

  // 2. Plugin connector toggle ON returns single plugin detail and skips tools/list when cached
  bearer.state.expectedToken = 'valid-token'
  bearer.state.initializeCalls = 0
  bearer.state.listToolsCalls = 0
  const connAuth = await postJson(base, `/plugins/${pluginName}/connectors/remote/auth`, {
    transport: 'http',
    url: bearer.url,
    headers: { Authorization: 'Bearer valid-token' },
  })
  assert.equal(connAuth.ok, true, connAuth.error)
  assert.equal(bearer.state.listToolsCalls, 1)

  const connOff = await postJson(base, `/plugins/${pluginName}/connectors/remote/toggle`, { enabled: false })
  assert.equal(connOff.ok, true)
  assert.equal(connOff.plugin?.name, pluginName)
  assert.equal(connOff.plugin?.connectors?.[0]?.connected, false)

  bearer.state.initializeCalls = 0
  bearer.state.listToolsCalls = 0
  const connOn = await postJson(base, `/plugins/${pluginName}/connectors/remote/toggle`, { enabled: true })
  assert.equal(connOn.ok, true, connOn.error)
  assert.equal(bearer.state.initializeCalls, 1)
  assert.equal(bearer.state.listToolsCalls, 0)
  assert.equal(connOn.plugin?.connectors?.[0]?.connected, true)

  // 3. Stdio unchanged verified MCP toggle ON skips spawning subprocess until config changes
  const serverFile = join(root, 'counter-stdio-mcp.mjs')
  const spawnLog = join(root, 'stdio-spawns.log')
  writeCounterStdioServer(serverFile)
  const createdStdio = await postJson(base, '/mcps', {
    name: 'stdio-user',
    transport: 'stdio',
    command: process.execPath,
    args: [serverFile],
    env: { TEST_SPAWN_LOG: spawnLog },
    enable: true,
  })
  assert.equal(createdStdio.ok, true, createdStdio.error)
  assert.equal(readFileSync(spawnLog, 'utf8').trim().split('\n').length, 1)

  await postJson(base, '/mcps/toggle', { name: 'stdio-user', enabled: false })
  const reEnabledStdio = await postJson(base, '/mcps/toggle', { name: 'stdio-user', enabled: true })
  assert.equal(reEnabledStdio.ok, true, reEnabledStdio.error)
  assert.equal(readFileSync(spawnLog, 'utf8').trim().split('\n').length, 1, 'unchanged verified stdio toggle ON must not re-spawn subprocess')

  const updatedStdio = await postJson(base, '/mcps/update', {
    name: 'stdio-user',
    transport: 'stdio',
    command: process.execPath,
    args: [serverFile],
    env: { TEST_SPAWN_LOG: spawnLog, EXTRA_FLAG: 'changed' },
    enable: true,
  })
  assert.equal(updatedStdio.ok, true, updatedStdio.error)
  assert.equal(readFileSync(spawnLog, 'utf8').trim().split('\n').length, 2, 'edited stdio MCP must re-probe subprocess')
})

test('cache safety, compact tools state, default-stdio/legacy-HTTP verifiedBefore, background applyProfile, and LSP disabled guard', { timeout: 20000 }, async (t) => {
  const bearer = await startBearerMcpFixture()
  t.after(() => bearer.close())

  const stdioScript = join(root, 'plugin-stdio-counter.mjs')
  const pluginSpawnLog = join(root, 'plugin-stdio-spawns.log')
  writeCounterStdioServer(stdioScript)

  const pluginName = 'legacy-default-plug'
  setupLocalSourcePlugin('legacy-default-src', pluginName, {
    skills: ['fast-skill'],
    connectors: {
      remote: { type: 'http', url: bearer.url, headers: { Authorization: 'Bearer valid-token' } },
      local: { type: 'stdio', command: process.execPath, args: [stdioScript], env: { TEST_SPAWN_LOG: pluginSpawnLog } },
    },
  })
  await install.installPlugin({ sourceId: 'legacy-default-src', pluginName })
  t.after(() => install.uninstallPlugin(pluginName).catch(() => {}))

  // installPlugin warms unauth-requiring 'local' stdio connector once automatically
  const warmDeadline = Date.now() + 5000
  while (Date.now() < warmDeadline && !install.isConnectorActive(pluginName, 'local')) {
    await new Promise((r) => setTimeout(r, 20))
  }
  assert.equal(install.isConnectorActive(pluginName, 'local'), true)
  assert.equal(readFileSync(pluginSpawnLog, 'utf8').trim().split('\n').length, 1)

  // Verify remote HTTP once, then toggle off
  assert.equal((await install.enableConnector(pluginName, 'remote', { transport: 'http', url: bearer.url, headers: { Authorization: 'Bearer valid-token' } }, { pluginOwned: true })).ok, true)
  assert.equal((await install.togglePlugin(pluginName, false)).ok, true)

  // Compact JSON & shallow-clone mutation isolation
  const statePath = join(store.dshHome(), '.mcp-tools-state.json')
  const rawToolsState = readFileSync(statePath, 'utf8')
  assert.equal(rawToolsState.includes('\n  '), false, '.mcp-tools-state.json should use compact serialization')

  const stRead1 = install.readMcpToolsState()
  delete stRead1[`${pluginName}::remote`].savedConnectorDefinition
  const stRead2 = install.readMcpToolsState()
  assert.ok(stRead2[`${pluginName}::remote`]?.savedConnectorDefinition, 'mutating readMcpToolsState() top-level entry must not poison cache')

  // No-op unregisterConnector skips rewriting .mcp-tools-state.json
  const past = new Date(Date.now() - 10_000)
  utimesSync(statePath, past, past)
  const expectedMtime = statSync(statePath).mtimeMs
  install.unregisterConnector(pluginName, 'remote')
  assert.equal(statSync(statePath).mtimeMs, expectedMtime, 'repeated unregisterConnector must not rewrite unchanged .mcp-tools-state.json')

  // Simulate legacy tools-state (missing cachedToolsResolved on HTTP & uncustomized default stdio without savedConnectorDefinition)
  const legacyState = install.readMcpToolsState()
  delete legacyState[`${pluginName}::remote`].cachedToolsResolved
  delete legacyState[`${pluginName}::local`].savedConnectorDefinition
  delete legacyState[`${pluginName}::local`].verifiedStdioConfig
  install.writeMcpToolsState(legacyState)

  const toggleOn = await install.togglePlugin(pluginName, true)
  assert.equal(toggleOn.ok, true)
  assert.equal(install.isConnectorActive(pluginName, 'remote'), true, 'legacy HTTP entry with cachedTools + verifiedRemoteConfig must enable synchronously')
  assert.equal(install.isConnectorActive(pluginName, 'local'), true, 'default stdio entry with cachedTools must enable synchronously without savedConnectorDefinition')
  assert.equal(readFileSync(pluginSpawnLog, 'utf8').trim().split('\n').length, 1, 'verified default stdio plugin toggle ON must not spawn subprocess')

  // Slow unverified plugin connector triggers applyProfile when background enable finishes
  const slowPlug = 'slow-unverified-plug'
  setupLocalSourcePlugin('slow-unverified-src', slowPlug, {
    connectors: {
      slow: { type: 'stdio', command: process.execPath, args: [stdioScript], env: { TEST_DELAY_MS: '180' } },
    },
  })
  await install.installPlugin({ sourceId: 'slow-unverified-src', pluginName: slowPlug })
  t.after(() => install.uninstallPlugin(slowPlug).catch(() => {}))
  await install.togglePlugin(slowPlug, false)

  const appliedBatches = []
  const slowHarness = createApiHarness((ids) => { appliedBatches.push(ids) })
  const slowBase = await slowHarness.start()
  t.after(() => slowHarness.close())

  const startedAt = Date.now()
  const slowResp = await postJson(slowBase, `/plugins/${slowPlug}/toggle`, { enabled: true })
  assert.equal(slowResp.ok, true)
  assert.equal(slowResp.plugin?.name, slowPlug)
  assert.ok(Date.now() - startedAt < 150, 'unverified slow MCP plugin toggle ON must return before slow probe finishes')

  const deadline = Date.now() + 5000
  while (Date.now() < deadline && !appliedBatches.some((ids) => Array.isArray(ids) && ids.includes(install.getConnectorId(slowPlug, 'slow')))) {
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.ok(
    appliedBatches.some((ids) => Array.isArray(ids) && ids.includes(install.getConnectorId(slowPlug, 'slow'))),
    'background connector completion must trigger applyProfile for the newly registered connector',
  )

  // Disabled LSP plugin must NOT auto-re-register during installedDetails()
  const lspPlug = 'disabled-lsp-plug'
  const { pluginDir } = setupLocalSourcePlugin('disabled-lsp-src', lspPlug, {
    lspServers: {
      test_lsp: {
        command: process.execPath,
        extensionToLanguage: { '.testext': 'testlang' },
      },
    },
  })
  assert.ok(existsSync(join(pluginDir, '.lsp.json')))
  await install.installPlugin({ sourceId: 'disabled-lsp-src', pluginName: lspPlug })
  t.after(() => install.uninstallPlugin(lspPlug).catch(() => {}))
  assert.equal(install.installedDetails().find((p) => p.name === lspPlug)?.lspServers?.[0]?.active, true)

  await install.togglePlugin(lspPlug, false)
  const afterDetails = install.installedDetails().find((p) => p.name === lspPlug)
  assert.equal(afterDetails?.enabled, false)
  assert.equal(afterDetails?.lspServers?.[0]?.active, false, 'installedDetails() must not re-activate LSP for disabled plugin')
})

function collectPatternBindings(pattern, scope) {
  if (!pattern) return
  if (pattern.type === 'Identifier') scope.add(pattern.name)
  else if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties) collectPatternBindings(prop.type === 'RestElement' ? prop.argument : prop.value, scope)
  } else if (pattern.type === 'ArrayPattern') {
    for (const el of pattern.elements) collectPatternBindings(el, scope)
  } else if (pattern.type === 'AssignmentPattern') collectPatternBindings(pattern.left, scope)
  else if (pattern.type === 'RestElement') collectPatternBindings(pattern.argument, scope)
}

function hoistBlockDecls(node, fnScope, blockScope) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) hoistBlockDecls(item, fnScope, blockScope)
    return
  }
  if (node.type === 'FunctionDeclaration') {
    if (node.id) blockScope.add(node.id.name)
    return
  }
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return
  if (node.type === 'VariableDeclaration') {
    const target = node.kind === 'var' ? fnScope : blockScope
    for (const decl of node.declarations) collectPatternBindings(decl.id, target)
    return
  }
  if (node.type === 'ClassDeclaration' && node.id) {
    blockScope.add(node.id.name)
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    const val = node[key]
    if (val && typeof val === 'object') hoistBlockDecls(val, fnScope, fnScope)
  }
}

function findUnresolvedIdentifiers(ast) {
  const GLOBALS = new Set([
    'Object', 'Array', 'String', 'Number', 'Boolean', 'Set', 'Map', 'WeakMap', 'WeakSet', 'Promise', 'Error', 'TypeError', 'RangeError',
    'Date', 'Math', 'JSON', 'RegExp', 'URL', 'URLSearchParams', 'Symbol', 'Reflect', 'Proxy', 'Intl', 'Function', 'Infinity', 'NaN', 'undefined',
    'globalThis', 'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'console', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'AbortController', 'Headers', 'Request', 'Response',
    'FormData', 'FileReader', 'Blob', 'File', 'CustomEvent', 'Event', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'HTMLElement',
    'Node', 'Image', 'XMLHttpRequest', 'Highlight', 'getComputedStyle', 'matchMedia', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI',
    'decodeURI', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'queueMicrotask', 'structuredClone', 'atob', 'btoa', 'performance',
    'TextEncoder', 'TextDecoder', 'module', 'exports', 'require', 'React', 'process',
  ])
  const unresolved = []
  function visit(node, scopeChain, fnScope) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) visit(item, scopeChain, fnScope)
      return
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'Program') {
      const nextScope = new Set()
      if (node.type === 'FunctionDeclaration' && node.id && scopeChain.length > 0) scopeChain[scopeChain.length - 1].add(node.id.name)
      if (node.type === 'FunctionExpression' && node.id) nextScope.add(node.id.name)
      if (node.params) for (const p of node.params) collectPatternBindings(p, nextScope)
      if (node.type !== 'ArrowFunctionExpression' && node.type !== 'Program') nextScope.add('arguments')
      const body = node.type === 'Program' ? node.body : node.body?.type === 'BlockStatement' ? node.body.body : null
      if (body) {
        hoistBlockDecls(body, nextScope, nextScope)
        for (const stmt of body) visit(stmt, [...scopeChain, nextScope], nextScope)
      } else {
        visit(node.body, [...scopeChain, nextScope], nextScope)
      }
      return
    }
    if (node.type === 'BlockStatement') {
      const bScope = new Set()
      for (const stmt of node.body) {
        if (stmt.type === 'VariableDeclaration' && stmt.kind !== 'var') {
          for (const decl of stmt.declarations) collectPatternBindings(decl.id, bScope)
        } else if ((stmt.type === 'ClassDeclaration' || stmt.type === 'FunctionDeclaration') && stmt.id) {
          bScope.add(stmt.id.name)
        }
      }
      for (const stmt of node.body) visit(stmt, [...scopeChain, bScope], fnScope)
      return
    }
    if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
      const bScope = new Set()
      if (node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var') {
        for (const decl of node.init.declarations) collectPatternBindings(decl.id, bScope)
      }
      if (node.left?.type === 'VariableDeclaration' && node.left.kind !== 'var') {
        for (const decl of node.left.declarations) collectPatternBindings(decl.id, bScope)
      }
      const nextChain = [...scopeChain, bScope]
      for (const key of ['init', 'left', 'right', 'test', 'update', 'body']) {
        if (node[key]) visit(node[key], nextChain, fnScope)
      }
      return
    }
    if (node.type === 'CatchClause') {
      const bScope = new Set()
      if (node.param) collectPatternBindings(node.param, bScope)
      visit(node.body, [...scopeChain, bScope], fnScope)
      return
    }
    if (node.type === 'Identifier') {
      if (!GLOBALS.has(node.name) && !scopeChain.some((s) => s.has(node.name))) unresolved.push(node.name)
      return
    }
    if (node.type === 'MemberExpression') {
      visit(node.object, scopeChain, fnScope)
      if (node.computed) visit(node.property, scopeChain, fnScope)
      return
    }
    if (node.type === 'Property') {
      if (node.computed) visit(node.key, scopeChain, fnScope)
      visit(node.value, scopeChain, fnScope)
      return
    }
    if (node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
      if (node.computed) visit(node.key, scopeChain, fnScope)
      if (node.value) visit(node.value, scopeChain, fnScope)
      return
    }
    if (node.type === 'AssignmentPattern') {
      visit(node.right, scopeChain, fnScope)
      return
    }
    if (node.type === 'VariableDeclarator') {
      if (node.init) visit(node.init, scopeChain, fnScope)
      return
    }
    if (node.type === 'AssignmentExpression') {
      if (node.left.type !== 'Identifier') visit(node.left, scopeChain, fnScope)
      else if (!GLOBALS.has(node.left.name) && !scopeChain.some((s) => s.has(node.left.name))) unresolved.push(node.left.name)
      visit(node.right, scopeChain, fnScope)
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'id') continue
      const val = node[key]
      if (val && typeof val === 'object') visit(val, scopeChain, fnScope)
    }
  }
  visit(ast, [], null)
  return unresolved
}

function textOf(node) {
  if (!node) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node.children)) return node.children.map(textOf).join('')
  return ''
}

test('client UI resolves patchPluginInState across BrowseView/DetailView/ManagePage and patches without blocking', async (t) => {
  const detailNode = findAstNode('DetailView')
  const manageNode = findAstNode('ManagePageContent')
  const mcpRowNode = findAstNode('renderMcpServerRow')
  assert.ok(detailNode && manageNode && mcpRowNode)

  const manageCode = clientSource.slice(manageNode.start, manageNode.end)
  const mcpRowCode = clientSource.slice(mcpRowNode.start, mcpRowNode.end)

  assert.match(clientSource, /function\s+\w*|patchPluginInState/, 'client must define patchPluginInState')
  assert.match(manageCode, /patchPluginInState/, 'ManagePageContent must apply single-plugin patch immediately')
  assert.doesNotMatch(manageCode, /const\s+toggle\s*=\s*async[\s\S]{0,600}await\s+refreshState\(\)[\s\S]{0,120}showApplicationToast/, 'ManagePageContent toggle success must not await full refreshState before unlocking')
  assert.doesNotMatch(manageCode, /const\s+toggleConn\s*=\s*async[\s\S]{0,600}await\s+refreshState\(\)[\s\S]{0,120}showApplicationToast/, 'ManagePageContent toggleConn success must not await full refreshState before unlocking')
  assert.match(manageCode, /disabled:\s*busy\s*\|\|\s*updating\s*\|\|\s*toggling\s*\|\|\s*Boolean\(togglingConn\)/, 'ManagePageContent button lock invariant must be preserved')
  assert.match(mcpRowCode, /patchPluginInState/, 'renderMcpServerRow must apply single-plugin patch immediately')

  const unresolved = findUnresolvedIdentifiers(clientAst)
  assert.equal(
    unresolved.includes('patchPluginInState'),
    false,
    `patchPluginInState must resolve in every client component scope (found unresolved: ${unresolved.join(', ')})`,
  )
  const unexpectedUnresolved = unresolved.filter((id) => !['setActiveSourceIdRaw', 'setFilterRaw', 'setViewRaw'].includes(id))
  assert.deepEqual(unexpectedUnresolved, [], `unexpected unresolved identifiers in client.js: ${unexpectedUnresolved.join(', ')}`)

  const req = createRequire(import.meta.url)
  const React = req('react')
  const TestRenderer = req('react-test-renderer')
  const { act } = TestRenderer

  let currentPlugin = {
    name: 'exa',
    sourceId: 'anthropic',
    displayName: 'Exa',
    description: 'Search MCP',
    installed: true,
    enabled: true,
    skills: [],
    commands: [],
    agents: [],
    hooks: [],
    lspServers: [],
    connectors: [{ name: 'exa', type: 'http', url: 'https://mcp.exa.ai/mcp', oauth: 'auto_register', configured: true, enabled: true, connected: true }],
  }
  const initialState = () => ({
    sources: [{ id: 'anthropic', name: 'Anthropic', url: 'https://example.com/market.git', builtin: true, pluginCount: 1 }],
    plugins: [structuredClone(currentPlugin)],
  })
  const marketRows = [{
    name: 'exa',
    sourceId: 'anthropic',
    displayName: 'Exa',
    description: 'Search MCP',
    skills: [],
    connectors: [{ name: 'exa', type: 'http', url: 'https://mcp.exa.ai/mcp' }],
  }]

  let holdRefresh = false
  let releasePendingRefresh = null
  const savedGlobals = new Map()
  const storage = new Map()
  const setTempGlobal = (k, v) => {
    savedGlobals.set(k, Object.prototype.hasOwnProperty.call(globalThis, k) ? globalThis[k] : Symbol.for('__unset__'))
    globalThis[k] = v
  }
  t.after(() => {
    for (const [k, v] of savedGlobals.entries()) {
      if (v === Symbol.for('__unset__')) delete globalThis[k]
      else globalThis[k] = v
    }
  })

  let loadedModule = null
  const mockEl = () => ({
    id: '',
    textContent: '',
    style: {},
    classList: { contains: () => false, add() {}, remove() {} },
    setAttribute() {},
    getAttribute: () => null,
    appendChild() {},
    removeChild() {},
    remove() {},
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    scrollTop: 0,
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 1000,
    parentElement: null,
  })
  const mockDoc = {
    getElementById: () => null,
    createElement: mockEl,
    head: { appendChild() {}, querySelectorAll: () => [] },
    body: mockEl(),
    documentElement: mockEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  }
  const mockWin = {
    __ModuleLoader__: { load: (def) => { loadedModule = def } },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ backgroundColor: '', color: '' }),
    matchMedia: () => ({ matches: false }),
    setTimeout,
    clearTimeout,
  }
  setTempGlobal('window', mockWin)
  setTempGlobal('document', mockDoc)
  setTempGlobal('localStorage', {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)) },
    removeItem: (k) => { storage.delete(k) },
  })
  setTempGlobal('MutationObserver', class { observe() {} disconnect() {} })
  setTempGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  setTempGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  setTempGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0))
  setTempGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
  setTempGlobal('Event', class { constructor(type) { this.type = type } })
  setTempGlobal('Image', class { constructor() { this.onload = null; this.onerror = null } set src(_) {} })
  setTempGlobal('matchMedia', mockWin.matchMedia)
  setTempGlobal('fetch', async (url, opts = {}) => {
    const u = String(url)
    if (u.endsWith('/state')) {
      if (holdRefresh) {
        await new Promise((resolve) => { releasePendingRefresh = resolve })
      }
      return { ok: true, status: 200, json: async () => initialState() }
    }
    if (u.includes('/market?')) return { ok: true, status: 200, json: async () => ({ plugins: marketRows }) }
    if (u.endsWith('/market/refresh')) return { ok: true, status: 200, json: async () => ({ plugins: marketRows }) }
    if (u.endsWith('/mcps')) return { ok: true, status: 200, json: async () => ({ rows: [] }) }
    if (u.endsWith('/tool-call-icons')) return { ok: true, status: 200, json: async () => ({ groups: [] }) }
    if (u.endsWith('/tools')) return { ok: true, status: 200, json: async () => ({ ok: true, tools: [{ name: 'search', description: 'Search web' }], disabledTools: [] }) }
    if (u.endsWith('/connectors/exa/toggle')) {
      const body = JSON.parse(opts.body || '{}')
      currentPlugin = {
        ...currentPlugin,
        connectors: [{ ...currentPlugin.connectors[0], enabled: body.enabled, connected: body.enabled }],
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, connected: body.enabled, plugin: structuredClone(currentPlugin) }) }
    }
    if (u.endsWith('/plugins/exa/toggle')) {
      const body = JSON.parse(opts.body || '{}')
      currentPlugin = { ...currentPlugin, enabled: body.enabled }
      return { ok: true, status: 200, json: async () => ({ ok: true, enabled: body.enabled, plugin: structuredClone(currentPlugin) }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  })

  new Function(clientSource)()
  assert.ok(loadedModule && typeof loadedModule.factory === 'function', 'client bundle should register via __ModuleLoader__.load')
  const customRequire = (id) => (id === 'react' ? React : {})
  const clientExports = loadedModule.factory(customRequire)

  let MainSection = null
  const mockCtx = {
    theme: { getTheme: () => 'dark' },
    effect: () => {},
    slots: {
      inject: (_slot, reg) => reg(),
      register: (meta, comp) => {
        if (meta?.name === 'main') MainSection = comp
      },
    },
  }
  clientExports.apply(mockCtx)
  assert.equal(typeof MainSection, 'function', 'apply(ctx) must register main view component')

  setTempGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let renderer
  try {
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(MainSection, { ctx: mockCtx }))
      await new Promise((r) => setTimeout(r, 40))
    })

    const browseDump = textOf(renderer.toJSON())
    assert.equal(browseDump.includes('插件视图运行异常'), false, `BrowseView crashed: ${browseDump}`)
    assert.match(browseDump, /Exa/)

    // Clicking installed card opens ManagePage directly; verify zero runtime crash and non-blocking patchPluginInState toggle
    const card = renderer.root.find((n) => n.type === 'div' && typeof n.props?.className === 'string' && n.props.className.includes('cpm-card') && typeof n.props.onClick === 'function')
    await act(async () => {
      card.props.onClick()
      await new Promise((r) => setTimeout(r, 20))
    })
    const manageDump = textOf(renderer.toJSON())
    assert.equal(manageDump.includes('插件视图运行异常'), false, `ManagePage crashed: ${manageDump}`)

    // Switch to Connectors tab too so connector switch renders
    const connTab = renderer.root.find((n) => n.type === 'button' && n.children?.includes('Connectors'))
    await act(async () => {
      connTab.props.onClick()
    })

    // Hold background GET /state so we prove toggles resolve via patchPluginInState instead of awaiting GET /state
    holdRefresh = true
    const getToggleSwitches = () => renderer.root.findAll((n) => n.type === 'button' && typeof n.props?.className === 'string' && n.props.className.includes('cpm-toggle'))
    assert.ok(getToggleSwitches().length >= 2, 'ManagePage must render plugin switch and connector switch')
    assert.ok(getToggleSwitches()[0].props.className.includes(' on'))
    assert.ok(getToggleSwitches()[1].props.className.includes(' on'))

    await act(async () => {
      await getToggleSwitches()[0].props.onClick()
    })
    assert.equal(textOf(renderer.toJSON()).includes('插件视图运行异常'), false)
    assert.equal(getToggleSwitches()[0].props.className.includes(' on'), false, 'plugin switch should flip immediately via patchPluginInState while GET /state is pending')
    assert.equal(getToggleSwitches()[0].props.disabled, false, 'plugin switch should unlock immediately while GET /state is pending')

    await act(async () => {
      await getToggleSwitches()[1].props.onClick()
    })
    assert.equal(getToggleSwitches()[1].props.className.includes(' on'), false, 'connector switch should flip immediately via patchPluginInState while GET /state is pending')
    assert.equal(getToggleSwitches()[1].props.disabled, false, 'connector switch should unlock immediately while GET /state is pending')
  } finally {
    if (releasePendingRefresh) releasePendingRefresh()
    if (renderer) {
      await act(async () => {
        renderer.unmount()
      })
    }
  }
})


test('unregisterConnector, payload overrides, and deep cloning do not resurrect deleted headers/env/args/cwd or corrupt cache', { timeout: 20000 }, async (t) => {
  const stdioScript = join(root, 'resurrect-stdio-mcp.mjs')
  writeCounterStdioServer(stdioScript)

  const pluginName = 'resurrect-guard-plug'
  setupLocalSourcePlugin('resurrect-guard-src', pluginName, {
    connectors: {
      hdrConn: {
        type: 'http',
        url: 'https://api.resurrect.test/mcp',
        headers: { 'x-source': 'manifest', Authorization: '${API_TOKEN}' },
      },
      stdioConn: {
        type: 'stdio',
        command: process.execPath,
        args: [stdioScript, '--flag'],
        cwd: '${PLUGIN_ROOT}',
        env: { MANIFEST_DEFAULT: '1', SECRET_ENV: '${SECRET_ENV}' },
      },
    },
  })
  await install.installPlugin({ sourceId: 'resurrect-guard-src', pluginName })
  t.after(() => install.uninstallPlugin(pluginName).catch(() => {}))

  // 1. Explicit payload.headers omits manifest default 'x-source': must NOT force 'x-source' back in
  const hdrSave1 = install.saveConnectorAuth(pluginName, 'hdrConn', {
    transport: 'http',
    url: 'https://api.resurrect.test/mcp',
    headers: { Authorization: 'Bearer secret-1' },
  })
  assert.equal(hdrSave1.ok, true)
  const hdrEntry1 = install.getConnectorEntry(pluginName, 'hdrConn')
  assert.deepEqual(hdrEntry1.config.headers, { Authorization: 'Bearer secret-1' })

  // 2. Deep clone check on readMcpToolsState(): mutating nested headers must not poison MCP_TOOLS_STATE_CACHE
  const readA = install.readMcpToolsState()
  readA[`${pluginName}::hdrConn`].savedConnectorDefinition.headers.Authorization = 'POISONED'
  const readB = install.readMcpToolsState()
  assert.equal(readB[`${pluginName}::hdrConn`].savedConnectorDefinition.headers.Authorization, 'Bearer secret-1')

  // 3. Clear headers completely, then togglePlugin(false) -> unregisterConnector must NOT resurrect Authorization or overwrite transport
  install.saveConnectorAuth(pluginName, 'hdrConn', {
    transport: 'http',
    url: 'https://api.resurrect.test/mcp',
    headers: {},
  })
  await install.togglePlugin(pluginName, false)
  const savedHdrAfterOff = install.readMcpToolsState()[`${pluginName}::hdrConn`]?.savedConnectorDefinition
  assert.equal(savedHdrAfterOff?.transport, 'http', 'unregisterConnector must preserve http transport rather than overwriting with streamable-http')
  assert.equal(savedHdrAfterOff?.headers?.Authorization, undefined, 'deleted sensitive Authorization header must not resurrect after toggle off')
  assert.equal(savedHdrAfterOff?.headers?.['x-source'], undefined, 'deleted manifest default header must not resurrect after toggle off')

  // 4. Re-enable and check stdio explicit env/args/cwd deletion does not resurrect on toggle OFF -> ON
  await install.togglePlugin(pluginName, true)
  assert.equal(install.getConnectorEntry(pluginName, 'hdrConn')?.config?.headers?.Authorization, undefined)

  install.saveConnectorAuth(pluginName, 'stdioConn', {
    transport: 'stdio',
    command: process.execPath,
    args: [stdioScript],
    cwd: root,
    env: { CUSTOM_KEY: 'secret-env' },
  })
  const stdioEntry1 = install.getConnectorEntry(pluginName, 'stdioConn')
  assert.equal(stdioEntry1.config.env?.MANIFEST_DEFAULT, undefined, 'deleted manifest default env must stay deleted')
  assert.equal(stdioEntry1.config.env?.CUSTOM_KEY, 'secret-env')
  assert.deepEqual(stdioEntry1.config.args, [stdioScript])
  assert.equal(stdioEntry1.config.cwd, root.replace(/\\/g, '/'))

  install.saveConnectorAuth(pluginName, 'stdioConn', {
    transport: 'stdio',
    command: process.execPath,
    args: [stdioScript],
    cwd: '',
    env: {},
  })
  await install.togglePlugin(pluginName, false)
  const savedStdioAfterOff = install.readMcpToolsState()[`${pluginName}::stdioConn`]?.savedConnectorDefinition
  assert.equal(savedStdioAfterOff?.env?.CUSTOM_KEY, undefined, 'cleared stdio env must not resurrect into savedConnectorDefinition')
  assert.equal(savedStdioAfterOff?.env?.MANIFEST_DEFAULT, undefined)
  assert.equal(savedStdioAfterOff?.cwd || undefined, undefined, 'cleared cwd must not resurrect into savedConnectorDefinition')

  await install.togglePlugin(pluginName, true)
  const stdioEntryAfterOn = install.getConnectorEntry(pluginName, 'stdioConn')
  assert.equal(stdioEntryAfterOn?.config?.env?.CUSTOM_KEY, undefined)
  assert.equal(stdioEntryAfterOn?.config?.env?.MANIFEST_DEFAULT, undefined)
})

test('OAuth credentials survive toggle, blank-secret edits, cancelled re-auth, transient probe failures, and save discoveryState cleanly', { timeout: 25000 }, async (t) => {
  // Part A: custom OAuth skips redundant DPAPI write when client_id/secret unchanged & preserves secret on blank edit
  const customPlug = 'custom-oauth-guard'
  const customUrl = 'https://custom.oauth.invalid/mcp'
  setupLocalSourcePlugin('custom-oauth-src', customPlug, {
    connectors: { remote: { type: 'http', url: customUrl } },
  })
  await install.installPlugin({ sourceId: 'custom-oauth-src', pluginName: customPlug })
  t.after(() => install.uninstallPlugin(customPlug).catch(() => {}))

  assert.equal(install.saveConnectorAuth(customPlug, 'remote', {
    transport: 'http',
    url: customUrl,
    oauth: 'custom',
    oauthClientId: 'cid-1',
    oauthClientSecret: 'csec-1',
    headers: {},
  }).ok, true)

  const customKey = oauthConfig.oauthCredentialKey(customPlug, 'remote', customUrl, 'custom')
  const customCredPath = oauthStore.oauthCredentialPath(customKey)
  oauthStore.allowOAuthRecordWrites(customKey)
  const existingCustomRec = oauthStore.readOAuthRecord(customKey)
  oauthStore.writeOAuthRecord(customKey, {
    ...existingCustomRec,
    tokens: { access_token: 'tok-custom', refresh_token: 'ref-custom', token_type: 'Bearer' },
  })
  const staleTime = new Date(Date.now() - 120000)
  utimesSync(customCredPath, staleTime, staleTime)
  const mtimeBefore = statSync(customCredPath).mtimeMs

  await install.enableConnector(customPlug, 'remote', {
    transport: 'http',
    url: customUrl,
    oauth: 'custom',
    oauthClientId: 'cid-1',
    oauthClientSecret: 'csec-1',
    headers: {},
  }, { pluginOwned: true })
  assert.equal(statSync(customCredPath).mtimeMs, mtimeBefore, 'unchanged custom OAuth client must not rewrite DPAPI credential file')

  install.saveConnectorAuth(customPlug, 'remote', {
    transport: 'http',
    url: customUrl,
    oauth: 'custom',
    oauthClientId: 'cid-1',
    oauthClientSecret: '',
    headers: {},
  })
  const recAfterBlankSecret = oauthStore.readOAuthRecord(customKey)
  assert.equal(recAfterBlankSecret.customClient?.client_secret, 'csec-1', 'blank secret edit with same clientId must preserve existing client_secret')
  assert.equal(recAfterBlankSecret.tokens?.access_token, 'tok-custom', 'blank secret edit with same clientId must preserve existing tokens')

  // Part B: OAuth cancel preservation, transient 503 vs 401 invalidation, and non-interactive provider discoveryState + localhost
  let forceMcpStatus = 200
  const fixtureState = { tokens: new Set(['exp-token']), refreshTokens: new Set(['ref-1']), refreshes: 0 }
  let serverPort = 0
  const oauthSrv = createServer(async (req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1')
    const issuer = `http://127.0.0.1:${serverPort}`
    if (u.pathname === '/.well-known/oauth-protected-resource') {
      return sendJson(res, 200, { resource: `${issuer}/mcp`, authorization_servers: [issuer] })
    }
    if (u.pathname === '/.well-known/oauth-authorization-server') {
      return sendJson(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        response_types_supported: ['code'],
        token_endpoint_auth_methods_supported: ['none'],
      })
    }
    if (u.pathname === '/token' && req.method === 'POST') {
      const params = new URLSearchParams(await readBody(req))
      if (params.get('grant_type') === 'refresh_token') {
        const oldR = params.get('refresh_token')
        if (!fixtureState.refreshTokens.has(oldR)) return sendJson(res, 400, { error: 'invalid_grant' })
        fixtureState.refreshTokens.delete(oldR)
        fixtureState.refreshes += 1
        const nextAcc = `acc-next-${fixtureState.refreshes}`
        const nextRef = `ref-next-${fixtureState.refreshes}`
        fixtureState.tokens.add(nextAcc)
        fixtureState.refreshTokens.add(nextRef)
        return sendJson(res, 200, { access_token: nextAcc, refresh_token: nextRef, token_type: 'Bearer', expires_in: 3600 })
      }
      return sendJson(res, 400, { error: 'unsupported_grant_type' })
    }
    if (u.pathname === '/mcp') {
      if (forceMcpStatus === 503) {
        res.writeHead(503).end('service temporarily unavailable')
        return
      }
      if (forceMcpStatus === 401) {
        res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"` }).end()
        return
      }
      const bearer = (req.headers.authorization || '').replace(/^Bearer /, '')
      if (!fixtureState.tokens.has(bearer)) {
        res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"` }).end()
        return
      }
      if (req.method === 'DELETE') {
        res.writeHead(200).end()
        return
      }
      const parsed = req.method === 'POST' ? JSON.parse(await readBody(req)) : undefined
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      const mcp = new Server({ name: 'oauth-guard-mcp', version: '1.0.0' }, { capabilities: { tools: {} } })
      mcp.setRequestHandler(ListToolsRequestSchema, () => ({
        tools: [{ name: 'oauth_search', description: 'OAuth tool', inputSchema: { type: 'object', properties: {} } }],
      }))
      await mcp.connect(transport)
      res.on('close', () => { void mcp.close() })
      await transport.handleRequest(req, res, parsed)
      return
    }
    sendJson(res, 404, { error: 'not_found' })
  })
  serverPort = await listenServer(oauthSrv)
  t.after(() => {
    oauthSrv.closeAllConnections?.()
    return new Promise((resolve) => oauthSrv.close(resolve))
  })
  const mcpUrl = `http://127.0.0.1:${serverPort}/mcp`
  const issuerUrl = `http://127.0.0.1:${serverPort}`

  const oauthPlug = 'oauth-guard-plug'
  setupLocalSourcePlugin('oauth-guard-src', oauthPlug, {
    connectors: { remote: { type: 'http', url: mcpUrl } },
  })
  await install.installPlugin({ sourceId: 'oauth-guard-src', pluginName: oauthPlug })
  t.after(() => install.uninstallPlugin(oauthPlug).catch(() => {}))

  const autoKey = oauthConfig.oauthCredentialKey(oauthPlug, 'remote', mcpUrl, 'auto_register')
  oauthStore.allowOAuthRecordWrites(autoKey)
  oauthStore.writeOAuthRecord(autoKey, {
    clientInformation: { client_id: 'dyn-guard', redirect_uris: ['http://localhost:0/callback'], issuer: issuerUrl },
    tokens: { access_token: 'stale-expired-tok', refresh_token: 'ref-1', token_type: 'Bearer', issuer: issuerUrl },
  })

  // First fresh tool fetch triggers non-interactive refresh + must populate discoveryState + use localhost metadata
  const payload = { transport: 'http', url: mcpUrl, oauth: 'auto_register', headers: {} }
  assert.equal(install.saveConnectorAuth(oauthPlug, 'remote', payload).ok, true)
  const freshTools = await install.fetchConnectorTools(oauthPlug, 'remote', true)
  assert.equal(freshTools.ok, true, freshTools.error)
  assert.deepEqual(freshTools.tools.map((tool) => tool.name), ['oauth_search'])
  assert.ok(oauthStore.readOAuthRecord(autoKey).discovery, 'non-interactive OAuth provider must save discoveryState')
  const installSrc = readFileSync(new URL('../src/install.js', import.meta.url), 'utf8')
  assert.doesNotMatch(installSrc, /createNonInteractiveOAuthProvider[\s\S]{0,600}http:\/\/127\.0\.0\.1:/, 'non-interactive OAuth provider must use localhost redirect_uri matching oauth-bridge')

  assert.equal(install.isConnectorActive(oauthPlug, 'remote'), true)
  assert.equal(install.installedPluginDetail(oauthPlug)?.connectors?.[0]?.oauthAuthenticated, true)

  // Cancelling an in-flight OAuth re-auth must NOT wipe already-verified session state
  const prevNoBrowser = process.env.UPH_MCP_NO_BROWSER
  process.env.UPH_MCP_NO_BROWSER = '1'
  let pendingReauth
  try {
    pendingReauth = await install.verifyConnectorAuth(oauthPlug, 'remote', payload)
  } finally {
    if (prevNoBrowser === undefined) delete process.env.UPH_MCP_NO_BROWSER
    else process.env.UPH_MCP_NO_BROWSER = prevNoBrowser
  }
  assert.equal(pendingReauth.pending, true)
  const { cancelOAuthVerification } = await import('../src/oauth.js')
  assert.equal(cancelOAuthVerification(pendingReauth.sessionId), true)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(install.isConnectorActive(oauthPlug, 'remote'), true, 'cancelling re-auth must preserve active verified state')
  assert.equal(install.installedPluginDetail(oauthPlug)?.connectors?.[0]?.oauthAuthenticated, true)

  // Transient 503 during fresh tool discovery must return stale cached tools AND preserve oauthAuthenticated / active
  forceMcpStatus = 503
  const transientRes = await install.fetchConnectorTools(oauthPlug, 'remote', true)
  assert.equal(transientRes.ok, true)
  assert.equal(transientRes.stale, true)
  assert.equal(install.isConnectorActive(oauthPlug, 'remote'), true, 'transient 503 must not wipe verifiedRemoteConfig')
  assert.equal(install.installedPluginDetail(oauthPlug)?.connectors?.[0]?.oauthAuthenticated, true)

  // Explicit 401 (with refresh token exhausted) MUST invalidate verifiedRemoteConfig / active
  forceMcpStatus = 401
  fixtureState.refreshTokens.clear()
  fixtureState.tokens.clear()
  const unauthorizedRes = await install.fetchConnectorTools(oauthPlug, 'remote', true)
  assert.equal(unauthorizedRes.stale, true)
  assert.equal(install.isConnectorActive(oauthPlug, 'remote'), false, 'explicit 401 failure must clear verifiedRemoteConfig')
})

test('togglePlugin reports pendingConnectors and connector routes preserve rememberDefinition & plugin detail', { timeout: 20000 }, async (t) => {
  const stdioScript = join(root, 'pending-stdio-mcp.mjs')
  writeCounterStdioServer(stdioScript)

  const plug = 'pending-route-plug'
  setupLocalSourcePlugin('pending-route-src', plug, {
    connectors: {
      slow: { type: 'stdio', command: process.execPath, args: [stdioScript], env: { TEST_DELAY_MS: '180' } },
    },
  })
  await install.installPlugin({ sourceId: 'pending-route-src', pluginName: plug })
  t.after(() => install.uninstallPlugin(plug).catch(() => {}))
  install.cancelActivePluginProbes(plug)
  await install.togglePlugin(plug, false)

  // Wipe cached/verified state so togglePlugin(true) enters background pending verification
  const ts = install.readMcpToolsState()
  delete ts[`${plug}::slow`]
  install.writeMcpToolsState(ts, { required: true })

  const toggleRes = await install.togglePlugin(plug, true)
  assert.equal(toggleRes.ok, true)
  assert.deepEqual(toggleRes.pendingConnectors, ['slow'], 'togglePlugin(true) must report connectors still probing in background')

  const deadline = Date.now() + 5000
  while (Date.now() < deadline && !install.isConnectorActive(plug, 'slow')) {
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.equal(install.isConnectorActive(plug, 'slow'), true)

  const harness = createApiHarness(() => {})
  const base = await harness.start()
  t.after(() => harness.close())

  // Uncustomized manifest connector toggled via route must NOT freeze savedConnectorDefinition
  await postJson(base, `/plugins/${plug}/connectors/slow/toggle`, { enabled: false })
  await postJson(base, `/plugins/${plug}/connectors/slow/toggle`, { enabled: true })
  assert.equal(install.readMcpToolsState()[`${plug}::slow`]?.savedConnectorDefinition, undefined, 'connector toggle route must match toggleConnector rememberDefinition semantics')

  // /connectors/:c/auth route must include updated plugin detail
  const authRes = await postJson(base, `/plugins/${plug}/connectors/slow/auth`, {
    transport: 'stdio',
    command: process.execPath,
    args: [stdioScript],
    env: {},
  })
  assert.equal(authRes.ok, true, authRes.error)
  assert.equal(authRes.plugin?.name, plug, '/connectors/:c/auth response must include updated plugin detail')
})

test('client UI refreshes pendingConnectors, invalidates stale GLOBAL_MCP_TOOLS_CACHE, and filters placeholders in AddMcpDialog', { timeout: 20000 }, async (t) => {
  const addDialogNode = findAstNode('AddMcpDialog')
  const manageNode = findAstNode('ManagePageContent')
  const removeNode = findAstNode('removePlugin')
  assert.ok(addDialogNode && manageNode && removeNode)

  const addDialogCode = clientSource.slice(addDialogNode.start, addDialogNode.end)
  assert.match(addDialogCode, /hasUnresolvedVarPlaceholder/, 'AddMcpDialog must filter unresolved ${VAR} placeholders in headers and env')
  assert.match(clientSource, /function\s+clearMcpToolsCache\b/, 'client.js must extract shared clearMcpToolsCache helper')

  const req = createRequire(import.meta.url)
  const React = req('react')
  const TestRenderer = req('react-test-renderer')
  const { act } = TestRenderer

  let pluginEnabled = false
  let probeSettled = false
  let stateFetchCount = 0
  let toolsFetchCount = 0
  let toolResponseTools = [{ name: 'fresh_tool_after_save', description: 'Fresh tool' }]

  const mkPlugin = (enabled, connected) => ({
    name: 'exa',
    sourceId: 'anthropic',
    displayName: 'Exa',
    description: 'Search MCP',
    installed: true,
    enabled,
    installedAt: probeSettled ? 2 : 1,
    skills: [],
    commands: [],
    agents: [],
    hooks: [],
    lspServers: [],
    connectors: [{
      name: 'exa',
      type: 'http',
      url: 'https://mcp.exa.ai/mcp',
      oauth: 'none',
      headers: { Authorization: '${API_TOKEN}', 'x-source': 'manifest' },
      configured: true,
      enabled: connected,
      connected,
    }],
  })
  const marketRows = [{
    name: 'exa',
    sourceId: 'anthropic',
    displayName: 'Exa',
    description: 'Search MCP',
    skills: [],
    connectors: [{ name: 'exa', type: 'http', url: 'https://mcp.exa.ai/mcp' }],
  }]

  const savedGlobals = new Map()
  const storage = new Map()
  storage.set('cpm_mcp_tools_cache_v1', JSON.stringify({
    'exa::exa': { tools: [{ name: 'stale_cached_tool', description: 'Stale' }], disabledTools: [] },
    'user-mcp::old-mcp': { tools: [{ name: 'old_mcp_tool', description: 'Old MCP' }], disabledTools: [] },
  }))

  const setTempGlobal = (k, v) => {
    savedGlobals.set(k, Object.prototype.hasOwnProperty.call(globalThis, k) ? globalThis[k] : Symbol.for('__unset__'))
    globalThis[k] = v
  }
  t.after(() => {
    for (const [k, v] of savedGlobals.entries()) {
      if (v === Symbol.for('__unset__')) delete globalThis[k]
      else globalThis[k] = v
    }
  })

  let loadedModule = null
  const mockEl = () => ({
    id: '', textContent: '', style: {}, children: [], classList: { contains: () => false, add() {}, remove() {} },
    setAttribute() {}, getAttribute: () => null, appendChild() {}, removeChild() {}, remove() {},
    contains: () => false, closest: () => null, querySelector: () => null, querySelectorAll: () => [], focus() {},
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 }),
    scrollTop: 0, scrollLeft: 0, scrollWidth: 0, scrollHeight: 0, clientWidth: 1000, clientHeight: 1000, parentElement: null,
  })
  const mockDoc = {
    getElementById: () => null, createElement: mockEl, head: { appendChild() {}, querySelectorAll: () => [] },
    body: mockEl(), documentElement: mockEl(), querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  }
  const mockWin = {
    __ModuleLoader__: { load: (def) => { loadedModule = def } },
    addEventListener() {}, removeEventListener() {},
    getComputedStyle: () => ({ backgroundColor: '', color: '' }),
    matchMedia: () => ({ matches: false }),
    setTimeout, clearTimeout,
  }
  setTempGlobal('window', mockWin)
  setTempGlobal('document', mockDoc)
  setTempGlobal('localStorage', {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)) },
    removeItem: (k) => { storage.delete(k) },
  })
  setTempGlobal('MutationObserver', class { observe() {} disconnect() {} })
  setTempGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  setTempGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  setTempGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0))
  setTempGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
  setTempGlobal('Event', class { constructor(type) { this.type = type } })
  setTempGlobal('Image', class { constructor() { this.onload = null; this.onerror = null } set src(_) {} })
  setTempGlobal('matchMedia', mockWin.matchMedia)
  setTempGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  setTempGlobal('fetch', async (url, opts = {}) => {
    const u = String(url)
    if (u.endsWith('/state')) {
      stateFetchCount += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sources: [{ id: 'anthropic', name: 'Anthropic', url: 'https://example.com/market.git', builtin: true, pluginCount: 1 }],
          plugins: [mkPlugin(pluginEnabled, probeSettled)],
        }),
      }
    }
    if (u.includes('/market?')) return { ok: true, status: 200, json: async () => ({ plugins: marketRows }) }
    if (u.endsWith('/market/refresh')) return { ok: true, status: 200, json: async () => ({ plugins: marketRows }) }
    if (u.endsWith('/mcps')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          mcps: [{
            name: 'old-mcp',
            transport: 'http',
            url: 'https://mcp.old.test/mcp',
            headers: { Authorization: '${API_TOKEN}', 'x-source': 'manifest' },
            env: { SECRET_ENV: '${SECRET_ENV}', MODE: 'prod' },
            enabled: true,
          }],
        }),
      }
    }
    if (u.endsWith('/tool-call-icons')) return { ok: true, status: 200, json: async () => ({ groups: [] }) }
    if (u.includes('/tools')) {
      toolsFetchCount += 1
      return { ok: true, status: 200, json: async () => ({ ok: true, tools: toolResponseTools, disabledTools: [] }) }
    }
    if (u.endsWith('/plugins/exa/toggle')) {
      const body = JSON.parse(opts.body || '{}')
      pluginEnabled = body.enabled !== false
      setTimeout(() => { probeSettled = true }, 60)
      return { ok: true, status: 200, json: async () => ({ ok: true, enabled: pluginEnabled, pendingConnectors: ['exa'], plugin: mkPlugin(pluginEnabled, false) }) }
    }
    if (u.endsWith('/plugins/exa/connectors/exa/auth')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, plugin: mkPlugin(true, true) }) }
    }
    if (u.endsWith('/plugins/anthropic/exa')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, plugin: { ...mkPlugin(pluginEnabled, probeSettled), detail: mkPlugin(pluginEnabled, probeSettled) } }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  })

  new Function(clientSource)()
  const clientExports = loadedModule.factory((id) => (id === 'react' ? React : {}))
  let MainSection = null
  const mockCtx = {
    theme: { getTheme: () => 'dark' },
    effect: () => {},
    slots: {
      inject: (_slot, reg) => reg(),
      register: (meta, comp) => { if (meta?.name === 'main') MainSection = comp },
    },
  }
  clientExports.apply(mockCtx)
  assert.equal(typeof MainSection, 'function')

  let renderer
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(MainSection, { ctx: mockCtx }), {
      createNodeMock: () => mockEl(),
    })
    await new Promise((r) => setTimeout(r, 40))
  })
  try {
    // 1. Open ManagePage for 'exa', toggle ON -> pendingConnectors triggers bounded follow-up poll
    const cards = renderer.root.findAll((node) => node.type === 'div' && node.props.className === 'cpm-card' && typeof node.props.onClick === 'function')
    assert.ok(cards.length >= 1, 'BrowseView must render plugin card')
    await act(async () => {
      cards[0].props.onClick()
      await new Promise((r) => setTimeout(r, 30))
    })

    const initialStateFetches = stateFetchCount
    const manageToggleBtns = renderer.root.findAll((node) => node.type === 'button' && String(node.props.className || '').includes('cpm-toggle'))
    assert.ok(manageToggleBtns.length >= 1, 'ManagePage must render plugin switch')
    await act(async () => {
      await manageToggleBtns[0].props.onClick()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    assert.ok(
      stateFetchCount >= initialStateFetches + 2 && probeSettled,
      `pendingConnectors must trigger bounded follow-up state refresh (state=${stateFetchCount}, initial=${initialStateFetches})`,
    )
    const treeTextAfterPoll = JSON.stringify(renderer.toJSON())
    assert.match(treeTextAfterPoll, /已连接/, 'UI must update automatically to Connected after pendingConnectors poll completes')

    // 2. Open connector auth dialog and Save -> clears stale 'exa::exa' cache and reloads fresh tools
    const connTabBtns = renderer.root.findAll((node) => node.type === 'button' && node.children?.includes?.('Connectors'))
    if (connTabBtns.length > 0) {
      await act(async () => {
        connTabBtns[0].props.onClick()
        await new Promise((r) => setTimeout(r, 20))
      })
    }
    const toolsFetchesBeforeSave = toolsFetchCount
    const gearBtns = renderer.root.findAll((node) => node.type === 'button' && node.props.className === 'cpm-icon-btn')
    assert.ok(gearBtns.length >= 1, 'ManagePage must render connector settings button (.cpm-icon-btn)')
    await act(async () => {
      gearBtns.at(-1).props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: mockEl() })
      await new Promise((r) => setTimeout(r, 20))
    })
    const saveBtns = renderer.root.findAll((node) => node.type === 'button' && node.children?.includes?.('保存并启用'))
    assert.ok(saveBtns.length >= 1, 'ManagePage must open connector auth dialog')
    await act(async () => {
      await saveBtns[0].props.onClick({ stopPropagation() {} })
      await new Promise((r) => setTimeout(r, 50))
    })
    assert.ok(toolsFetchCount > toolsFetchesBeforeSave, 'saving connector auth must trigger fresh tools fetch')
    const cachedAfterSave = JSON.parse(storage.get('cpm_mcp_tools_cache_v1') || '{}')
    assert.equal(
      cachedAfterSave['exa::exa']?.tools?.[0]?.name,
      'fresh_tool_after_save',
      'stale GLOBAL_MCP_TOOLS_CACHE entry must be cleared and replaced after auth Save',
    )

    // 3. Switch to MCP tab, open edit dialog on 'old-mcp' -> placeholders filtered out of inputs
    const backBtns = renderer.root.findAll((node) => node.type === 'button' && node.children?.includes?.('Back'))
    if (backBtns.length > 0) {
      await act(async () => {
        backBtns[0].props.onClick()
        await new Promise((r) => setTimeout(r, 30))
      })
    }
    const mcpTabBtns = renderer.root.findAll((node) => node.type === 'button' && node.findAll((n) => n.children?.includes?.('MCP')).length > 0)
    assert.ok(mcpTabBtns.length >= 1, 'BrowseView must render MCP tab')
    await act(async () => {
      mcpTabBtns[0].props.onClick()
      await new Promise((r) => setTimeout(r, 30))
    })
    const mcpEditBtns = renderer.root.findAll((node) => node.type === 'button' && typeof node.props.onClick === 'function' && String(node.props.title || '').includes('编辑'))
    assert.ok(mcpEditBtns.length >= 1, 'MCP tab must render edit button for standalone MCP')
    await act(async () => {
      mcpEditBtns[0].props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: mockEl() })
      await new Promise((r) => setTimeout(r, 30))
    })
    const inputValues = renderer.root.findAll((node) => node.type === 'input').map((n) => String(n.props.value || ''))
    assert.equal(inputValues.some((v) => v.includes('${API_TOKEN}') || v.includes('${SECRET_ENV}')), false, 'AddMcpDialog must not render unresolved ${VAR} placeholders in inputs')
  } finally {
    await act(async () => {
      renderer?.unmount()
    })
  }
})
