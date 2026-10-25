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
} = await import('../src/install.js')

function writePlugin(name, connector) {
  const dir = installedDir(name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { [connector.name]: connector } }))
}

const exa = { name: 'exa', type: 'http', url: 'https://mcp.exa.ai/mcp', headers: { 'x-exa-source': 'agent-plugin' } }

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
      globalThis.fetch = async () => new Response(JSON.stringify({ result: { tools: [] } }), { status: 200 })
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', exa)).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
      globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Not Acceptable' } }), { status: 406 })
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', exa)).ok, false)
      const [connector] = installedDetails()[0].connectors
      assert.equal(connector.connected, false)
      assert.equal(connector.enabled, true)
    })

    await t.test('success is bound to the exact tested URL and headers', async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ result: { tools: [] } }), { status: 200 })
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
      globalThis.fetch = async () => new Response(JSON.stringify({ result: { tools: [] } }), { status: 200 })
      assert.equal((await verifyConnectorAuth('remote-plugin', 'exa', sse)).ok, true)
      assert.equal(isConnectorActive('remote-plugin', 'exa'), true)
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
