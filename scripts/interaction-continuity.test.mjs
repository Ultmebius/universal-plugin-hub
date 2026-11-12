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
  const names = new Set(['currentSourceInstalledNames', 'crossSourceInstalledNames', 'sortInstalledSnapshots', 'sortInstalledNames', 'currentSourcePlugins', 'visible'])
  const commits = browse.body.body.filter(n => n.type === 'ExpressionStatement'
    && n.expression?.type === 'CallExpression' && code(n).includes('SESSION_STORE.browseSortSnapshots'))
  assert.equal(commits.length, 1, 'the snapshot commit effect moved; update this test to follow it')
  const sorting = browse.body.body.filter(n => (n.type === 'VariableDeclaration' && n.declarations.some(d => names.has(d.id.name)))
    || commits.includes(n))
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

test('dismissible backdrops require a complete click, while editors keep their drafts', () => {
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
  const overlays = nodes.filter(n => n.type === 'CallExpression' && n.callee.name === 'h' &&
    n.arguments[1]?.properties?.some(p => p.key?.name === 'className' && p.value?.value === 'cpm-dialog'))
  assert.ok(overlays.length >= 5)
  const editors = overlays.filter(overlay => /cpm-mcp-modal|cpm-source-dialog-box/.test(code(overlay.arguments[2])))
  assert.equal(editors.length, 3)
  for (const overlay of overlays) {
    const props = code(overlay.arguments[1])
    if (editors.includes(overlay)) {
      assert.doesNotMatch(props, /backdropDismissProps|onClick|onPointer/)
      assert.match(code(overlay.arguments[2]), /onClick: (?:onCancel|closeAuthDialog)/)
    } else {
      assert.match(props, /\.\.\.backdropDismissProps\(/)
    }
  }
})

test('Skills loads once in the background across tabs and keeps identical or newer rows', async () => {
  const hook = func('useSkillsCatalog')
  assert.ok(hook)
  const saved = [{ id: 'a', enabled: true }]
  const store = { rows: { 'skills-local': saved } }
  const calls = [], resolve = []
  const context = { ...React, SESSION_STORE: store,
    api: url => { calls.push(url); return new Promise(r => resolve.push(r)) } }
  vm.runInNewContext(code(hook) + '\nglobalThis.useCatalog = useSkillsCatalog', context)
  const setRows = update => { store.rows = update(store.rows) }
  function App({ source }) {
    context.useCatalog(true, setRows)
    return React.createElement('div', null, source)
  }
  let view
  await act(async () => { view = create(React.createElement(App, { source: 'anthropic' })) })
  await act(async () => view.update(React.createElement(App, { source: 'skills-local' })))
  assert.deepEqual(calls, ['/skills'])
  assert.equal(store.rows['skills-local'], saved)
  await act(async () => resolve.shift()({ skills: [{ ...saved[0] }] }))
  assert.equal(store.rows['skills-local'], saved, 'an equal response keeps the rendered list')
  await act(async () => view.unmount())
  await act(async () => { view = create(React.createElement(App, { source: 'skills-local' })) })
  const newer = [{ id: 'a', enabled: false }]
  store.rows = { 'skills-local': newer }
  await act(async () => resolve.shift()({ skills: saved }))
  assert.equal(store.rows['skills-local'], newer, 'a late background read cannot undo a toggle')
  await act(async () => view.unmount())
  const browse = code(func('BrowseView'))
  assert.match(browse, /if \(!activeSourceId \|\| activeSourceId === "skills-local"\) return/)
  assert.ok(browse.includes('!rows?.["skills-local"] ? (skillsLoadFailed ?'))
})

test('MCP tool chips share the icon curve and draw a single outer hover outline', () => {
  for (const selector of ['.cpm-card-icon', '.cpm-mcp-tool-pill']) {
    const css = source.slice(source.indexOf(selector + ' {')).split('}')[0]
    assert.match(css, /border-radius: var\(--cpm-card-icon-radius\)/)
    assert.match(css, /corner-shape: var\(--cpm-icon-corner-shape\)/)
  }
  const hoverEdges = [...source.matchAll(/\.cpm-mcp-tool-pill-wrap:hover > \.cpm-mcp-tool-pill:not\(\.is-disabled\) \{([^}]+)\}/g)].filter(([, css]) => css.includes('border-color'))
  assert.equal(hoverEdges.length, 1)
  assert.match(hoverEdges[0][1], /border-color: transparent;/)
  assert.match(source, /\.cpm-mcp-tool-pill:not\(\.is-disabled, :focus-visible\) \{\s*outline: 1px solid var\(--cpm-tool-hover-outline\);\s*outline-offset: 0;/)
  assert.match(source, /\.cpm-mcp-tool-pill:focus-visible \{[^}]*outline: 2px solid/)
  assert.match(source, /top: 0;\s*transition: top 190ms cubic-bezier\(0\.18, 0\.78, 0\.3, 1\)/)
  const glow = source.match(/\.cpm-mcp-tool-pill::before\s*\{([^}]+)\}/)[1]
  assert.match(glow, /inset: -1px;/, 'the glow starts at the border instead of leaving a gap')
  assert.match(glow, /border-radius: inherit;\s*corner-shape: inherit;/)
  assert.match(glow, /box-shadow: 0 0 [\d.]+px var\(--cpm-tool-hover-glow\);/)
  assert.doesNotMatch(source.match(/\.cpm-mcp-tool-pill \{([^}]+)\}/)[1], /\b(?:translate:|transform:|will-change:|border-color \d)/)
})

test('MCP mouse and keyboard previews use the same stationary anchor during lift', () => {
  const context = { h: (type, props, ...children) => ({ type, props, children }) }
  const render = vm.runInNewContext(code(func('McpToolsPanel')) + '\nMcpToolsPanel', context)
  const rect = { top: 20, bottom: 46 }
  const anchor = { getBoundingClientRect: () => rect }
  const button = { parentElement: anchor, getBoundingClientRect() { throw new Error('animated bounds used') } }
  const entered = [], left = []
  const tree = render({ tools: ['tool'], onHoverTool: (...args) => entered.push(args), onHoverEnd: node => left.push(node) })
  const grid = tree.children.find(child => child?.props?.className === 'cpm-mcp-tools-grid')
  const wrapper = grid.children[0][0]
  wrapper.props.onMouseEnter({ currentTarget: anchor, clientX: 12, clientY: 45, buttons: 0 })
  wrapper.children[0].props.onFocus({ currentTarget: button })
  wrapper.props.onMouseLeave({ currentTarget: anchor })
  wrapper.children[0].props.onBlur({ currentTarget: button })
  assert.deepEqual(entered.map(([, bounds, node]) => [bounds, node]), [[rect, anchor], [rect, anchor]])
  assert.deepEqual(left, [anchor, anchor])
})

test('Skills warms only its first rows and reuses local image requests across rerenders', () => {
  const warmed = [], ref = { current: new Map() }
  const local = '/universal-plugin-hub/api/skills/icon?id='
  const context = {
    useRef: () => ref, useEffect: fn => fn(), getPluginIconCandidates: skill => skill.icons || [],
    getPluginBadge: () => ({ src: '/bundled' }),
    Image: class { set src(value) { warmed.push(value) } decode() { return Promise.resolve() } },
  }
  const warm = vm.runInNewContext(code(func('useWarmSkillIcons')) + '\nuseWarmSkillIcons', context)
  const rows = [{ icons: ['https://example.test/external.png'] }, {}, {},
    ...Array.from({ length: 15 }, (_, id) => ({ icons: [local + id] }))]
  warm(rows, true)
  warm([...rows], false)
  assert.deepEqual(warmed, ['/bundled', ...Array.from({ length: 9 }, (_, id) => local + id)])
})

test('MCP details match the tool pill at the aligned corner and use the host styling elsewhere', () => {
  const shared = source.match(/\.cpm-smart-hover\s*\{([^}]+)\}/)?.[1]
  assert.match(shared || '', /border-radius: var\(--dsw-radius-lg, 16px\)/)
  assert.match(shared || '', /corner-shape: squircle/)
  const alignedCorner = source.match(/\.cpm-mcp-tool-popover\.cpm-smart-hover\s*\{([^}]+)\}/)?.[1]
  assert.match(alignedCorner || '', /border-top-left-radius: var\(--cpm-card-icon-radius\)/)
  assert.match(alignedCorner || '', /corner-top-left-shape: var\(--cpm-icon-corner-shape\)/)
  for (const name of ['PluginPreviewPopover', 'McpToolPopover']) {
    assert.match(code(func(name)), /h\(SmartHoverPopover,/)
  }
})
