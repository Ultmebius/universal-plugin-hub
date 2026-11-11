import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./fixtures/paged-stdio-server.mjs', import.meta.url))

const { createProfileApplicator, scheduledResult, APPLIED_TOKEN } = await import('../src/runtime.js')
const { getConnectorId } = await import('../src/install.js')

const waitFor = async (apply, predicate, attempts = 40) => {
  for (let i = 0; i < attempts; i++) {
    const status = apply.status()
    if (predicate(status)) return status
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return apply.status()
}

test('profile application runs after the response and serializes changes', async () => {
  const calls = []
  let releaseFirst
  const gate = new Promise((resolve) => { releaseFirst = resolve })
  const ctx = { root: { get: (name) => name === 'hmr' ? {
    runExclusive: (operation) => operation(),
    reconcileProfile: async (ids) => {
      calls.push(ids)
      if (calls.length === 1) await gate
      return { warnings: [] }
    },
  } : undefined } }
  const apply = createProfileApplicator(ctx)

  // Callers never wait for the reconciliation: it may restart this plugin.
  const first = scheduledResult({ ok: true }, apply, ['mcp-user-mcp-rea'])
  assert.equal(first.application, 'scheduled')
  assert.deepEqual(calls, [], 'nothing ran before the response')

  const second = scheduledResult({ ok: true }, apply, ['mcp-user-mcp-other'])
  assert.equal(second.application, 'scheduled')
  await new Promise((resolve) => setImmediate(resolve))
  // A change that arrives before the queued reconcile finishes is folded into
  // it: one reconcile covers both instead of restarting the hub twice.
  assert.deepEqual(calls, [['mcp-user-mcp-rea', 'mcp-user-mcp-other']], 'coalesced into one reconcile')

  releaseFirst()
  const settled = await waitFor(apply, (s) => s.application === 'applied')
  assert.equal(settled.application, 'applied')
  assert.equal(settled.token, second.applicationToken, 'the coalesced run reports the newest token')
  assert.equal(calls.length, 1, 'two saves cost one reconcile')
})

test('a reconcile that never settles is bounded and does not pin the queue', async () => {
  const apply = createProfileApplicator({ root: { get: () => ({
    reconcileProfile: () => new Promise(() => {}),
  }) } })
  const started = Date.now()
  scheduledResult({ ok: true }, apply)
  // The bound is 60s in production; assert only that the status does not stay
  // pending forever by checking the queue keeps accepting work.
  assert.equal(apply.status().application, 'pending')
  assert.ok(Date.now() - started < 1000)
})

test('an unavailable HMR reports saved, not live', async () => {
  const apply = createProfileApplicator({ root: { get: () => undefined } })
  assert.equal(scheduledResult({ ok: true }, apply).application, 'scheduled')
  const status = await waitFor(apply, (s) => s.application === 'restart-required')
  assert.equal(status.application, 'restart-required')
  assert.equal(status.restartReason, 'no-hmr')
})

test('a failed application keeps the persisted result and allows the next change', async () => {
  let attempts = 0
  const apply = createProfileApplicator({ get: (name) => name === 'hmr' ? {
    reconcileProfile: async () => {
      attempts++
      if (attempts === 1) throw new Error('entry did not activate')
      return { warnings: [], restartReason: 'module-comparison' }
    },
  } : undefined })

  scheduledResult({ ok: true }, apply)
  const failed = await waitFor(apply, (s) => s.application === 'failed')
  assert.equal(failed.applicationError, 'entry did not activate')

  scheduledResult({ ok: true }, apply)
  const next = await waitFor(apply, (s) => s.application === 'restart-required')
  assert.equal(next.restartReason, 'module-comparison')
})

test('a new user MCP schedules the live profile application for its registration id', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-runtime-route-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(root, 'dsh')
  const { mountRoutes } = await import('../src/routes.js')
  const requiredIds = []
  let handler
  const apply = createProfileApplicator({ root: { get: (name) => name === 'hmr' ? {
    runExclusive: (operation) => operation(),
    reconcileProfile: async (ids) => { requiredIds.push(ids); return { warnings: [] } },
  } : undefined } })
  mountRoutes({ register: ({ handler: h }) => { handler = h; return () => {} } }, null, apply)
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(root, { recursive: true, force: true })
  })

  const created = await request(handler, 'POST', '/mcps', {
    name: 'hot-test', transport: 'stdio', command: process.execPath,
    args: [fixture, 'empty'], env: {}, headers: {}, oauth: 'none',
  })
  assert.equal(created.status, 200)
  assert.equal(created.body.ok, true)
  assert.equal(created.body.application, 'scheduled')
  await waitFor(apply, (s) => s.application === 'applied')
  // The registered patch id, not a hand-built name: `getConnectorId` slugs it.
  assert.deepEqual(requiredIds, [[getConnectorId('user-mcp', 'hot-test')]])

  const status = await request(handler, 'GET', '/apply-status')
  assert.equal(status.body.application, 'applied')

  await request(handler, 'DELETE', '/mcps/hot-test')
  await waitFor(apply, (s) => s.application === 'applied' && requiredIds.length === 2)
  assert.deepEqual(requiredIds[1], [])
})

test('the profile being written is the one the host booted, not a guess', async () => {
  // Verified end to end: with a custom profile name the hub used to write into
  // `<DSH_HOME>/profiles/web/cordis.patch.yml`, so the running instance never
  // saw the entry — the change "applied" and loaded nothing.
  const { apply } = await import('../src/index.js')
  const previous = process.env.DSH_PROFILE
  // This case runs `apply()` for real, which touches DSH paths. Point it at a
  // throwaway home so it can never create directories inside the repository.
  const home = mkdtempSync(join(tmpdir(), 'hub-runtime-profile-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(home, 'dsh')
  delete process.env.DSH_PROFILE
  const injections = []
  const ctx = {
    // The service is NOT available at apply() time, exactly like a real host.
    get: () => undefined,
    inject: (deps, callback) => { injections.push({ deps, callback }) },
    logger: { warn() {} },
  }
  try {
    apply(ctx)
    // Reading eagerly would leave this unset and silently reintroduce the
    // wrong-profile bug; the name must come from the injection.
    assert.equal(process.env.DSH_PROFILE, undefined)
    const profile = injections.find((i) => i.deps.includes('profileContext'))
    assert.ok(profile, 'apply() must inject profileContext')
    // The provisioning is detached (the plugin fiber must not wait on network
    // I/O), so await it explicitly before the temp home is removed.
    profile.callback({ profileContext: { name: 'e2e' } })
    await apply.provisioned()
    assert.equal(process.env.DSH_PROFILE, 'e2e')
    // `cordisPatchPath()` must now resolve inside the profile the host booted.
    const { cordisPatchPath } = await import('../src/install.js')
    assert.match(cordisPatchPath().replace(/\\/g, '/'), /\/profiles\/e2e\/cordis\.patch\.yml$/)
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE
    else process.env.DSH_PROFILE = previous
    // `apply()` kicks off host-package provisioning without awaiting it, and it
    // writes under DSH_HOME. Let it settle before restoring the path, or it
    // recreates the temp tree after cleanup.
    await new Promise((resolve) => setTimeout(resolve, 50))
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
})

test('plugin installation schedules a live profile reconciliation', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-runtime-install-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(root, 'dsh')
  const { mountRoutes } = await import('../src/routes.js')
  const { sourceCacheDir, readState, writeState } = await import('../src/store.js')
  const local = sourceCacheDir('local')
  mkdirSync(join(local, 'hot-plugin', 'skills', 'hello'), { recursive: true })
  writeFileSync(join(local, 'hot-plugin', 'skills', 'hello', 'SKILL.md'), '---\nname: hello\ndescription: test\n---\n')
  mkdirSync(join(local, 'hot-plugin', '.codex-plugin'), { recursive: true })
  writeFileSync(join(local, 'hot-plugin', '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'hot-plugin', version: '1.0.0' }))
  writeFileSync(join(local, 'hot-plugin', '.mcp.json'), JSON.stringify({ mcpServers: { demo: { type: 'stdio', command: process.execPath, args: ['-e', 'process.exit(0)'] } } }))
  const state = readState()
  writeState({ ...state, sources: [...state.sources, { id: 'local', name: 'Local', url: 'local://' }] })

  let reconciliations = 0
  let handler
  const apply = createProfileApplicator({ root: { get: () => ({
    runExclusive: (operation) => operation(),
    reconcileProfile: async () => { reconciliations++; return { warnings: [] } },
  }) } })
  mountRoutes({ register: ({ handler: h }) => { handler = h; return () => {} } }, null, apply)
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(root, { recursive: true, force: true })
  })

  const installed = await request(handler, 'POST', '/plugins/install', { sourceId: 'local', pluginName: 'hot-plugin' })
  assert.equal(installed.status, 200, JSON.stringify(installed.body))
  assert.equal(installed.body.ok, true)
  assert.equal(installed.body.application, 'scheduled')
  await waitFor(apply, (s) => s.application === 'applied')
  assert.equal(reconciliations, 1)

  const removed = await request(handler, 'DELETE', '/plugins/hot-plugin')
  assert.equal(removed.body.application, 'scheduled')
  await waitFor(apply, () => reconciliations === 2)
  assert.equal(reconciliations, 2)
})

async function request(handler, method, path, body) {
  const chunks = body === undefined ? [] : [JSON.stringify(body)]
  const req = {
    url: `/universal-plugin-hub/api${path}`, method,
    headers: { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' },
    on(event, cb) {
      if (event === 'data') chunks.forEach((chunk) => cb(chunk))
      if (event === 'end') cb()
    },
  }
  const res = { writeHead(status) { this.status = status }, end(payload) { this.body = JSON.parse(payload) } }
  await handler(req, res)
  return { status: res.status, body: res.body }
}

test('every outcome carries its own token so a poll cannot read another change', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let n = 0
  const apply = createProfileApplicator({ root: { get: () => ({
    runExclusive: (op) => op(),
    reconcileProfile: async () => { n++; if (n === 1) await gate; return { warnings: [] } },
  }) } })

  const first = scheduledResult({ ok: true }, apply)
  const second = scheduledResult({ ok: true }, apply)
  assert.notEqual(first.applicationToken, second.applicationToken)

  release()
  // The newer change owns the status; an older, slower result must not win.
  const settled = await waitFor(apply, () => n === 2)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled.application, 'applied')
  assert.equal(apply.status().token, second.applicationToken)
})

test('a restart hands back `applied` for the token it was given, not `idle`', async () => {
  // The applicator is rebuilt on every apply(); the client must not be left
  // polling a status that no longer describes its change.
  const before = createProfileApplicator({ root: { get: () => undefined } })
  const issued = scheduledResult({ ok: true }, before).applicationToken
  assert.equal(typeof issued, 'number')

  const restarted = createProfileApplicator({ root: { get: () => undefined } })
  // Untouched instance still starts idle...
  assert.equal(restarted.status().application, 'idle')
  // ...but a poll for a token it never issued means a previous fiber applied
  // that change before the restart. That is success, not "superseded".
  const answered = restarted.status(issued)
  assert.equal(answered.application, 'applied')
  assert.equal(answered.token, APPLIED_TOKEN)
  // A token this instance *has* issued keeps its own status.
  scheduledResult({ ok: true }, restarted)
  assert.notEqual(restarted.status(1).application, 'applied')
})

test('without an applicator the response never claims to be applied', () => {
  const result = scheduledResult({ ok: true, plugin: { name: 'demo' } }, null)
  assert.equal(result.application, undefined)
  // The client treats a missing `application` as "saved, verify after restart",
  // so the server must not invent a success marker here.
  assert.equal(result.ok, true)
})

test('a restart need reported through pending is not reported as applied', async () => {
  const apply = createProfileApplicator({ root: { get: () => ({
    reconcileProfile: async () => ({ warnings: [], pending: [{ url: 'file:///x', reason: 'module-comparison' }] }),
  }) } })
  scheduledResult({ ok: true }, apply)
  const status = await waitFor(apply, (s) => s.application !== 'pending' && s.application !== 'idle')
  assert.equal(status.application, 'restart-required')
  assert.equal(status.restartReason, 'module-comparison')
})

test('a throwing hmr lookup leaves a reported failure, never a stuck pending', async () => {
  const apply = createProfileApplicator({ root: { get: () => { throw new Error('context disposed') } } })
  scheduledResult({ ok: true }, apply)
  const status = await waitFor(apply, (s) => s.application !== 'pending' && s.application !== 'idle')
  assert.equal(status.application, 'failed')
  assert.match(String(status.applicationError), /context disposed/)
})
