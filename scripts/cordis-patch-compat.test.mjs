import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const root = mkdtempSync(join(tmpdir(), 'uph-cordis-patch-compat-'))
const prevHome = process.env.DSH_HOME
const prevProfile = process.env.DSH_PROFILE
process.env.DSH_HOME = join(root, 'dsh')
process.env.DSH_PROFILE = 'desktop'

after(() => {
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome
  if (prevProfile === undefined) delete process.env.DSH_PROFILE
  else process.env.DSH_PROFILE = prevProfile
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const store = await import('../src/store.js')
const install = await import('../src/install.js')
const { mountRoutes } = await import('../src/routes.js')

let handler
mountRoutes({ register(route) { handler = route.handler } }, null, () => ({ token: 'apply-fixture' }))

async function call(method, path, body) {
  const req = {
    url: `/universal-plugin-hub/api${path}`,
    method,
    headers: { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' },
    on(event, callback) {
      if (event === 'data' && body !== undefined) callback(JSON.stringify(body))
      if (event === 'end') callback()
    },
  }
  const res = { writeHead(status) { this.status = status }, end(payload) { this.body = JSON.parse(payload) } }
  await handler(req, res)
  return res
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
}

function setupSourcePlugin(sourceId, pluginName, { version = '1.0.0', skills = ['lint-skill'], hooks = false } = {}) {
  const sourceDir = store.sourceCacheDir(sourceId)
  const marketFile = join(sourceDir, '.claude-plugin', 'marketplace.json')
  let plugins = []
  if (existsSync(marketFile)) {
    try {
      plugins = JSON.parse(readFileSync(marketFile, 'utf8')).plugins || []
    } catch {}
  }
  plugins = plugins.filter((p) => p.name !== pluginName)
  plugins.push({
    name: pluginName,
    displayName: pluginName,
    version,
    description: `${pluginName} v${version}`,
    source: `./plugins/${pluginName}`,
  })
  write(marketFile, { name: sourceId, plugins })

  const pluginDir = join(sourceDir, 'plugins', pluginName)
  rmSync(pluginDir, { recursive: true, force: true })
  write(join(pluginDir, '.claude-plugin', 'plugin.json'), { name: pluginName, version, description: `${pluginName} v${version}` })
  for (const s of skills) {
    write(join(pluginDir, 'skills', s, 'SKILL.md'), `---\nname: ${s}\ndescription: ${s} v${version}\n---\nVersion ${version}\n`)
  }
  if (hooks) {
    write(join(pluginDir, 'hooks', 'hooks.json'), {
      hooks: {
        SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'echo hook' }] }],
      },
    })
  }
  const state = store.readState()
  if (!state.sources.some((s) => s.id === sourceId)) {
    state.sources.push({ id: sourceId, name: sourceId, url: `https://example.com/${sourceId}.git`, builtin: false })
    store.writeState(state)
  }
  return pluginDir
}

test('hook plugin lifecycle round-trips all DSH !!js forms, numeric ids, and UTF-8 BOM without losing tags or crashing readers', async () => {
  const patchFile = install.cordisPatchPath()
  const initialPatch = [
    '\uFEFF# Windows Notepad BOM + DSH expressions',
    '- id: 1',
    '  name: numeric-id-entry',
    '- id: tool-bash',
    "  disabled: !!js process.platform === 'win32'",
    '- id: tool-pm',
    '  disabled: !!js "!ctx.get(\'profileContext\')"',
    '- id: sandbox-policy',
    '  config:',
    '    workspaceRoot: !!js process.cwd()',
    '- id: empty-js',
    "  disabled: !!js ''",
    '- id: multiline-js',
    '  disabled: !!js |',
    "    process.platform === 'win32'",
    '    && true',
    '- insert:',
    '    - id: !!js "\'dyn-id\'"',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: !!js "\'dyn-server\'"',
    '    - id: mcp-user-mcp-dyn-name',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: !!js "\'dyn-user-server\'"',
    '',
  ].join('\r\n')
  write(patchFile, initialPatch)

  setupSourcePlugin('brooks-src', 'brooks-like', { skills: ['brooks-review', 'brooks-audit'], hooks: true })
  const res = await install.installPlugin({ sourceId: 'brooks-src', pluginName: 'brooks-like' })
  assert.equal(res.ok, true)
  assert.equal(res.plugin.hookCount, 1)

  const afterInstall = readFileSync(patchFile, 'utf8')
  assert.equal(afterInstall.startsWith('\uFEFF'), false)
  assert.match(afterInstall, /disabled: !!js process\.platform === 'win32'/)
  assert.match(afterInstall, /disabled: !!js '!ctx\.get\(''profileContext''\)'/)
  assert.match(afterInstall, /workspaceRoot: !!js process\.cwd\(\)/)
  assert.match(afterInstall, /disabled: !!js ''/, 'empty !!js must stay quoted so DSH js-yaml v4 loader accepts it')
  assert.match(afterInstall, /disabled: !!js \|/)
  assert.match(afterInstall, /id: hooks-brooks-like/)

  // Readers must not crash on CordisJsExpr or numeric ids in cordis.patch.yml
  assert.doesNotThrow(() => install.toolCallIconGroups())
  assert.doesNotThrow(() => install.installedDetails())
  const mcpsRes = await call('GET', '/mcps')
  assert.equal(mcpsRes.status, 200)
  assert.equal(mcpsRes.body.mcps.some((m) => typeof m.name !== 'string'), false)

  // Toggle off and uninstall must remove only brooks-like while preserving !!js entries
  const toggledOff = await install.togglePlugin('brooks-like', false)
  assert.equal(toggledOff.ok, true)
  const afterToggle = readFileSync(patchFile, 'utf8')
  assert.doesNotMatch(afterToggle, /hooks-brooks-like/)
  assert.match(afterToggle, /workspaceRoot: !!js process\.cwd\(\)/)
  assert.match(afterToggle, /disabled: !!js ''/)

  const uninstalled = await install.uninstallPlugin('brooks-like')
  assert.equal(uninstalled.ok, true)
  const afterUninstall = readFileSync(patchFile, 'utf8')
  assert.match(afterUninstall, /disabled: !!js process\.platform === 'win32'/)
  assert.match(afterUninstall, /disabled: !!js ''/)
})

test('fresh install failure on malformed cordis.patch.yml rolls back copied plugin, skills, and compiled hooks while preserving unrelated skills', async () => {
  const patchFile = install.cordisPatchPath()
  const brokenPatch = '[]\n- id: broken\n'
  write(patchFile, brokenPatch)
  const beforeBytes = readFileSync(patchFile)

  // Existing user-uploaded / unrelated skill must remain untouched
  const unrelatedSkill = join(store.dshSkillsDir(), 'unrelated-skill', 'SKILL.md')
  write(unrelatedSkill, '---\nname: unrelated-skill\ndescription: keep\n---\nKeep\n')

  setupSourcePlugin('fail-src', 'fail-hook-plugin', { skills: ['fail-s1', 'fail-s2'], hooks: true })

  await assert.rejects(
    () => install.installPlugin({ sourceId: 'fail-src', pluginName: 'fail-hook-plugin' }),
    (err) => {
      assert.match(err.message, /无法解析/)
      assert.match(err.message, /第 2 行第 1 列/)
      assert.match(err.message, /已中止写入以保护现有配置/)
      assert.equal(err.message.includes('\n'), false)
      return true
    },
  )

  assert.ok(readFileSync(patchFile).equals(beforeBytes), 'malformed cordis.patch.yml must stay untouched byte-for-byte')
  assert.equal(store.readState().plugins.some((p) => p.name === 'fail-hook-plugin'), false)
  assert.equal(existsSync(store.installedDir('fail-hook-plugin')), false, 'installed dir should be rolled back')
  assert.equal(existsSync(join(store.dshSkillsDir(), 'fail-s1')), false, 'synced skill fail-s1 should be rolled back')
  assert.equal(existsSync(join(store.dshSkillsDir(), 'fail-s2')), false, 'synced skill fail-s2 should be rolled back')
  assert.equal(existsSync(store.compiledHooksPath('fail-hook-plugin')), false, 'compiled hooks should be rolled back')
  assert.equal(existsSync(unrelatedSkill), true, 'unrelated skills must not be removed')

  // Pure-skill plugin install must still succeed even when cordis.patch.yml is malformed
  setupSourcePlugin('pure-src', 'pure-skill-plugin', { skills: ['pure-s1'], hooks: false })
  const pureRes = await install.installPlugin({ sourceId: 'pure-src', pluginName: 'pure-skill-plugin' })
  assert.equal(pureRes.ok, true)
  assert.equal(existsSync(join(store.dshSkillsDir(), 'pure-s1', 'SKILL.md')), true)
  assert.ok(readFileSync(patchFile).equals(beforeBytes), 'pure-skill install must not touch cordis.patch.yml')
  await install.uninstallPlugin('pure-skill-plugin')
})

test('update failure on malformed cordis.patch.yml preserves existing installed version and skills', async () => {
  const patchFile = install.cordisPatchPath()
  write(patchFile, '[]\n')

  setupSourcePlugin('upd-src', 'upd-hook-plugin', { version: '1.0.0', skills: ['upd-skill'], hooks: true })
  const first = await install.installPlugin({ sourceId: 'upd-src', pluginName: 'upd-hook-plugin' })
  assert.equal(first.ok, true)
  assert.match(readFileSync(join(store.dshSkillsDir(), 'upd-skill', 'SKILL.md'), 'utf8'), /Version 1\.0\.0/)

  // Now corrupt cordis.patch.yml and try updating to 2.0.0
  const brokenPatch = '- id: [\n'
  write(patchFile, brokenPatch)
  const beforeBytes = readFileSync(patchFile)
  setupSourcePlugin('upd-src', 'upd-hook-plugin', { version: '2.0.0', skills: ['upd-skill'], hooks: true })

  await assert.rejects(
    () => install.updatePlugin('upd-hook-plugin'),
    (err) => {
      assert.match(err.message, /无法解析/)
      assert.match(err.message, /第 \d+ 行第 \d+ 列/)
      return true
    },
  )

  assert.ok(readFileSync(patchFile).equals(beforeBytes))
  const rec = store.readState().plugins.find((p) => p.name === 'upd-hook-plugin')
  assert.equal(rec?.version, '1.0.0')
  assert.match(readFileSync(join(store.installedDir('upd-hook-plugin'), 'skills', 'upd-skill', 'SKILL.md'), 'utf8'), /Version 1\.0\.0/)
  assert.match(readFileSync(join(store.dshSkillsDir(), 'upd-skill', 'SKILL.md'), 'utf8'), /Version 1\.0\.0/)

  // Repair patch and clean up
  write(patchFile, '[]\n')
  await install.uninstallPlugin('upd-hook-plugin')
})

test('mid-install failure after skill sync rolls back synced skills and installed copy without clobbering existing skills', async () => {
  const patchFile = install.cordisPatchPath()
  write(patchFile, '[]\n')

  const keepSkill = join(store.dshSkillsDir(), 'keep-after-midfail', 'SKILL.md')
  write(keepSkill, '---\nname: keep-after-midfail\ndescription: keep\n---\nKeep\n')

  setupSourcePlugin('midfail-src', 'midfail-hook-plugin', { skills: ['midfail-s1'], hooks: true })
  // Block compiledHooksPath write with an existing directory so pre-flight passes and failure occurs after syncPluginSkillsToDsh.
  const hookBlocker = store.compiledHooksPath('midfail-hook-plugin')
  mkdirSync(hookBlocker, { recursive: true })

  try {
    await assert.rejects(() => install.installPlugin({ sourceId: 'midfail-src', pluginName: 'midfail-hook-plugin' }))
    assert.equal(store.readState().plugins.some((p) => p.name === 'midfail-hook-plugin'), false)
    assert.equal(existsSync(store.installedDir('midfail-hook-plugin')), false, 'installed dir should be rolled back on mid-install failure')
    assert.equal(existsSync(join(store.dshSkillsDir(), 'midfail-s1')), false, 'synced skill should be rolled back on mid-install failure')
    assert.equal(existsSync(keepSkill), true, 'unrelated skill must remain untouched')
  } finally {
    rmSync(hookBlocker, { recursive: true, force: true })
  }
})
