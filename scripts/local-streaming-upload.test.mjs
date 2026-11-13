import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const temp = mkdtempSync(join(tmpdir(), 'hub-streaming-upload-'))
process.env.DSH_HOME = join(temp, 'dsh')
process.env.DSH_AGENTS_HOME = join(temp, 'native-agents')

const { mountRoutes } = await import('../src/routes.js')
const { MAX_UPLOAD_BYTES, saveUploadedStream } = await import('../src/local.js')
const { createSkillsManager } = await import('../src/skills.js')
const { dshSkillsDir, readState, sourceCacheDir, writeState } = await import('../src/store.js')

const tempUploadsRoot = () => join(sourceCacheDir('local'), '.temp')
const listTempUploads = () => (existsSync(tempUploadsRoot()) ? readdirSync(tempUploadsRoot()) : [])

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function resetEnv() {
  rmSync(dshSkillsDir(), { recursive: true, force: true })
  rmSync(tempUploadsRoot(), { recursive: true, force: true })
  writeState({ ...readState(), uploadedSkills: [] })
}

function makeSkillZipBuffer(skillName, desc = 'Streaming test skill') {
  const srcDir = join(temp, 'pkg-' + skillName)
  rmSync(srcDir, { recursive: true, force: true })
  write(join(srcDir, skillName, 'SKILL.md'), ['---', `name: ${skillName}`, `description: ${desc}`, '---', `Hello ${skillName}`, ''].join('\n'))
  const outZip = join(temp, skillName + '.zip')
  rmSync(outZip, { force: true })
  execFileSync('tar', ['-a', '-cf', outZip, '-C', srcDir, '.'])
  return outZip
}

async function startServer() {
  const manager = createSkillsManager()
  let handler
  const unmount = mountRoutes({ register(route) { handler = route.handler } }, manager)
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      if (!res.headersSent) res.writeHead(err.status || 500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    base: `http://127.0.0.1:${port}/universal-plugin-hub/api`,
    origin: `http://127.0.0.1:${port}`,
    unmount,
    close: () => new Promise((resolve) => {
      unmount?.()
      server.close(resolve)
    }),
  }
}

test.after(() => {
  rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('MAX_UPLOAD_BYTES is 500MB and streaming endpoint stages archive once across inspect -> import', async (t) => {
  resetEnv()
  assert.equal(MAX_UPLOAD_BYTES, 500 * 1024 * 1024)

  const { readFileSync } = await import('node:fs')
  const zipPath = makeSkillZipBuffer('streamed-skill')
  const zipBytes = readFileSync(zipPath)
  const srv = await startServer()
  t.after(() => srv.close())

  // 1. Stream raw binary archive to /plugins/local/inspect (with Unicode filename)
  const inspectRes = await fetch(`${srv.base}/plugins/local/inspect?filename=${encodeURIComponent('中文测试-包.zip')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', Origin: srv.origin },
    body: zipBytes,
  })
  assert.equal(inspectRes.status, 200)
  const inspectBody = await inspectRes.json()
  assert.equal(inspectBody.ok, true)
  assert.equal(inspectBody.kind, 'skills')
  assert.ok(inspectBody.uploadId, 'returns opaque staged uploadId token')

  // Staged temp zip exists, no temp extract dir leaked
  const tempEntriesAfterInspect = listTempUploads()
  assert.equal(tempEntriesAfterInspect.filter((n) => n.startsWith('upload-')).length, 1)
  assert.equal(tempEntriesAfterInspect.filter((n) => !n.startsWith('upload-')).length, 0)

  // 2. Import using uploadId ONLY (zero archive bytes re-sent)
  const importRes = await fetch(`${srv.base}/skills/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: srv.origin },
    body: JSON.stringify({ uploadId: inspectBody.uploadId, filename: '中文测试-包.zip', overwrite: false }),
  })
  assert.equal(importRes.status, 200)
  const importBody = await importRes.json()
  assert.equal(importBody.kind, 'skills')
  assert.equal(importBody.skills?.[0]?.name, 'streamed-skill')
  assert.ok(existsSync(join(dshSkillsDir(), 'streamed-skill', 'SKILL.md')))

  // Staged upload directory is removed immediately after import
  assert.equal(listTempUploads().length, 0)

  // Reusing consumed uploadId returns 410
  const replayRes = await fetch(`${srv.base}/skills/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: srv.origin },
    body: JSON.stringify({ uploadId: inspectBody.uploadId, overwrite: false }),
  })
  assert.equal(replayRes.status, 410)
})

test('upload-cancel cleans up staged archive and invalid streamed uploads leave zero temp files', async (t) => {
  resetEnv()
  const { readFileSync } = await import('node:fs')
  const zipPath = makeSkillZipBuffer('cancel-skill')
  const zipBytes = readFileSync(zipPath)
  const srv = await startServer()
  t.after(() => srv.close())

  // Cancel path cleans staged upload
  const inspectRes = await fetch(`${srv.base}/plugins/local/inspect?filename=cancel-skill.zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', Origin: srv.origin },
    body: zipBytes,
  })
  const { uploadId } = await inspectRes.json()
  assert.equal(listTempUploads().length, 1)

  const cancelRes = await fetch(`${srv.base}/plugins/local/upload-cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: srv.origin },
    body: JSON.stringify({ uploadId }),
  })
  assert.equal(cancelRes.status, 200)
  assert.equal(listTempUploads().length, 0)

  // Invalid archive upload cleans temp file immediately
  const badRes = await fetch(`${srv.base}/plugins/local/inspect?filename=broken.zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', Origin: srv.origin },
    body: Buffer.from('not-a-valid-zip-archive'),
  })
  const badBody = await badRes.json()
  assert.equal(badBody.ok, false)
  assert.equal(listTempUploads().length, 0)
})

test('oversize streaming uploads reject with HTTP 413 (500MB limit) via Content-Length and mid-stream enforcement', async (t) => {
  resetEnv()
  const srv = await startServer()
  t.after(() => srv.close())

  // Declared Content-Length > 500MB rejects immediately with HTTP 413
  await new Promise((resolve, reject) => {
    const req = http.request(`${srv.base}/plugins/local/inspect?filename=too-big.zip`, {
      method: 'POST',
      headers: {
        Origin: srv.origin,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(MAX_UPLOAD_BYTES + 1),
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try {
          assert.equal(res.statusCode, 413)
          const body = JSON.parse(data)
          assert.match(body.error, /500MB/)
          resolve()
        } catch (e) { reject(e) }
      })
    })
    req.on('error', (err) => {
      // Server sends 413 + Connection: close immediately without reading body
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return
      reject(err)
    })
    req.end(Buffer.alloc(16))
  })

  // Mid-stream overflow enforcement removes temp dir and throws status 413
  const fakeReq = new EventEmitter()
  fakeReq.headers = {}
  fakeReq.pause = () => {}
  fakeReq.resume = () => {}
  const pending = saveUploadedStream(fakeReq, 'chunked-over.zip', 1024)
  queueMicrotask(() => {
    fakeReq.emit('data', Buffer.alloc(600))
    fakeReq.emit('data', Buffer.alloc(600))
  })
  await assert.rejects(pending, (err) => err.status === 413 && /500MB/.test(err.message))
  assert.equal(listTempUploads().length, 0, 'temp upload folder removed on oversize abort')
})

test('client close disconnect during streaming releases file handle and cleans temp dir', async (t) => {
  resetEnv()
  const srv = await startServer()
  t.after(() => srv.close())

  // Simulate Node modern IncomingMessage disconnect via close event before end (e.g. client cancel)
  const fakeReq = new EventEmitter()
  fakeReq.headers = {}
  fakeReq.pause = () => {}
  fakeReq.resume = () => {}
  const pending = saveUploadedStream(fakeReq, 'client-drop.zip', 1024 * 1024)
  queueMicrotask(() => {
    fakeReq.emit('data', Buffer.alloc(512))
    fakeReq.emit('close')
  })
  await assert.rejects(pending, (err) => err.status === 499)
  assert.equal(listTempUploads().length, 0, 'aborted/closed stream leaves zero temp upload dirs')
})

test('DELETE /sources/local and JSON base64 fallback leave zero staged temp dirs', async (t) => {
  resetEnv()
  const { readFileSync } = await import('node:fs')
  const zipPath = makeSkillZipBuffer('json-fallback-skill')
  const base64 = readFileSync(zipPath).toString('base64')
  const srv = await startServer()
  t.after(() => srv.close())

  // JSON base64 inspect stages uploadId and cleans up on import
  const inspectRes = await fetch(`${srv.base}/plugins/local/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: srv.origin },
    body: JSON.stringify({ data: base64, filename: 'json-fallback-skill.zip' }),
  })
  const inspectBody = await inspectRes.json()
  assert.equal(inspectBody.ok, true)
  assert.ok(inspectBody.uploadId)
  assert.equal(listTempUploads().length, 1)

  // Seed a local source entry with no installed plugins so DELETE /sources/local is permitted
  const state = readState()
  state.sources = [...(state.sources || []).filter((s) => s.id !== 'local'), { id: 'local', name: '本地插件', url: 'local://' }]
  state.plugins = (state.plugins || []).filter((p) => p.sourceId !== 'local')
  writeState(state)

  const delRes = await fetch(`${srv.base}/sources/local`, {
    method: 'DELETE',
    headers: { Origin: srv.origin },
  })
  assert.equal(delRes.status, 200)
  assert.equal(listTempUploads().length, 0, 'deleting local source deletes staged uploads too')

  // Stale uploadId now returns 410 instead of pointing into deleted cache
  const staleRes = await fetch(`${srv.base}/skills/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: srv.origin },
    body: JSON.stringify({ uploadId: inspectBody.uploadId, overwrite: false }),
  })
  assert.equal(staleRes.status, 410)

  // Direct JSON base64 import without prior inspect cleans up its own temp upload dir immediately
  const directRes = await fetch(`${srv.base}/skills/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: srv.origin },
    body: JSON.stringify({ data: base64, filename: 'direct-json.zip', overwrite: true }),
  })
  assert.equal(directRes.status, 200)
  assert.equal(listTempUploads().length, 0)
})
