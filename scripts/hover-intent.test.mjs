import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const context = vm.createContext({})
vm.runInContext(source.slice(source.indexOf('function hoverRectContains('), source.indexOf('function useHoverPreview(')) + '\nglobalThis.hover = {hoverInCorridor, placeHoverCard, placePluginPreview, createHoverSession};', context)
const { hoverInCorridor, placeHoverCard, placePluginPreview, createHoverSession } = context.hover
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height })
const element = rect => ({ isConnected: true, style: {}, dataset: {}, getBoundingClientRect: () => rect, contains(target) { return target === this || target?.parent === this } })
function fixture() {
  let time = 0, id = 0
  const timers = new Map(), changes = []
  const session = createHoverSession({ onChange: item => changes.push(item?.name ?? null), now: () => time, setTimer(fn, ms) { timers.set(++id, { at: time + ms, fn }); return id }, clearTimer(key) { timers.delete(key) } })
  const advance = ms => {
    const end = time + ms
    for (let i = 0; i < 100; i++) {
      const next = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) { time = end; return }
      timers.delete(next[0]); time = next[1].at; next[1].fn()
    }
    throw new Error('timer loop did not settle')
  }
  const a = element(box(100, 100, 180, 30)), popup = element(box(290, 100, 340, 300))
  const open = () => { session.enter({ name: 'a' }, a, { x: 180, y: 115 }); advance(200); return session.attach(popup, a) }
  const move = (x, y, options = {}) => session.move({ type: 'pointermove', clientX: x, clientY: y, buttons: 0, ...options })
  const events = () => {
    const listeners = new Map()
    return { addEventListener(type, fn) { listeners.set(type, fn) }, removeEventListener(type) { listeners.delete(type) }, emit(type, event = {}) { listeners.get(type)?.({ type, ...event }) }, count: () => listeners.size }
  }
  return { session, advance, changes, a, popup, open, move, timers, events }
}

test('MCP details stay adjacent on the right and within the viewport', () => {
  const p = placeHoverCard(box(100, 100, 180, 30), 340, 260, { width: 1200, height: 800 })
  assert.equal(p.left, 290); assert.equal(p.top, 100)
  const small = placeHoverCard(box(300, 260, 70, 30), 340, 260, { width: 390, height: 320 })
  assert.ok(small.left >= 12 && small.left + 340 <= 378)
  assert.ok(small.top >= 12 && small.top + 260 <= 308)
})

test('plugin previews return below the title and flip above only at the bottom edge', () => {
  const p = placePluginPreview(box(140, 137, 476, 52), 380, 150, { width: 1280, height: 720 }, 260)
  assert.equal(p.left, 260); assert.equal(p.top, 195)
  const bottom = placePluginPreview(box(140, 600, 476, 52), 380, 150, { width: 1280, height: 720 }, 260)
  assert.equal(bottom.top, 444)
})

test('travel corridor preserves movement to the card but excludes movement down the list', () => {
  assert.equal(hoverInCorridor({ x: 180, y: 100 }, { x: 210, y: 110 }, box(240, 80, 340, 260)), true)
  assert.equal(hoverInCorridor({ x: 180, y: 100 }, { x: 182, y: 150 }, box(240, 80, 340, 260)), false)
})

test('leaving before the initial delay cancels the request', () => {
  const f = fixture()
  f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 })
  f.advance(100); f.session.leave(f.a); f.advance(1000)
  assert.deepEqual(f.changes, [])
})

test('next-row tool replaces details immediately even inside the previous travel corridor', () => {
  const f = fixture(); f.open()
  const b = element(box(200, 140, 160, 30))
  f.session.enter({ name: 'b' }, b, { x: 250, y: 150 })
  f.move(250, 150); f.advance(1000)
  assert.deepEqual(f.changes, ['a', 'b'])
})

test('a deferred underlying target is retained and opens when the pointer reaches its visible part', () => {
  const f = fixture(); f.open()
  const b = element(box(240, 140, 160, 30))
  f.session.enter({ name: 'b' }, b, { x: 330, y: 150 })
  assert.deepEqual(f.changes, ['a'])
  f.move(250, 150)
  assert.deepEqual(f.changes, ['a', 'b'])
})

test('crossing an adjacent pill into the hovercard preserves the original readable content', () => {
  const f = fixture(); f.open()
  const b = element(box(288, 100, 160, 30))
  f.session.enter({ name: 'b' }, b, { x: 289, y: 115 })
  f.move(310, 120); f.advance(60)
  assert.deepEqual(f.changes, ['a'])
  f.advance(80)
  assert.equal(f.popup.style.pointerEvents, 'auto')
  assert.equal(f.popup.dataset.reading, 'true')
  f.advance(1000)
  assert.deepEqual(f.changes, ['a'])
})

test('resting on the adjacent trigger in the gap switches once instead of dropping its request', () => {
  const f = fixture(); f.open()
  const b = element(box(288, 100, 160, 30))
  f.session.enter({ name: 'b' }, b, { x: 289, y: 115 })
  f.advance(60)
  assert.deepEqual(f.changes, ['a', 'b'])
})

test('leaving a readable preview for the adjacent exposed trigger hands off without a dead hover', () => {
  // Browsers may deliver React mouseenter before or after the document's
  // pointermove. Both orders must work without a second entry or movement.
  for (const order of ['enter-first', 'move-first']) {
    const f = fixture(); f.open(); f.move(310, 150); f.advance(140)
    const b = element(box(288, 100, 160, 30))
    const enter = () => f.session.enter({ name: 'b' }, b, { x: 289, y: 115 })
    if (order === 'enter-first') { enter(); f.move(289, 115) }
    else { f.move(289, 115); enter() }
    assert.equal(f.changes.at(-1), 'b', order)
    const nextPopup = element(box(458, 100, 340, 300))
    f.session.attach(nextPopup, b); f.advance(1000)
    assert.equal(f.changes.at(-1), 'b', order)
    assert.equal(nextPopup.dataset.pointerInside, 'false')
    assert.equal(f.timers.size, 0)
  }
})

test('reading-to-trigger handoffs work repeatedly in every direction and on the next row', () => {
  const f = fixture(); f.open()
  let activePopup = f.popup
  const targets = [
    element(box(288, 100, 160, 30)),
    element(box(100, 140, 180, 30)),
    element(box(100, 100, 180, 30)),
    element(box(288, 140, 160, 30)),
  ]
  for (let i = 0; i < 12; i++) {
    const target = targets[i % targets.length], r = target.getBoundingClientRect()
    const popup = element(box(r.right + 10, r.top, 340, 300))
    const previousRect = activePopup.getBoundingClientRect()
    f.move(previousRect.left + 20, previousRect.top + 50); f.advance(140)
    assert.equal(activePopup.dataset.reading, 'true')
    f.session.enter({ name: `tool-${i}` }, target, { x: r.left + 1, y: r.top + 15 })
    f.move(r.left + 1, r.top + 15)
    assert.equal(f.changes.at(-1), `tool-${i}`)
    f.session.attach(popup, target)
    activePopup = popup
  }
})

test('Escape, blur and pointer exit cancel pending previews before they become visible', () => {
  for (const type of ['keydown', 'blur', 'pointerout']) {
    const f = fixture(), doc = f.events(), win = f.events()
    const dispose = f.session.bind(doc, win)
    f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 })
    if (type === 'blur') win.emit(type)
    else doc.emit(type, { key: 'Escape', relatedTarget: null })
    f.advance(1000)
    assert.deepEqual(f.changes, [])
    dispose(); assert.equal(doc.count(), 0); assert.equal(win.count(), 0)
  }
})

test('scrolling cancels pending previews and defers new requests until scrolling settles', () => {
  const f = fixture()
  f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 }); f.session.suspend(); f.advance(1000)
  assert.deepEqual(f.changes, [])
  f.session.suspend(); f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 }); f.advance(200)
  assert.deepEqual(f.changes, [])
  f.advance(20); assert.deepEqual(f.changes, ['a'])
})

test('scroll inside the preview keeps it open; background scroll closes it', () => {
  const f = fixture(), doc = f.events(), win = f.events()
  f.session.bind(doc, win); f.open()
  doc.emit('scroll', { target: { parent: f.popup } })
  assert.deepEqual(f.changes, ['a'])
  doc.emit('wheel', { target: {} })
  assert.deepEqual(f.changes, ['a', null])
})

test('keyboard focus enters reading mode and pointer-click focus does not reopen a closed preview', () => {
  const f = fixture(), doc = f.events(), win = f.events()
  f.session.bind(doc, win); f.open()
  doc.emit('focusin', { target: f.popup })
  assert.equal(f.popup.dataset.reading, 'true')
  doc.emit('pointerdown', { target: f.a })
  f.session.enter({ name: 'a' }, f.a, null, true); f.advance(500)
  assert.deepEqual(f.changes, ['a', null])
})

test('detached anchors and disposal cannot publish a stale preview', () => {
  const f = fixture()
  f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 }); f.a.isConnected = false; f.advance(1000)
  assert.deepEqual(f.changes, [])
  f.a.isConnected = true
  const doc = f.events(), win = f.events(), dispose = f.session.bind(doc, win)
  f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 }); dispose(); f.advance(1000)
  assert.deepEqual(f.changes, [])
  assert.equal(f.timers.size, 0)
})

test('selection drag and release outside keep text available until the next pointer movement', () => {
  const f = fixture(); f.open(); f.move(310, 120); f.advance(140)
  f.move(700, 500, { buttons: 1 }); f.move(700, 500, { type: 'pointerup' })
  assert.deepEqual(f.changes, ['a'])
  f.move(700, 500)
  assert.deepEqual(f.changes, ['a', null])
})

test('dragging selected preview text across another trigger preserves the reading preview', () => {
  for (const order of ['enter-first', 'move-first']) {
    const f = fixture(); f.open(); f.move(310, 150); f.advance(140)
    const b = element(box(288, 100, 160, 30))
    const enter = () => f.session.enter({ name: 'b' }, b, { x: 289, y: 115, buttons: 1 })
    if (order === 'enter-first') { enter(); f.move(289, 115, { buttons: 1 }) }
    else { f.move(289, 115, { buttons: 1 }); enter() }
    f.advance(1000)
    assert.deepEqual(f.changes, ['a'])
    assert.equal(f.popup.dataset.reading, 'true')
    f.move(289, 115, { type: 'pointerup', target: b })
    assert.deepEqual(f.changes, ['a'])
    f.move(289, 115, { target: { parentElement: b } })
    assert.equal(f.changes.at(-1), 'b', 'movement over the already-hovered trigger recovers after selection')
  }
})

test('pointer reconciliation keeps the initial opening deadline and honors explicit dismissal', () => {
  const f = fixture()
  f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 })
  for (let i = 0; i < 5; i++) { f.advance(30); f.move(180 + i, 115, { target: f.a }) }
  f.advance(50)
  assert.deepEqual(f.changes, ['a'])
  f.session.attach(f.popup, f.a)
  f.session.dismiss(); f.advance(1000)
  assert.deepEqual(f.changes, ['a', null], 'dismissal stays closed until fresh pointer input')
  f.move(185, 115, { target: f.a })
  f.advance(200)
  assert.equal(f.changes.at(-1), 'a')
})

test('returning to the original trigger restores a transparent preview', () => {
  const f = fixture(); f.open(); f.move(310, 120); f.advance(140); f.move(180, 115)
  assert.equal(f.popup.style.pointerEvents, 'none')
  assert.equal(f.popup.dataset.pointerInside, 'false')
  assert.deepEqual(f.changes, ['a'])
})

test('underlying hover decoration is suppressed immediately on entering the preview and restored on dismissal', () => {
  const f = fixture(); f.open()
  assert.equal(f.popup.dataset.pointerInside, 'false')
  f.move(310, 120)
  assert.equal(f.popup.dataset.pointerInside, 'true')
  assert.equal(f.popup.style.pointerEvents, 'none')
  f.advance(140)
  assert.equal(f.popup.dataset.pointerInside, 'true')
  assert.equal(f.popup.style.pointerEvents, 'auto')
  f.session.dismiss()
  assert.equal(f.popup.dataset.pointerInside, 'false')
})

test('rapidly crossing triggers publishes the final request and cancels earlier timers', () => {
  const f = fixture(), b = element(box(100, 140, 180, 30)), c = element(box(100, 180, 180, 30))
  f.session.enter({ name: 'a' }, f.a, { x: 180, y: 115 }); f.advance(40)
  f.session.enter({ name: 'b' }, b, { x: 180, y: 155 }); f.advance(40)
  f.session.enter({ name: 'c' }, c, { x: 180, y: 195 }); f.advance(200)
  assert.deepEqual(f.changes, ['c'])
})
