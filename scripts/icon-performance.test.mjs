import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { performance } from 'node:perf_hooks'
import { PNG } from 'pngjs'
import { buildPluginIcons, getOrFetchIcon } from '../src/icons.js'
import { mountRoutes } from '../src/routes.js'
import { invalidateMarketplaceCache } from '../src/parser.js'
import { installedDir, marketRoot, sourceCacheDir, writeState } from '../src/store.js'
import { createSkillsManager } from '../src/skills.js'

const svgA = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>')
const svgB = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20"/></svg>')

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
}

function makeTranslucentPng(width, height) {
  const data = Buffer.alloc(width * height * 4)
  let seed = 987654321
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Transparent outer frame, translucent middle ring, textured core.
      // 512x512 PNG stays well above 12KB while its 96x96 area-sampled preview compresses well below 12KB.
      const dx = x - width / 2
      const dy = y - height / 2
      const r = Math.hypot(dx, dy)
      if (r > width * 0.45) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0
      } else {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const jitter = (seed >>> 26) & 0x1f
        data[i] = Math.min(255, ((x * 255) / width | 0) + jitter)
        data[i + 1] = Math.min(255, ((y * 255) / height | 0) + jitter)
        data[i + 2] = 180 + (jitter >> 1)
        data[i + 3] = r > width * 0.3 ? 128 : 255
      }
    }
  }
  return PNG.sync.write({ width, height, data })
}

function makeNoisyPng(width, height, seedInit = 12345) {
  const data = Buffer.alloc(width * height * 4)
  let seed = seedInit
  for (let i = 0; i < data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data[i] = data[i + 1] = data[i + 2] = seed >>> 24
    data[i + 3] = 128
  }
  return PNG.sync.write({ width, height, data })
}

import { createHash } from 'node:crypto'
function urlDiskCache(url) {
  return join(marketRoot(), 'icons', `icon_${createHash('md5').update(url).digest('hex')}.bin`)
}

test('HTTP caching (ETag / 304 / Cache-Control), O(1) /plugin-icon, LRU caches, and inlinePreview speed', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-icon-perf-'))
  const oldHome = process.env.DSH_HOME
  const oldAgents = process.env.DSH_AGENTS_HOME
  const oldFetch = globalThis.fetch
  process.env.DSH_HOME = join(root, 'dsh')
  process.env.DSH_AGENTS_HOME = join(root, 'agents')

  try {
    const manifest = JSON.parse(readFileSync(new URL('../assets/fluent-3d/manifest.json', import.meta.url), 'utf8'))
    const bundledEntry = Object.values(manifest.icons)[0]

    const skillDir = join(process.env.DSH_AGENTS_HOME, 'skills', 'perf-skill')
    write(join(skillDir, 'SKILL.md'), '---\nname: perf-skill\ndescription: perf\n---\nbody\n')
    write(join(skillDir, 'assets', 'icon.svg'), svgA)
    const skills = createSkillsManager()
    const [skillSummary] = skills.entries()

    let handler
    mountRoutes({ register(route) { handler = route.handler } }, skills)
    const request = async (url, headers = {}) => {
      const res = {
        status: 0,
        headers: {},
        body: undefined,
        writeHead(status, hdrs) {
          this.status = status
          this.headers = hdrs || {}
        },
        end(body) {
          this.body = body
        },
      }
      await handler({ method: 'GET', url, headers }, res)
      return res
    }

    await t.test('GET /icon sets strong ETag, immutable on bundled Fluent 3D assets, mutable max-age on remote icons, and handles If-None-Match 304', async () => {
      globalThis.fetch = () => { throw new Error('Bundled icons must not hit network') }
      const bundledPath = `/universal-plugin-hub/api/icon?u=${encodeURIComponent(bundledEntry.url)}`
      const first = await request(bundledPath)
      assert.equal(first.status, 200)
      assert.equal(first.headers['Content-Type'], 'image/png')
      assert.equal(first.headers['Cache-Control'], 'public, max-age=31536000, immutable')
      const etag = first.headers['ETag']
      assert.match(etag, /^"[^"]+"$/, 'must be a strong double-quoted ETag')
      assert.equal(etag.startsWith('W/'), false)

      for (const headerVal of [
        etag,
        `W/${etag}`,
        `"other-tag", ${etag}`,
        `"other-tag", W/${etag}`,
        '*',
      ]) {
        const res304 = await request(bundledPath, { 'if-none-match': headerVal })
        assert.equal(res304.status, 304, `expected 304 for If-None-Match: ${headerVal}`)
        assert.equal(res304.body?.length || 0, 0, '304 body must be empty')
        assert.equal(res304.headers['ETag'], etag)
        assert.equal(res304.headers['Cache-Control'], 'public, max-age=31536000, immutable')
      }

      const mismatch = await request(bundledPath, { 'if-none-match': '"mismatch-etag"' })
      assert.equal(mismatch.status, 200)
      assert.ok(mismatch.body.length > 0)

      // Mutable remote icon keeps max-age=604800 (not immutable) and supports ETag/304
      let fetches = 0
      globalThis.fetch = async () => {
        fetches++
        return new Response(svgA, { headers: { 'content-type': 'image/svg+xml' } })
      }
      const remoteUrl = 'https://remote-cache.example.test/avatar.svg'
      const remotePath = `/universal-plugin-hub/api/icon?v=2&u=${encodeURIComponent(remoteUrl)}`
      const remoteRes = await request(remotePath)
      assert.equal(remoteRes.status, 200)
      assert.equal(remoteRes.headers['Cache-Control'], 'public, max-age=604800')
      assert.match(remoteRes.headers['ETag'], /^"[^"]+"$/)
      const remote304 = await request(remotePath, { 'if-none-match': remoteRes.headers['ETag'] })
      assert.equal(remote304.status, 304)
      assert.equal(remote304.body?.length || 0, 0)
      assert.equal(remote304.headers['Cache-Control'], 'public, max-age=604800')
      assert.equal(fetches, 1)
    })

    await t.test('GET /plugin-icon uses immutable for matching v=, mutable for unversioned/stale v=, and supports ETag/304', async () => {
      const mktDir = sourceCacheDir('perf-market')
      const pluginDir = join(mktDir, 'plugins', 'target')
      const iconFile = join(pluginDir, 'assets', 'logo.svg')
      write(iconFile, svgA)
      write(join(mktDir, '.claude-plugin', 'marketplace.json'), JSON.stringify({
        plugins: [{ name: 'target', source: './plugins/target' }],
      }))
      const info = statSync(iconFile)
      const matchingUrl = `/universal-plugin-hub/api/plugin-icon?sourceId=perf-market&name=target&path=${encodeURIComponent('./assets/logo.svg')}&v=${info.mtimeMs}-${info.size}`
      const unversionedUrl = `/universal-plugin-hub/api/plugin-icon?sourceId=perf-market&name=target&path=${encodeURIComponent('./assets/logo.svg')}`
      const staleUrl = `/universal-plugin-hub/api/plugin-icon?sourceId=perf-market&name=target&path=${encodeURIComponent('./assets/logo.svg')}&v=0-1`

      const resVer = await request(matchingUrl)
      assert.equal(resVer.status, 200)
      assert.equal(resVer.headers['Cache-Control'], 'public, max-age=31536000, immutable')
      const etag = resVer.headers['ETag']
      assert.match(etag, /^"[^"]+"$/)

      const resVer304 = await request(matchingUrl, { 'if-none-match': `W/${etag}` })
      assert.equal(resVer304.status, 304)
      assert.equal(resVer304.body?.length || 0, 0)
      assert.equal(resVer304.headers['Cache-Control'], 'public, max-age=31536000, immutable')
      assert.equal(resVer304.headers['ETag'], etag)

      const resUnver = await request(unversionedUrl)
      assert.equal(resUnver.status, 200)
      assert.equal(resUnver.headers['Cache-Control'], 'public, max-age=604800')
      assert.equal(resUnver.headers['ETag'], etag)

      const resStale = await request(staleUrl)
      assert.equal(resStale.status, 200)
      assert.equal(resStale.headers['Cache-Control'], 'public, max-age=604800')
      assert.equal(resStale.headers['ETag'], etag)

      const resUnver304 = await request(unversionedUrl, { 'if-none-match': `"other", ${etag}` })
      assert.equal(resUnver304.status, 304)
      assert.equal(resUnver304.headers['Cache-Control'], 'public, max-age=604800')
    })

    await t.test('GET /skills/icon sets ETag, max-age=3600, handles If-None-Match 304, and invalidates on disk change/removal', async () => {
      const skillIconUrl = `/universal-plugin-hub/api/skills/icon?id=${encodeURIComponent(skillSummary.id)}`
      const first = await request(skillIconUrl)
      assert.equal(first.status, 200)
      assert.equal(first.headers['Cache-Control'], 'public, max-age=3600')
      assert.match(first.headers['ETag'], /^"[^"]+"$/)
      assert.deepEqual(first.body, svgA)

      const hit304 = await request(skillIconUrl, { 'if-none-match': first.headers['ETag'] })
      assert.equal(hit304.status, 304)
      assert.equal(hit304.body?.length || 0, 0)
      assert.equal(hit304.headers['Cache-Control'], 'public, max-age=3600')
      assert.equal(hit304.headers['ETag'], first.headers['ETag'])

      // Mutate file on disk -> ETag updates, old ETag returns 200 with new bytes
      const skillIconFile = join(skillDir, 'assets', 'icon.svg')
      writeFileSync(skillIconFile, svgB)
      const updated = await request(skillIconUrl, { 'if-none-match': first.headers['ETag'] })
      assert.equal(updated.status, 200)
      assert.deepEqual(updated.body, svgB)
      assert.notEqual(updated.headers['ETag'], first.headers['ETag'])

      // Remove file on disk -> 404 immediately
      rmSync(skillIconFile, { force: true })
      const gone = await request(skillIconUrl)
      assert.equal(gone.status, 404)
    })

    await t.test('GET /plugin-icon resolves O(1) without full-marketplace scan, handles installedDir, and returns 404 on delete/traversal', async () => {
      // Build a large marketplace with sibling plugins carrying >12KB PNGs.
      // If GET /plugin-icon invoked readMarketplace(), buildPluginIcons() would run
      // across siblings and materialize preview thumbnails under icons/previews.
      const mktDir = sourceCacheDir('big-market')
      const siblingPng = makeTranslucentPng(512, 512)
      assert.ok(siblingPng.length > 12 * 1024)
      const entries = []
      for (let i = 0; i < 40; i++) {
        const pName = `sibling-${i}`
        const pDir = join(mktDir, 'plugins', pName)
        write(join(pDir, 'assets', 'icon.png'), siblingPng)
        entries.push({ name: pName, source: `./plugins/${pName}` })
      }
      const targetDir = join(mktDir, 'plugins', 'fast-target')
      const targetIcon = join(targetDir, 'assets', 'icon.svg')
      write(targetIcon, svgA)
      entries.push({ name: 'fast-target', source: './plugins/fast-target' })
      write(join(mktDir, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: entries }))

      invalidateMarketplaceCache('big-market')
      const previewsDir = join(marketRoot(), 'icons', 'previews')
      rmSync(previewsDir, { recursive: true, force: true })

      const targetUrl = `/universal-plugin-hub/api/plugin-icon?sourceId=big-market&name=fast-target&path=${encodeURIComponent('./assets/icon.svg')}`
      const first = await request(targetUrl)
      assert.equal(first.status, 200)
      assert.deepEqual(first.body, svgA)
      assert.equal(existsSync(previewsDir), false, 'must NOT scan/generate sibling plugin previews on GET /plugin-icon')

      // Traversal attempts must return 404 immediately even when target is warm in cache
      const traversal = `/universal-plugin-hub/api/plugin-icon?sourceId=big-market&name=fast-target&path=${encodeURIComponent('../../../.claude-plugin/marketplace.json')}`
      assert.equal((await request(traversal)).status, 404)

      const outsideFile = join(root, 'secret-outside.svg')
      write(outsideFile, svgA)
      const linkPath = join(targetDir, 'assets', 'escape.svg')
      try {
        symlinkSync(outsideFile, linkPath)
        const escapedUrl = `/universal-plugin-hub/api/plugin-icon?sourceId=big-market&name=fast-target&path=${encodeURIComponent('./assets/escape.svg')}`
        assert.equal((await request(escapedUrl)).status, 404, 'symlink escaping plugin dir must return 404')
      } catch {
        // Symlink creation may require privilege on some Windows configs; traversal check above still runs.
      }

      // Warm cached /plugin-icon timing check (200 requests should be very fast)
      const t0 = performance.now()
      for (let i = 0; i < 200; i++) {
        const res = await request(targetUrl)
        assert.equal(res.status, 200)
      }
      const elapsedMs = performance.now() - t0
      assert.ok(elapsedMs < 500, `200 cached /plugin-icon requests took ${elapsedMs.toFixed(1)}ms, expected < 500ms`)

      // Removing the icon file invalidates cache immediately and returns 404
      rmSync(targetIcon, { force: true })
      assert.equal((await request(targetUrl)).status, 404)

      // Direct installedDir resolution works even without marketplace manifest
      write(join(installedDir('direct-installed'), 'assets', 'installed.svg'), svgB)
      writeState({
        sources: [{ id: 'missing-market', name: 'Missing Market', url: 'https://example.test/repo.git' }],
        plugins: [{ name: 'direct-installed', sourceId: 'missing-market', enabled: true }],
      })
      const instUrl = `/universal-plugin-hub/api/plugin-icon?sourceId=missing-market&name=direct-installed&path=${encodeURIComponent('./assets/installed.svg')}`
      const instRes = await request(instUrl)
      assert.equal(instRes.status, 200)
      assert.deepEqual(instRes.body, svgB)
      rmSync(installedDir('direct-installed'), { recursive: true, force: true })
      assert.equal((await request(instUrl)).status, 404)
    })

    await t.test('getOrFetchIcon attaches etag & immutable flag, keeps bundled assets cached across >256 remote icons, and enforces true LRU on memory & failures', async () => {
      // 1. Bundled asset metadata & retention across memory eviction
      globalThis.fetch = () => { throw new Error('must not fetch bundled') }
      const b1 = await getOrFetchIcon(bundledEntry.url)
      assert.equal(b1.immutable, true)
      assert.match(b1.etag, /^"[^"]+"$/)

      // 2. True LRU for memory cache (capacity 256)
      let remoteCalls = new Map()
      globalThis.fetch = async (target) => {
        remoteCalls.set(target, (remoteCalls.get(target) || 0) + 1)
        return new Response(svgA, { headers: { 'content-type': 'image/svg+xml' } })
      }
      const memUrls = Array.from({ length: 257 }, (_, i) => `https://lru-mem.example.test/icon-${i}.svg`)
      for (let i = 0; i < 256; i++) {
        const res = await getOrFetchIcon(memUrls[i])
        assert.equal(res.immutable, false)
        assert.match(res.etag, /^"[^"]+"$/)
      }
      // Remove disk cache for u0 and u1 so only in-memory LRU determines hits vs network
      rmSync(urlDiskCache(memUrls[0]), { force: true })
      rmSync(urlDiskCache(memUrls[1]), { force: true })

      // Touch u0 -> refreshes its recency under true LRU
      await getOrFetchIcon(memUrls[0])
      assert.equal(remoteCalls.get(memUrls[0]), 1, 'u0 should be served from memory')

      // Insert 257th item -> evicts u1 (least recently used), NOT u0
      await getOrFetchIcon(memUrls[256])

      await getOrFetchIcon(memUrls[0])
      assert.equal(remoteCalls.get(memUrls[0]), 1, 'u0 must remain cached in memory after LRU touch')
      await getOrFetchIcon(memUrls[1])
      assert.equal(remoteCalls.get(memUrls[1]), 2, 'u1 should have been evicted as LRU')

      // Bundled icon must still be served with 0 network even after >256 remote icons filled memory
      globalThis.fetch = () => { throw new Error('bundled icon was evicted or attempted network') }
      const b2 = await getOrFetchIcon(bundledEntry.url)
      assert.equal(b2.etag, b1.etag)
      assert.equal(b2.immutable, true)

      // 3. True LRU for failures cooldown cache (capacity 256)
      const failCalls = new Map()
      globalThis.fetch = async (target) => {
        failCalls.set(target, (failCalls.get(target) || 0) + 1)
        return new Response('nope', { status: 500 })
      }
      const failUrls = Array.from({ length: 257 }, (_, i) => `https://lru-fail.example.test/bad-${i}.svg`)
      for (let i = 0; i < 256; i++) {
        await assert.rejects(getOrFetchIcon(failUrls[i]))
      }
      // Touch f0 -> still in cooldown (0 new fetches) and refreshes recency under true LRU
      await assert.rejects(getOrFetchIcon(failUrls[0]), /temporarily/)
      assert.equal(failCalls.get(failUrls[0]), 1)

      // Fail 257th URL -> evicts f1, keeps f0
      await assert.rejects(getOrFetchIcon(failUrls[256]))

      await assert.rejects(getOrFetchIcon(failUrls[0]), /temporarily/)
      assert.equal(failCalls.get(failUrls[0]), 1, 'f0 cooldown must remain active after LRU touch')

      await assert.rejects(getOrFetchIcon(failUrls[1]))
      assert.equal(failCalls.get(failUrls[1]), 2, 'f1 cooldown should have been evicted as LRU')
    })

    await t.test('previewMemory supports 512 entries with true LRU eviction and inlinePreview preserves alpha, <= 12KB size, and fast area-sampling', () => {
      // Clear previews dir and verify capacity 512 + true LRU
      const previewsDir = join(marketRoot(), 'icons', 'previews')
      const largeSample = makeTranslucentPng(512, 512)
      assert.ok(largeSample.length > 12 * 1024 && largeSample.length <= 2 * 1024 * 1024)

      const pluginDirs = []
      for (let i = 0; i < 513; i++) {
        const d = join(root, 'lru-previews', `p-${i}`)
        write(join(d, 'assets', 'icon.png'), largeSample)
        pluginDirs.push(d)
      }

      // Populate 300 entries first (> old 256 cap)
      for (let i = 0; i < 300; i++) {
        const icons = buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: `p-${i}`, dir: pluginDirs[i] })
        assert.ok(icons.previews[icons.light[0]])
      }
      rmSync(previewsDir, { recursive: true, force: true })
      buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'p-0', dir: pluginDirs[0] })
      assert.equal(existsSync(previewsDir), false, 'previewMemory capacity must retain 300+ entries without evicting p-0')

      // Fill cleanly 0..511 in sequence so p-0..p-511 occupy all 512 slots with q0 oldest -> wait: use fresh set of 512!
      const qDirs = []
      for (let i = 0; i < 513; i++) {
        const d = join(root, 'lru-previews-512', `q-${i}`)
        write(join(d, 'assets', 'icon.png'), largeSample)
        qDirs.push(d)
      }
      for (let i = 0; i < 512; i++) {
        buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: `q-${i}`, dir: qDirs[i] })
      }
      rmSync(previewsDir, { recursive: true, force: true })

      // Touch q-0 (hit -> moves q-0 to MRU, making q-1 the LRU)
      buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'q-0', dir: qDirs[0] })
      assert.equal(existsSync(previewsDir), false, 'q-0 should hit previewMemory at capacity 512')

      // Insert q-512 -> evicts q-1, keeps q-0
      buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'q-512', dir: qDirs[512] })
      rmSync(previewsDir, { recursive: true, force: true })

      buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'q-0', dir: qDirs[0] })
      assert.equal(existsSync(previewsDir), false, 'q-0 must stay in previewMemory after LRU touch')

      buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'q-1', dir: qDirs[1] })
      assert.equal(existsSync(previewsDir), true, 'q-1 should be evicted as LRU and recompute preview')

      // Verify inlinePreview preserves alpha, <= 12KB on 1024px PNGs, and runs rapidly
      const bigTrans = makeTranslucentPng(1024, 512)
      const transDir = join(root, 'big-trans')
      write(join(transDir, 'assets', 'icon.png'), bigTrans)
      const t0 = performance.now()
      const transIcons = buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'big-trans', dir: transDir })
      const elapsedBig = performance.now() - t0
      const transBuf = Buffer.from(transIcons.previews[transIcons.light[0]].split(',')[1], 'base64')
      assert.ok(transBuf.length <= 12 * 1024, `preview size ${transBuf.length} must be <= 12KB`)
      const decoded = PNG.sync.read(transBuf)
      assert.equal(decoded.width, 96)
      assert.equal(decoded.height, 48)
      // Top-left corner is transparent (alpha=0), center is opaque (alpha=255), ring has intermediate alpha
      assert.equal(decoded.data[3], 0)
      const centerAlpha = decoded.data[(24 * 96 + 48) * 4 + 3]
      assert.equal(centerAlpha, 255)
      let hasTranslucent = false
      for (let i = 3; i < decoded.data.length; i += 4) {
        if (decoded.data[i] > 10 && decoded.data[i] < 245) { hasTranslucent = true; break }
      }
      assert.equal(hasTranslucent, true, 'must preserve translucent alpha values')
      assert.ok(elapsedBig < 1500, `1024x512 inlinePreview took ${elapsedBig.toFixed(1)}ms`)

      // Also verify noisy 1024x512 PNG stays <= 12KB under deflateLevel: 6
      const noisy = makeNoisyPng(1024, 512, 54321)
      const noisyDir = join(root, 'big-noisy')
      write(join(noisyDir, 'assets', 'icon.png'), noisy)
      const noisyIcons = buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'big-noisy', dir: noisyDir })
      const noisyBuf = Buffer.from(noisyIcons.previews[noisyIcons.light[0]].split(',')[1], 'base64')
      assert.ok(noisyBuf.length <= 12 * 1024, `noisy preview size ${noisyBuf.length} must be <= 12KB`)
    })

    await t.test('real HTTP server returns 200 ETag and 304 Not Modified empty body across icon endpoints', async () => {
      const mktDir = sourceCacheDir('http-market')
      const iconFile = join(mktDir, 'plugins', 'p', 'icon.svg')
      write(iconFile, svgA)
      write(join(mktDir, '.claude-plugin', 'marketplace.json'), JSON.stringify({
        plugins: [{ name: 'p', source: './plugins/p' }],
      }))
      const info = statSync(iconFile)
      const server = createServer((req, res) => handler(req, res))
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      try {
        const base = `http://127.0.0.1:${server.address().port}`
        const url = `${base}/universal-plugin-hub/api/plugin-icon?sourceId=http-market&name=p&path=icon.svg&v=${info.mtimeMs}-${info.size}`
        const r1 = await oldFetch(url)
        assert.equal(r1.status, 200)
        assert.equal(r1.headers.get('cache-control'), 'public, max-age=31536000, immutable')
        const etag = r1.headers.get('etag')
        assert.match(etag, /^"[^"]+"$/)
        assert.deepEqual(Buffer.from(await r1.arrayBuffer()), svgA)

        const r2 = await oldFetch(url, { headers: { 'If-None-Match': `W/${etag}` } })
        assert.equal(r2.status, 304)
        assert.equal((await r2.arrayBuffer()).byteLength, 0)
        assert.equal(r2.headers.get('etag'), etag)
        assert.equal(r2.headers.get('cache-control'), 'public, max-age=31536000, immutable')
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    })
  } finally {
    globalThis.fetch = oldFetch
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
    if (oldAgents === undefined) delete process.env.DSH_AGENTS_HOME
    else process.env.DSH_AGENTS_HOME = oldAgents
    invalidateMarketplaceCache()
    rmSync(root, { recursive: true, force: true })
  }
})
