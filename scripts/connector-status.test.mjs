import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const root = mkdtempSync(join(tmpdir(), 'hub-connector-status-'))
const previousHome = process.env.DSH_HOME
const previousFetch = globalThis.fetch
process.env.DSH_HOME = join(root, 'dsh')

const { installedDir, writeState } = await import('../src/store.js')
const {
  isConnectorActive,
  saveConnectorAuth,
  verifyConnectorAuth,
  installedDetails,
  enableConnector,
  fetchConnectorTools,
} = await import('../src/install.js')

function writePlugin(name, connector) {
  const dir = installedDir(name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { [connector.name]: connector } }))
}

const exa = { name: 'exa', type: 'http', url: 'https://mcp.exa.ai/mcp', headers: { 'x-exa-source': 'agent-plugin' } }

function successfulMcpFetch(_url, { body }) {
  const { id, method } = JSON.parse(body)
  if (method === 'notifications/initialized') return Promise.resolve(new Response(null, { status: 202 }))
  const result = method === 'initialize'
    ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } }
    : { tools: [] }
  return Promise.resolve(Response.json({ jsonrpc: '2.0', id, result }))
}

test('remote connector status follows a successful probe of the current config', async (t) => {
  try {
    await t.test('non-empty headers and a saved registration do not imply connected', () => {
      writePlugin('remote-plugin', exa)
      writeState({ sources: [], plugins: [{ name: 'remote-plugin', sourceId: 'local' }] })
      assert.equal(saveConnectorAuth('remote-plugin', 'exa', exa).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), false)
      assert.equal(installedDetails()[0].connectors[0].connected, false)
    })

    await t.test('HTTP 406 after a previous success leaves the row pending verification', async () => {
      globalThis.fetch = successfulMcpFetch
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', exa)).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
      globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Not Acceptable' } }), { status: 406 })
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', exa)).ok, false)
      const [connector] = installedDetails()[0].connectors
      assert.equal(connector.connected, false)
      assert.equal(connector.enabled, true)
    })

    await t.test('success is bound to the exact tested URL and headers', async () => {
      globalThis.fetch = successfulMcpFetch
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', exa)).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
      const changed = { ...exa, url: 'https://mcp.exa.ai/other' }
      saveConnectorAuth('remote-plugin', 'exa', changed)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), false)
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', changed)).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
    })

    await t.test('token and SSE verification match the registered config', async () => {
      const sse = { ...exa, type: 'sse', transport: 'sse', token: 'secret-token' }
      saveConnectorAuth('remote-plugin', 'exa', sse)
      globalThis.fetch = successfulMcpFetch
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', sse)).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
    })

    await t.test('testing a different unsaved endpoint preserves the live connection status', async () => {
      saveConnectorAuth('remote-plugin', 'exa', exa)
      globalThis.fetch = successfulMcpFetch
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', exa)).ok, true)
      const draft = { ...exa, url: 'https://mcp.exa.ai/draft' }
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', draft)).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
      globalThis.fetch = async () => new Response(null, { status: 401 })
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', draft)).ok, false)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
    })

    await t.test('a verified empty tool list is served without running discovery again', async () => {
      globalThis.fetch = successfulMcpFetch
      assert.equal((await enableConnector('remote-plugin', 'exa', exa)).ok, true)
      let probes = 0
      globalThis.fetch = async () => { probes++; throw new Error('unexpected discovery') }
      const result = await fetchConnectorTools('remote-plugin', 'exa')
      assert.equal(result.ok, true)
      assert.deepEqual(result.tools, [])
      assert.equal(probes, 0)
      const refreshed = await fetchConnectorTools('remote-plugin', 'exa', true)
      assert.equal(refreshed.ok, true)
      assert.equal(refreshed.stale, true)
      assert.deepEqual(refreshed.tools, [])
      assert.ok(probes > 0)
    })

    await t.test('a valid stdio command keeps its existing active-state behavior', () => {
      const local = { name: 'local', type: 'stdio', command: 'node', args: ['server.js'] }
      writePlugin('stdio-plugin', local)
      saveConnectorAuth('stdio-plugin', 'local', local)
      assert.equal(isConnectorActive('stdio-plugin', 'local'), true)
    })
  } finally {
    globalThis.fetch = previousFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(root, { recursive: true, force: true })
  }
})

test('an installed record carries the identity the icon chain reads', () => {
  // The browse grid and the "来自插件" connector rows render the plugin from
  // /state's installed records, while its own page merges the marketplace row
  // first. When the record lacked `source`/`homepage`, an icon-less plugin fell
  // back to "author name as a GitHub handle" and showed a stranger's avatar
  // inline while its page showed the real logo.
  //
  // Every test here owns its own DSH_HOME: the previous test's finally already
  // restored (and possibly deleted) the variable, so relying on it would point
  // writeState at the user's real state.json.
  const identityRoot = mkdtempSync(join(tmpdir(), 'hub-identity-'))
  const savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(identityRoot, 'dsh')
  try {
    writePlugin('identity-plugin', exa)
    writeState({
      sources: [{ id: 'src', name: 'Src', url: 'https://example.test/repo' }],
      plugins: [{ name: 'identity-plugin', sourceId: 'src', author: 'Exa' }],
    })
    const record = installedDetails().find((p) => p.name === 'identity-plugin')
    assert.ok(record)
    // Nothing to merge from here, but the fields must exist and be undefined
    // rather than absent, and the record must not invent a GitHub identity.
    assert.equal('source' in record, true)
    assert.equal('homepage' in record, true)
    assert.equal(record.source ?? null, null)
    // An install-time record whose manifest declares no icon still reports the
    // icons object, so the client's fallback chain is reached identically.
    assert.deepEqual(record.icons, { light: [], dark: [], portrait: { light: [], dark: [] } })
  } finally {
    if (savedHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = savedHome
    rmSync(identityRoot, { recursive: true, force: true })
  }
})
