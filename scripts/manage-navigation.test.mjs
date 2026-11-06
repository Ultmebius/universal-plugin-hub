import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from 'acorn'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = parse(source, { ecmaVersion: 'latest' })
const nodes = []
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type) nodes.push(node)
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) walk(child)
}
walk(ast)
const code = node => source.slice(node.start, node.end)
const declaration = name => nodes.find(node => node.type === 'VariableDeclarator' && node.id.name === name)
const func = name => nodes.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
const h = (type, props, ...children) => ({ type, props, children })

test('opening management keeps the shared browser shell and stores it as the source view', () => {
  const store = { view: { type: 'browse', sourceId: 'a' }, activeSourceId: 'a', rows: {},
    state: { sources: [], plugins: [] }, query: '', filter: 'all', sortBy: 'default' }
  const slots = []
  let cursor = 0
  const context = {
    SESSION_STORE: store, isDarkMode: () => false, h, BrowseView: 'browse',
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial } },
    useCallback: callback => callback, useEffect() {},
  }
  vm.runInNewContext(code(func('MarketApp')) + '\nglobalThis.App = MarketApp;', context)
  const render = () => { cursor = 0; return context.App({ ctx: {} }) }
  const browse = tree => tree.children.find(child => child?.type === 'browse')
  let tree = render()
  const record = { name: 'installed', sourceId: 'a' }
  browse(tree).props.openManage(record, null, 'connectors', 'server')
  tree = render()
  assert.equal(browse(tree).props.view.type, 'manage')
  assert.equal(browse(tree).props.view.pluginName, record.name)
  assert.equal(browse(tree).props.view.initialTab, 'connectors')
  assert.equal(browse(tree).props.view.initialConnector, 'server')
  assert.equal(store.sourceViews.a, store.view)
  browse(tree).props.setActiveSourceId('b')
  tree = render()
  assert.equal(browse(tree).props.view.type, 'browse')
  browse(tree).props.setActiveSourceId('a')
  tree = render()
  assert.equal(browse(tree).props.view.type, 'manage')
  assert.equal(browse(tree).props.view.pluginName, 'installed')
  // Management is rendered by BrowseView alongside its existing top bar.
  const manageCall = nodes.find(node => node.type === 'CallExpression' && node.callee.name === 'h' && node.arguments[0]?.name === 'ManagePage')
  assert.ok(manageCall.start > func('BrowseView').start && manageCall.end < func('BrowseView').end)
})

test('normal and grouped installed cards use the same entry for their body and Manage button', () => {
  const cards = nodes.filter(node => node.type === 'CallExpression' && node.callee.name === 'h'
    && node.arguments[0]?.name === 'PluginCard'
    && node.arguments[1]?.properties.some(prop => prop.key.name === 'plugin' && prop.value.name === 'p'))
  assert.equal(cards.length, 2)
  for (const installed of [true, false]) {
    const plugin = { name: 'example' }, record = { name: 'example', sourceId: 'a' }
    const store = {}, opened = []
    const context = { state: { plugins: installed ? [record] : [] }, SESSION_STORE: store,
      gridRef: { current: { scrollTop: 640 } }, activeSourceId: 'a', closePluginHover() {},
      openManage: value => opened.push(['manage', value]), setView: value => opened.push(['view', value]), p: plugin }
    vm.runInNewContext('const ' + code(declaration('openPlugin')) + '; globalThis.open = openPlugin;', context)
    for (const card of cards) {
      const props = card.arguments[1].properties
      const click = props.find(prop => prop.key.name === 'onClick').value
      vm.runInNewContext('(' + code(click) + ')()', context)
      assert.equal(opened.at(-1)[0], installed ? 'manage' : 'view')
      assert.equal(store.scrollTops.a, 640)
      if (installed) {
        assert.equal(opened.at(-1)[1], record)
        let stopped = false
        context.event = { stopPropagation() { stopped = true } }
        const manage = props.find(prop => prop.key.name === 'onManage').value
        vm.runInNewContext('(' + code(manage) + ')(event)', context)
        assert.equal(stopped, true)
        assert.equal(opened.at(-1)[0], 'manage')
        assert.equal(opened.at(-1)[1], record)
      } else assert.equal(opened.at(-1)[1].type, 'detail')
    }
  }
})

test('management opened from MCP returns to MCP with the original source view intact', () => {
  const localOpen = nodes.filter(node => node.type === 'VariableDeclarator' && node.id.name === 'openManage')[1]
  const returnView = { type: 'detail', sourceId: 'a', plugin: { name: 'other' } }
  const record = { name: 'example' }
  let args, mcpVisible = true
  vm.runInNewContext('(' + code(localOpen.init) + ')(record, null, "connectors", "server")', {
    record, mcpsOpen: true, view: returnView,
    setMcpsOpen(value) { mcpVisible = value }, openManageView(...values) { args = values },
  })
  assert.equal(mcpVisible, false)
  assert.equal(args[1], returnView)
  assert.equal(args[2], 'connectors')
  assert.equal(args[4], true)
  const view = { type: 'manage', returnView, returnToMcp: true }
  let next
  vm.runInNewContext('(' + code(declaration('closeManage').init) + ')()', {
    view, SESSION_STORE: { view }, activeSourceId: 'a', setView(value) { next = value },
    setMcpsOpen(value) { mcpVisible = value },
  })
  assert.equal(next, returnView)
  assert.equal(mcpVisible, true)
})

test('installing inside details keeps that page; explicit management renders under the shared shell', () => {
  const record = { name: 'example' }
  const gate = source.split('\n').find(line => line.includes('&& h(DetailView, {')).split('&& h(DetailView, {')[0].trim()
  const manageGate = source.split('\n').find(line => line.includes('&& h(ManagePage, {')).split('&& h(ManagePage, {')[0].trim()
  for (const type of ['detail', 'manage']) {
    const context = { state: { plugins: [record] }, view: { type, pluginName: 'example' }, currentDetailPlugin: { name: 'example' }, mcpsOpen: false }
    vm.runInNewContext('const ' + code(declaration('manageRecord')) + '; globalThis.record = manageRecord;', context)
    assert.equal(context.record, type === 'manage' ? record : null)
    assert.equal(!!vm.runInNewContext(gate, context), type === 'detail')
    assert.equal(!!vm.runInNewContext(manageGate, context), type === 'manage')
    context.mcpsOpen = true
    assert.equal(!!vm.runInNewContext(manageGate, context), false)
  }
  let next
  let view = {}
  vm.runInNewContext('(' + code(declaration('closeManage').init) + ')()', { view, SESSION_STORE: { view }, activeSourceId: 'a', setView: value => { next = value } })
  assert.equal(next.type, 'browse')
  assert.equal(next.sourceId, 'a')
  const returnView = { type: 'detail', sourceId: 'a', plugin: record }
  view = { returnView }
  vm.runInNewContext('(' + code(declaration('closeManage').init) + ')()', { view, SESSION_STORE: { view }, activeSourceId: 'a', setView: value => { next = value } })
  assert.equal(next, returnView, 'explicit Manage from an installation detail page retains its Back destination')
  next = null
  vm.runInNewContext('(' + code(declaration('closeManage').init) + ')()', { view, SESSION_STORE: { view: { type: 'browse', sourceId: 'b' } }, activeSourceId: 'a', setView: value => { next = value } })
  assert.equal(next, null, 'a late removal completion must not navigate away from the new source')
})
