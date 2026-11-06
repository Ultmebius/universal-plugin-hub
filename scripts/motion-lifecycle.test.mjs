import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const React = require('react')
const { create, act } = require('react-test-renderer')
const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

test('saved skill states stay still across mounts and refreshes; user changes enable motion', async () => {
  const start = source.indexOf('function SkillSwitch(')
  const end = source.indexOf('function useDetailScrollMask(', start)
  const context = { ...React, h: React.createElement }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.Switch = SkillSwitch;', context)
  const toggles = []
  const skill = { id: 'example', name: 'example', available: true, enabled: true }
  const props = { skill, onToggle: (_skill, enabled) => toggles.push(enabled) }
  let view
  await act(async () => { view = create(React.createElement(context.Switch, props)) })
  const control = () => view.root.findByProps({ role: 'switch' })
  assert.equal(control().props.checked, true)
  assert.doesNotMatch(control().props.className, /is-interactive/)
  // A refreshed catalog may change state without a click on this control.
  await act(async () => view.update(React.createElement(context.Switch, { ...props, skill: { ...skill, enabled: false } })))
  assert.equal(control().props.checked, false)
  assert.doesNotMatch(control().props.className, /is-interactive/)
  await act(async () => control().props.onChange({ currentTarget: { checked: true } }))
  assert.deepEqual(toggles, [true])
  assert.match(control().props.className, /is-interactive/)
  await act(async () => view.update(React.createElement(context.Switch, props)))
  assert.equal(control().props.checked, true)
  assert.match(control().props.className, /is-interactive/)
  await act(async () => view.unmount())
  await act(async () => { view = create(React.createElement(context.Switch, props)) })
  assert.doesNotMatch(control().props.className, /is-interactive/)
  await act(async () => view.unmount())
  assert.match(source, /\.cpm-skill-toggle:not\(\.is-interactive\),\s*\.cpm-skill-toggle:not\(\.is-interactive\)::after\s*\{\s*transition: none;/)
})

test('the browse fade is measured before paint and follows resized content without a timer', () => {
  const start = source.indexOf('const updateGridMask = useCallback(')
  const callbackEnd = source.indexOf('const scrollContentToTop = useCallback(', start)
  const effectsStart = source.indexOf('useSafeLayoutEffect(', callbackEnd)
  const effectsEnd = source.indexOf('const isScrollingRef', effectsStart)
  const layouts = [], effects = [], observed = []
  let mask = '', resize, disconnected = false
  const scroller = { scrollTop: 0, scrollHeight: 900, clientHeight: 400, children: [{}] }
  const context = {
    gridRef: { current: scroller },
    setGridMaskClass: value => { mask = value },
    useCallback: callback => callback,
    useSafeLayoutEffect: callback => layouts.push(callback),
    useEffect: callback => effects.push(callback),
    ResizeObserver: class {
      constructor(callback) { resize = callback }
      observe(node) { observed.push(node) }
      disconnect() { disconnected = true }
    },
    window: { addEventListener() {}, removeEventListener() {} },
    activeSourceId: 'skills-local', rows: {}, filter: 'all', query: '', view: { type: 'browse' }, mcpsOpen: false,
    requestAnimationFrame() { throw new Error('mask update deferred past layout') },
    setTimeout() { throw new Error('mask update deferred past layout') },
  }
  vm.runInNewContext(source.slice(start, callbackEnd) + source.slice(effectsStart, effectsEnd), context)
  layouts.forEach(callback => callback())
  assert.equal(mask, ' mask-bottom', 'first paint must already have the long-list fade')
  const cleanups = effects.map(callback => callback())
  assert.deepEqual(observed, [scroller, ...scroller.children])
  scroller.scrollTop = 500
  resize()
  assert.equal(mask, '', 'last lines must be readable')
  scroller.scrollTop = 0
  scroller.scrollHeight = 300
  layouts.forEach(callback => callback())
  assert.equal(mask, '', 'a short replacement list must not inherit the old fade')
  scroller.scrollHeight = 1000
  resize()
  assert.equal(mask, ' mask-bottom', 'late content growth must restore the fade')
  cleanups.forEach(cleanup => cleanup?.())
  assert.equal(disconnected, true)
})

test('management tabs apply their scroll edges during layout and observe later growth', () => {
  const start = source.indexOf('const updateManageMask = useCallback(')
  const end = source.indexOf('useEffect(() => {\n\t\t\tif (searchOpen', start)
  assert.ok(start > 0 && end > start)
  const layouts = [], effects = []
  let mask = '', resized, disconnected = false
  const scroller = { scrollTop: 100, scrollHeight: 900, clientHeight: 400, children: [{}] }
  const rememberStart = source.indexOf('function useRememberedDetailScroll(')
  const rememberEnd = source.indexOf('function useDetailScrollMask(', rememberStart)
  vm.runInNewContext(source.slice(rememberStart, rememberEnd) + source.slice(start, end), {
    manageRef: { current: scroller },
    setManageMaskClass: value => { mask = value },
    useCallback: callback => callback,
    useLayoutEffect: callback => layouts.push(callback),
    useEffect: callback => effects.push(callback),
    record: { name: 'example' }, tab: 'skills', tabQuery: '', initialTab: null, scrollState: {},
    setTab() {}, setTabQuery() {}, setSearchOpen() {}, setMenuOpen() {},
    window: { addEventListener() {}, removeEventListener() {} },
    ResizeObserver: class {
      constructor(callback) { resized = callback }
      observe() {}
      disconnect() { disconnected = true }
    },
    setTimeout() { throw new Error('management mask deferred past layout') },
  })
  layouts.forEach(callback => callback())
  assert.equal(scroller.scrollTop, 0, 'opening a plugin resets its position before paint')
  assert.equal(mask, ' mask-bottom')
  const cleanups = effects.map(callback => callback())
  scroller.scrollTop = 500
  resized()
  assert.equal(mask, ' mask-top')
  scroller.scrollHeight = 300
  scroller.scrollTop = 0
  layouts.at(-1)()
  assert.equal(mask, '', 'switching to short tab content must clear both edges before paint')
  scroller.scrollHeight = 900
  scroller.scrollTop = 100
  resized()
  assert.equal(mask, ' mask-both')
  cleanups.forEach(cleanup => cleanup?.())
  assert.equal(disconnected, true)
})
