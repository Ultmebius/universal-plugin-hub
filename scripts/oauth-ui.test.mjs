import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const React = require('react')
const TestRenderer = require('react-test-renderer')
const { act } = TestRenderer
const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const start = client.indexOf('\tfunction useOauthVerification')
const end = client.indexOf('\n\tconst useSafeLayoutEffect', start)
assert.ok(start > 0 && end > start)
const context = { window: { setTimeout, clearTimeout }, AbortController, ...React }
globalThis.window = context.window
globalThis.IS_REACT_ACT_ENVIRONMENT = true
vm.runInNewContext(`${client.slice(start, end)}\nglobalThis.OAuthProbe = useOauthVerification`, context)

function deferred() { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
async function flush() { await act(async () => { await new Promise((resolve) => setImmediate(resolve)) }) }
function response(result) { return { ok: true, json: async () => result } }
function mount(form, fetchImpl, events) {
  window.fetch = fetchImpl
  let renderer
  let current
  function Probe({ form }) {
    current = context.OAuthProbe({ form, verifyPath: '/plugins/test/connectors/remote/verify', onFinished: (result) => events.finished.push(result), onCancel: () => events.cancelled.push(true), onError: (error) => events.errors.push(error) })
    return null
  }
  act(() => { renderer = TestRenderer.create(React.createElement(Probe, { form })) })
  return {
    get current() { return current },
    update(next) { act(() => { renderer.update(React.createElement(Probe, { form: next })) }) },
    unmount() { act(() => { renderer.unmount() }) },
  }
}

test('OAuth UI polls to a verified result and supports cancelling an active session', async (t) => {
  const timers = []
  const original = window.setTimeout
  const originalClear = window.clearTimeout
  window.setTimeout = (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer }
  window.clearTimeout = () => {}
  t.after(() => { window.setTimeout = original; window.clearTimeout = originalClear })
  const events = { finished: [], cancelled: [], errors: [] }
  let polls = 0
  const view = mount({ url: 'https://example.test/mcp' }, async (url, options) => {
    if (options?.method === 'POST') return response({ pending: true, sessionId: 'test-session' })
    polls += 1
    return response(polls === 1 ? { found: true, pending: true, authorizationUrl: 'https://example.test/authorize' } : { found: true, ok: true, message: '验证成功' })
  }, events)
  await act(() => view.current.start())
  await flush()
  await act(() => timers.shift().callback())
  assert.equal(view.current.pending.authorizationUrl, 'https://example.test/authorize')
  assert.equal(events.finished.length, 0)
  await act(() => timers.shift().callback())
  assert.equal(events.finished[0].ok, true)
  assert.equal(view.current.pending, null)
  assert.equal(events.errors.length, 0)
  view.unmount()
})

test('OAuth UI cancels close, late starts, form changes and unmount', async () => {
  const events = { finished: [], cancelled: [], errors: [] }
  const posts = []
  const start = deferred()
  const view = mount({ url: 'https://example.test/one' }, async (url, options) => {
    if (options?.method === 'POST' && url.endsWith('/verify')) return start.promise
    posts.push(JSON.parse(options.body))
    return response({ found: false })
  }, events)
  await act(() => { void view.current.start() })
  await act(() => view.current.cancel())
  assert.equal(events.cancelled.length, 1)
  assert.equal(posts[0].sessionId, '')
  start.resolve(response({ pending: true, sessionId: 'late-session' }))
  await flush()
  assert.equal(posts[1].sessionId, 'late-session')
  assert.equal(events.finished.length, 0)
  view.unmount()

  const active = mount({ url: 'https://example.test/one' }, async (url, options) => {
    if (options?.method === 'POST' && url.endsWith('/verify')) return response({ pending: true, sessionId: 'old-config' })
    posts.push(JSON.parse(options.body))
    return response({ found: true, pending: false, ok: false })
  }, events)
  await act(() => active.current.start())
  await act(async () => { active.update({ url: 'https://example.test/two' }); await Promise.resolve() })
  await flush()
  assert.equal(posts.at(-1).sessionId, 'old-config')
  assert.equal(events.finished.length, 0)
  assert.equal(events.errors.length, 0)
  active.unmount()
})
