import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, openSync, closeSync, readdirSync, statSync, symlinkSync, utimesSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'

const root = mkdtempSync(join(tmpdir(), 'uph-lifecycle-locking-'))
const prevHome = process.env.DSH_HOME
const prevProfile = process.env.DSH_PROFILE
const prevOauthDir = process.env.UPH_OAUTH_STORE_DIR
process.env.DSH_HOME = join(root, 'dsh')
process.env.DSH_PROFILE = 'desktop'
process.env.UPH_OAUTH_STORE_DIR = join(root, 'oauth-creds')

const spawnedChildren = new Set()

after(() => {
  for (const child of spawnedChildren) {
    try { child.kill() } catch {}
  }
  spawnedChildren.clear()
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome
  if (prevProfile === undefined) delete process.env.DSH_PROFILE
  else process.env.DSH_PROFILE = prevProfile
  if (prevOauthDir === undefined) delete process.env.UPH_OAUTH_STORE_DIR
  else process.env.UPH_OAUTH_STORE_DIR = prevOauthDir
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const store = await import('../src/store.js')
const parser = await import('../src/parser.js')
const install = await import('../src/install.js')
const { mountRoutes } = await import('../src/routes.js')

const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const clientAst = parse(clientSource, { ecmaVersion: 'latest', sourceType: 'script' })

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
}

function setupLocalSourcePlugin(sourceId, pluginName, { skills = ['exa-agent', 'search'], connectors = null, version = '1.0.0' } = {}) {
  const sourceDir = store.sourceCacheDir(sourceId)
  const marketFile = join(sourceDir, '.claude-plugin', 'marketplace.json')
  let existingPlugins = []
  if (existsSync(marketFile)) {
    try {
      existingPlugins = JSON.parse(readFileSync(marketFile, 'utf8')).plugins || []
    } catch {}
  }
  const entry = {
    name: pluginName,
    displayName: pluginName,
    version,
    description: `${pluginName} desc`,
    source: `./plugins/${pluginName}`,
  }
  const mergedPlugins = [...existingPlugins.filter((p) => p.name !== pluginName), entry]
  const pluginDir = join(sourceDir, 'plugins', pluginName)
  write(marketFile, {
    name: `${sourceId}-market`,
    plugins: mergedPlugins,
  })
  write(join(pluginDir, '.claude-plugin', 'plugin.json'), {
    name: pluginName,
    version,
    description: `${pluginName} desc`,
  })
  for (const s of skills) {
    write(join(pluginDir, 'skills', s, 'SKILL.md'), `---\nname: ${s}\ndescription: ${s} skill\n---\n\n# ${s}\n`)
    write(join(pluginDir, 'skills', s, 'references', 'doc.md'), `# ${s} reference\n`)
  }
  if (connectors) {
    write(join(pluginDir, '.mcp.json'), { mcpServers: connectors })
  }
  const state = store.readState()
  if (!state.sources.some((s) => s.id === sourceId)) {
    state.sources.push({ id: sourceId, name: sourceId, url: `local:${sourceId}`, local: true, addedAt: Date.now() })
    store.writeState(state)
  }
  parser.invalidateMarketplaceCache(sourceId)
  install.invalidateParserCaches?.()
  return { sourceDir, pluginDir }
}

function holdDirectoryCwd(dir, durationMs = 150) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', `process.stdout.write('READY'); setTimeout(() => process.exit(0), ${durationMs})`], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    spawnedChildren.add(child)
    child.once('exit', () => spawnedChildren.delete(child))
    child.once('error', reject)
    child.stdout.once('data', () => resolve(child))
  })
}

const FETCH_BAD_PORTS = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080])

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

function walkNodes(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walkNodes(item, visit)
    return
  }
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue
    const val = node[key]
    if (val && typeof val === 'object') walkNodes(val, visit)
  }
}

function findVariableNode(name) {
  let found = null
  walkNodes(clientAst, (node) => {
    if (!found && node.type === 'VariableDeclarator' && node.id?.name === name) found = node
  })
  return found
}

function findPropertyOrFn(name) {
  let found = null
  walkNodes(clientAst, (node) => {
    if (!found && node.type === 'Property' && node.key?.name === name) found = node
    if (!found && node.type === 'VariableDeclarator' && node.id?.name === name) found = node
    if (!found && node.type === 'FunctionDeclaration' && node.id?.name === name) found = node
  })
  return found
}

test('Windows open reader handle on DSH skill dir does not break togglePlugin(false) or leave .trash-* inside dshSkillsDir', async () => {
  setupLocalSourcePlugin('lock-src-1', 'exa-repro', { skills: ['exa-agent', 'search'] })
  await install.installPlugin({ sourceId: 'lock-src-1', pluginName: 'exa-repro' })

  const dshSkills = store.dshSkillsDir()
  const searchSkillMd = join(dshSkills, 'search', 'SKILL.md')
  assert.equal(existsSync(searchSkillMd), true)

  // Simulate DSH Desktop / antivirus holding a shared read handle on SKILL.md while toggling off.
  const fd = openSync(searchSkillMd, 'r')
  try {
    const res = await install.togglePlugin('exa-repro', false)
    assert.equal(res.ok, true)
    assert.equal(res.enabled, false)
  } finally {
    closeSync(fd)
  }

  assert.equal(existsSync(join(dshSkills, 'exa-agent')), false, 'exa-agent should be removed from dshSkillsDir')
  assert.equal(existsSync(join(dshSkills, 'search')), false, 'search should be removed from dshSkillsDir')
  const leftovers = readdirSync(dshSkills).filter((name) => name.includes('.trash'))
  assert.deepEqual(leftovers, [], 'dshSkillsDir must never contain .trash-* sibling directories')
  const rec = store.readState().plugins.find((p) => p.name === 'exa-repro')
  assert.equal(rec?.enabled, false)

  if (typeof store.sweepTrash === 'function') {
    store.sweepTrash()
  }
  const trashDir = join(store.marketRoot(), '.trash')
  if (existsSync(trashDir)) {
    assert.deepEqual(readdirSync(trashDir), [], 'central trash should be clean after reader closes and sweepTrash runs')
  }
})

test('transient directory lock clears via async retry in togglePlugin(false), uninstallPlugin, and DELETE /sources/:id', { skip: process.platform !== 'win32' }, async () => {
  setupLocalSourcePlugin('transient-src', 'transient-plugin', { skills: ['alpha-skill', 'beta-skill'] })
  await install.installPlugin({ sourceId: 'transient-src', pluginName: 'transient-plugin' })

  // 1. Transient CWD lock on skill dir during togglePlugin(false)
  const betaRefs = join(store.dshSkillsDir(), 'beta-skill', 'references')
  await holdDirectoryCwd(betaRefs, 130)
  const toggleRes = await install.togglePlugin('transient-plugin', false)
  assert.equal(toggleRes.ok, true)
  assert.equal(existsSync(join(store.dshSkillsDir(), 'beta-skill')), false)

  // Re-enable then lock installedDir during uninstallPlugin
  await install.togglePlugin('transient-plugin', true)
  const targetDir = install.installedDetails().find((p) => p.name === 'transient-plugin')
  assert.ok(targetDir)
  await holdDirectoryCwd(join(store.installedDir('transient-plugin'), 'skills'), 130)
  const unRes = await install.uninstallPlugin('transient-plugin')
  assert.equal(unRes.ok, true)
  assert.equal(existsSync(store.installedDir('transient-plugin')), false)
  const installedParentLeftovers = readdirSync(dirname(store.installedDir('transient-plugin'))).filter((n) => n.includes('.trash'))
  assert.deepEqual(installedParentLeftovers, [], 'installed parent must not contain .trash-* leftovers')

  // 2. Transient CWD lock on sourceCacheDir during DELETE /sources/:sourceId
  setupLocalSourcePlugin('transient-del-src', 'unused-plugin')
  const server = createServer()
  let unregister = () => {}
  const fakeApp = {
    register({ handler }) {
      server.on('request', handler)
      return () => server.off('request', handler)
    },
  }
  unregister = mountRoutes(fakeApp, null, () => {})
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  try {
    await holdDirectoryCwd(join(store.sourceCacheDir('transient-del-src'), 'plugins'), 130)
    const resp = await fetch(`http://127.0.0.1:${port}/universal-plugin-hub/api/sources/transient-del-src`, { method: 'DELETE' })
    assert.equal(resp.status, 200)
    const body = await resp.json()
    assert.equal(body.ok, true)
    assert.equal(existsSync(store.sourceCacheDir('transient-del-src')), false)
  } finally {
    unregister()
    server.close()
  }
})

test('unrecoverable lock during togglePlugin(false) rolls back already-deleted skills so state & disk remain consistent', { skip: process.platform !== 'win32' }, async () => {
  setupLocalSourcePlugin('rollback-src', 'rollback-plugin', { skills: ['first-skill', 'second-skill'] })
  await install.installPlugin({ sourceId: 'rollback-src', pluginName: 'rollback-plugin' })

  const child = await holdDirectoryCwd(join(store.dshSkillsDir(), 'second-skill', 'references'), 10000)
  try {
    await assert.rejects(() => install.togglePlugin('rollback-plugin', false), /无法清理目录/)
    const rec = store.readState().plugins.find((p) => p.name === 'rollback-plugin')
    assert.equal(rec?.enabled, true, 'plugin must remain enabled when cleanup fails')
    assert.equal(existsSync(join(store.dshSkillsDir(), 'first-skill', 'SKILL.md')), true, 'previously deleted sibling skill must be rolled back on failure')
  } finally {
    try { child.kill() } catch {}
    await once(child, 'exit').catch(() => {})
    await install.uninstallPlugin('rollback-plugin')
  }
})

test('concurrent togglePlugin(true) + togglePlugin(false) aborts slow probe immediately and never leaves enabled artifacts', async () => {
  let reqCount = 0
  const pendingRes = new Set()
  const slowMcpServer = createServer((req, res) => {
    reqCount++
    pendingRes.add(res)
    res.on('close', () => pendingRes.delete(res))
    // Deliberately stall response unless aborted or cleaned up after 6s
    const timer = setTimeout(() => {
      if (!res.writableEnded) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{}')
      }
    }, 6000)
    res.on('close', () => clearTimeout(timer))
  })
  const port = await listenSafe(slowMcpServer)

  try {
    setupLocalSourcePlugin('slow-src', 'slow-plugin', {
      skills: ['slow-skill'],
      connectors: { 'slow-mcp': { url: `http://127.0.0.1:${port}/mcp` } },
    })
    await install.installPlugin({ sourceId: 'slow-src', pluginName: 'slow-plugin' })
    await install.togglePlugin('slow-plugin', false)
    assert.equal(existsSync(join(store.dshSkillsDir(), 'slow-skill')), false)

    const started = Date.now()
    const probeArrived = once(slowMcpServer, 'request')
    const enablePromise = install.togglePlugin('slow-plugin', true)
    await Promise.race([probeArrived, new Promise((r) => setTimeout(r, 1000))])
    const disablePromise = install.togglePlugin('slow-plugin', false)
    const [enableRes, disableRes] = await Promise.all([enablePromise, disablePromise])
    const elapsed = Date.now() - started

    assert.ok(reqCount >= 1, 'slow MCP probe should have started')
    assert.ok(elapsed < 2500, `togglePlugin(false) must abort slow probe promptly instead of hanging (${elapsed}ms)`)
    assert.equal(disableRes.ok, true)
    assert.equal(disableRes.enabled, false)
    assert.equal(store.readState().plugins.find((p) => p.name === 'slow-plugin')?.enabled, false)
    assert.equal(existsSync(join(store.dshSkillsDir(), 'slow-skill')), false)
    assert.equal(install.getConnectorEntry('slow-plugin', 'slow-mcp'), null)
    // Stale enable operation either settled cleanly or reported cancelled/superseded, never corrupting state.
    assert.ok(enableRes && typeof enableRes === 'object')
  } finally {
    for (const res of pendingRes) {
      try { res.destroy() } catch {}
    }
    slowMcpServer.close()
  }
})

test('concurrent uninstallPlugin on plugin-a does not overwrite concurrent togglePlugin on plugin-b', { skip: process.platform !== 'win32' }, async () => {
  setupLocalSourcePlugin('race-src', 'race-a', { skills: ['race-a-skill'] })
  setupLocalSourcePlugin('race-src', 'race-b', { skills: ['race-b-skill'] })
  await install.installPlugin({ sourceId: 'race-src', pluginName: 'race-a' })
  await install.installPlugin({ sourceId: 'race-src', pluginName: 'race-b' })

  const child = await holdDirectoryCwd(join(store.installedDir('race-a'), 'skills'), 160)
  try {
    const unPromise = install.uninstallPlugin('race-a')
    await new Promise((r) => setTimeout(r, 40))
    await install.togglePlugin('race-b', false)
    await unPromise

    const state = store.readState()
    assert.equal(state.plugins.some((p) => p.name === 'race-a'), false)
    assert.equal(state.plugins.find((p) => p.name === 'race-b')?.enabled, false, 'plugin-b disabled state must survive concurrent uninstallPlugin(race-a)')
  } finally {
    try { child.kill() } catch {}
  }
})

test('refreshInstalledPluginsFromSource keeps disabled plugin disabled without temporarily exposing skills into dshSkillsDir', async () => {
  setupLocalSourcePlugin('refresh-src', 'disabled-refresh', { skills: ['hidden-skill'], version: '1.0.0' })
  await install.installPlugin({ sourceId: 'refresh-src', pluginName: 'disabled-refresh' })
  await install.togglePlugin('disabled-refresh', false)
  assert.equal(existsSync(join(store.dshSkillsDir(), 'hidden-skill')), false)

  // Bump version in source cache and track whether hidden-skill ever appears in dshSkillsDir
  setupLocalSourcePlugin('refresh-src', 'disabled-refresh', { skills: ['hidden-skill'], version: '2.0.0' })
  let leakedSkill = false
  const fsWatch = (await import('node:fs')).watch(store.dshSkillsDir(), (event, filename) => {
    if (String(filename || '').includes('hidden-skill') && existsSync(join(store.dshSkillsDir(), 'hidden-skill'))) {
      leakedSkill = true
    }
  })
  try {
    await install.refreshInstalledPluginsFromSource('refresh-src', ['disabled-refresh'])
  } finally {
    fsWatch.close()
  }

  const rec = store.readState().plugins.find((p) => p.name === 'disabled-refresh')
  assert.equal(rec?.version, '2.0.0')
  assert.equal(rec?.enabled, false)
  assert.equal(existsSync(join(store.dshSkillsDir(), 'hidden-skill')), false)
  assert.equal(leakedSkill, false, 'refresh of disabled plugin must not temporarily expose then delete skills')
})

test('concurrent same-plugin operations (uninstall during toggle / rapid double toggle / installedDetails) stay serialized', { skip: process.platform !== 'win32' }, async () => {
  setupLocalSourcePlugin('same-src', 'same-plugin', { skills: ['same-skill'] })
  await install.installPlugin({ sourceId: 'same-src', pluginName: 'same-plugin' })

  const child = await holdDirectoryCwd(join(store.dshSkillsDir(), 'same-skill', 'references'), 120)
  try {
    // Start toggle(false) which waits for transient lock, then fire toggle(true) rapidly while in-flight
    const offPromise = install.togglePlugin('same-plugin', false)
    await new Promise((r) => setTimeout(r, 30))
    // While lock is active on same-plugin, installedDetails must not recreate skills/ inside target!
    install.installedDetails()
    const onPromise = install.togglePlugin('same-plugin', true)
    await Promise.all([offPromise, onPromise])

    assert.equal(store.readState().plugins.find((p) => p.name === 'same-plugin')?.enabled, true)
    assert.equal(existsSync(join(store.dshSkillsDir(), 'same-skill', 'SKILL.md')), true)
  } finally {
    try { child.kill() } catch {}
    await install.uninstallPlugin('same-plugin')
  }
})

test('routes scheduledIfOk skips applyProfile when result.ok === false (toggle & connector routes)', async () => {
  const routesSrc = readFileSync(new URL('../src/routes.js', import.meta.url), 'utf8')
  const helperIdx = routesSrc.indexOf('function scheduledIfOk(')
  assert.notEqual(helperIdx, -1, 'scheduledIfOk helper must exist in routes.js')
  assert.match(routesSrc.slice(helperIdx, helperIdx + 180), /result\.ok\s*===\s*false/, 'scheduledIfOk must skip scheduledResult when result.ok === false')

  const toggleIdx = routesSrc.indexOf("if (method === 'POST' && path.startsWith('/plugins/') && path.endsWith('/toggle'))")
  assert.notEqual(toggleIdx, -1, 'toggle plugin route should exist in routes.js')
  assert.match(routesSrc.slice(toggleIdx, toggleIdx + 450), /scheduledIfOk\(/, 'toggle route must use scheduledIfOk')

  setupLocalSourcePlugin('route-ok-src', 'route-ok-plugin', {
    skills: ['route-skill'],
    connectors: { conn: { url: 'http://127.0.0.1:9/mcp' } },
  })
  await install.installPlugin({ sourceId: 'route-ok-src', pluginName: 'route-ok-plugin' })
  await install.togglePlugin('route-ok-plugin', false)

  let applyCalls = 0
  const server = createServer()
  const fakeApp = {
    register({ handler }) {
      server.on('request', handler)
      return () => server.off('request', handler)
    },
  }
  const unregister = mountRoutes(fakeApp, null, () => { applyCalls++ })
  const port = await listenSafe(server)
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/universal-plugin-hub/api/plugins/route-ok-plugin/connectors/conn/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    const body = await resp.json()
    assert.equal(body.ok, false)
    assert.equal(applyCalls, 0, 'applyProfile must not be scheduled when route returns { ok: false }')
  } finally {
    unregister()
    server.close()
  }
})

test('UI guards: App.onTogglePlugin, DetailView, and ManagePageContent handle result.ok === false and cross-disable conflicting actions', () => {
  const detailNode = findPropertyOrFn('DetailView')
  const manageNode = findPropertyOrFn('ManagePageContent')
  const onToggleNode = findPropertyOrFn('onTogglePlugin')
  assert.ok(detailNode && manageNode && onToggleNode, 'DetailView, ManagePageContent, and onTogglePlugin must exist in client AST')

  const detailCode = clientSource.slice(detailNode.start, detailNode.end)
  const manageCode = clientSource.slice(manageNode.start, manageNode.end)
  const onToggleCode = clientSource.slice(onToggleNode.start, onToggleNode.end)

  // 1. onTogglePlugin must return the toggle result so DetailView can inspect result.ok === false
  assert.match(onToggleCode, /return\s+res\b|return\s+result\b/, 'onTogglePlugin must return API result')

  // 2. DetailView must inspect result?.ok === false, disable Remove while toggling, and block Remove modal close while busy
  assert.match(detailCode, /result\?\.ok\s*===\s*false/, 'DetailView.handleToggle must handle ok: false results')
  assert.match(detailCode, /disabled:\s*busy\s*\|\|\s*toggling/, 'DetailView Remove button must be disabled while toggling is active')
  assert.match(detailCode, /if\s*\(\s*!busy\s*\)\s*setConfirmRemove\(false\)/, 'DetailView must prevent closing confirmRemove dialog while busy')

  // 3. ManagePageContent must check result?.ok === false on toggle & update, cross-disable buttons, encode plugin names, and guard confirmRemove close while busy
  const manageToggleMatch = manageCode.match(/const toggle = async \(\)\s*=>\s*\{[\s\S]{0,900}?\n\t\t\};/)
  assert.ok(manageToggleMatch, 'ManagePageContent.toggle found')
  assert.match(manageToggleMatch[0], /result\?\.ok\s*===\s*false/, 'ManagePageContent.toggle must reject when result.ok === false')
  assert.match(manageToggleMatch[0], /if\s*\(\s*toggling\s*\|\|\s*updating\s*\|\|\s*busy\s*\|\|\s*togglingConn\s*\)\s*return/, 'ManagePageContent.toggle must guard against concurrent operations')
  assert.match(manageToggleMatch[0], /encodeURIComponent\(record\.name\)/, 'ManagePageContent.toggle must encodeURIComponent(record.name)')

  const manageUpdateMatch = manageCode.match(/const update = async \(\)\s*=>\s*\{[\s\S]{0,900}?\n\t\t\};/)
  assert.ok(manageUpdateMatch, 'ManagePageContent.update found')
  assert.match(manageUpdateMatch[0], /result\?\.ok\s*===\s*false/, 'ManagePageContent.update must handle result.ok === false')

  assert.match(manageCode, /disabled:\s*busy\s*\|\|\s*updating\s*\|\|\s*toggling\s*\|\|\s*Boolean\(togglingConn\)/, 'ManagePageContent action buttons must cross-disable across busy/updating/toggling/togglingConn')
  assert.match(manageCode, /if\s*\(\s*confirmRemove\s*&&\s*!busy\s*\)\s*setConfirmRemove\(false\)/, 'ManagePageContent must prevent Escape closing confirmRemove while busy')
})

test('togglePlugin(true) does not block on unresponsive MCP server and cancels background enable on rapid disable', async () => {
  const openSockets = new Set()
  const pendingResponses = []
  let requestCount = 0
  const mcpServer = createServer((req, res) => {
    requestCount++
    openSockets.add(req.socket)
    req.socket.on('close', () => openSockets.delete(req.socket))
    req.resume()
    const timer = setTimeout(() => {
      if (res.writableEnded) return
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'slow', version: '1.0' } },
      }))
    }, 3000)
    pendingResponses.push({ res, timer })
  })
  const port = await listenSafe(mcpServer)

  try {
    setupLocalSourcePlugin('perf-mcp-src', 'perf-mcp-plugin', {
      skills: ['perf-skill'],
      connectors: { slow: { type: 'http', url: `http://127.0.0.1:${port}/mcp` } },
    })
    await install.installPlugin({ sourceId: 'perf-mcp-src', pluginName: 'perf-mcp-plugin' })
    await install.togglePlugin('perf-mcp-plugin', false)
    const toolsState = install.readMcpToolsState()
    delete toolsState['perf-mcp-plugin::slow']
    install.writeMcpToolsState(toolsState)

    const probeArrived = once(mcpServer, 'request')
    const start = performance.now()
    const onRes = await install.togglePlugin('perf-mcp-plugin', true)
    const elapsed = performance.now() - start

    assert.equal(onRes.ok, true)
    assert.equal(onRes.enabled, true)
    assert.ok(elapsed < 500, `togglePlugin(true) must not wait for 3s MCP probe (took ${elapsed.toFixed(1)}ms)`)

    // Wait for the background fetch to reach the server before rapidly cancelling it
    await Promise.race([probeArrived, new Promise((r) => setTimeout(r, 1000))])
    const offRes = await install.togglePlugin('perf-mcp-plugin', false)
    assert.equal(offRes.ok, true)
    assert.equal(offRes.enabled, false)

    // Wait briefly for in-flight probe abort/settlement
    await new Promise((r) => setTimeout(r, 80))
    assert.equal(install.getConnectorEntry('perf-mcp-plugin', 'slow'), null, 'late MCP probe must not register connector after rapid disable')
    assert.ok(requestCount >= 1, 'background probe should have started')
  } finally {
    for (const { timer, res } of pendingResponses) {
      clearTimeout(timer)
      try { res.destroy() } catch {}
    }
    for (const sock of openSockets) {
      try { sock.destroy() } catch {}
    }
    mcpServer.close()
    await install.uninstallPlugin('perf-mcp-plugin').catch(() => {})
  }
})

test('safeRmDir with active lock fails fast without blocking ~800ms on Windows retries/attrib, sweepTrash tracks PENDING_TRASH_PATHS, and nested junctions are unlinked before attrib.exe', { skip: process.platform !== 'win32' }, async () => {
  const lockedDir = join(root, 'fast-fail-locked-dir')
  const lockedSub = join(lockedDir, 'sub')
  write(join(lockedSub, 'SKILL.md'), '# locked skill\n')
  const trashParent = join(root, 'dsh', '.market', '.trash')

  const child = await holdDirectoryCwd(lockedSub, 250)
  try {
    const t0 = performance.now()
    store.safeRmDir(lockedDir, { allowTrash: true, quarantineRoot: trashParent })
    const elapsed = performance.now() - t0
    assert.ok(elapsed < 150, `blocked safeRmDir should not stall synchronously on maxRetries/attrib loops (took ${elapsed.toFixed(1)}ms)`)
  } finally {
    try { child.kill() } catch {}
    await new Promise((r) => setTimeout(r, 80))
    store.safeRmDir(lockedDir, { allowTrash: false })
  }

  const extDir = join(root, 'external-junction-target')
  const extFile = join(extDir, 'keep-ro.txt')
  write(extFile, 'do not touch attributes\n')
  chmodSync(extFile, 0o444)

  const doomed = join(root, 'doomed-with-junction')
  const doomedRo = join(doomed, 'ro.txt')
  write(doomedRo, 'locked attr inside doomed\n')
  chmodSync(doomedRo, 0o444)
  symlinkSync(extDir, join(doomed, 'ext-link'), 'junction')

  try {
    store.safeRmDir(doomed, { allowTrash: false })
    assert.equal(existsSync(doomed), false, 'doomed dir must be removed cleanly')
    assert.equal(existsSync(extFile), true, 'junction target file must survive deletion')
    assert.equal(statSync(extFile).mode & 0o200, 0, 'attrib.exe must never traverse junction and strip read-only flag on external target')
  } finally {
    chmodSync(extFile, 0o666)
  }
})

test('no-op unregisterConnector / unregisterPluginLsp / unregisterPluginHooks and pure-skill toggle(false) skip cordis.patch.yml writes', async () => {
  setupLocalSourcePlugin('noop-patch-src', 'noop-patch-plugin', { skills: ['noop-skill'] })
  await install.installPlugin({ sourceId: 'noop-patch-src', pluginName: 'noop-patch-plugin' })

  const patchFile = install.cordisPatchPath()
  if (!existsSync(patchFile)) install.writeCordisPatch([])
  const past = new Date(Date.now() - 15_000)
  utimesSync(patchFile, past, past)
  const expectedMtime = statSync(patchFile).mtimeMs

  install.unregisterConnector('noop-patch-plugin', 'nonexistent-mcp')
  install.unregisterPluginLsp('noop-patch-plugin')
  install.unregisterPluginHooks('noop-patch-plugin')
  await install.togglePlugin('noop-patch-plugin', false)

  assert.equal(statSync(patchFile).mtimeMs, expectedMtime, 'cordis.patch.yml must not be rewritten on no-op unregistrations')
  await install.uninstallPlugin('noop-patch-plugin')
})

test('togglePlugin(true) rollback removes already-synced skills even when cordis.patch.yml is malformed', async () => {
  const { pluginDir } = setupLocalSourcePlugin('rb-src', 'rb-plugin', { skills: ['rb-skill'] })
  write(join(pluginDir, 'hooks', 'hooks.json'), {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'echo hello' }] }],
    },
  })
  await install.installPlugin({ sourceId: 'rb-src', pluginName: 'rb-plugin' })
  await install.togglePlugin('rb-plugin', false)

  const patchFile = install.cordisPatchPath()
  const originalPatch = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : null
  write(patchFile, '::::\n  broken_yaml: [\n')
  try {
    await assert.rejects(
      () => install.togglePlugin('rb-plugin', true),
      /无法解析/,
      'togglePlugin(true) should throw original cordis.patch parse error rather than a secondary rollback error',
    )
    assert.equal(existsSync(join(store.dshSkillsDir(), 'rb-skill')), false, 'rollback must still remove rb-skill even if unregisterPluginHooks/Lsp fail on malformed patch')
  } finally {
    if (originalPatch !== null) writeFileSync(patchFile, originalPatch, 'utf8')
    else rmSync(patchFile, { force: true })
    await install.uninstallPlugin('rb-plugin').catch(() => {})
  }
})

test('routes: POST /sources preserves concurrent state mutations during clone and DELETE /plugins/:p/connectors/:c/toggle checks plugin presence', async () => {
  // Set up a tiny local bare git repo served over smart HTTP with an artificial /info/refs delay
  const bareRepo = join(root, 'slow-bare.git')
  const workRepo = join(root, 'slow-work')
  mkdirSync(workRepo, { recursive: true })
  execFileSync('git', ['init', '-b', 'main'], { cwd: workRepo, windowsHide: true })
  write(join(workRepo, '.claude-plugin', 'marketplace.json'), {
    name: 'slow-remote-market',
    plugins: [{ name: 'remote-plug', source: './plugins/remote-plug', version: '1.0.0' }],
  })
  write(join(workRepo, 'plugins', 'remote-plug', '.claude-plugin', 'plugin.json'), {
    name: 'remote-plug',
    version: '1.0.0',
    description: 'remote plugin',
  })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workRepo, windowsHide: true })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workRepo, windowsHide: true })
  execFileSync('git', ['add', '.'], { cwd: workRepo, windowsHide: true })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: workRepo, windowsHide: true })
  execFileSync('git', ['clone', '--bare', workRepo, bareRepo], { windowsHide: true })

  const gitHttpServer = createServer((req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1')
    if (reqUrl.pathname.endsWith('/info/refs') && reqUrl.searchParams.get('service') === 'git-upload-pack') {
      setTimeout(() => {
        const proc = spawn('git', ['upload-pack', '--stateless-rpc', '--advertise-refs', bareRepo], { windowsHide: true })
        spawnedChildren.add(proc)
        proc.once('exit', () => spawnedChildren.delete(proc))
        const chunks = [Buffer.from('001e# service=git-upload-pack\n0000')]
        proc.stdout.on('data', (c) => chunks.push(c))
        proc.once('close', () => {
          res.writeHead(200, { 'Content-Type': 'application/x-git-upload-pack-advertisement' })
          res.end(Buffer.concat(chunks))
        })
      }, 150)
      return
    }
    if (reqUrl.pathname.endsWith('/git-upload-pack') && req.method === 'POST') {
      const proc = spawn('git', ['upload-pack', '--stateless-rpc', bareRepo], { windowsHide: true })
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
  const gitPort = await listenSafe(gitHttpServer)

  setupLocalSourcePlugin('src-race', 'race-peer-plugin', { skills: ['race-peer-skill'] })
  await install.installPlugin({ sourceId: 'src-race', pluginName: 'race-peer-plugin' })

  const apiServer = createServer()
  const fakeApp = {
    register({ handler }) {
      apiServer.on('request', handler)
      return () => apiServer.off('request', handler)
    },
  }
  const unregister = mountRoutes(fakeApp, null, () => {})
  const apiPort = await listenSafe(apiServer)

  try {
    const addSourcePromise = fetch(`http://127.0.0.1:${apiPort}/universal-plugin-hub/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Slow HTTP Source',
        url: `http://127.0.0.1:${gitPort}/testorg/slowrepo.git`,
      }),
    }).then((r) => r.json())

    // Mutate plugin state while POST /sources is waiting on git clone
    await new Promise((r) => setTimeout(r, 40))
    await install.togglePlugin('race-peer-plugin', false)

    const addBody = await addSourcePromise
    assert.equal(addBody.ok, true)

    const finalState = store.readState()
    assert.ok(finalState.sources.some((s) => s.id === 'testorg-slowrepo'), 'added source must be persisted')
    assert.equal(
      finalState.plugins.find((p) => p.name === 'race-peer-plugin')?.enabled,
      false,
      'POST /sources must not clobber concurrent togglePlugin state updates after await ensureSourceCloned',
    )

    // Uninstalled plugin connector toggle(false) must also reject cleanly
    const missingToggle = await fetch(`http://127.0.0.1:${apiPort}/universal-plugin-hub/api/plugins/never-installed-plugin/connectors/foo/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    }).then((r) => r.json())
    assert.equal(missingToggle.ok, false)
  } finally {
    unregister()
    apiServer.close()
    gitHttpServer.close()
    await install.uninstallPlugin('race-peer-plugin').catch(() => {})
    store.safeRmDir(store.sourceCacheDir('testorg-slowrepo'), { allowTrash: false })
  }
})

test('UI guards & optimistic toggles: App.removePlugin, DetailView Install/Manage/optimisticEnabled, and ManagePageContent optimistic state', () => {
  const detailNode = findPropertyOrFn('DetailView')
  const manageNode = findPropertyOrFn('ManagePageContent')
  const removeNode = findPropertyOrFn('removePlugin')
  const mcpRowNode = findPropertyOrFn('renderMcpServerRow')
  assert.ok(detailNode && manageNode && removeNode && mcpRowNode, 'UI components and handlers must exist in client AST')

  const detailCode = clientSource.slice(detailNode.start, detailNode.end)
  const manageCode = clientSource.slice(manageNode.start, manageNode.end)
  const removeCode = clientSource.slice(removeNode.start, removeNode.end)
  const mcpRowCode = clientSource.slice(mcpRowNode.start, mcpRowNode.end)

  assert.match(removeCode, /result\?\.ok\s*===\s*false/, 'App.removePlugin must inspect result?.ok === false')
  assert.match(detailCode, /optimisticEnabled/, 'DetailView must apply immediate optimistic toggle feedback')
  assert.match(detailCode, /finally\s*\{\s*setBusy\(false\)\s*;?\s*\}/, 'DetailView Install/uninstall handlers must reset busy in finally')
  assert.match(detailCode, /"Manage"[\s\S]{0,160}disabled:\s*busy\s*\|\|\s*toggling/, 'DetailView Manage button must disable while busy or toggling')
  assert.match(manageCode, /optimisticEnabled/, 'ManagePageContent must apply immediate optimistic plugin toggle feedback')
  assert.match(manageCode, /optimisticConn/, 'ManagePageContent must apply immediate optimistic connector toggle feedback')
  assert.match(mcpRowCode, /optimistic/i, 'renderMcpServerRow must apply immediate optimistic MCP toggle feedback')
})
