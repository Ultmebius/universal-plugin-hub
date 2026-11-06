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
// Run the component's render-time sorting, before any effects can run. Every
// name below must be found: an extraction that silently matches nothing would
// let the whole file pass while proving nothing.
const REQUIRED = ['sortInstalledNames', 'currentSourceInstalledNames', 'currentSourcePlugins', 'visible']
const browseBody = findBrowseView(ast).body.body
const declared = new Set(browseBody
  .filter(node => node.type === 'VariableDeclaration')
  .flatMap(node => node.declarations.map(d => d.id.name)))
for (const name of REQUIRED) {
  assert.ok(declared.has(name), `BrowseView no longer declares ${name}; update this extraction instead of letting it pass empty`)
}
const COMMIT = browseBody.filter(node => node.type === 'ExpressionStatement'
  && node.expression?.type === 'CallExpression'
  && client.slice(node.start, node.end).includes('SESSION_STORE.browseSortSnapshots'))
assert.equal(COMMIT.length, 1, 'the snapshot commit effect moved; update this test to follow it')
const sorting = browseBody
  .filter(node => (node.type === 'VariableDeclaration'
    && node.declarations.some(d => REQUIRED.includes(d.id.name) || d.id.name === 'sortInstalledSnapshots'))
    || COMMIT.includes(node))
  .map(node => client.slice(node.start, node.end)).join('\n')
const rows = {
  anthropic: [{ name: 'activecampaign' }, { name: 'playwright' }, { name: '42crunch' }],
  other: [{ name: 'alpha' }, { name: 'zebra' }],
}
const plugins = [{ sourceId: 'anthropic', name: 'playwright' }, { sourceId: 'other', name: 'zebra' }]
function render({ activeSourceId = 'anthropic', installed = plugins, sortBy = 'default', session = {} } = {}) {
  const effects = []
  const context = { state: { plugins: installed }, rows, activeSourceId, sortBy, filter: 'all', query: '', SESSION_STORE: session,
    useMemo: fn => fn(), useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) }
  const names = vm.runInNewContext(sorting + '\nvisible.map(p => p.name)', context)
  // Replay the effect commit, exactly as React does after the render.
  for (const effect of effects) effect()
  return Array.from(names)
}

test('a new Hub session puts installed plugins first on its first render', () => {
  assert.deepEqual(render(), ['playwright', '42crunch', 'activecampaign'])
  assert.deepEqual(render({ session: {} }), ['playwright', '42crunch', 'activecampaign'])
})

test('switching sources uses the target installed set immediately', () => {
  const session = {}
  assert.equal(render({ session })[0], 'playwright')
  assert.deepEqual(render({ session, activeSourceId: 'other' }), ['zebra', 'alpha'])
  assert.equal(render({ session })[0], 'playwright')
})

test('a newly opened list orders its current installed set immediately', () => {
  assert.deepEqual(render({ installed: [] }), ['42crunch', 'activecampaign', 'playwright'])
  assert.deepEqual(render({ installed: [...plugins, { sourceId: 'anthropic', name: 'activecampaign' }] }), ['activecampaign', 'playwright', '42crunch'])
})

test('uninstalling a plugin returns it to its place in the current order', () => {
  const session = {}
  // While installed, the plugin is pinned and the rest keep alphabetical order.
  assert.deepEqual(render({ session }), ['playwright', '42crunch', 'activecampaign'])
  // Uninstalled, it is no longer pinned, so it must fall back to the order it
  // would sort into now — not the slot it held while it was still installed.
  assert.deepEqual(render({ session, installed: [] }), ['42crunch', 'activecampaign', 'playwright'])
})

test('a freshly installed plugin does not disturb the remembered order', () => {
  const session = {}
  assert.deepEqual(render({ session }), ['playwright', '42crunch', 'activecampaign'])
  // Installing must keep its existing promise: the new plugin does not jump
  // ahead of the already pinned one, and nothing else moves.
  assert.deepEqual(
    render({ session, installed: [...plugins, { sourceId: 'anthropic', name: 'activecampaign' }] }),
    ['playwright', '42crunch', 'activecampaign'],
  )
})

test('explicit alphabetical sorting still overrides installed-first ordering', () => {
  assert.deepEqual(render({ sortBy: 'name-asc' }), ['42crunch', 'activecampaign', 'playwright'])
  assert.deepEqual(render({ sortBy: 'name-desc' }), ['playwright', 'activecampaign', '42crunch'])
})
