import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { parse } from 'acorn'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const nodes = []
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type) nodes.push(node)
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) walk(child)
}
walk(parse(source, { ecmaVersion: 'latest' }))
const code = node => source.slice(node.start, node.end)
const func = name => nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name)

test('detail reading position survives remount and waits for asynchronous content', async () => {
  const page = {}, listeners = new Map()
  let height = 2400, top = 0
  const observers = new Set()
  const scroller = { clientHeight: 400, children: [], get scrollHeight() { return height },
    get scrollTop() { return top }, set scrollTop(value) { top = Math.min(value, Math.max(0, height - 400)) },
    addEventListener(type, fn) { listeners.set(type, fn) }, removeEventListener(type) { listeners.delete(type) } }
  const context = { ...React, ResizeObserver: class { constructor(fn) { this.fn = fn; observers.add(fn) } observe() {} disconnect() { observers.delete(this.fn) } } }
  const remember = func('useRememberedDetailScroll')
  vm.runInNewContext((remember ? code(remember) : '') + '\n' + code(func('useDetailScrollMask')) + '\nglobalThis.useMask = useDetailScrollMask', context)
  function Reader({ content, scrollState = page }) {
    const ref = React.useRef(null)
    const { updateMask } = context.useMask('skill', ref, content, scrollState)
    return React.createElement('div', { ref, onScroll: updateMask })
  }
  const mount = async () => { let view; await act(async () => { view = create(React.createElement(Reader, { content: 'loading' }), { createNodeMock: () => scroller }) }); return view }
  let view = await mount()
  top = 1250
  await act(async () => { view.root.findByType('div').props.onScroll(); listeners.get('scroll')?.() })
  await act(async () => view.unmount())
  height = 500; top = 0
  view = await mount()
  assert.equal(top, 100, 'restore is initially clamped to the loading content')
  listeners.get('scroll')?.()
  height = 2400
  await act(async () => { for (const resize of observers) resize() })
  assert.equal(top, 1250, 'loading must not overwrite the saved reading position')
  await act(async () => view.update(React.createElement(Reader, { content: 'loaded' })))
  assert.equal(top, 1250, 'refreshing content keeps the restored position')
  await act(async () => view.update(React.createElement(Reader, { content: 'different page', scrollState: {} })))
  assert.equal(top, 0, 'opening a different detail starts at the top')
  await act(async () => view.unmount())
  height = 500; top = 0
  view = await mount()
  top = 40
  listeners.get('wheel')?.()
  height = 2400
  await act(async () => { for (const resize of observers) resize() })
  assert.equal(top, 40, 'a user scroll cancels a pending restore')
  await act(async () => view.unmount())
  assert.equal(listeners.size, 0)
  assert.equal(observers.size, 0)
})

test('source sorting survives installation, tab navigation and remounts until filtering, sorting or a new Hub session', async () => {
  const browse = func('BrowseView')
  const names = new Set(['currentSourceInstalledNames', 'sortInstalledSnapshots', 'sortInstalledSnapshot', 'sortInstalledNames', 'currentSourcePlugins', 'visible'])
  const sorting = browse.body.body.filter(n => (n.type === 'VariableDeclaration' && n.declarations.some(d => names.has(d.id.name)))
    || (n.type === 'IfStatement' && code(n).includes('sortInstalledSnapshot')))
    .map(code).join('\n')
  let result, view
  const context = { ...React, calcSearchScore: () => 1, SESSION_STORE: {} }
  vm.runInNewContext('globalThis.sort = function(props) { const {state, rows, activeSourceId, filter, sortBy, query} = props;\n' + sorting + '\nglobalThis.installed = currentSourceInstalledNames; return visible.map(p => p.name); }', context)
  function List(props) { result = Array.from(context.sort(props)); return null }
  let props = { state: { plugins: [] }, rows: { a: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }], b: [{ name: 'delta' }] }, activeSourceId: 'a', filter: 'all', sortBy: 'default', query: '' }
  const render = async () => { await act(async () => { if (view) view.update(React.createElement(List, props)); else view = create(React.createElement(List, props)) }); return result }
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'])
  props = { ...props, state: { plugins: [{ sourceId: 'a', name: 'gamma' }] } }
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'], 'install changes the card action without moving it')
  assert.equal(context.installed.has('gamma'), true, 'card installation state updates immediately')
  props = { ...props, activeSourceId: 'b' }
  assert.deepEqual(await render(), ['delta'])
  props = { ...props, activeSourceId: 'a' }
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'], 'returning from another source keeps the installed card in place')
  props = { ...props, state: { plugins: [...props.state.plugins] }, rows: { ...props.rows, a: [...props.rows.a] } }
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'], 'background state and catalog refreshes keep the browsing order')
  await act(async () => view.unmount())
  view = null
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'], 'remounting the panel in the same Hub session retains its source order')
  props = { ...props, filter: 'installed' }
  assert.deepEqual(await render(), ['gamma', 'alpha', 'beta'])
  props = { ...props, sortBy: 'name-asc' }
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'])
  props = { ...props, sortBy: 'default' }
  assert.deepEqual(await render(), ['gamma', 'alpha', 'beta'])
  props = { ...props, state: { plugins: [{ sourceId: 'a', name: 'beta' }, { sourceId: 'a', name: 'gamma' }] } }
  assert.deepEqual(await render(), ['gamma', 'alpha', 'beta'])
  props = { ...props, query: 'a' }
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'], 'search uses its relevance order')
  props = { ...props, query: '' }
  assert.deepEqual(await render(), ['beta', 'gamma', 'alpha'], 'clearing search captures the current installed set')
  props = { ...props, state: { plugins: [...props.state.plugins, { sourceId: 'a', name: 'alpha' }] } }
  assert.deepEqual(await render(), ['beta', 'gamma', 'alpha'])
  await act(async () => view.unmount())
  view = null
  context.SESSION_STORE = {}
  assert.deepEqual(await render(), ['alpha', 'beta', 'gamma'], 'restarting the Hub creates a fresh installed-first order')
  await act(async () => view.unmount())
})

test('Skill, plugin detail and management all retain the source view as their scroll state', () => {
  for (const name of ['SkillDetail', 'DetailView', 'ManagePage']) {
    const call = nodes.find(n => n.type === 'CallExpression' && n.callee.name === 'h' && n.arguments[0]?.name === name)
    const prop = call.arguments[1].properties.find(p => p.key?.name === 'scrollState')
    assert.equal(prop?.value.name, 'view', name)
  }
  const manage = func('ManagePageContent')
  const tabNodes = manage.body.body.filter(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === 'setTab' || d.id.elements?.[0]?.name === 'tab'))
  const page = {}
  let current, select, view
  const context = { ...React }
  vm.runInNewContext('globalThis.tabs = function(scrollState, initialTab) {\n' + tabNodes.map(code).join('\n') + '\nreturn [tab, setTab]; }', context)
  function Tabs() { [current, select] = context.tabs(page, 'skills'); return null }
  // React mounts and remounts the same management state when leaving its source.
  act(() => { view = create(React.createElement(Tabs)) })
  assert.equal(current, 'skills')
  act(() => select('connectors'))
  assert.equal(current, 'connectors')
  act(() => view.unmount())
  act(() => { view = create(React.createElement(Tabs)) })
  assert.equal(current, 'connectors')
  act(() => view.unmount())
})

test('dialog dismiss requires a complete backdrop click, never a text-selection drag', () => {
  const helper = func('backdropDismissProps')
  assert.ok(helper, 'dialogs need a shared gesture-aware dismiss handler')
  const context = {}
  vm.runInNewContext(code(helper) + '\nglobalThis.props = backdropDismissProps', context)
  let closed = 0
  const props = context.props(() => closed++)
  const backdrop = {}, input = {}
  const event = (target, button = 0) => ({ target, currentTarget: backdrop, button })
  props.onPointerDown(event(input)); props.onClick(event(backdrop))
  assert.equal(closed, 0)
  props.onPointerDown(event(backdrop)); props.onClick(event(input))
  assert.equal(closed, 0)
  props.onPointerDown(event(backdrop, 2)); props.onClick(event(backdrop))
  assert.equal(closed, 0)
  props.onPointerDown(event(backdrop)); props.onPointerCancel(); props.onClick(event(backdrop))
  assert.equal(closed, 0)
  props.onPointerDown(event(backdrop)); props.onClick(event(backdrop))
  assert.equal(closed, 1)
  const overlays = nodes.filter(n => n.type === 'ObjectExpression' && n.properties.some(p => p.key?.name === 'className' && p.value?.value === 'cpm-dialog'))
  assert.ok(overlays.length >= 5)
  for (const overlay of overlays) assert.match(code(overlay), /\.\.\.backdropDismissProps\(/)
})
