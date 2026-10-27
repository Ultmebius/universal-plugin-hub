import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from 'acorn'

const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = parse(client, { ecmaVersion: 'latest' })
function findBrowseView(node) {
  if (node?.type === 'FunctionDeclaration' && node.id.name === 'BrowseView') return node
  for (const value of Object.values(node || {})) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object') {
        const found = findBrowseView(child)
        if (found) return found
      }
    }
  }
}
// Run the component's render-time sorting, before any effects can run.
const declarations = new Set(['installedSnapshots', 'sortInstalledSnapshot', 'sortTick', 'currentSourceInstalledNames', 'currentSourcePlugins', 'visible'])
const sorting = findBrowseView(ast).body.body
  .filter(node => node.type === 'VariableDeclaration' && node.declarations.some(d => declarations.has(d.id.name || d.id.elements?.[0]?.name)))
  .map(node => client.slice(node.start, node.end)).join('\n')
const rows = {
  anthropic: [{ name: 'activecampaign' }, { name: 'playwright' }, { name: '42crunch' }],
  other: [{ name: 'alpha' }, { name: 'zebra' }],
}
const plugins = [{ sourceId: 'anthropic', name: 'playwright' }, { sourceId: 'other', name: 'zebra' }]
function render({ activeSourceId = 'anthropic', installed = plugins, sortBy = 'default', session = {} } = {}) {
  const context = { state: { plugins: installed }, rows, activeSourceId, sortBy, query: '', SESSION_STORE: session,
    useMemo: fn => fn(), useState: value => [value, () => {}] }
  return Array.from(vm.runInNewContext(sorting + '\nvisible.map(p => p.name)', context))
}

test('opening or reopening the panel puts installed plugins first on the first render', () => {
  assert.deepEqual(render(), ['playwright', '42crunch', 'activecampaign'])
  assert.deepEqual(render({ session: {} }), ['playwright', '42crunch', 'activecampaign'])
})

test('switching sources uses the target installed set immediately', () => {
  const session = {}
  assert.equal(render({ session })[0], 'playwright')
  assert.deepEqual(render({ session, activeSourceId: 'other' }), ['zebra', 'alpha'])
  assert.equal(render({ session })[0], 'playwright')
})

test('install and uninstall updates are reflected in the same render as card state', () => {
  assert.deepEqual(render({ installed: [] }), ['42crunch', 'activecampaign', 'playwright'])
  assert.deepEqual(render({ installed: [...plugins, { sourceId: 'anthropic', name: 'activecampaign' }] }), ['activecampaign', 'playwright', '42crunch'])
})

test('explicit alphabetical sorting still overrides installed-first ordering', () => {
  assert.deepEqual(render({ sortBy: 'name-asc' }), ['42crunch', 'activecampaign', 'playwright'])
  assert.deepEqual(render({ sortBy: 'name-desc' }), ['playwright', 'activecampaign', '42crunch'])
})
