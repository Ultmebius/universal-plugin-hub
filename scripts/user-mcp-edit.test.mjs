import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse } from 'acorn'

const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

const root = mkdtempSync(join(tmpdir(), 'hub-user-mcp-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = join(root, 'dsh')

const { mountRoutes } = await import('../src/routes.js')
const { readCordisPatch } = await import('../src/install.js')
const { oauthCredentialPath } = await import('../src/oauth-store.js')
const { oauthCredentialKey } = await import('../src/oauth-config.js')

let handler
mountRoutes({ register(route) { handler = route.handler } })

async function call(method, path, body) {
  const chunks = body === undefined ? [] : [JSON.stringify(body)]
  const req = {
    url: `/universal-plugin-hub/api${path}`,
    method,
    headers: { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' },
    on(event, cb) {
      if (event === 'data') chunks.forEach((chunk) => cb(chunk))
      if (event === 'end') cb()
    },
  }
  const res = { writeHead(status) { this.status = status }, end(payload) { this.body = JSON.parse(payload) } }
  await handler(req, res)
  return { status: res.status, body: res.body }
}

const stdio = {
  name: 'computer-use',
  transport: 'stdio',
  command: 'node',
  args: ['G:/CODE/server.js'],
  env: { A: '1' },
  headers: {},
  oauth: 'none',
}

test('user-added MCP servers: create, rename, delete', async (t) => {
  try {
    await t.test('a server can be renamed and its registration id moves with it', async () => {
      assert.equal((await call('POST', '/mcps', stdio)).body.ok, true)
      const renamed = await call('POST', '/mcps/update', { ...stdio, name: 'computer-use-2', previousName: 'computer-use' })
      assert.deepEqual(renamed.body, { ok: true, name: 'computer-use-2', previousName: 'computer-use' })
      const list = (await call('GET', '/mcps')).body.mcps
      assert.deepEqual(list.map((m) => m.name), ['computer-use-2'])
      const ids = readCordisPatch().flatMap((b) => b?.insert || []).map((i) => i.id)
      assert.deepEqual(ids, ['mcp-user-mcp-computer-use-2'])
    })

    await t.test('a rename onto an existing name is refused', async () => {
      await call('POST', '/mcps', { ...stdio, name: 'taken' })
      const clash = await call('POST', '/mcps/update', { ...stdio, name: 'taken', previousName: 'computer-use-2' })
      assert.match(String(clash.body.error), /已存在同名 MCP/)
      // Both servers survive: a failed rename must not consume either name.
      const names = (await call('GET', '/mcps')).body.mcps.map((m) => m.name).sort()
      assert.deepEqual(names, ['computer-use-2', 'taken'])
    })

    await t.test('delete removes the definition, the registration and the OAuth record', async () => {
      const url = 'https://mcp.example.com/mcp'
      await call('POST', '/mcps', { name: 'remote', transport: 'http', url, headers: {}, oauth: 'auto_register', args: [], env: {} })
      // Stand in for a finished sign-in: the file a delete must not leave behind.
      const key = oauthCredentialKey('user-mcp', 'remote', url, 'auto_register')
      const credentialFile = oauthCredentialPath(key)
      mkdirSync(dirname(credentialFile), { recursive: true })
      writeFileSync(credentialFile, JSON.stringify({ tokens: { access_token: 'x' } }))
      assert.equal(existsSync(credentialFile), true)

      const deleted = await call('DELETE', '/mcps/remote')
      assert.equal(existsSync(credentialFile), false, 'saved credentials outlived the server')
      assert.deepEqual(deleted.body, { ok: true, name: 'remote' })
      const names = (await call('GET', '/mcps')).body.mcps.map((m) => m.name).sort()
      assert.deepEqual(names, ['computer-use-2', 'taken'])
      const ids = readCordisPatch().flatMap((b) => b?.insert || []).map((i) => i.id)
      assert.ok(!ids.some((id) => id.includes('remote')))
    })

    await t.test('deleting twice reports the server is gone rather than succeeding silently', async () => {
      assert.equal((await call('DELETE', '/mcps/remote')).body.ok, undefined)
      assert.match(String((await call('DELETE', '/mcps/remote')).body.error), /MCP 不存在/)
    })

    await t.test('per-tool state is cleared with the server', async () => {
      const { readMcpToolsState, setToolDisabled } = await import('../src/install.js')
      setToolDisabled('user-mcp', 'taken', 'someTool', true)
      assert.deepEqual(readMcpToolsState()['user-mcp::taken'].disabledTools, ['someTool'])
      await call('DELETE', '/mcps/taken')
      assert.equal(readMcpToolsState()['user-mcp::taken'], undefined)
    })
  } finally {
    process.env.DSH_HOME = previousHome
  }
})

test('only user-added servers expose rename and delete in the editor', () => {
  const ast = parse(client, { ecmaVersion: 'latest' })
  function findFunction(node, name) {
    if (node?.type === 'FunctionDeclaration' && node.id?.name === name) return node
    for (const value of Object.values(node || {})) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child === 'object') {
          const found = findFunction(child, name)
          if (found) return found
        }
      }
    }
  }
  const dialog = findFunction(ast, 'AddMcpDialog')
  assert.ok(dialog)

  // Name input: the disabled flag must depend on `owner` (plugin connector),
  // never on `initial` — that was the bug where a user's own server could not
  // be renamed after it had been saved once.
  let nameInputDisabled = null
  let deleteButton = null
  ;(function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression' && node.callee?.name === 'h' && node.arguments?.[0]?.type === 'Literal') {
      const props = node.arguments[1]?.type === 'ObjectExpression' ? node.arguments[1] : null
      if (props) {
        const get = (name) => props.properties.find(p => p.key?.name === name)?.value
        const className = get('className')
        const classSource = className ? client.slice(className.start, className.end) : ''
        if (classSource.includes('cpm-mcp-input') && get('placeholder')?.value?.includes('mcp-name')) {
          nameInputDisabled = client.slice(get('disabled').start, get('disabled').end)
        }
        if (classSource.includes('cpm-mcp-footer-del')) deleteButton = props
      }
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) walk(child)
    }
  })(dialog)

  assert.ok(nameInputDisabled, 'name input not found in AddMcpDialog')
  assert.match(nameInputDisabled, /\bowner\b/)
  assert.ok(!/\binitial\b/.test(nameInputDisabled), 'a saved user server must stay renameable')

  assert.ok(deleteButton, 'delete control not found in the editor footer')
  assert.equal(deleteButton.properties.find(p => p.key?.name === 'type')?.value?.value, 'button')
  assert.match(client.slice(deleteButton.properties.find(p => p.key?.name === 'className').value.start,
    deleteButton.properties.find(p => p.key?.name === 'className').value.end), /cpm-mcp-footer-del/)

  // The delete call targets the user-MCP route, not the plugin connector route.
  assert.match(client, /api\(`\/mcps\/\$\{encodeURIComponent\(initial\.name\)\}`, \{ method: "DELETE" \}\)/)
  assert.match(client, /\.cpm-mcp-footer-del:hover/)
  assert.match(client, /prefers-reduced-motion[\s\S]{0,600}cpm-del-lid/)
})

test('the delete control reads as a button at rest and animates as two parts', () => {
  const css = client.slice(client.indexOf('const CSS = `'), client.indexOf('\n`;'))
  // Anchor to the start of a line and require the newline before the brace, so
  // the reduced-motion overrides earlier in the file (same selectors, nested in
  // a media block) cannot be mistaken for the rules under test.
  const rule = (selector) => {
    const pattern = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm')
    const at = css.search(pattern)
    assert.ok(at >= 0, `missing rule: ${selector}`)
    return css.slice(at, css.indexOf('}', at))
  }

  // Continuous curvature: corner-shape carries the corner past the arc into the
  // straight edge. It is progressive enhancement, so the radius must stay as
  // the fallback for browsers without it.
  const base = rule('.cpm-mcp-footer-del')
  assert.match(base, /corner-shape:\s*squircle/)
  assert.match(base, /border-radius:\s*var\(--del-radius\)/)

  // The surface is present before hover, not only on it — that was the
  // reported "未选中状态也要有这个背景".
  assert.match(base, /background:\s*rgba\(0, 0, 0, 0\.045\)/)
  assert.match(rule('.cpm-dark .cpm-mcp-footer-del'), /background:\s*rgba\(255, 255, 255, 0\.055\)/)

  // Lid and can move independently: a translate/rotate on the lid group and a
  // counter-rotate on the body group, both origin-anchored so they pivot
  // rather than drift.
  assert.match(rule('.cpm-mcp-footer-del .cpm-del-lid'), /transform-origin: 12px 6px/)
  assert.match(rule('.cpm-mcp-footer-del .cpm-del-lid'), /translate: 0px 0px/)
  assert.match(rule('.cpm-mcp-footer-del:hover .cpm-del-lid'), /rotate: -9deg/)
  assert.match(rule('.cpm-mcp-footer-del:hover .cpm-del-lid'), /translate: 0px -1\.7px/)
  assert.match(rule('.cpm-mcp-footer-del:hover .cpm-del-body'), /rotate: 3\.5deg/)
  // Press settles rather than repeating the hover pose from zero.
  assert.match(rule('.cpm-mcp-footer-del:active .cpm-del-lid'), /rotate: -5deg/)

  // Both groups exist in the markup, or the CSS above animates nothing.
  assert.match(client, /className: "cpm-del-lid"/)
  assert.match(client, /className: "cpm-del-body"/)
})
