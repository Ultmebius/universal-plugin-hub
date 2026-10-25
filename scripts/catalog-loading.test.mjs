import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const start = client.indexOf('// Read cached catalogs immediately')
const end = client.indexOf('const onInstalled = useCallback', start)

test('fresh cached catalogs load before a slow Git update finishes', async () => {
  let effect, effectKey
  let rows = { modern: [{ name: 'old', icons: {} }] }
  const requests = []
  const state = { sources: [{ id: 'slow-git' }, { id: 'modern' }, { id: 'local' }] }
  const context = {
    state,
    useEffect(callback, deps) { effect = callback; effectKey = deps[0] },
    setRows(update) { rows = update(rows) },
    api: async (path, options) => {
      requests.push({ path, method: options?.method || 'GET' })
      if (options?.method === 'POST') return new Promise(() => {})
      return { plugins: [{ name: path.includes('modern') ? 'modern' : 'cached', icons: { light: ['fresh-icon'] } }] }
    },
  }
  vm.runInNewContext(client.slice(start, end), context)
  const cleanup = effect()
  await new Promise(setImmediate)
  assert.equal(rows.modern[0].icons.light[0], 'fresh-icon')
  assert.equal(requests.filter((r) => r.method === 'GET').length, 3)
  assert.equal(requests.filter((r) => r.method === 'POST').length, 1)
  assert.equal(effectKey, 'local,modern,slow-git')
  cleanup()
})

test('catalog effects ignore responses arriving after the view is disposed', async () => {
  let effect
  let resolveRequest
  let writes = 0
  vm.runInNewContext(client.slice(start, end), {
    state: { sources: [{ id: 'local' }] },
    useEffect(callback) { effect = callback },
    setRows() { writes++ },
    api: () => new Promise((resolve) => { resolveRequest = resolve }),
  })
  const cleanup = effect()
  cleanup()
  resolveRequest({ plugins: [{ name: 'late' }] })
  await new Promise(setImmediate)
  assert.equal(writes, 0)
})
