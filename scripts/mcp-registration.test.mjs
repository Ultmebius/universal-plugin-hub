import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const root = mkdtempSync(join(tmpdir(), 'uph-mcp-registration-'))
process.env.DSH_HOME = root
process.env.DSH_PROFILE = 'desktop'
after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5 }))

const { mountRoutes } = await import('../src/routes.js')
const { queryStdioToolsList, cordisPatchPath, readCordisPatch } = await import('../src/install.js')
const { installedDir, readState, sourceCacheDir, writeState } = await import('../src/store.js')
let handler
const scheduled = []
mountRoutes({ register(route) { handler = route.handler } }, null, (ids) => {
  scheduled.push(ids)
  return { token: 'apply-fixture' }
})

async function call(method, path, body) {
  const req = {
    url: `/universal-plugin-hub/api${path}`,
    method,
    headers: { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' },
    on(event, callback) {
      if (event === 'data' && body !== undefined) callback(JSON.stringify(body))
      if (event === 'end') callback()
    },
  }
  const res = { writeHead(status) { this.status = status }, end(payload) { this.body = JSON.parse(payload) } }
  await handler(req, res)
  return res
}

const fixture = fileURLToPath(new URL('./fixtures/paged-stdio-server.mjs', import.meta.url))
const local = { transport: 'stdio', command: process.execPath, args: [fixture, 'empty'] }

async function remoteFixture(t, headerName = 'authorization') {
  let credential = 'Bearer fixture'
  let requests = 0
  const http = createServer(async (req, res) => {
    requests++
    if (req.url === '/html') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>sign in</html>')
      return
    }
    if (req.url === '/hang') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{')
      return
    }
    if (req.headers[headerName] !== credential) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end()
      return
    }
    const server = new Server({ name: 'fixture', version: '1' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => {
      if (req.url === '/list-error') throw new Error('fixture cannot list tools')
      return params?.cursor
        ? { tools: [{ name: 'second', inputSchema: { type: 'object' } }] }
        : { tools: [{ name: 'first', inputSchema: { type: 'object' } }], nextCursor: 'page-2' }
    })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => void server.close())
    await server.connect(transport)
    await transport.handleRequest(req, res)
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => http.close(resolve)))
  return {
    url: `http://127.0.0.1:${http.address().port}`,
    headers: { [headerName === 'authorization' ? 'Authorization' : headerName]: credential },
    get requests() { return requests },
    rotate() { credential = 'Bearer rotated' },
  }
}

test('save and enable rejects missing credentials, invalid protocols and failed tool listing', async (t) => {
  const remote = await remoteFixture(t)
  const cases = [
    { name: 'no-header', transport: 'http', url: remote.url },
    { name: 'html', transport: 'http', url: remote.url + '/html' },
    { name: 'remote-list-error', transport: 'http', url: remote.url + '/list-error', headers: remote.headers },
    { ...local, name: 'stdio-list-error', args: [fixture, 'list-error'] },
  ]
  for (const payload of cases) {
    await t.test(payload.name, async () => {
      assert.equal((await call('POST', '/mcps/verify', payload)).body.ok, false)
      const scheduledBefore = scheduled.length
      const response = await call('POST', '/mcps', payload)
      assert.equal(response.body.ok, false)
      assert.ok(response.body.error)
      assert.equal(scheduled.length, scheduledBefore)
      const listed = await call('GET', '/mcps')
      assert.equal(listed.body.mcps.some(server => server.name === payload.name && server.enabled), false)
    })
  }
})

test('standalone tool discovery never contacts a disabled server', async (t) => {
  const remote = await remoteFixture(t)
  const name = 'disabled-discovery'
  const path = `/mcps/${name}/tools`
  assert.equal((await call('POST', '/mcps', { name, transport: 'http', url: remote.url, headers: remote.headers })).body.ok, true)
  assert.equal((await call('POST', '/mcps/toggle', { name, enabled: false })).body.ok, true)
  const before = remote.requests
  for (const suffix of ['?fresh=1', '']) {
    const { body } = await call('GET', path + suffix)
    assert.equal(remote.requests, before, 'discovery must use only saved tool metadata')
    assert.equal(body.ok, true)
    assert.deepEqual(body.tools.map(tool => tool.name), ['first', 'second'])
  }
  const empty = await call('GET', '/mcps/unknown-server/tools?fresh=1')
  assert.equal(empty.body.ok, false)
  assert.deepEqual(empty.body.tools, [])
  assert.equal((await call('POST', '/mcps/toggle', { name, enabled: true })).body.ok, true)
  assert.ok(remote.requests > before, 'explicit enable must still probe')
})

test('standalone Headers survive disable and enable; a failed edit or re-enable leaves the previous state intact', async (t) => {
  const remote = await remoteFixture(t)
  const name = 'standalone-auth'
  const payload = { name, transport: 'http', url: remote.url, headers: remote.headers }
  const lookup = async () => (await call('GET', '/mcps')).body.mcps.find(server => server.name === name)
  assert.equal((await call('POST', '/mcps', payload)).body.ok, true)
  const tools = await call('GET', `/mcps/${name}/tools?fresh=1`)
  assert.deepEqual(tools.body.tools.map(tool => tool.name), ['first', 'second'])
  const failedEdit = await call('POST', '/mcps/update', { ...payload, headers: {} })
  assert.equal(failedEdit.body.ok, false)
  assert.deepEqual((await lookup()).headers, remote.headers)
  await call('POST', '/mcps/toggle', { name, enabled: false })
  assert.deepEqual((await lookup()).headers, remote.headers)
  assert.equal((await call('POST', '/mcps/toggle', { name, enabled: true })).body.ok, true)
  remote.rotate()
  const stale = await call('GET', `/mcps/${name}/tools?fresh=1`)
  assert.equal(stale.body.stale, true)
  assert.match(stale.body.message, /401/)
  assert.deepEqual(stale.body.tools.map(tool => tool.name), ['first', 'second'])
  await call('POST', '/mcps/toggle', { name, enabled: false })
  const before = scheduled.length
  assert.equal((await call('POST', '/mcps/toggle', { name, enabled: true })).body.ok, false)
  assert.equal(scheduled.length, before)
  assert.equal((await lookup()).enabled, false)
  assert.deepEqual((await lookup()).headers, remote.headers)
  assert.equal((await call('POST', '/mcps/update', { ...payload, enable: true })).body.ok, false)
  assert.equal((await lookup()).enabled, false)
  const newHeaders = { Authorization: 'Bearer rotated' }
  assert.equal((await call('POST', '/mcps/update', { ...payload, headers: newHeaders, enable: true })).body.ok, true)
  assert.deepEqual((await lookup()).headers, newHeaders)
  assert.equal((await call('DELETE', `/mcps/${name}`)).body.ok, true)
  assert.equal(await lookup(), undefined)
  assert.equal((await call('POST', '/mcps', { name, transport: 'http', url: remote.url })).body.ok, false)
})

test('HTTP initialization timeout covers a response body that never finishes', async (t) => {
  const remote = await remoteFixture(t)
  const timeout = AbortSignal.timeout
  t.mock.method(AbortSignal, 'timeout', (ms) => timeout(ms === 8000 ? 200 : ms))
  const result = await call('POST', '/mcps', { name: 'hang', transport: 'http', url: remote.url + '/hang' })
  assert.equal(result.body.ok, false)
  assert.match(result.body.error, /超时/)
})

test('plugin-owned Headers survive disable and re-enable and still appear in the editor', async (t) => {
  const remote = await remoteFixture(t)
  const owner = 'fixture-plugin'
  const name = 'github'
  const base = `/plugins/${owner}/connectors/${name}`
  const plugin = installedDir(owner)
  mkdirSync(plugin, { recursive: true })
  writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { [name]: { type: 'http', url: remote.url } } }))
  const state = readState()
  writeState({ ...state, plugins: [...state.plugins, { name: owner, sourceId: 'fixture', enabled: true }] })
  const { installedDetails } = await import('../src/install.js')
  const lookup = () => installedDetails().find(item => item.name === owner).connectors[0]
  const payload = { transport: 'http', url: remote.url, headers: remote.headers }
  assert.equal((await call('POST', base + '/auth', { ...payload, headers: {} })).body.ok, false)
  assert.equal(lookup().enabled, false)
  assert.equal((await call('POST', base + '/auth', payload)).body.ok, true)
  assert.equal(lookup().connected, true)
  await call('POST', base + '/toggle', { enabled: false })
  assert.equal(lookup().enabled, false)
  assert.deepEqual(lookup().headers, remote.headers)
  const restored = await call('POST', base + '/toggle', { enabled: true })
  assert.equal(restored.body.ok, true, restored.body.error)
  assert.equal(lookup().connected, true)
  await call('POST', `/plugins/${owner}/toggle`, { enabled: false })
  assert.deepEqual(lookup().headers, remote.headers)
  await call('POST', `/plugins/${owner}/toggle`, { enabled: true })
  assert.equal(lookup().connected, true)
  assert.deepEqual(lookup().headers, remote.headers)
  await call('POST', base + '/toggle', { enabled: false })
  remote.rotate()
  const failed = await call('POST', base + '/toggle', { enabled: true })
  assert.equal(failed.body.ok, false)
  assert.equal(lookup().enabled, false)
  assert.deepEqual(lookup().headers, remote.headers)
  assert.equal((await call('DELETE', `/plugins/${owner}`)).body.ok, true)
  mkdirSync(plugin, { recursive: true })
  writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { [name]: { type: 'http', url: remote.url } } }))
  const afterDelete = readState()
  writeState({ ...afterDelete, plugins: [...afterDelete.plugins, { name: owner, sourceId: 'fixture', enabled: true }] })
  assert.deepEqual(lookup().headers || {}, {})
  assert.equal(lookup().enabled, false)
})

test('plain HTTP remains verified when an OAuth form submits previous client fields', async (t) => {
  const remote = await remoteFixture(t)
  const owner = 'plain-after-oauth'
  const name = 'remote'
  const plugin = installedDir(owner)
  mkdirSync(plugin, { recursive: true })
  writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { [name]: { type: 'http', url: remote.url } } }))
  const state = readState()
  writeState({ ...state, plugins: [...state.plugins, { name: owner, sourceId: 'fixture', enabled: true }] })
  const response = await call('POST', `/plugins/${owner}/connectors/${name}/auth`, {
    transport: 'http', url: remote.url, headers: remote.headers, oauth: 'none',
    oauthClientId: 'previous-client', oauthScope: 'tools:read', oauthCallbackPort: 8765,
  })
  assert.equal(response.body.ok, true, response.body.error)
  const { installedDetails } = await import('../src/install.js')
  assert.equal(installedDetails().find(item => item.name === owner).connectors[0].connected, true)
})

test('install probes declared connectors before activating them', async (t) => {
  const remote = await remoteFixture(t, 'x-fixture')
  const sourceId = 'local'
  const owner = 'auto-connect'
  const dir = join(sourceCacheDir(sourceId), owner)
  mkdirSync(join(dir, '.codex-plugin'), { recursive: true })
  writeFileSync(join(dir, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: owner }))
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: {
    working: { type: 'http', url: remote.url, headers: remote.headers },
    broken: { type: 'http', url: remote.url + '/list-error', headers: remote.headers },
  } }))
  const state = readState()
  writeState({ ...state, sources: [...state.sources, { id: sourceId, name: 'Local Test', url: 'local://' }] })
  const installed = await call('POST', '/plugins/install', { sourceId, pluginName: owner })
  assert.equal(installed.body.ok, true, installed.body.error)
  const { getConnectorEntry } = await import('../src/install.js')
  for (let attempt = 0; attempt < 100 && !getConnectorEntry(owner, 'working'); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(getConnectorEntry(owner, 'working'))
  assert.equal(getConnectorEntry(owner, 'broken') == null, true)
})

test('stdio verification rejects a command that cannot start', async () => {
  const response = await call('POST', '/mcps/verify', { ...local, name: 'missing', command: join(root, 'missing-executable') })
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, false)
  assert.match(response.body.message, /ENOENT|无法启动/)
})

test('stdio verification distinguishes an empty tool list from a protocol failure', async () => {
  for (const mode of ['empty', 'no-tools']) {
    const empty = await call('POST', '/mcps/verify', { ...local, name: mode, args: [fixture, mode] })
    assert.equal(empty.body.ok, true, empty.body.message)
  }
  const failed = await call('POST', '/mcps/verify', { ...local, name: 'list-error', args: [fixture, 'list-error'] })
  assert.equal(failed.body.ok, false)
  assert.match(failed.body.message, /Fixture tools unavailable/)
})

test('stdio discovery returns all pages and preserves arguments, env and tool metadata', async () => {
  const result = await queryStdioToolsList(process.execPath, [fixture, 'paged', 'an argument with spaces'], { UPH_TEST_STDIO_VALUE: 'explicit env' })
  assert.equal(result.error, null)
  assert.deepEqual(result.tools.map((tool) => tool.name), ['first', 'second'])
  assert.equal(result.tools[0].description, 'an argument with spaces / explicit env')
})

test('stdio discovery preserves startup stderr and uses separate startup and tools deadlines', async (t) => {
  const exited = await queryStdioToolsList(process.execPath, [fixture, 'exit'])
  assert.match(exited.error, /Fixture startup failed/)

  const timeout = AbortSignal.timeout
  const requested = []
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    requested.push(ms)
    return timeout(ms === 180000 ? 2000 : 250)
  })
  const startup = await queryStdioToolsList(process.execPath, [fixture, 'hang-start'])
  assert.match(startup.error, /启动超时（180 秒）/)
  const listing = await queryStdioToolsList(process.execPath, [fixture, 'hang-list'])
  assert.match(listing.error, /工具解析超时（60 秒）/)
  assert.deepEqual(requested, [180000, 180000, 60000])
})

test('Windows command shims work in draft verification and after saving', { skip: process.platform !== 'win32' }, async () => {
  const bin = join(root, 'wrapper directory')
  mkdirSync(bin)
  const shim = join(bin, 'uph-fixture.cmd')
  writeFileSync(shim, `@echo off\r\n"${process.execPath}" %*\r\n`)
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path')
  const payload = {
    ...local,
    name: 'windows-shim',
    command: 'uph-fixture',
    args: [fixture, 'paged', 'an argument with spaces'],
    env: { PATH: `${bin};${process.env[pathKey]}`, UPH_TEST_STDIO_VALUE: 'explicit env' },
  }
  const verification = await call('POST', '/mcps/verify', payload)
  assert.equal(verification.body.ok, true, verification.body.message)
  const added = await call('POST', '/mcps', payload)
  assert.equal(added.body.ok, true, added.body.error)
  const listed = await call('GET', '/mcps/windows-shim/tools?fresh=1')
  assert.equal(listed.body.ok, true, listed.body.message)
  assert.deepEqual(listed.body.tools.map((tool) => tool.name), ['first', 'second'])
  assert.equal(listed.body.tools[0].description, 'an argument with spaces / explicit env')
  const absolute = await queryStdioToolsList(shim, [fixture, 'empty'])
  assert.deepEqual(absolute, { tools: [], error: null })
})

test('MCP registration preserves files it cannot safely rewrite', async (t) => {
  const cases = {
    'DSH tag': '# user config\r\n- id: sandbox-policy\r\n  config:\r\n    workspaceRoot: !!js process.cwd()\r\n- id: ui-theme\r\n',
    'malformed YAML': '- id: [\n',
    'mapping at root': 'id: ui-theme\n',
    'explicit null at root': 'null\n',
  }
  const patch = cordisPatchPath()
  mkdirSync(dirname(patch), { recursive: true })
  for (const [label, contents] of Object.entries(cases)) {
    await t.test(label, async () => {
      const before = Buffer.from(contents)
      writeFileSync(patch, before)
      const scheduledBefore = scheduled.length
      const response = await call('POST', '/mcps', { ...local, name: 'blocked-write' })
      assert.ok(readFileSync(patch).equals(before), 'original file must be preserved byte for byte')
      assert.equal(response.status, 500)
      assert.match(response.body.error, /已中止写入/)
      assert.equal(scheduled.length, scheduledBefore)
      const listed = await call('GET', '/mcps')
      assert.ok(listed.body.mcps.every((server) => server.name !== 'blocked-write'))
    })
  }
})

test('MCP registration supports missing and empty patches and preserves existing valid entries', async (t) => {
  const cases = { missing: null, empty: '', whitespace: ' \t\r\n', comments: '# comment only\r\n  # another', list: '- id: ui-theme\n  config:\n    fontSize: 16\n' }
  const patch = cordisPatchPath()
  for (const [label, contents] of Object.entries(cases)) {
    await t.test(label, async () => {
      if (contents === null) rmSync(patch, { force: true })
      else writeFileSync(patch, contents)
      const response = await call('POST', '/mcps', { ...local, name: `valid-${label}` })
      assert.equal(response.status, 200, response.body.error)
      assert.equal(response.body.ok, true)
      const entries = readCordisPatch()
      assert.ok(entries.some((block) => block.insert?.some((item) => item.id === `mcp-user-mcp-valid-${label}`)))
      if (label === 'list') assert.deepEqual(entries[0], { id: 'ui-theme', config: { fontSize: 16 } })
    })
  }
})
