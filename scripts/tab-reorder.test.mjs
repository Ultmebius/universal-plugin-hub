import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const start = source.indexOf('const [dragState, setDragState] = useState(null);')
const end = source.indexOf('const cleanError =', start)

function harness({ widths = [112, null, 260, 230, 60], scroll = 0, gap = 2, reduced = false } = {}) {
  let nextTimer = 0, renders = 0, drag = null
  const timers = new Map(), rafs = new Map(), requests = [], effects = [], layouts = []
  const names = ['Anthropic', 'Local', 'Knowledge Work Plugins', 'Modern Web Guidance', 'Skills']
  let state = { sources: names.map((name, i) => ({ id: String(i), name, builtin: i === 0 })), plugins: [] }
  const container = { scrollLeft: scroll, getBoundingClientRect: () => ({ left: 80, right: 780, width: 700, top: 100 }) }
  let offset = 42 // The separately pinned MCP entry also occupies space.
  const slots = widths.map((width, i) => {
    if (width === null) return null
    const slot = { index: i, offsetLeft: offset, width }
    offset += width + gap
    return slot
  })
  const tabRefs = Object.fromEntries(slots.map((slot, i) => [String(i), slot ? {
    isConnected: true, offsetLeft: 9999, // A different offsetParent must not affect geometry.
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ left: 80 + slot.offsetLeft - container.scrollLeft, top: 100, width: slot.width, height: 30 }),
    setPointerCapture() {}, releasePointerCapture() {},
  } : { isConnected: false }])) // A detached ref from the hidden Local source.
  const overlay = { style: {} }
  const context = {
    useState: () => [null, fn => { drag = typeof fn === 'function' ? fn(drag) : fn; renders++ }],
    useRef: current => ({ current }), useCallback: fn => fn,
    useSafeLayoutEffect: fn => layouts.push(fn), useEffect: fn => effects.push(fn),
    tabsRef: { current: container }, tabRefs: { current: tabRefs },
    state, activeSourceId: '0', view: { type: 'browse' }, filter: 'all', mcpsOpen: false,
    setState: fn => { state = fn(state) }, updateTabsMask() {}, showToast() {},
    setActiveSourceId() { throw new Error('drag incorrectly activated a source') },
    scrollActiveTabIntoView() { throw new Error('drag incorrectly scrolled to the active tab') },
    scrollContentToTop() {}, gridRef: { current: null },
    SESSION_STORE: {}, STORAGE_KEY_STATE: 'test', localStorage: { setItem() {} }, savedTabScrolls: new Map(),
    currentTabAnim: null, currentTabTarget: null,
    api: (url, init) => { requests.push({ url, ...JSON.parse(init.body) }); return Promise.resolve() },
    getComputedStyle: () => ({ columnGap: String(gap) }),
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++nextTimer; rafs.set(id, fn); return id },
    cancelAnimationFrame: id => rafs.delete(id),
    window: { matchMedia: () => ({ matches: reduced }), addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
  }
  vm.runInNewContext(source.slice(start, end) + `\nglobalThis.controls = {
    handleTabPointerDown, handleTabPointerMove, handleTabPointerUp, cancelOrResetDrag,
    dragLiveRef, dragOverlayRef, snapFinishRef
  };`, context)
  const controls = context.controls
  controls.dragOverlayRef.current = overlay
  const event = (index, x, extra = {}) => ({ button: 0, pointerId: 7, clientX: x,
    clientY: 115, currentTarget: tabRefs[String(index)], target: { closest: () => null }, preventDefault() {}, ...extra })
  const flushTimer = () => {
    const [id, timer] = timers.entries().next().value || []
    assert.ok(timer, 'expected a pending timer')
    timers.delete(id); timer.fn()
  }
  return {
    controls, slots, container, overlay, requests, timers,
    get drag() { return drag }, get renders() { return renders }, get state() { return state },
    down(index, x = 80 + slots[index].offsetLeft - container.scrollLeft + slots[index].width / 2) {
      controls.handleTabPointerDown(event(index, x), state.sources[index], index)
    },
    begin(index) { this.down(index); flushTimer() },
    move(index, center, extra) { controls.handleTabPointerMove(event(index, 80 + center - container.scrollLeft, extra)) },
    up(index, center) { controls.handleTabPointerUp(event(index, 80 + center - container.scrollLeft), state.sources[index], index) },
    flushTimer,
    destination(from, to) {
      const target = slots[to]
      return target.offsetLeft + (to > from ? target.width - slots[from].width : 0) + slots[from].width / 2
    },
  }
}

test('short Skills can land before, between, or after two long tabs in both drag directions', () => {
  for (const widths of [[112, null, 260, 230, 60], [112, null, 60, 260, 230]]) {
    for (const from of [2, 3, 4]) for (const to of [2, 3, 4]) {
      const h = harness({ widths })
      h.begin(from)
      const center = h.destination(from, to)
      h.move(from, center)
      assert.equal(h.controls.dragLiveRef.current.toIndex, to, `${widths}: ${from} → ${to}`)
      h.up(from, center)
      assert.equal(h.drag.isSnapping, true)
      assert.equal(h.drag.snapTargetX, 80 + center - widths[from] / 2)
      assert.equal(h.requests.length, 0, 'persist only after the settle animation')
      h.controls.snapFinishRef.current()
      const expected = ['0', '1', '2', '3', '4']
      expected.splice(to, 0, expected.splice(from, 1)[0])
      assert.deepEqual(Array.from(h.state.sources, s => s.id), expected)
      assert.equal(h.requests.length, from === to ? 0 : 1)
    }
  }
})

test('scrolling and non-default gaps share exactly the same preview and drop coordinates', () => {
  const h = harness({ scroll: 137.5, gap: 9.5 })
  h.begin(4)
  const center = h.destination(4, 3)
  h.move(4, center)
  assert.equal(h.controls.dragLiveRef.current.toIndex, 3)
  assert.equal(h.controls.dragLiveRef.current.slotSize, 69.5)
  h.up(4, center)
  assert.equal(h.drag.snapTargetX, 80 + h.slots[3].offsetLeft - 137.5)
  h.controls.snapFinishRef.current()
  assert.equal(h.state.sources[3].id, '4')
})

test('holding and tiny movement keep the source in its original slot; MCP/Anthropic/hidden Local are excluded', () => {
  const h = harness()
  h.begin(4)
  h.move(4, h.destination(4, 4) - 1)
  assert.equal(h.controls.dragLiveRef.current.toIndex, 4)
  h.move(4, -500)
  assert.equal(h.controls.dragLiveRef.current.toIndex, 2)
  assert.equal(h.controls.dragLiveRef.current.baseSlots[1], null)
})

test('reversing over the same boundary remains stable and tracks the pointer without rerendering', () => {
  const h = harness()
  h.begin(4)
  h.move(4, h.destination(4, 3))
  const renders = h.renders
  for (const dx of [1, 2, -1, -2, 0]) h.move(4, h.destination(4, 3) + dx)
  assert.equal(h.renders, renders)
  assert.match(h.overlay.style.transform, /translate3d\(/)
  for (const to of [2, 3, 4, 3, 2, 4]) {
    h.move(4, h.destination(4, to))
    assert.equal(h.controls.dragLiveRef.current.toIndex, to)
  }
})

test('release coordinates are used even when the last pointermove was not delivered', () => {
  const h = harness()
  h.begin(4)
  h.up(4, h.destination(4, 3))
  assert.equal(h.controls.dragLiveRef.current.toIndex, 3)
  h.controls.snapFinishRef.current()
  assert.equal(h.state.sources[3].id, '4')
})

test('duplicate release and another pointer cannot start a second drop or activate a tab', () => {
  const h = harness()
  h.begin(4)
  h.move(4, h.destination(4, 2), { pointerId: 99 })
  assert.equal(h.controls.dragLiveRef.current.toIndex, 4)
  h.up(4, h.destination(4, 3))
  h.up(4, h.destination(4, 2))
  const finish = h.controls.snapFinishRef.current
  finish(); finish()
  assert.equal(h.requests.length, 1)
  assert.equal(h.state.sources[3].id, '4')
  assert.equal(h.timers.size, 0)
})

test('cancelled capture clears a pending hold and cancels an active preview without persisting', () => {
  const h = harness()
  h.down(4)
  h.controls.cancelOrResetDrag()
  assert.equal(h.timers.size, 0)
  h.begin(4)
  h.move(4, h.destination(4, 3))
  h.controls.cancelOrResetDrag()
  assert.equal(h.drag, null)
  assert.equal(h.requests.length, 0)
  assert.deepEqual(h.state.sources.map(s => s.id), ['0', '1', '2', '3', '4'])
})

test('transition fallback completes exactly once, including reduced motion', () => {
  for (const reduced of [false, true]) {
    const h = harness({ reduced })
    h.begin(4)
    h.up(4, h.destination(4, 3))
    assert.equal([...h.timers.values()][0].delay, reduced ? 0 : 320)
    h.flushTimer()
    assert.equal(h.drag, null)
    assert.equal(h.requests.length, 1)
    assert.equal(h.controls.snapFinishRef.current, null)
  }
})
