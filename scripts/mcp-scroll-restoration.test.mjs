import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from 'acorn'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = parse(source, { ecmaVersion: 'latest' })
let mcpClick
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'ObjectExpression' && node.properties.some(p => p.key?.name === 'key' && p.value?.value === '__mcps')) {
    mcpClick = node.properties.find(p => p.key?.name === 'onClick').value
  }
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) walk(child)
}
walk(ast)

test('MCP preserves plugin and Skill detail views when returning to the same or another source', () => {
  const start = source.indexOf('const switchSource = useCallback(')
  const end = source.indexOf('const setQuery = useCallback(', start)
  for (const type of ['detail', 'skill-detail']) {
    const saved = { type, sourceId: 'a', plugin: { name: 'example' }, skill: { id: 'skill' } }
    const store = { activeSourceId: 'a', view: saved, sourceViews: { a: saved } }
    const context = { SESSION_STORE: store, activeSourceId: 'a', isSourceBrowse: false,
      gridRef: { current: null }, stopScrollTopAnim() {}, refreshMcps() {},
      setMcpsOpen(value) { store.mcpsOpen = value },
      setView(value) { store.view = value; store.sourceViews.a = value },
      useCallback: callback => callback, setActiveSourceIdRaw() {}, setFilterRaw() {}, setViewRaw() {},
    }
    vm.runInNewContext('(' + source.slice(mcpClick.start, mcpClick.end) + ')()', context)
    assert.equal(store.mcpsOpen, true)
    assert.equal(store.view, saved, 'opening MCP must not replace the source detail view with browse')
    assert.equal(store.sourceViews.a, saved)
    vm.runInNewContext(source.slice(start, end) + '\nswitchSource("b"); switchSource("a");', context)
    assert.equal(store.view, saved, 'switching via another source must preserve the original detail page')
  }
})

test('MCP displays its own list while the saved plugin detail remains hidden', () => {
  const start = source.indexOf('const isBrowse = ')
  const end = source.indexOf(';', start)
  const expression = source.slice(start + 'const isBrowse = '.length, end)
  const pluginGate = source.split('\n').find(line => line.includes('&& h(DetailView, {')).split('&& h(DetailView, {')[0].trim()
  const skillGate = source.split('\n').find(line => line.includes('view.type === "skill-detail" && (() => {')).split('&& (() => {')[0].trim()
  for (const type of ['detail', 'skill-detail']) {
    for (const mcpsOpen of [true, false]) {
      const context = { mcpsOpen, view: { type }, currentDetailPlugin: {}, manageRecord: null }
      assert.equal(vm.runInNewContext(expression, context), mcpsOpen)
      assert.equal(!!vm.runInNewContext(pluginGate, context), !mcpsOpen && type === 'detail')
      assert.equal(!!vm.runInNewContext(skillGate, context), !mcpsOpen && type === 'skill-detail')
    }
  }
})

test('opening MCP saves the source position before replacing its scroll container', () => {
  const store = {}, gridRef = { current: { scrollTop: 560 } }
  let opened = false, stopped = false
  const context = { SESSION_STORE: store, gridRef, activeSourceId: 'a', isSourceBrowse: true,
    stopScrollTopAnim() { stopped = true }, setMcpsOpen() { opened = true }, refreshMcps() {}, setView() {} }
  vm.runInNewContext('(' + source.slice(mcpClick.start, mcpClick.end) + ')()', context)
  assert.equal(store.scrollTops.a, 560)
  assert.equal(opened && stopped, true)
  context.isSourceBrowse = false
  gridRef.current.scrollTop = 30
  vm.runInNewContext('(' + source.slice(mcpClick.start, mcpClick.end) + ')()', context)
  assert.equal(store.scrollTops.a, 560, 're-clicking MCP must not save its position as the source position')
})

function clickSource(mcpsOpen, target) {
  const start = source.indexOf('// Normal click action')
  const end = source.indexOf('\n\t\t}, [state.sources', start)
  assert.ok(start > 0 && end > start)
  const store = { scrollTops: { a: 560, b: 920 } }
  let reset = false, selected
  vm.runInNewContext(source.slice(start, end), {
    mcpsOpen, s: { id: target }, activeSourceId: 'a', view: { type: 'browse' }, filter: 'all',
    isLongPressTriggeredRef: { current: false }, state: { plugins: [] }, SESSION_STORE: store,
    gridRef: { current: { scrollTop: 30 } }, setActiveSourceId(id) { selected = id },
    scrollActiveTabIntoView() {}, scrollContentToTop() { reset = true },
  })
  return { store, reset, selected }
}

test('returning from MCP to the same source preserves its position; clicking the active source still returns to top', () => {
  const returned = clickSource(true, 'a')
  assert.equal(returned.reset, false)
  assert.equal(returned.store.scrollTops.a, 560)
  const repeated = clickSource(false, 'a')
  assert.equal(repeated.reset, true)
  assert.equal(repeated.store.scrollTops.a, 0)
})

test('switching from MCP to another source cannot overwrite the previous source with MCP scrollTop', () => {
  const returned = clickSource(true, 'b')
  assert.equal(returned.selected, 'b')
  assert.equal(returned.store.scrollTops.a, 560)
  assert.equal(returned.store.scrollTops.b, 920)
  assert.equal(clickSource(false, 'b').store.scrollTops.a, 30, 'ordinary source switching still saves the outgoing position')
})

test('source scroll restoration runs on leaving MCP and never writes into the MCP container', () => {
  const start = source.indexOf('const pendingScrollTopRef = useRef(null);')
  const end = source.indexOf('useEffect(() => {\n\t\t\tconst onDocClick', start)
  assert.ok(start > 0 && end > start)
  const refs = [], hooks = [], frames = new Map()
  const store = { scrollTops: { a: 560, b: 920 } }
  const gridRef = { current: { scrollTop: 0 } }
  let cursor = 0, frameId = 0, work
  const effect = (callback, deps) => {
    const index = cursor++, previous = hooks[index]
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      work.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: callback() } })
    }
  }
  const render = (activeSourceId, isSourceBrowse) => {
    cursor = 0; work = []
    vm.runInNewContext(source.slice(start, end), {
      activeSourceId, isSourceBrowse, filter: 'all', sortBy: 'default', SESSION_STORE: store, gridRef,
      useRef(initial) { const i = cursor++; return refs[i] ||= { current: initial } },
      useSafeLayoutEffect: effect, useEffect: effect,
      stopScrollTopAnim() {}, updateGridMask,
      requestAnimationFrame(callback) { const id = ++frameId; frames.set(id, callback); return id },
      cancelAnimationFrame(id) { frames.delete(id) },
    })
    work.forEach(callback => callback())
  }
  function updateGridMask() {}
  render('a', true)
  assert.equal(gridRef.current.scrollTop, 560)
  gridRef.current = { scrollTop: 30 }
  render('a', false)
  assert.equal(frames.size, 0, 'entering MCP cancels the pending source restore frame')
  assert.equal(gridRef.current.scrollTop, 30)
  gridRef.current = { scrollTop: 0 }
  render('a', true)
  assert.equal(gridRef.current.scrollTop, 560, 'returning to the same source restores before paint')
  render('a', false)
  gridRef.current = { scrollTop: 50 }
  render('b', false)
  assert.equal(gridRef.current.scrollTop, 50)
  gridRef.current = { scrollTop: 0 }
  render('b', true)
  assert.equal(gridRef.current.scrollTop, 920, 'returning to a different source uses its own position')
})
