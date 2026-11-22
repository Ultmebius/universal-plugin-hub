import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { parse } from 'acorn'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const root = mkdtempSync(join(tmpdir(), 'uph-speed-ver-modal-'))
const prevEnv = {
  DSH_HOME: process.env.DSH_HOME,
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  DSH_PROFILE: process.env.DSH_PROFILE,
  UPH_OAUTH_STORE_DIR: process.env.UPH_OAUTH_STORE_DIR,
}

// Test isolation: env vars must be set before dynamically importing ../src/*.js.
process.env.DSH_HOME = join(root, 'dsh')
process.env.HOME = join(root, 'home')
process.env.USERPROFILE = join(root, 'home')
process.env.DSH_PROFILE = 'desktop'
process.env.UPH_OAUTH_STORE_DIR = join(root, 'oauth-creds')

const spawnedChildren = new Set()

after(() => {
  for (const child of spawnedChildren) {
    try { child.kill() } catch {}
  }
  spawnedChildren.clear()
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const store = await import('../src/store.js')
const parser = await import('../src/parser.js')
const market = await import('../src/market.js')
const install = await import('../src/install.js')
const { mountRoutes } = await import('../src/routes.js')

const FETCH_BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6697, 10080,
])

async function listenSafe(server) {
  for (let i = 0; i < 8; i++) {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = server.address().port
    if (!FETCH_BAD_PORTS.has(port)) return port
    await new Promise((resolve) => server.close(resolve))
  }
  throw new Error('unable to allocate fetch-safe loopback port')
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, windowsHide: true, encoding: 'utf8' }).trim()
}

function initWorkRepo(dirName) {
  const work = join(root, `${dirName}-work`)
  const bare = join(root, `${dirName}.git`)
  mkdirSync(work, { recursive: true })
  git(work, 'init', '-b', 'main')
  git(work, 'config', 'user.email', 'test@example.com')
  git(work, 'config', 'user.name', 'Test')
  return { work, bare }
}

function commitAll(work, message = 'commit') {
  git(work, 'add', '.')
  git(work, 'commit', '-m', message)
}

function createGitHttpServer(bareMap, { onUploadPack } = {}) {
  const server = createServer(async (req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1')
    const bare = bareMap(reqUrl.pathname)
    if (!bare) {
      res.writeHead(404)
      res.end()
      return
    }
    const gitEnv = req.headers['git-protocol']
      ? { ...process.env, GIT_PROTOCOL: String(req.headers['git-protocol']) }
      : process.env
    if (reqUrl.pathname.endsWith('/info/refs') && reqUrl.searchParams.get('service') === 'git-upload-pack') {
      const proc = spawn('git', ['upload-pack', '--stateless-rpc', '--advertise-refs', bare], { windowsHide: true, env: gitEnv })
      spawnedChildren.add(proc)
      proc.once('exit', () => spawnedChildren.delete(proc))
      const chunks = [Buffer.from('001e# service=git-upload-pack\n0000')]
      proc.stdout.on('data', (c) => chunks.push(c))
      proc.once('close', () => {
        res.writeHead(200, { 'Content-Type': 'application/x-git-upload-pack-advertisement' })
        res.end(Buffer.concat(chunks))
      })
      return
    }
    if (reqUrl.pathname.endsWith('/git-upload-pack') && req.method === 'POST') {
      if (onUploadPack) await onUploadPack(reqUrl.pathname)
      const proc = spawn('git', ['upload-pack', '--stateless-rpc', bare], { windowsHide: true, env: gitEnv })
      spawnedChildren.add(proc)
      proc.once('exit', () => spawnedChildren.delete(proc))
      res.writeHead(200, { 'Content-Type': 'application/x-git-upload-pack-result' })
      req.pipe(proc.stdin)
      proc.stdout.pipe(res)
      return
    }
    res.writeHead(404)
    res.end()
  })
  return server
}

test('self-referential git-subdir reuses source clone and preserves metadata.version across install, detail reads, and update', async () => {
  const { work, bare } = initWorkRepo('ppt-mirror')
  const server = createGitHttpServer((pathname) => (pathname.startsWith('/hugo/ppt-master') ? bare : null))
  const port = await listenSafe(server)
  const repoUrl = `http://127.0.0.1:${port}/hugo/ppt-master.git`

  write(join(work, '.claude-plugin', 'marketplace.json'), {
    name: 'ppt-master',
    metadata: { version: '6.10.0', description: 'PPT Master' },
    plugins: [
      {
        name: 'ppt-master',
        source: { source: 'git-subdir', url: repoUrl, path: 'skills' },
        description: 'Generate PPTX',
        author: { name: 'Hugo He' },
      },
    ],
  })
  write(join(work, 'skills', '.claude-plugin', 'plugin.json'), {
    name: 'ppt-master',
    description: 'Generate PPTX',
    skills: './',
  })
  write(join(work, 'skills', 'ppt-master', 'SKILL.md'), '---\nname: ppt-master\ndescription: PPT skill\n---\n# PPT\n')
  write(join(work, 'skills', 'ppt-master', 'templates', 'sample.svg'), '<svg/>')
  write(join(work, 'docs', 'large-doc.md'), 'Unrelated root docs')
  commitAll(work, 'v6.10.0')
  execFileSync('git', ['clone', '--bare', work, bare], { windowsHide: true })

  const sourceId = 'hugohe3-ppt-master'
  try {
    await market.ensureSourceCloned(sourceId, repoUrl)
    const state0 = store.readState()
    store.writeState({
      ...state0,
      sources: [...state0.sources.filter((s) => s.id !== sourceId), { id: sourceId, name: 'PPT Master', url: repoUrl, addedAt: Date.now() }],
    })
    parser.invalidateMarketplaceCache(sourceId)

    const rows = parser.readMarketplace(sourceId)
    assert.equal(rows[0].version, '6.10.0')

    // Materialize must reuse sourceCacheDir(sourceId) without cloning into market/remote/
    const mat = await market.materializePlugin(sourceId, 'ppt-master', rows[0].source)
    assert.equal(mat.dir, join(store.sourceCacheDir(sourceId), 'skills'))
    assert.equal(existsSync(store.sourceCacheDir('remote')), false, 'self-referential git-subdir must not create market/remote clone')

    const res = await install.installPlugin({ sourceId, pluginName: 'ppt-master' })
    assert.equal(res.ok, true)
    assert.equal(res.plugin.version, '6.10.0')
    assert.equal(existsSync(store.sourceCacheDir('remote')), false)

    // buildInstalledPluginDetail / installedDetails / installedPluginDetail must preserve state rec.version
    assert.equal(store.readState().plugins.find((p) => p.name === 'ppt-master')?.version, '6.10.0')
    assert.equal(install.installedPluginDetail('ppt-master')?.version, '6.10.0')
    assert.equal(install.installedDetails().find((p) => p.name === 'ppt-master')?.version, '6.10.0')

    // Push v6.11.0 to bare and run updatePlugin — version must advance and stay non-null
    write(join(work, '.claude-plugin', 'marketplace.json'), {
      name: 'ppt-master',
      metadata: { version: '6.11.0', description: 'PPT Master' },
      plugins: [
        {
          name: 'ppt-master',
          source: { source: 'git-subdir', url: repoUrl, path: 'skills' },
          description: 'Generate PPTX',
          author: { name: 'Hugo He' },
        },
      ],
    })
    commitAll(work, 'v6.11.0')
    execFileSync('git', ['push', bare, 'main:main'], { cwd: work, windowsHide: true })

    const updated = await install.updatePlugin('ppt-master')
    assert.equal(updated.ok, true)
    assert.equal(updated.plugin.version, '6.11.0')
    assert.equal(install.installedPluginDetail('ppt-master')?.version, '6.11.0')
    assert.equal(existsSync(store.sourceCacheDir('remote')), false)
  } finally {
    await install.uninstallPlugin('ppt-master').catch(() => {})
    server.closeAllConnections?.()
    server.close()
    store.safeRmDir(store.sourceCacheDir(sourceId), { allowTrash: false })
  }
})

test('external git-subdir uses sparse-checkout (or clean fallback), refreshes stale cache on install, and excludes .git', async () => {
  // Sparse server (uploadpack.allowFilter=true) + fallback server (uploadpack.allowFilter=false)
  const { work: spWork, bare: spBare } = initWorkRepo('ext-sparse')
  write(join(spWork, 'plugins', 'sub-a', '.claude-plugin', 'plugin.json'), { name: 'sub-a', version: '1.0.0' })
  write(join(spWork, 'plugins', 'sub-a', 'skills', 'skill-a', 'SKILL.md'), '---\nname: skill-a\ndescription: A\n---\n# A\n')
  write(join(spWork, 'plugins', 'sub-b', '.claude-plugin', 'plugin.json'), { name: 'sub-b', version: '1.0.0' })
  write(join(spWork, 'plugins', 'sub-b', 'skills', 'skill-b', 'SKILL.md'), '---\nname: skill-b\ndescription: B\n---\n# B\n')
  write(join(spWork, 'heavy', 'ignored.txt'), 'not checked out by sparse cone')
  commitAll(spWork, 'init sparse')
  execFileSync('git', ['clone', '--bare', spWork, spBare], { windowsHide: true })
  git(spBare, 'config', 'uploadpack.allowFilter', 'true')

  const { work: fbWork, bare: fbBare } = initWorkRepo('ext-fallback')
  write(join(fbWork, 'sub', '.claude-plugin', 'plugin.json'), { name: 'fb-plug', version: '1.0.0' })
  write(join(fbWork, 'sub', 'skills', 'fb-skill', 'SKILL.md'), '---\nname: fb-skill\ndescription: FB\n---\n# FB\n')
  commitAll(fbWork, 'init fb')
  execFileSync('git', ['clone', '--bare', fbWork, fbBare], { windowsHide: true })
  git(fbBare, 'config', 'uploadpack.allowFilter', 'false')

  const server = createGitHttpServer((pathname) => {
    if (pathname.startsWith('/org/sparse')) return spBare
    if (pathname.startsWith('/org/fallback')) return fbBare
    return null
  })
  const port = await listenSafe(server)
  const sparseUrl = `http://127.0.0.1:${port}/org/sparse.git`
  const fallbackUrl = `http://127.0.0.1:${port}/org/fallback.git`

  const sourceId = 'ext-sparse-mkt'
  const mktCache = store.sourceCacheDir(sourceId)
  write(join(mktCache, '.claude-plugin', 'marketplace.json'), {
    name: 'External Sparse Market',
    plugins: [
      { name: 'sub-a', version: '1.0.0', source: { source: 'git-subdir', url: sparseUrl, path: 'plugins/sub-a' } },
      { name: 'sub-b', version: '1.0.0', source: { source: 'git-subdir', url: sparseUrl, path: 'plugins/sub-b' } },
      { name: 'fb-plug', version: '1.0.0', source: { source: 'git-subdir', url: fallbackUrl, path: 'sub' } },
    ],
  })
  const st = store.readState()
  store.writeState({
    ...st,
    sources: [...st.sources.filter((s) => s.id !== sourceId), { id: sourceId, name: 'Ext', url: 'local:ext', addedAt: Date.now() }],
  })
  parser.invalidateMarketplaceCache(sourceId)

  try {
    // 1. Preview sub-a -> triggers sparse checkout (only plugins/sub-a checked out)
    const matA = await market.materializePlugin(sourceId, 'sub-a', { source: 'git-subdir', url: sparseUrl, path: 'plugins/sub-a' })
    assert.equal(existsSync(join(matA.dir, 'skills', 'skill-a', 'SKILL.md')), true)
    const checkout = market.remoteCheckoutDir(sparseUrl)
    assert.equal(existsSync(join(checkout, '.git', 'info', 'sparse-checkout')), true, 'sparse checkout should be active when remote supports partial filter')
    assert.equal(existsSync(join(checkout, 'heavy', 'ignored.txt')), false, 'unrelated top-level dirs should be excluded by sparse checkout')

    // 2. Materializing sibling sub-b on the same checkout adds plugins/sub-b via sparse-checkout add
    const matB = await market.materializePlugin(sourceId, 'sub-b', { source: 'git-subdir', url: sparseUrl, path: 'plugins/sub-b' })
    assert.equal(existsSync(join(matB.dir, 'skills', 'skill-b', 'SKILL.md')), true)

    // Canonicalization of internal '..' in sparse path & rejection of traversal escape
    const matCanon = await market.materializePlugin(sourceId, 'sub-a', { source: 'git-subdir', url: sparseUrl, path: 'plugins/other/../sub-a' })
    assert.equal(matCanon.dir, matA.dir)
    await assert.rejects(
      () => market.materializePlugin(sourceId, 'escape', { source: 'git-subdir', url: sparseUrl, path: '../escape' }),
      /unsafe plugin path/,
    )

    // 3. Stale cache auto-refresh on install: bump sparse repo + market row to 2.0.0 while preview cache stays at 1.0.0
    write(join(spWork, 'plugins', 'sub-a', '.claude-plugin', 'plugin.json'), { name: 'sub-a', version: '2.0.0' })
    commitAll(spWork, 'bump sub-a to 2.0.0')
    execFileSync('git', ['push', spBare, 'main:main'], { cwd: spWork, windowsHide: true })
    write(join(mktCache, '.claude-plugin', 'marketplace.json'), {
      name: 'External Sparse Market',
      plugins: [
        { name: 'sub-a', version: '2.0.0', source: { source: 'git-subdir', url: sparseUrl, path: 'plugins/sub-a' } },
        { name: 'sub-b', version: '1.0.0', source: { source: 'git-subdir', url: sparseUrl, path: 'plugins/sub-b' } },
        { name: 'fb-plug', version: '1.0.0', source: { source: 'git-subdir', url: fallbackUrl, path: 'sub' } },
      ],
    })
    parser.invalidateMarketplaceCache(sourceId)

    const instA = await install.installPlugin({ sourceId, pluginName: 'sub-a' })
    assert.equal(instA.plugin.version, '2.0.0', 'stale remote cache must auto-refresh when marketplace row declares newer version')

    // 4. Full-repo source on the same sparse checkout disables sparse-checkout cleanly
    const fullMat = await market.materializePlugin(sourceId, 'full-repo', { source: 'url', url: sparseUrl })
    assert.equal(existsSync(join(fullMat.dir, 'heavy', 'ignored.txt')), true)

    // 5. Fallback clone works when uploadpack.allowFilter is disabled
    const instFb = await install.installPlugin({ sourceId, pluginName: 'fb-plug' })
    assert.equal(instFb.ok, true)
    assert.equal(existsSync(join(store.installedDir('fb-plug'), '.git')), false, '.git must never be copied into installedDir')

    // Root-repo plugin (source: { source: 'url' }) also must not copy .git into installedDir
    write(join(mktCache, '.claude-plugin', 'marketplace.json'), {
      name: 'External Sparse Market',
      plugins: [
        { name: 'full-repo', version: '1.0.0', source: { source: 'url', url: fallbackUrl } },
      ],
    })
    parser.invalidateMarketplaceCache(sourceId)
    const instFull = await install.installPlugin({ sourceId, pluginName: 'full-repo' })
    assert.equal(instFull.ok, true)
    assert.equal(existsSync(join(store.installedDir('full-repo'), '.git')), false)
  } finally {
    for (const p of ['sub-a', 'sub-b', 'fb-plug', 'full-repo']) {
      await install.uninstallPlugin(p).catch(() => {})
    }
    server.closeAllConnections?.()
    server.close()
    store.safeRmDir(mktCache, { allowTrash: false })
    store.safeRmDir(store.sourceCacheDir('remote'), { allowTrash: false })
  }
})

test('concurrent install/update calls (including case variants) reject immediately with 409 conflict', async () => {
  const { work, bare } = initWorkRepo('concurrency')
  write(join(work, '.claude-plugin', 'plugin.json'), { name: 'race-plug', version: '1.0.0' })
  write(join(work, 'skills', 'race-skill', 'SKILL.md'), '---\nname: race-skill\ndescription: R\n---\n# R\n')
  commitAll(work, 'init race')
  execFileSync('git', ['clone', '--bare', work, bare], { windowsHide: true })

  let gateResolve = null
  let armGate = false
  const server = createGitHttpServer(
    (pathname) => (pathname.startsWith('/org/race') ? bare : null),
    {
      onUploadPack: async () => {
        if (armGate) {
          armGate = false
          await new Promise((resolve) => { gateResolve = resolve })
        }
      },
    },
  )
  const port = await listenSafe(server)
  const repoUrl = `http://127.0.0.1:${port}/org/race.git`

  const sourceId = 'race-mkt'
  const mktCache = store.sourceCacheDir(sourceId)
  write(join(mktCache, '.claude-plugin', 'marketplace.json'), {
    name: 'Race Market',
    plugins: [{ name: 'race-plug', version: '1.0.0', source: { source: 'url', url: repoUrl } }],
  })
  const st = store.readState()
  store.writeState({
    ...st,
    sources: [...st.sources.filter((s) => s.id !== sourceId), { id: sourceId, name: 'Race', url: 'local:race', addedAt: Date.now() }],
  })
  parser.invalidateMarketplaceCache(sourceId)

  const apiServer = createServer()
  let unregister = () => {}
  let handlerRegistered = false
  const fakeApp = {
    register({ handler }) {
      apiServer.on('request', handler)
      handlerRegistered = true
      return () => {
        handlerRegistered = false
        apiServer.off('request', handler)
      }
    },
  }
  unregister = mountRoutes(fakeApp, null, () => {})
  assert.equal(handlerRegistered, true)

  try {
    const apiPort = await listenSafe(apiServer)
    // Wait until upload-pack gate is held mid-install
    armGate = true
    const firstInstall = fetch(`http://127.0.0.1:${apiPort}/universal-plugin-hub/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${apiPort}` },
      body: JSON.stringify({ sourceId, pluginName: 'race-plug' }),
    })

    // Poll briefly until gateResolve is captured (in-flight upload-pack)
    for (let i = 0; i < 100 && !gateResolve; i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    assert.ok(gateResolve, 'first install should hold git upload-pack in flight')

    const dupHttp = await fetch(`http://127.0.0.1:${apiPort}/universal-plugin-hub/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${apiPort}` },
      body: JSON.stringify({ sourceId, pluginName: 'race-plug' }),
    })
    assert.equal(dupHttp.status, 409)
    const dupBody = await dupHttp.json()
    assert.match(dupBody.error, /正在安装/)

    await assert.rejects(
      () => install.installPlugin({ sourceId, pluginName: 'Race-Plug' }),
      (err) => err.status === 409 && /正在安装/.test(err.message),
    )
    await assert.rejects(
      () => install.updatePlugin('race-plug'),
      (err) => err.status === 409 && /正在安装/.test(err.message),
    )

    gateResolve()
    gateResolve = null
    const firstRes = await firstInstall
    assert.equal(firstRes.status, 200)
    const firstJson = await firstRes.json()
    assert.equal(firstJson.ok, true)

    // Now test concurrent updatePlugin calls
    armGate = true
    const firstUpdate = install.updatePlugin('race-plug')
    for (let i = 0; i < 100 && !gateResolve; i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    assert.ok(gateResolve, 'first update should hold git upload-pack in flight')

    await assert.rejects(
      () => install.updatePlugin('RACE-PLUG'),
      (err) => err.status === 409 && /正在更新/.test(err.message),
    )
    await assert.rejects(
      () => install.installPlugin({ sourceId, pluginName: 'race-plug' }),
      (err) => err.status === 409 && /正在更新/.test(err.message),
    )

    gateResolve()
    const updateRes = await firstUpdate
    assert.equal(updateRes.ok, true)
    assert.equal(existsSync(join(store.installedDir('race-plug'), 'skills', 'race-skill', 'SKILL.md')), true)
  } finally {
    gateResolve?.()
    await install.uninstallPlugin('race-plug').catch(() => {})
    unregister()
    apiServer.closeAllConnections?.()
    apiServer.close()
    server.closeAllConnections?.()
    server.close()
    store.safeRmDir(mktCache, { allowTrash: false })
    store.safeRmDir(store.sourceCacheDir('remote'), { allowTrash: false })
  }
})

test('copyDirAsync excludes .git, pure-skill top-level dirs move without duplicating, and deferCleanup quarantines cleanly', async () => {
  // 1. copyDir / copyDirAsync + excludeNames + dangling/cyclic symlink resilience + worker drain on error
  const srcDir = join(root, 'async-copy-src')
  const dstDir = join(root, 'async-copy-dst')
  const syncDstDir = join(root, 'sync-copy-dst')
  write(join(srcDir, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  write(join(srcDir, 'nested', 'a.txt'), 'alpha')
  write(join(srcDir, 'nested', 'deep', 'b.txt'), 'beta')
  symlinkSync(srcDir, join(srcDir, 'nested', 'loop'), process.platform === 'win32' ? 'junction' : 'dir')
  try {
    symlinkSync(join(root, 'does-not-exist'), join(srcDir, 'dangling-link'))
  } catch {}
  parser.copyDir(srcDir, syncDstDir)
  assert.equal(readFileSync(join(syncDstDir, 'nested', 'a.txt'), 'utf8'), 'alpha')
  await parser.copyDirAsync(srcDir, dstDir, { excludeNames: new Set(['.git']) })
  assert.equal(existsSync(join(dstDir, '.git')), false)
  assert.equal(readFileSync(join(dstDir, 'nested', 'a.txt'), 'utf8'), 'alpha')
  assert.equal(readFileSync(join(dstDir, 'nested', 'deep', 'b.txt'), 'utf8'), 'beta')

  const errSrc = join(root, 'async-err-src')
  const errDst = join(root, 'async-err-dst')
  write(join(errSrc, 'a.txt'), 'ok-a')
  write(join(errSrc, 'b.txt'), 'fail-b')
  write(join(errSrc, 'c.txt'), 'ok-c')
  mkdirSync(join(errDst, 'b.txt'), { recursive: true })
  await assert.rejects(() => parser.copyDirAsync(errSrc, errDst, { concurrency: 2 }))
  const snapshotAfterReject = readdirSync(errDst).sort()
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(readdirSync(errDst).sort(), snapshotAfterReject, 'no background worker may write to dest after copyDirAsync rejects')

  // 2. Pure-skill top-level move vs PLUGIN_ROOT / root SKILL.md / $PLUGIN_ROOT_EXTRA handling
  const srcId = 'move-vs-copy'
  const mkt = store.sourceCacheDir(srcId)
  const pureSrc = join(mkt, 'plugins', 'pure-top')
  write(join(pureSrc, '.claude-plugin', 'plugin.json'), { name: 'pure-top', version: '1.2.3', skills: './' })
  write(join(pureSrc, 'pure-skill', 'SKILL.md'), '---\nname: pure-skill\ndescription: pure\n---\nNo env vars\n')
  write(join(pureSrc, 'pure-skill', 'templates', 'a.svg'), '<svg/>')

  const rootVarSrc = join(mkt, 'plugins', 'var-top')
  write(join(rootVarSrc, '.claude-plugin', 'plugin.json'), { name: 'var-top', version: '1.0.0', skills: './' })
  write(join(rootVarSrc, 'var-skill', 'SKILL.md'), '---\nname: var-skill\ndescription: uses root\n---\nRun `${PLUGIN_ROOT}/var-skill/run.py`\n')
  write(join(rootVarSrc, 'var-skill', 'run.py'), 'print(1)\n')

  const prefixVarSrc = join(mkt, 'plugins', 'prefix-var-top')
  write(join(prefixVarSrc, '.claude-plugin', 'plugin.json'), { name: 'prefix-var-top', version: '1.0.0', skills: './' })
  write(join(prefixVarSrc, 'prefix-skill', 'SKILL.md'), '---\nname: prefix-skill\ndescription: extra\n---\nEcho `$PLUGIN_ROOT_EXTRA`\n')

  const bothRootSrc = join(mkt, 'plugins', 'both-root')
  write(join(bothRootSrc, '.claude-plugin', 'plugin.json'), { name: 'both-root', version: '1.0.0', skills: './' })
  write(join(bothRootSrc, 'SKILL.md'), '---\nname: both-root\ndescription: root skill\n---\nRoot\n')
  write(join(bothRootSrc, 'helper-sub', 'SKILL.md'), '---\nname: helper-sub\ndescription: helper\n---\nSub\n')

  write(join(mkt, '.claude-plugin', 'marketplace.json'), {
    name: 'Move Vs Copy',
    plugins: [
      { name: 'pure-top', source: './plugins/pure-top', version: '1.2.3' },
      { name: 'var-top', source: './plugins/var-top', version: '1.0.0' },
      { name: 'prefix-var-top', source: './plugins/prefix-var-top', version: '1.0.0' },
      { name: 'both-root', source: './plugins/both-root', version: '1.0.0' },
    ],
  })
  const st = store.readState()
  store.writeState({
    ...st,
    sources: [...st.sources.filter((s) => s.id !== srcId), { id: srcId, name: 'MoveVsCopy', url: `local:${srcId}`, addedAt: Date.now() }],
  })
  parser.invalidateMarketplaceCache(srcId)

  try {
    await install.installPlugin({ sourceId: srcId, pluginName: 'pure-top' })
    const pureTarget = store.installedDir('pure-top')
    assert.equal(existsSync(join(pureTarget, 'skills', 'pure-skill', 'SKILL.md')), true)
    assert.equal(existsSync(join(pureTarget, 'pure-skill')), false, 'pure-skill top-level dir should be moved instead of duplicated')
    assert.equal(existsSync(join(store.dshSkillsDir(), 'pure-skill', 'templates', 'a.svg')), true)
    assert.equal(install.installedPluginDetail('pure-top').skills.length, 1)

    await install.togglePlugin('pure-top', false)
    assert.equal(existsSync(join(store.dshSkillsDir(), 'pure-skill')), false)
    await install.togglePlugin('pure-top', true)
    assert.equal(existsSync(join(store.dshSkillsDir(), 'pure-skill', 'SKILL.md')), true)

    await install.installPlugin({ sourceId: srcId, pluginName: 'var-top' })
    const varTarget = store.installedDir('var-top')
    assert.equal(existsSync(join(varTarget, 'skills', 'var-skill', 'SKILL.md')), true)
    assert.equal(existsSync(join(varTarget, 'var-skill', 'run.py')), true, 'PLUGIN_ROOT skill must keep top-level directory intact')

    await install.installPlugin({ sourceId: srcId, pluginName: 'prefix-var-top' })
    const prefixTarget = store.installedDir('prefix-var-top')
    assert.equal(existsSync(join(prefixTarget, 'skills', 'prefix-skill', 'SKILL.md')), true)
    assert.equal(existsSync(join(prefixTarget, 'prefix-skill')), false, '$PLUGIN_ROOT_EXTRA must not block pure-skill move')

    await install.installPlugin({ sourceId: srcId, pluginName: 'both-root' })
    const bothTarget = store.installedDir('both-root')
    assert.equal(existsSync(join(bothTarget, 'skills', 'both-root', 'helper-sub', 'SKILL.md')), true, 'root SKILL.md must retain helper-sub when mirroring')
  } finally {
    for (const p of ['pure-top', 'var-top', 'prefix-var-top', 'both-root']) {
      await install.uninstallPlugin(p).catch(() => {})
    }
    store.safeRmDir(mkt, { allowTrash: false })
  }

  // 3. removeManagedDir(..., { deferCleanup: true }) + sweepTrash
  const trashTarget = join(root, 'dsh', 'agent-skills', 'universal-plugin-hub', 'defer-check')
  write(join(trashTarget, 'file.txt'), 'bye')
  store.removeManagedDir(trashTarget, { deferCleanup: true })
  assert.equal(existsSync(trashTarget), false, 'deferred removal should detach target synchronously')
  store.sweepTrash()
  if (existsSync(store.trashRoot())) {
    assert.deepEqual(readdirSync(store.trashRoot()), [])
  }
})

test('InstallDialog locks backdrop/Escape/Cancel during install and disables underlying Install triggers', async () => {
  const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const ast = parse(clientSource, { ecmaVersion: 'latest', sourceType: 'script' })
  const code = (node) => clientSource.slice(node.start, node.end)
  const nodes = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.type) nodes.push(n)
    for (const v of Object.values(n)) {
      for (const child of Array.isArray(v) ? v : [v]) walk(child)
    }
  }
  walk(ast)
  const func = (name) => nodes.find((n) => n.type === 'FunctionDeclaration' && n.id.name === name)

  const dismissFn = func('backdropDismissProps')
  const dialogFn = func('InstallDialog')
  assert.ok(dismissFn && dialogFn)

  const busyEvents = []
  let cancelCount = 0
  let resolveConfirm
  const context = {
    ...React,
    h: React.createElement,
    PluginIcon: () => null,
  }
  vm.runInNewContext(
    `${code(dismissFn)}\n${code(dialogFn)}\nglobalThis.InstallDialog = InstallDialog;`,
    context,
  )

  let view
  await act(async () => {
    view = create(
      React.createElement(context.InstallDialog, {
        plugin: { name: 'ppt-master', displayName: 'Ppt master', author: 'Hugo He', description: 'desc' },
        isDark: false,
        onBusyChange: (v) => busyEvents.push(v),
        onCancel: () => { cancelCount++ },
        onConfirm: () => new Promise((resolve) => { resolveConfirm = resolve }),
      }),
    )
  })

  try {
    const backdrop = () => view.root.findByProps({ className: 'cpm-dialog' })
    const btn = (label) => view.root.findAllByType('button').find((b) => b.children.includes(label))

    // Idle: backdrop click cancels
    const el = backdrop()
    const makeEvt = (target) => ({ button: 0, target, currentTarget: el })
    await act(async () => {
      el.props.onPointerDown(makeEvt(el))
      el.props.onClick(makeEvt(el))
    })
    assert.equal(cancelCount, 1, 'idle backdrop click dismisses InstallDialog')

    // Start install -> dialog must lock backdrop and Cancel button
    let confirmPromise
    await act(async () => {
      confirmPromise = btn('确认安装').props.onClick()
    })

    assert.equal(busyEvents.at(-1), true)
    assert.equal(btn('取消').props.disabled, true)
    assert.equal(btn('正在安装…')?.props.disabled, true)

    await act(async () => {
      const busyBackdrop = backdrop()
      const busyEvt = (target) => ({ button: 0, target, currentTarget: busyBackdrop })
      busyBackdrop.props.onPointerDown(busyEvt(busyBackdrop))
      busyBackdrop.props.onClick(busyEvt(busyBackdrop))
      btn('取消').props.onClick()
    })
    assert.equal(cancelCount, 1, 'backdrop click and Cancel must not dismiss while installing')

    await act(async () => {
      resolveConfirm()
      await confirmPromise
    })
    assert.equal(busyEvents.at(-1), false)
  } finally {
    await act(async () => view.unmount())
  }

  // Unmounted InstallDialog must NOT call onBusyChange(false) when late onConfirm resolves
  const lateBusyEvents = []
  let resolveLate
  let lateView
  await act(async () => {
    lateView = create(
      React.createElement(context.InstallDialog, {
        plugin: { name: 'late-plug', displayName: 'Late Plug' },
        isDark: false,
        onBusyChange: (v) => lateBusyEvents.push(v),
        onCancel: () => {},
        onConfirm: () => new Promise((resolve) => { resolveLate = resolve }),
      }),
    )
  })
  let latePromise
  await act(async () => {
    latePromise = lateView.root.findAllByType('button').find((b) => b.children.includes('确认安装')).props.onClick()
  })
  assert.deepEqual(lateBusyEvents, [true])
  await act(async () => lateView.unmount())
  await act(async () => {
    resolveLate()
    await latePromise
  })
  assert.deepEqual(lateBusyEvents, [true], 'unmounted InstallDialog must not emit onBusyChange(false)')

  // Verify BrowseView Escape guard + case-insensitive isPluginInstalling + DetailView / PluginCard installing props in client.js AST
  const browseFn = func('BrowseView')
  const detailFn = func('DetailView')
  const cardFn = func('PluginCard')
  assert.ok(browseFn && detailFn && cardFn)
  const browseCode = code(browseFn)
  const detailCode = code(detailFn)
  const cardCode = code(cardFn)

  assert.match(browseCode, /if\s*\(\s*installFor\s*&&\s*!installDialogBusyRef\.current\s*\)\s*setInstallFor\(null\)/)
  assert.match(browseCode, /if\s*\(\s*confirmRemoveSource\s*&&\s*!busy\s*\)\s*setConfirmRemoveSource\(null\)/)
  assert.match(browseCode, /isPluginInstalling\s*=\s*\(name\)\s*=>\s*installingNames\.has\(String\(name\s*\|\|\s*""\)\.toLowerCase\(\)\)/)
  assert.match(detailCode, /disabled:\s*busy\s*\|\|\s*installing/)
  assert.match(cardCode, /disabled:\s*installing/)
})
