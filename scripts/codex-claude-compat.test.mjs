import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const root = mkdtempSync(join(tmpdir(), 'uph-codex-claude-compat-'))
const prevHome = process.env.DSH_HOME
const prevProfile = process.env.DSH_PROFILE
const prevOauthDir = process.env.UPH_OAUTH_STORE_DIR
process.env.DSH_HOME = join(root, 'dsh')
process.env.DSH_PROFILE = 'desktop'
process.env.UPH_OAUTH_STORE_DIR = join(root, 'oauth-creds')

after(() => {
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome
  if (prevProfile === undefined) delete process.env.DSH_PROFILE
  else process.env.DSH_PROFILE = prevProfile
  if (prevOauthDir === undefined) delete process.env.UPH_OAUTH_STORE_DIR
  else process.env.UPH_OAUTH_STORE_DIR = prevOauthDir
  rmSync(root, { recursive: true, force: true, maxRetries: 5 })
})

const store = await import('../src/store.js')
const parser = await import('../src/parser.js')
const install = await import('../src/install.js')
const local = await import('../src/local.js')
const oauthConfig = await import('../src/oauth-config.js')
const oauthStore = await import('../src/oauth-store.js')
const { mountRoutes } = await import('../src/routes.js')

const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

function mcpStdioServerSource(requireFileInCwd = null) {
  return `import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
${requireFileInCwd ? `if (!existsSync(${JSON.stringify(requireFileInCwd)})) { console.error('Missing cwd marker: ' + process.cwd()); process.exit(2) }` : ''}
if (process.env.WRITE_DATA_MARKER && process.env.PLUGIN_DATA) {
  mkdirSync(process.env.PLUGIN_DATA, { recursive: true })
  writeFileSync(join(process.env.PLUGIN_DATA, 'marker.txt'), process.env.WRITE_DATA_MARKER)
}
const input = createInterface({ input: process.stdin })
for await (const line of input) {
  const req = JSON.parse(line)
  if (req.id === undefined) continue
  const respond = (result) => console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }))
  if (req.method === 'initialize') {
    respond({ protocolVersion: req.params.protocolVersion, serverInfo: { name: 'compat-fixture', version: '1.0.0' }, capabilities: { tools: {} } })
  } else if (req.method === 'tools/list') {
    respond({
      tools: [{
        name: 'probe_info',
        description: JSON.stringify({
          cwd: process.cwd().replace(/\\\\/g, '/'),
          pluginRoot: (process.env.PLUGIN_ROOT || '').replace(/\\\\/g, '/'),
          pluginData: (process.env.PLUGIN_DATA || '').replace(/\\\\/g, '/'),
          claudeRoot: (process.env.CLAUDE_PLUGIN_ROOT || '').replace(/\\\\/g, '/'),
          claudeData: (process.env.CLAUDE_PLUGIN_DATA || '').replace(/\\\\/g, '/'),
          waitMs: process.env.CCC_WAIT_MS || null,
          cfgPath: (process.env.CFG_PATH || '').replace(/\\\\/g, '/'),
          dataPath: (process.env.DATA_PATH || '').replace(/\\\\/g, '/'),
        }),
        inputSchema: { type: 'object' },
      }],
    })
  } else {
    respond({})
  }
}
`
}

let handler
mountRoutes({ register(route) { handler = route.handler } }, null, () => ({ token: 'apply-fixture' }))

async function apiCall(method, path, body) {
  const req = {
    url: `/universal-plugin-hub/api${path}`,
    method,
    headers: { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' },
    on(event, cb) {
      if (event === 'data' && body !== undefined) cb(JSON.stringify(body))
      if (event === 'end') cb()
    },
  }
  const res = { writeHead(status) { this.status = status }, end(payload) { this.body = JSON.parse(payload) } }
  await handler(req, res)
  return res
}

function norm(p) {
  return String(p || '').replace(/\\/g, '/')
}

test('Codex ${PLUGIN_ROOT}, ${PLUGIN_DATA}, cwd, and builtin env vars resolve on install, probe, enable, update, and uninstall', async () => {
  const sourceId = 'local'
  const pluginName = 'codex-controls-claude'
  const srcDir = join(store.sourceCacheDir(sourceId), pluginName)
  write(join(srcDir, '.codex-plugin', 'plugin.json'), {
    name: pluginName,
    version: '0.11.1',
    description: 'Orchestrator plugin',
  })
  write(join(srcDir, 'cwd-marker.txt'), 'present')
  write(join(srcDir, 'server', 'index.mjs'), mcpStdioServerSource('cwd-marker.txt'))
  write(join(srcDir, '.mcp.json'), {
    mcpServers: {
      'claude-orchestrator': {
        command: process.execPath,
        args: ['${PLUGIN_ROOT}/server/index.mjs'],
        cwd: '${PLUGIN_ROOT}',
        env: {
          CCC_WAIT_MS: '1200000',
          CFG_PATH: '${PLUGIN_ROOT}/cwd-marker.txt',
          DATA_PATH: '${PLUGIN_DATA}/state.json',
          WRITE_DATA_MARKER: 'persisted-v1',
        },
      },
    },
  })
  write(join(srcDir, 'skills', 'plan-task', 'SKILL.md'), '---\nname: plan-task\ndescription: Plan\n---\nRun `${PLUGIN_ROOT}/server/index.mjs` and store in `${PLUGIN_DATA}`.\n')

  const state = store.readState()
  store.writeState({ ...state, sources: [{ id: sourceId, name: 'Local Plugins', url: 'local://' }] })
  parser.invalidateMarketplaceCache(sourceId)

  const installed = await install.installPlugin({ sourceId, pluginName })
  assert.equal(installed.ok, true)

  const expectedRoot = norm(store.installedDir(pluginName))
  const expectedData = norm(store.pluginDataDir(pluginName))

  // Wait briefly for warmInstalledConnectorTools auto-enable to finish
  for (let i = 0; i < 150 && !install.getConnectorEntry(pluginName, 'claude-orchestrator'); i++) {
    await new Promise(r => setTimeout(r, 20))
  }
  const entry = install.getConnectorEntry(pluginName, 'claude-orchestrator')
  assert.ok(entry, 'plugin without secret placeholders must auto-enable')
  assert.equal(norm(entry.config.args[0]), `${expectedRoot}/server/index.mjs`)
  assert.equal(norm(entry.config.cwd), expectedRoot)
  assert.equal(norm(entry.config.env.CFG_PATH), `${expectedRoot}/cwd-marker.txt`)
  assert.equal(norm(entry.config.env.DATA_PATH), `${expectedData}/state.json`)

  // Verify live tool discovery & cwd / env inside child process
  const toolsRes = await install.fetchConnectorTools(pluginName, 'claude-orchestrator', true)
  assert.equal(toolsRes.ok, true, toolsRes.message)
  const info = JSON.parse(toolsRes.tools[0].description)
  assert.equal(norm(realpathSync(info.cwd)), norm(realpathSync(expectedRoot)))
  assert.equal(info.pluginRoot, expectedRoot)
  assert.equal(info.pluginData, expectedData)
  assert.equal(info.claudeRoot, expectedRoot)
  assert.equal(info.claudeData, expectedData)
  assert.equal(info.waitMs, '1200000')
  assert.equal(info.cfgPath, `${expectedRoot}/cwd-marker.txt`)
  assert.equal(info.dataPath, `${expectedData}/state.json`)
  assert.equal(readFileSync(join(store.pluginDataDir(pluginName), 'marker.txt'), 'utf8'), 'persisted-v1')

  // Verify SKILL.md had builtin vars expanded cleanly when mirrored
  const skillText = readFileSync(join(store.installedDir(pluginName), 'skills', 'plan-task', 'SKILL.md'), 'utf8')
  assert.ok(skillText.includes(`${expectedRoot}/server/index.mjs`))
  assert.ok(skillText.includes(expectedData))

  // Verify installedDetails exposes expanded display fields while keeping editable templates & clean env
  const detail = install.installedDetails().find(p => p.name === pluginName)
  const conn = detail.connectors.find(c => c.name === 'claude-orchestrator')
  assert.equal(conn.needsAuth, false)
  assert.equal(conn.connected, true)
  assert.deepEqual(conn.args, ['${PLUGIN_ROOT}/server/index.mjs'])
  assert.equal(conn.cwd, '${PLUGIN_ROOT}')
  assert.deepEqual(conn.displayArgs, [`${expectedRoot}/server/index.mjs`])
  assert.equal(conn.displayCwd, expectedRoot)
  assert.equal(conn.env.PLUGIN_ROOT, undefined, 'synthetic runtime vars must not pollute editable env')
  assert.equal(conn.env.CCC_WAIT_MS, '1200000')

  // Update preserves pluginDataDir
  write(join(srcDir, '.codex-plugin', 'plugin.json'), { name: pluginName, version: '0.12.0' })
  await install.updatePlugin(pluginName)
  assert.equal(readFileSync(join(store.pluginDataDir(pluginName), 'marker.txt'), 'utf8'), 'persisted-v1')

  // Uninstall removes pluginDataDir
  await install.uninstallPlugin(pluginName)
  assert.equal(existsSync(store.pluginDataDir(pluginName)), false)
})

test('relative dot cwd (".", "./sub"), relative command, Agent Plugins implicit cwd, and omitted default cwd behave accurately', async () => {
  const sourceId = 'local'
  const pluginName = 'rel-paths-plugin'
  const srcDir = join(store.sourceCacheDir(sourceId), pluginName)
  write(join(srcDir, '.codex-plugin', 'plugin.json'), { name: pluginName, version: '1.0.0' })
  write(join(srcDir, 'dot-marker.txt'), 'root')
  write(join(srcDir, 'sub', 'sub-marker.txt'), 'sub')
  write(join(srcDir, 'mcp', 'server.mjs'), mcpStdioServerSource('dot-marker.txt'))
  write(join(srcDir, 'sub', 'server.mjs'), mcpStdioServerSource('sub-marker.txt'))
  write(join(srcDir, 'plain.mjs'), mcpStdioServerSource())

  write(join(srcDir, 'mcp.json'), {
    mcpServers: {
      dotcwd: { command: process.execPath, args: ['./mcp/server.mjs'], cwd: '.' },
      subcwd: { command: process.execPath, args: ['./server.mjs'], cwd: './sub' },
      implicitrel: { command: process.execPath, args: ['./mcp/server.mjs'] },
      globaldefault: { command: process.execPath, args: [join(srcDir, 'plain.mjs')] },
    },
  })

  parser.invalidateMarketplaceCache(sourceId)
  await install.installPlugin({ sourceId, pluginName })
  const target = norm(store.installedDir(pluginName))

  for (const name of ['dotcwd', 'subcwd', 'implicitrel', 'globaldefault']) {
    const res = await install.enableConnector(pluginName, name, undefined, { pluginOwned: true })
    assert.equal(res.ok, true, `${name}: ${res.error}`)
  }

  assert.equal(norm(install.getConnectorEntry(pluginName, 'dotcwd').config.cwd), target)
  assert.equal(norm(install.getConnectorEntry(pluginName, 'subcwd').config.cwd), `${target}/sub`)
  assert.equal(norm(install.getConnectorEntry(pluginName, 'implicitrel').config.cwd), target)
  assert.equal(install.getConnectorEntry(pluginName, 'globaldefault').config.cwd, undefined)

  // Custom saved template preserves '.' & '${PLUGIN_DATA}' while explicit empty cwd clears it
  const saveDot = await apiCall('POST', `/plugins/${pluginName}/connectors/dotcwd/auth`, {
    transport: 'stdio',
    command: process.execPath,
    args: ['${PLUGIN_ROOT}/plain.mjs'],
    cwd: '${PLUGIN_DATA}',
    env: { CUSTOM: '${PLUGIN_DATA}/v' },
  })
  assert.equal(saveDot.body.ok, true, saveDot.body.error)
  assert.equal(norm(install.getConnectorEntry(pluginName, 'dotcwd').config.cwd), norm(store.pluginDataDir(pluginName)))
  let detailConn = install.installedDetails().find(p => p.name === pluginName).connectors.find(c => c.name === 'dotcwd')
  assert.equal(detailConn.cwd, '${PLUGIN_DATA}')
  assert.equal(norm(detailConn.displayCwd), norm(store.pluginDataDir(pluginName)))

  const cleared = await apiCall('POST', `/plugins/${pluginName}/connectors/globaldefault/auth`, {
    transport: 'stdio',
    command: process.execPath,
    args: ['${PLUGIN_ROOT}/plain.mjs'],
    cwd: '',
  })
  assert.equal(cleared.body.ok, true, cleared.body.error)
  assert.equal(install.getConnectorEntry(pluginName, 'globaldefault').config.cwd, undefined)
})

test('resolveCommandPath supports relative dot executable paths against plugin root', () => {
  const dir = join(root, 'rel-cmd-dir')
  const ext = process.platform === 'win32' ? '.cmd' : '.sh'
  const relFile = join(dir, 'bin', `runner${ext}`)
  write(relFile, process.platform === 'win32' ? '@echo off\r\necho ok\r\n' : '#!/bin/sh\necho ok\n')
  if (process.platform !== 'win32') chmodSync(relFile, 0o755)
  assert.equal(install.resolveCommandPath(`./bin/runner${ext}`, process.env, { cwd: dir }), relFile)
  assert.equal(install.resolveCommandPath('./bin/missing-exec', process.env, { cwd: dir }), null)
})

test('builtin plugin vars never trigger secret-required errors while real placeholders do; client UI preserves templates and smart secret masking', () => {
  assert.equal(install.connectorRequiresAuth({
    name: 'srv', type: 'stdio', command: 'node',
    args: ['${PLUGIN_ROOT}/index.mjs'], cwd: '${PLUGIN_ROOT}',
    env: { DATA: '${PLUGIN_DATA}/db', CLAUDE: '${CLAUDE_PLUGIN_DATA}/cache' },
  }), false)
  assert.equal(install.connectorRequiresAuth({
    name: 'srv', type: 'stdio', command: 'node',
    args: ['index.mjs'], env: { API_TOKEN: '${SERVICE_API_TOKEN}' },
  }), true)

  // Test UI helper extraction: openAuthDialog state building, buildAuthPayload cwd preservation, and smart env masking
  const helperStart = clientSource.indexOf('function hasUnresolvedVarPlaceholder(')
  assert.ok(helperStart >= 0, 'client.js should define shared builtin/secret classification helper')
  const helperEnd = clientSource.indexOf('function isLikelySecretEnv(', helperStart)
  const secretFnEnd = clientSource.indexOf('\n\t', clientSource.indexOf('return ', helperEnd))
  const helpersCode = clientSource.slice(helperStart, clientSource.indexOf('\n\tfunction ', secretFnEnd + 1) > 0
    ? clientSource.indexOf('\n\tfunction ', secretFnEnd + 1)
    : clientSource.indexOf('\n\tconst ', secretFnEnd + 1))

  const ctx = {}
  runInNewContext(helpersCode + '\nglobalThis.api = { hasUnresolvedVarPlaceholder, isLikelySecretEnv, isLikelySecretHeader };', ctx)
  assert.equal(ctx.api.hasUnresolvedVarPlaceholder('${PLUGIN_ROOT}/cfg.json'), false)
  assert.equal(ctx.api.hasUnresolvedVarPlaceholder('${PLUGIN_DATA}/state.json'), false)
  assert.equal(ctx.api.hasUnresolvedVarPlaceholder('${CLAUDE_PLUGIN_ROOT}/cfg'), false)
  assert.equal(ctx.api.hasUnresolvedVarPlaceholder('${CLAUDE_PLUGIN_DATA}/cfg'), false)
  assert.equal(ctx.api.hasUnresolvedVarPlaceholder('${GITHUB_TOKEN}'), true)
  assert.equal(ctx.api.isLikelySecretEnv('CCC_WAIT_MS', '1200000'), false)
  assert.equal(ctx.api.isLikelySecretEnv('DATA_DIR', '${PLUGIN_DATA}'), false)
  assert.equal(ctx.api.isLikelySecretEnv('AUTHOR', 'Alice'), false)
  assert.equal(ctx.api.isLikelySecretEnv('OAUTH_MODE', 'auto_register'), false)
  assert.equal(ctx.api.isLikelySecretEnv('GITHUB_TOKEN', 'ghp_123'), true)
  assert.equal(ctx.api.isLikelySecretEnv('AUTH_TOKEN', 'tok'), true)
  assert.equal(ctx.api.isLikelySecretEnv('API_AUTH', 'tok'), true)
  assert.equal(ctx.api.isLikelySecretEnv('OPENAI_API_KEY', 'sk-123'), true)
  assert.equal(ctx.api.isLikelySecretHeader('Authorization', 'Bearer abc'), true)
  assert.equal(ctx.api.isLikelySecretHeader('x-exa-source', 'agent-plugin'), false)

  // Verify Working directory UI row / list subtitle removal and buildAuthPayload omits cwd
  assert.equal(clientSource.includes('"Working directory"'), false)
  assert.equal(clientSource.includes('工作目录 ·'), false)
  assert.equal(clientSource.includes('dispCwd'), false)

  const buildStart = clientSource.indexOf('const buildAuthPayload = ')
  const buildEnd = clientSource.indexOf('const persistAuthDialog = ', buildStart)
  const payload = runInNewContext(clientSource.slice(buildStart, buildEnd) + 'buildAuthPayload()', {
    authDialog: {
      transport: 'stdio',
      command: 'node',
      args: '["${PLUGIN_ROOT}/server/index.mjs"]',
      envList: [{ key: 'CCC_WAIT_MS', value: '1200000', isSecret: false }],
      headersList: [],
    },
  })
  assert.equal(Object.hasOwn(payload, 'cwd'), false)
  assert.equal(payload.command, 'node')

  // Verify OAuth connect button switches to 测试连接 when already signed in & connected
  const needsLoginStart = clientSource.indexOf('function needsOAuthLogin(')
  assert.ok(needsLoginStart >= 0, 'client.js should define shared needsOAuthLogin helper')
  const needsLoginEnd = clientSource.indexOf('\n\tfunction ', needsLoginStart + 1)
  const oauthCtx = {}
  runInNewContext(clientSource.slice(needsLoginStart, needsLoginEnd) + '\nglobalThis.needsOAuthLogin = needsOAuthLogin;', oauthCtx)
  const signedInInitial = {
    name: 'exa', url: 'https://mcp.exa.ai/mcp?client=agent-plugin', oauth: 'auto_register',
    oauthClientId: '', oauthCallbackPort: null, oauthScope: '', oauthAuthenticated: true,
  }
  assert.equal(oauthCtx.needsOAuthLogin({ transport: 'http', name: 'exa', url: 'https://mcp.exa.ai/mcp?client=agent-plugin', oauth: 'auto_register', oauthClientId: '', oauthClientSecret: '', oauthCallbackPort: '', oauthScope: '' }, signedInInitial), false)
  assert.equal(oauthCtx.needsOAuthLogin({ transport: 'http', name: 'exa', url: 'https://mcp.exa.ai/other', oauth: 'auto_register', oauthClientId: '', oauthClientSecret: '', oauthCallbackPort: '', oauthScope: '' }, signedInInitial), true)
  assert.equal(oauthCtx.needsOAuthLogin({ transport: 'http', name: 'exa', url: 'https://mcp.exa.ai/mcp?client=agent-plugin', oauth: 'custom', oauthClientId: 'id1', oauthClientSecret: '', oauthCallbackPort: '', oauthScope: '' }, signedInInitial), true)
  assert.equal(oauthCtx.needsOAuthLogin({ transport: 'http', name: 'exa2', url: 'https://mcp.exa.ai/mcp?client=agent-plugin', oauth: 'auto_register', oauthClientId: '', oauthClientSecret: '', oauthCallbackPort: '', oauthScope: '' }, signedInInitial), true)
  assert.equal(oauthCtx.needsOAuthLogin({ transport: 'http', name: 'fresh', url: 'https://mcp.exa.ai/mcp', oauth: 'auto_register', oauthClientId: '', oauthClientSecret: '', oauthCallbackPort: '', oauthScope: '' }, { ...signedInInitial, oauthAuthenticated: false }), true)
})

test('Claude .lsp.json, manifest.lspServers path/array, settings->configuration, and ${CLAUDE_PLUGIN_ROOT} expansion', async () => {
  const sourceId = 'local'
  const pluginName = 'claude-lsp-plugin'
  const srcDir = join(store.sourceCacheDir(sourceId), pluginName)
  const binExt = process.platform === 'win32' ? '.cmd' : '.sh'
  const lspBinRel = `./bin/fake-lsp${binExt}`
  write(join(srcDir, '.claude-plugin', 'plugin.json'), {
    name: pluginName,
    version: '1.0.0',
    lspServers: ['./lsp/extra.json', { inline_lang: { command: `${'${CLAUDE_PLUGIN_ROOT}'}/bin/fake-lsp${binExt}`, extensionToLanguage: { '.inl': 'inline' }, settings: { enable: true } } }],
  })
  write(join(srcDir, 'bin', `fake-lsp${binExt}`), process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n')
  if (process.platform !== 'win32') chmodSync(join(srcDir, 'bin', `fake-lsp${binExt}`), 0o755)
  write(join(srcDir, '.lsp.json'), {
    py_root: {
      command: lspBinRel,
      args: ['--stdio'],
      extensionToLanguage: { '.py': 'python' },
      settings: { analysis: { typeCheckingMode: 'strict' } },
      env: { CACHE: '${CLAUDE_PLUGIN_DATA}/lsp-cache' },
    },
  })
  write(join(srcDir, 'lsp', 'extra.json'), {
    ts_extra: {
      command: '${PLUGIN_ROOT}/bin/fake-lsp' + binExt,
      extensionToLanguage: { '.mts': 'typescript' },
    },
  })

  parser.invalidateMarketplaceCache(sourceId)
  await install.installPlugin({ sourceId, pluginName })
  const servers = parser.listLspServers(store.installedDir(pluginName))
  assert.deepEqual(servers.map(s => s.name).sort(), ['inline_lang', 'py_root', 'ts_extra'])
  assert.deepEqual(servers.find(s => s.name === 'py_root').configuration, { analysis: { typeCheckingMode: 'strict' } })

  const detail = install.installedDetails().find(p => p.name === pluginName)
  assert.equal(detail.lspServers.every(s => s.active === true), true)
  const pyEntry = install.readCordisPatch().flatMap(b => b?.insert || []).find(e => e?.id === install.getLspServerId(pluginName, 'py_root'))
  assert.ok(pyEntry)
  assert.equal(norm(pyEntry.config.servers.py_root.command), `${norm(store.installedDir(pluginName))}/bin/fake-lsp${binExt}`)
  assert.deepEqual(pyEntry.config.servers.py_root.configuration, { analysis: { typeCheckingMode: 'strict' } })
  assert.equal(norm(pyEntry.config.servers.py_root.env.CACHE), `${norm(store.pluginDataDir(pluginName))}/lsp-cache`)
})

test('Hooks support mixed array of paths + inline objects, YAML, args, ${PLUGIN_ROOT}/${PLUGIN_DATA}, compiled JSON bridge, and cleanup', async () => {
  const sourceId = 'local'
  const pluginName = 'hooks-combo-plugin'
  const srcDir = join(store.sourceCacheDir(sourceId), pluginName)
  write(join(srcDir, '.codex-plugin', 'plugin.json'), {
    name: pluginName,
    version: '1.0.0',
    hooks: [
      './hooks/extra.yaml',
      {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'node ${PLUGIN_ROOT}/scripts/guard.mjs', args: ['--data', '${PLUGIN_DATA}'] }] },
        ],
      },
    ],
  })
  write(join(srcDir, 'hooks', 'extra.yaml'), 'hooks:\n  SessionStart:\n    - hooks:\n        - type: command\n          command: echo $CLAUDE_PLUGIN_DATA/init\n')

  parser.invalidateMarketplaceCache(sourceId)
  await install.installPlugin({ sourceId, pluginName })
  const hooks = parser.listHooks(store.installedDir(pluginName))
  assert.deepEqual(hooks, ['SessionStart', 'Pre-tool use: Bash'])

  const bridgeEntry = install.readCordisPatch().flatMap(b => b?.insert || []).find(e => e?.id === install.getHookBridgeId(pluginName))
  assert.ok(bridgeEntry, 'compiled hook bridge entry must be written')
  const compiled = JSON.parse(readFileSync(bridgeEntry.config.configPath, 'utf8'))
  const expectedRoot = norm(store.installedDir(pluginName))
  const expectedData = norm(store.pluginDataDir(pluginName))
  assert.match(compiled.hooks.SessionStart[0].hooks[0].command, new RegExp(expectedData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(compiled.hooks.PreToolUse[0].hooks[0].command, new RegExp(`${expectedRoot}/scripts/guard.mjs`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(compiled.hooks.PreToolUse[0].hooks[0].command, new RegExp(expectedData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  install.unregisterPluginHooks(pluginName)
  assert.equal(existsSync(bridgeEntry.config.configPath), false)
})

test('Agent Plugins 1.0.0 root plugin.json + extensions["com.openai"] + .codex-plugin merge + MCP/commands/agents variants + marketplace.json metadata.pluginRoot & github/strict', async () => {
  const sourceId = 'compat-market'
  const marketDir = store.sourceCacheDir(sourceId)
  // Marketplace using metadata.pluginRoot + bare plugin name + github source + strict:false inline components
  write(join(marketDir, '.claude-plugin', 'marketplace.json'), {
    name: 'compat-marketplace',
    metadata: { pluginRoot: './plugins', version: '2.0.0' },
    plugins: [
      {
        name: 'portable-one',
        source: 'portable-one',
      },
      {
        name: 'inline-strict-false',
        source: 'bare-dir',
        strict: false,
        mcpServers: {
          declared: { command: process.execPath, args: ['${CLAUDE_PLUGIN_ROOT}/srv.mjs'] },
        },
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'echo ${CLAUDE_PLUGIN_ROOT}/done' }] }],
        },
        commands: './extra-cmds',
      },
      {
        name: 'remote-gh',
        source: { source: 'github', repo: 'ExampleOrg/RemoteRepo', ref: 'main', path: 'plugins/r1' },
      },
    ],
  })

  // Plugin 1: Agent Plugins 1.0.0 root plugin.json + .codex-plugin/plugin.json + mixed manifest mcpServers/skills/commands/agents
  const p1 = join(marketDir, 'plugins', 'portable-one')
  write(join(p1, 'plugin.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'portable-one',
    version: '3.4.5',
    description: 'Root canonical description',
    skills: ['.'],
    commands: {
      deploy: { content: '---\ndescription: Deploy app\n---\nDeploy now\n' },
    },
    agents: ['./agents/nested/reviewer.md'],
    mcpServers: ['./mcp/extra.json', { inlineMcp: { command: 'node', args: ['${PLUGIN_ROOT}/a.mjs'] } }],
  })
  write(join(p1, '.codex-plugin', 'plugin.json'), {
    name: 'ignored-override-name',
    interface: { displayName: 'Portable One Display' },
  })
  write(join(p1, 'alpha-skill', 'SKILL.md'), '---\nname: alpha-skill\ndescription: Alpha\n---\nBody\n')
  write(join(p1, 'commands', 'db', 'migrate.md'), '---\ndescription: DB migrate\n---\nMigrate body\n')
  write(join(p1, 'agents', 'nested', 'reviewer.md'), '---\nname: nested-reviewer\ndescription: Reviews code\n---\nInspect all files\n')
  write(join(p1, 'mcp', 'extra.json'), { mcpServers: { fileMcp: { command: 'node', args: ['${PLUGIN_ROOT}/b.mjs'] } } })

  // Plugin 2: strict:false bare directory enriched from marketplace row
  const p2 = join(marketDir, 'plugins', 'bare-dir')
  write(join(p2, 'srv.mjs'), mcpStdioServerSource())
  write(join(p2, 'extra-cmds', 'ship.md'), '---\ndescription: Ship command\n---\nShip it\n')

  const state = store.readState()
  store.writeState({ ...state, sources: [...state.sources, { id: sourceId, name: 'Compat Market', url: 'https://example.test/market.git' }] })
  parser.invalidateMarketplaceCache(sourceId)

  const rows = parser.readMarketplace(sourceId)
  const r1 = rows.find(r => r.name === 'portable-one')
  assert.equal(r1.source, './plugins/portable-one')
  assert.equal(r1.version, '3.4.5')
  assert.equal(r1.displayName, 'Portable One Display')

  const r3 = rows.find(r => r.name === 'remote-gh')
  assert.equal(r3.source.url, 'https://github.com/ExampleOrg/RemoteRepo.git')

  const d1 = parser.pluginDetail(sourceId, 'portable-one', r1.source, r1)
  assert.deepEqual(d1.connectors.map(c => c.name).sort(), ['fileMcp', 'inlineMcp'])
  assert.ok(d1.skills.some(s => s.name === 'alpha-skill'))
  assert.ok(d1.skills.some(s => s.name === 'db-migrate'))
  assert.ok(d1.skills.some(s => s.name === 'deploy'))
  assert.deepEqual(d1.agents.map(a => a.name), ['nested-reviewer'])

  // Install inline-strict-false and verify marketplace-supplied components materialized onto disk
  const r2 = rows.find(r => r.name === 'inline-strict-false')
  await install.installPlugin({ sourceId, pluginName: 'inline-strict-false' })
  const d2 = install.installedDetails().find(p => p.name === 'inline-strict-false')
  assert.ok(d2.skills.some(s => s.name === 'ship'))
  assert.deepEqual(d2.connectors.map(c => c.name), ['declared'])
  assert.deepEqual(d2.hooks, ['Stop'])
  assert.equal(r2.strict, false)
})

test('security & path containment: blocks traversal escapes in commands, cwd, spec paths, hooks, pluginRoot & preserves $ vars', () => {
  const jailDir = join(root, 'sec-jail')
  const outsideDir = join(root, 'sec-outside')
  const secretSpec = join(outsideDir, 'secret-hooks.json')
  write(join(jailDir, '.claude-plugin', 'plugin.json'), { name: 'sec-plugin', version: '1.0.0' })
  write(secretSpec, { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'echo leaked' }] }] } })

  assert.equal(parser.resolvePluginCommand('../sec-outside/evil.exe', jailDir), null)
  assert.equal(parser.resolvePluginCommand('${PLUGIN_ROOT}/../sec-outside/evil.exe', jailDir), null)
  assert.equal(parser.resolvePluginCwd('../../sec-outside', jailDir), null)
  assert.equal(parser.resolvePluginSpecPath(jailDir, secretSpec), null)

  // Literal $ patterns in root/data paths must not trigger String.replace backreferences
  assert.equal(
    parser.expandPluginVars('${PLUGIN_ROOT}/bin/tool', '/tmp/$1$$dir', '/tmp/$2data'),
    '/tmp/$1$$dir/bin/tool',
  )

  // Hook compilation must drop escaping relative binary rather than stringifying "null ..."
  write(join(jailDir, 'hooks', 'hooks.json'), {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: '../escape.sh --flag' }] }],
    },
  })
  assert.equal(parser.compileResolvedHooks(jailDir, readFileSync ? undefined : undefined), null)

  // Malicious metadata.pluginRoot traversal must not crash readMarketplace for sibling plugins
  const badMarketId = 'sec-bad-market'
  const badMarketDir = store.sourceCacheDir(badMarketId)
  write(join(badMarketDir, '.claude-plugin', 'marketplace.json'), {
    metadata: { pluginRoot: '../sec-outside' },
    plugins: [
      { name: 'bad-escape', source: 'secret-plugin', description: 'Bad' },
      { name: 'good-explicit', source: './plugins/good-explicit', description: 'Good' },
    ],
  })
  write(join(badMarketDir, 'plugins', 'good-explicit', 'SKILL.md'), '# Good\nValid sibling\n')
  write(join(outsideDir, 'secret-plugin', 'SKILL.md'), '# Secret\nShould never leak\n')
  const st = store.readState()
  store.writeState({ ...st, sources: [...st.sources, { id: badMarketId, name: 'Bad Market', url: 'https://example.test/bad.git' }] })
  parser.invalidateMarketplaceCache(badMarketId)
  const marketRows = parser.readMarketplace(badMarketId)
  assert.ok(marketRows.some(r => r.name === 'good-explicit'))
  assert.equal(marketRows.some(r => r.name === 'bad-escape'), false)

  if (process.platform === 'win32') {
    const winBin = join(jailDir, 'bin', 'my-lsp.cmd')
    write(winBin, '@echo off\r\n')
    const resolved = install.resolveCommandPath(join(jailDir, 'bin', 'my-lsp'), process.env)
    assert.equal(resolved?.toLowerCase(), winBin.toLowerCase())
  }
})

test('manifest edge cases: custom agents dir, single-file skills, prompts row merge, metadata-only commands, single implicit hook file', async () => {
  const sourceId = 'edge-market'
  const marketDir = store.sourceCacheDir(sourceId)
  const pluginDir = join(marketDir, 'plugins', 'edge-plugin')

  // Custom agents dir + single-file skills + sibling non-skill dir inside extras + both hooks.json & hooks.yaml
  write(join(pluginDir, 'plugin.json'), {
    name: 'edge-plugin',
    version: '1.2.3',
    agents: ['./custom-agents'],
    skills: ['./extras/single.md'],
    commands: { help: { description: 'Metadata only note' } },
  })
  write(join(pluginDir, 'custom-agents', 'bot.md'), '---\nname: custom-bot\ndescription: Custom agent\n---\nHandle custom tasks cleanly.\n')
  write(join(pluginDir, 'extras', 'single.md'), '---\ndescription: Single file skill\n---\nSingle body\n')
  write(join(pluginDir, 'extras', 'unrelated-dir', 'SKILL.md'), '---\ndescription: Should not be imported from single.md sibling\n---\nUnrelated\n')
  write(join(pluginDir, 'commands', 'real.md'), '---\ndescription: Real command\n---\nReal body\n')
  write(join(pluginDir, 'hooks', 'hooks.json'), { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: './ok.sh' }] }] } })
  write(join(pluginDir, 'hooks', 'hooks.yaml'), 'hooks:\n  PreToolUse:\n    - hooks:\n        - type: command\n          command: ./dup.sh\n')
  write(join(pluginDir, 'prompts', 'review.md'), '# Review\nCheck diff\n')

  // Marketplace row supplying prompts + mergeManifestWithRow
  write(join(marketDir, '.claude-plugin', 'marketplace.json'), {
    plugins: [{ name: 'edge-plugin', source: './plugins/edge-plugin', prompts: ['./prompts/review.md'] }],
  })

  // Dual-manifest priority consistency between readPluginManifest and syncPluginManifestMetadata
  const stBeforeLocal = store.readState()
  if (!stBeforeLocal.sources.some(s => s.id === 'local')) {
    store.writeState({ ...stBeforeLocal, sources: [...stBeforeLocal.sources, { id: 'local', name: 'Local', url: 'local' }] })
  }
  const dualSrcDir = join(root, 'dual-local-src')
  write(join(dualSrcDir, '.claude-plugin', 'marketplace.json'), {
    plugins: [{ name: 'dual-synced', source: './plugins/dual-synced', prompts: ['./prompts/review.md'] }],
  })
  write(join(dualSrcDir, 'plugins', 'dual-synced', '.claude-plugin', 'plugin.json'), { name: 'dual-synced', version: '2.0.0', description: 'Claude wins' })
  write(join(dualSrcDir, 'plugins', 'dual-synced', '.codex-plugin', 'plugin.json'), { name: 'dual-synced', version: '0.1.0', description: 'Codex overlay' })
  write(join(dualSrcDir, 'plugins', 'dual-synced', 'prompts', 'review.md'), '# Review\nCheck\n')
  await local.importLocalMarketplace(dualSrcDir, { target: 'local', overwrite: true })
  const importedDualDir = join(store.sourceCacheDir('local'), 'dual-synced')
  const claudeManifest = JSON.parse(readFileSync(join(importedDualDir, '.claude-plugin', 'plugin.json'), 'utf8'))
  const codexManifest = JSON.parse(readFileSync(join(importedDualDir, '.codex-plugin', 'plugin.json'), 'utf8'))
  assert.deepEqual(claudeManifest.prompts, ['./prompts/review.md'])
  assert.equal(codexManifest.prompts, undefined)

  const state = store.readState()
  store.writeState({ ...state, sources: [...state.sources, { id: sourceId, name: 'Edge Market', url: 'https://example.test/edge.git' }] })
  parser.invalidateMarketplaceCache(sourceId)
  const [row] = parser.readMarketplace(sourceId)
  assert.deepEqual(row.prompts, ['./prompts/review.md'])
  const merged = parser.mergeManifestWithRow({ name: 'edge-plugin' }, row)
  assert.deepEqual(merged.prompts, ['./prompts/review.md'])

  const compiled = parser.compileResolvedHooks(pluginDir)
  assert.equal(compiled.hooks.PreToolUse.length, 1, 'implicit hooks discovery must not duplicate JSON + YAML')
  assert.match(compiled.hooks.PreToolUse[0].hooks[0].command, /ok\.sh/)

  const res = await install.installPlugin({ sourceId, pluginName: 'edge-plugin' })
  const hubText = readFileSync(res.subagentsHub.skillPath, 'utf8')
  assert.match(hubText, /Handle custom tasks cleanly/)
  const botText = readFileSync(join(store.installedDir('edge-plugin'), 'skills', 'custom-bot', 'SKILL.md'), 'utf8')
  assert.match(botText, /Handle custom tasks cleanly/)
  assert.ok(res.skills.includes('/single'), 'single.md skill must be installed')
  assert.ok(!res.skills.includes('/unrelated-dir'), 'single.md spec must not pull sibling directories')
  assert.ok(res.skills.includes('/real'))
  assert.ok(!res.skills.includes('/help'), 'metadata-only command object must not become a skill when real commands exist')
})

test('lifecycle fidelity: auto-enabled toggle preserves ${PLUGIN_ROOT} templates, custom patch headers, and /mcps + installedDetails oauthAuthenticated', async () => {
  const sourceId = 'life-market'
  const pluginName = 'life-plugin'
  const marketDir = store.sourceCacheDir(sourceId)
  const pluginDir = join(marketDir, 'plugins', pluginName)
  write(join(pluginDir, '.claude-plugin', 'plugin.json'), { name: pluginName, version: '1.0.0' })
  write(join(pluginDir, 'srv.mjs'), mcpStdioServerSource())
  write(join(pluginDir, '.mcp.json'), {
    mcpServers: {
      stdioConn: {
        command: 'node',
        args: ['${PLUGIN_ROOT}/srv.mjs'],
        cwd: '${PLUGIN_ROOT}',
      },
      hdrConn: {
        type: 'http',
        url: 'https://example.test/mcp',
        headers: {
          'X-Root-Ref': '${PLUGIN_ROOT}/cfg',
          Authorization: '${API_TOKEN}',
        },
      },
    },
  })
  write(join(marketDir, '.claude-plugin', 'marketplace.json'), {
    plugins: [{ name: pluginName, source: `./plugins/${pluginName}` }],
  })

  const state = store.readState()
  store.writeState({ ...state, sources: [...state.sources, { id: sourceId, name: 'Life Market', url: 'https://example.test/life.git' }] })
  parser.invalidateMarketplaceCache(sourceId)

  await install.installPlugin({ sourceId, pluginName })
  // Simulate auto-enabled (uncustomized) stdioConn finishing activation
  const target = store.installedDir(pluginName)
  const conn = parser.listConnectors(target).find(c => c.name === 'stdioConn')
  const enabledRes = await install.enableConnector(pluginName, 'stdioConn', conn, { pluginOwned: true, rememberDefinition: false })
  assert.equal(enabledRes.ok, true)

  // Toggling OFF then ON must NOT freeze expanded paths into savedConnectorDefinition
  install.toggleConnector(pluginName, 'stdioConn', false)
  assert.equal(install.readMcpToolsState()[`${pluginName}::stdioConn`]?.savedConnectorDefinition, undefined)
  const reEnabled = await install.toggleConnector(pluginName, 'stdioConn', true)
  assert.equal(reEnabled.ok, true)
  assert.equal(install.readMcpToolsState()[`${pluginName}::stdioConn`]?.savedConnectorDefinition, undefined)

  // Custom Authorization header in cordis.patch must surface in installedDetails even alongside ${PLUGIN_ROOT} header
  install.saveConnectorAuth(pluginName, 'hdrConn', {
    type: 'http',
    url: 'https://example.test/mcp',
    headers: { 'X-Root-Ref': `${target.replace(/\\/g, '/')}/cfg`, Authorization: 'Bearer live-secret-123' },
  }, { pluginOwned: true })
  // Remove savedConnectorTemplate/Definition to directly exercise patch diffing path
  const ts = install.readMcpToolsState()
  delete ts[`${pluginName}::hdrConn`].savedConnectorDefinition
  delete ts[`${pluginName}::hdrConn`].savedConnectorTemplate
  install.writeMcpToolsState(ts)
  const detailAfterPatch = install.installedDetails().find(p => p.name === pluginName)
  const hdrDetail = detailAfterPatch.connectors.find(c => c.name === 'hdrConn')
  assert.equal(hdrDetail.headers.Authorization, 'Bearer live-secret-123')

  // Verify /mcps exposes oauthAuthenticated = true only when BOTH tokens and matching verifiedRemoteConfig exist
  const oauthUrl = 'https://mcp.exa.ai/mcp?client=agent-plugin'
  const credKey = oauthConfig.oauthCredentialKey('user-mcp', 'exa', oauthUrl, 'auto_register')
  oauthStore.allowOAuthRecordWrites(credKey)
  oauthStore.writeOAuthRecord(credKey, { tokens: { access_token: 'tok-ok' } })
  const reg = install.saveConnectorAuth('user-mcp', 'exa', {
    name: 'exa', transport: 'http', url: oauthUrl, headers: { 'x-exa-source': 'agent-plugin' }, oauth: 'auto_register',
  }, { pluginOwned: false, probe: { ok: true, tools: [] } })
  assert.equal(reg.ok, true)
  const curState = store.readState()
  store.writeState({
    ...curState,
    userMcps: [...(curState.userMcps || []), install.userMcpConfig('exa', {
      transport: 'http', url: oauthUrl, headers: { 'x-exa-source': 'agent-plugin' }, oauth: 'auto_register',
    })],
  })
  let handler
  const unmount = mountRoutes({ register({ handler: h }) { handler = h } })
  try {
    let status = 0
    let raw = ''
    const mockRes = () => ({
      setHeader() {},
      writeHead(s) { status = s; return this },
      end(b) { raw = b },
    })
    await handler({
      method: 'GET', url: '/universal-plugin-hub/api/mcps', headers: { host: 'localhost' },
    }, mockRes())
    assert.equal(status, 200)
    const listBody = JSON.parse(raw)
    const exaRow = listBody.mcps.find(m => m.name === 'exa')
    assert.equal(exaRow?.oauthAuthenticated, true)

    // If OAuth tokens are removed, oauthAuthenticated must flip back to false
    oauthStore.deleteOAuthRecord(credKey, { required: true })
    raw = ''
    await handler({
      method: 'GET', url: '/universal-plugin-hub/api/mcps', headers: { host: 'localhost' },
    }, mockRes())
    assert.equal(JSON.parse(raw).mcps.find(m => m.name === 'exa')?.oauthAuthenticated, false)
  } finally {
    unmount()
  }
})

test('probeOnly verifies OAuth connectors non-interactively without pending browser card or saving state', { timeout: 30000 }, async (t) => {
  const validTokens = new Set()
  let rejectAllTokens = false
  const body = (req) => new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
  const server = createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://localhost')
    if (reqUrl.pathname === '/.well-known/oauth-protected-resource') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        resource: `http://127.0.0.1:${server.address().port}/mcp`,
        authorization_servers: [`http://127.0.0.1:${server.address().port}`],
      }))
      return
    }
    if (reqUrl.pathname === '/.well-known/oauth-authorization-server') {
      const issuer = `http://127.0.0.1:${server.address().port}`
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        response_types_supported: ['code'],
        token_endpoint_auth_methods_supported: ['none'],
      }))
      return
    }
    if (reqUrl.pathname === '/mcp') {
      const token = (req.headers.authorization || '').replace(/^Bearer /, '')
      if (rejectAllTokens || !validTokens.has(token)) {
        res.writeHead(401, {
          'WWW-Authenticate': `Bearer resource_metadata="http://127.0.0.1:${server.address().port}/.well-known/oauth-protected-resource"`,
        }).end()
        return
      }
      if (req.method === 'DELETE') { res.writeHead(200).end(); return }
      const parsedBody = req.method === 'POST' ? JSON.parse(await body(req)) : undefined
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      const mcp = new Server({ name: 'probe-oauth-test', version: '1.0.0' }, { capabilities: { tools: {} } })
      mcp.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [{ name: 'search', inputSchema: { type: 'object', properties: {} } }, { name: 'fetch', inputSchema: { type: 'object', properties: {} } }] }))
      await mcp.connect(transport)
      res.on('close', () => { void mcp.close() })
      await transport.handleRequest(req, res, parsedBody)
      return
    }
    res.writeHead(404).end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const url = `http://127.0.0.1:${server.address().port}/mcp`
  const plugin = 'probe-oauth-plugin'
  const connName = 'remote-oauth'
  const target = store.installedDir(plugin)
  mkdirSync(target, { recursive: true })
  write(join(target, '.mcp.json'), { mcpServers: { [connName]: { type: 'http', url } } })
  const hub = store.readState()
  store.writeState({ ...hub, plugins: [...hub.plugins.filter(p => p.name !== plugin), { name: plugin, sourceId: 'local' }] })

  // 1. Missing tokens + probeOnly -> immediate non-pending failure with authExpired: true, WITHOUT mutating mcp-tools-state
  const stateKey = `${plugin}::${connName}`
  const unauthed = await install.verifyConnectorAuth(plugin, connName, {
    transport: 'http', url, oauth: 'auto_register', probeOnly: true,
  }, { pluginOwned: true })
  assert.equal(unauthed.pending, undefined)
  assert.equal(unauthed.ok, false)
  assert.equal(unauthed.mode, 'probe')
  assert.equal(unauthed.authExpired, true)
  assert.equal(install.readMcpToolsState()[stateKey]?.verifiedRemoteConfig, undefined, 'unauthed probeOnly must not persist verifiedRemoteConfig')

  // 2. Valid tokens + probeOnly -> connects non-interactively, reports toolsCount, NEVER returns pending or saves state
  const tok = `tok-${randomUUID()}`
  validTokens.add(tok)
  const key = oauthConfig.oauthCredentialKey(plugin, connName, url, 'auto_register')
  oauthStore.allowOAuthRecordWrites(key)
  oauthStore.writeOAuthRecord(key, {
    clientInformation: { client_id: 'dyn-client', redirect_uris: [] },
    tokens: { access_token: tok, token_type: 'Bearer' },
  })

  const probed = await install.verifyConnectorAuth(plugin, connName, {
    transport: 'http', url, oauth: 'auto_register', probeOnly: true,
  }, { pluginOwned: true })
  assert.equal(probed.pending, undefined)
  assert.equal(probed.ok, true, probed.message)
  assert.equal(probed.mode, 'probe')
  assert.equal(probed.toolsCount, 2)
  assert.equal(install.getConnectorEntry(plugin, connName), null, 'probeOnly must never register or enable the connector')
  assert.equal(install.readMcpToolsState()[stateKey]?.verifiedRemoteConfig, undefined, 'probeOnly on draft/disabled connector must not write verifiedRemoteConfig')

  // 3. Previously saved (disabled) OAuth connector retains verifiedRemoteConfig even when probeOnly draft fails
  assert.equal((await install.enableConnector(plugin, connName, { transport: 'http', url, oauth: 'auto_register' }, { pluginOwned: true })).ok, true)
  install.toggleConnector(plugin, connName, false)
  assert.equal(install.installedDetails().find(p => p.name === plugin)?.connectors.find(c => c.name === connName)?.oauthAuthenticated, true)

  rejectAllTokens = true
  const expired = await install.verifyConnectorAuth(plugin, connName, {
    transport: 'http', url: `${url}?draft=1`, oauth: 'auto_register', probeOnly: true,
  }, { pluginOwned: true })
  assert.equal(expired.pending, undefined)
  assert.equal(expired.ok, false)
  assert.equal(expired.authExpired, true)
  assert.doesNotMatch(expired.message, /node\.exe/i)
  assert.equal(
    install.installedDetails().find(p => p.name === plugin)?.connectors.find(c => c.name === connName)?.oauthAuthenticated,
    true,
    'failed probeOnly on disabled connector must not wipe previously saved verifiedRemoteConfig',
  )

  // 4. stdio verification must never write bogus HTTP verifiedRemoteConfig fingerprints
  const stdioKey = `${plugin}::stdio-tool`
  await install.verifyConnectorAuth(plugin, 'stdio-tool', { transport: 'stdio', command: 'nonexistent-bin-xyz' }, { pluginOwned: true })
  assert.equal(install.readMcpToolsState()[stdioKey]?.verifiedRemoteConfig, undefined, 'stdio verification must not write verifiedRemoteConfig')

  // 5. Missing custom OAuth client error directs users to 「登录并连接」, not 「测试连接」
  const customBlocked = await install.probeConnectorAuth(plugin, connName, {
    transport: 'http', url, oauth: 'custom', oauthClientId: 'cid-123',
  }, { pluginOwned: true })
  assert.equal(customBlocked.ok, false)
  assert.match(customBlocked.error, /登录并连接/)
  assert.doesNotMatch(customBlocked.error, /测试连接/)
})

test('client KeyValueEditor masks only sensitive headers/envs and hides eye button on non-secret rows', () => {
  const start = clientSource.indexOf('function isKvSensitive(')
  assert.ok(start >= 0, 'client.js should define isKvSensitive helper')
  const end = clientSource.indexOf('function KeyValueEditor(', start)
  assert.ok(end > start, 'client.js should define shared KeyValueEditor component')

  const baseStart = clientSource.indexOf('function hasUnresolvedVarPlaceholder(')
  const baseEnd = clientSource.indexOf('function cleanMcpErrorText(', baseStart)
  const kvCtx = {}
  runInNewContext(
    clientSource.slice(baseStart, baseEnd) + '\n' + clientSource.slice(start, end) +
    '\nglobalThis.kv = { makeKvRow, updateKvRow, toggleKvSecret, isKvSensitive };',
    kvCtx,
  )

  // Loaded non-secret header (`x-exa-source`) -> plaintext, NO eye icon
  const plainHeader = kvCtx.kv.makeKvRow('header', 'h1', 'x-exa-source', 'agent-plugin')
  assert.equal(plainHeader.isSecret, false)
  assert.equal(plainHeader.secretToggleable, false)

  // Loaded secret header (`Authorization`) -> masked, WITH eye icon
  const secretHeader = kvCtx.kv.makeKvRow('header', 'h2', 'Authorization', 'Bearer tok')
  assert.equal(secretHeader.isSecret, true)
  assert.equal(secretHeader.secretToggleable, true)

  // + Add blank header (represents Authorization placeholder) -> masked WITH eye until non-secret key typed
  const blankHeader = kvCtx.kv.makeKvRow('header', 'h3', '', '')
  assert.equal(blankHeader.isSecret, true)
  assert.equal(blankHeader.secretToggleable, true)
  const typedPlainHeader = kvCtx.kv.updateKvRow('header', blankHeader, { key: 'x-custom' })
  assert.equal(typedPlainHeader.isSecret, false)
  assert.equal(typedPlainHeader.secretToggleable, false)
  const typedSecretHeader = kvCtx.kv.updateKvRow('header', typedPlainHeader, { key: 'x-api-key' })
  assert.equal(typedSecretHeader.isSecret, true)
  assert.equal(typedSecretHeader.secretToggleable, true)

  // Loaded & + Add env rows: plaintext & NO eye for non-secret; auto-mask + eye when sensitive key/value typed
  const plainEnv = kvCtx.kv.makeKvRow('env', 'e1', 'CCC_WAIT_MS', '1200000')
  assert.equal(plainEnv.isSecret, false)
  assert.equal(plainEnv.secretToggleable, false)
  const blankEnv = kvCtx.kv.makeKvRow('env', 'e2', '', '')
  assert.equal(blankEnv.isSecret, false)
  assert.equal(blankEnv.secretToggleable, false)
  const typedSecretEnv = kvCtx.kv.updateKvRow('env', blankEnv, { key: 'GITHUB_TOKEN', value: 'ghp_123' })
  assert.equal(typedSecretEnv.isSecret, true)
  assert.equal(typedSecretEnv.secretToggleable, true)

  // Revealing via eye survives value edits; secret value prefix still flags secret even under non-secret key; clearing both hides eye
  const revealed = kvCtx.kv.toggleKvSecret(typedSecretEnv)
  assert.equal(revealed.isSecret, false)
  assert.equal(revealed.secretToggleable, true)
  const editedRevealed = kvCtx.kv.updateKvRow('env', revealed, { value: 'ghp_456' })
  assert.equal(editedRevealed.isSecret, false)
  assert.equal(editedRevealed.secretToggleable, true)
  const renamedWithSecretVal = kvCtx.kv.updateKvRow('env', editedRevealed, { key: 'APP_MODE' })
  assert.equal(renamedWithSecretVal.secretToggleable, true)
  const renamedPlain = kvCtx.kv.updateKvRow('env', renamedWithSecretVal, { value: 'production' })
  assert.equal(renamedPlain.isSecret, false)
  assert.equal(renamedPlain.secretToggleable, false)

  // AST check: AddMcpDialog & authDialog use shared KeyValueEditor which gates pw-btn on secretToggleable
  const ast = parse(clientSource, { ecmaVersion: 'latest' })
  const findFn = (node, name) => {
    if (node?.type === 'FunctionDeclaration' && node.id?.name === name) return node
    for (const val of Object.values(node || {})) {
      for (const child of Array.isArray(val) ? val : [val]) {
        if (child && typeof child === 'object') {
          const hit = findFn(child, name)
          if (hit) return hit
        }
      }
    }
  }
  const kvNode = findFn(ast, 'KeyValueEditor')
  assert.ok(kvNode)
  const kvSrc = clientSource.slice(kvNode.start, kvNode.end)
  assert.match(kvSrc, /item\.secretToggleable\s*&&/)
  assert.match(kvSrc, /cpm-mcp-pw-btn/)
  const addNode = findFn(ast, 'AddMcpDialog')
  const manageNode = findFn(ast, 'ManagePageContent')
  for (const [label, fnNode] of [['AddMcpDialog', addNode], ['ManagePageContent', manageNode]]) {
    const src = clientSource.slice(fnNode.start, fnNode.end)
    assert.match(src, /h\(KeyValueEditor,\s*\{\s*kind:\s*"header"/, `${label} should use KeyValueEditor for headers`)
    assert.match(src, /h\(KeyValueEditor,\s*\{\s*kind:\s*"env"/, `${label} should use KeyValueEditor for env vars`)
  }
  assert.doesNotMatch(clientSource, /headersList\.map\(/, 'client.js should not retain duplicated inline headersList editor')
})

test('AddMcpDialog and authDialog separate probe vs OAuth login and share McpConnectionStatus', async () => {
  const ast = parse(clientSource, { ecmaVersion: 'latest' })
  const findFn = (node, name) => {
    if (node?.type === 'FunctionDeclaration' && node.id?.name === name) return node
    for (const val of Object.values(node || {})) {
      for (const child of Array.isArray(val) ? val : [val]) {
        if (child && typeof child === 'object') {
          const hit = findFn(child, name)
          if (hit) return hit
        }
      }
    }
  }
  const statusFn = findFn(ast, 'McpConnectionStatus')
  assert.ok(statusFn, 'client.js should extract shared McpConnectionStatus component')
  const statusSrc = clientSource.slice(statusFn.start, statusFn.end)
  assert.match(statusSrc, /cpm-mcp-status-pill/)
  assert.match(statusSrc, /cpm-mcp-diag-popover/)

  // Render McpConnectionStatus with react-test-renderer: untested must render nothing by default
  const req = createRequire(import.meta.url)
  const React = req('react')
  const { create, act } = req('react-test-renderer')
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const statusCtx = { ...React, React, h: React.createElement }
  runInNewContext(statusSrc + '\nglobalThis.McpConnectionStatus = McpConnectionStatus;', statusCtx)
  let tree
  await act(async () => {
    tree = create(React.createElement(statusCtx.McpConnectionStatus, { status: 'untested', serverName: 'codegraph', transport: 'stdio' }))
  })
  assert.equal(tree.toJSON(), null, 'McpConnectionStatus must stay hidden while untested')

  await act(async () => {
    tree.update(React.createElement(statusCtx.McpConnectionStatus, { status: 'testing', serverName: 'codegraph', transport: 'stdio' }))
  })
  assert.match(JSON.stringify(tree.toJSON()), /Testing\.\.\./)
  assert.equal(tree.toJSON().props.tabIndex, undefined, 'spinner pill must not be keyboard-focusable')

  // publicSession from OAuth polling returns string status ('success'/'error') alongside numeric statusCode and tools array
  await act(async () => {
    tree.update(React.createElement(statusCtx.McpConnectionStatus, {
      status: 'success',
      statusMessage: 'Connected',
      lastResult: { ok: true, status: 'success', statusCode: 200, duration: 42, tools: [{ name: 'search' }, { name: 'fetch' }, { name: 'read' }], endpoint: 'https://mcp.exa.ai/mcp' },
      serverName: 'exa',
      transport: 'http',
      url: 'https://mcp.exa.ai/mcp',
    }))
  })
  assert.match(JSON.stringify(tree.toJSON()), /Connected/)
  assert.equal(tree.toJSON().props.tabIndex, 0, 'completed status pill should support keyboard focus')
  await act(async () => { tree.toJSON().props.onMouseEnter() })
  const successPop = JSON.stringify(tree.toJSON())
  assert.match(successPop, /42ms/)
  assert.match(successPop, /3 tools/)
  assert.match(successPop, /"200"/)
  assert.doesNotMatch(successPop, /"success"/, 'popover must render numeric HTTP code rather than publicSession state string')
  await act(async () => { tree.toJSON().props.onMouseLeave() })

  // Keyboard focus opens diagnostic popover; error status string ('error') must not render as "Server returned error"
  await act(async () => {
    tree.update(React.createElement(statusCtx.McpConnectionStatus, {
      status: 'error',
      statusMessage: '连接失败',
      lastResult: { ok: false, status: 'error', statusCode: 401, message: 'Unauthorized' },
      serverName: 'exa',
      transport: 'http',
      url: 'https://mcp.exa.ai/mcp',
    }))
  })
  await act(async () => { tree.toJSON().props.onFocus() })
  const errWithCode = JSON.stringify(tree.toJSON())
  assert.match(errWithCode, /Server returned 401/)
  assert.doesNotMatch(errWithCode, /Server returned error/)
  await act(async () => { tree.toJSON().props.onBlur() })

  await act(async () => {
    tree.update(React.createElement(statusCtx.McpConnectionStatus, {
      status: 'error',
      statusMessage: '连接超时',
      lastResult: { ok: false, status: 'error', message: '连接超时' },
      serverName: 'exa',
      transport: 'http',
      url: 'https://mcp.exa.ai/mcp',
    }))
  })
  await act(async () => { tree.toJSON().props.onFocus() })
  const errNoCode = JSON.stringify(tree.toJSON())
  assert.match(errNoCode, /Connection failed/)
  assert.doesNotMatch(errNoCode, /Server returned error/)

  await act(async () => {
    tree.update(React.createElement(statusCtx.McpConnectionStatus, { status: 'untested', serverName: 'exa', transport: 'http' }))
  })
  assert.equal(tree.toJSON(), null, 'Editing fields after a probe hides the pill again until re-tested')
  await act(async () => { tree.unmount() })

  // OauthFields must emit pure field patches without injecting dead `status: "untested"` or spreading stale closures
  const oauthFieldsFn = findFn(ast, 'OauthFields')
  const oauthFieldsSrc = clientSource.slice(oauthFieldsFn.start, oauthFieldsFn.end)
  const patches = []
  const fieldCtx = { ...React, React, h: React.createElement }
  runInNewContext(oauthFieldsSrc + '\nglobalThis.OauthFields = OauthFields;', fieldCtx)
  let fieldsTree
  await act(async () => {
    fieldsTree = create(React.createElement(fieldCtx.OauthFields, {
      form: { oauth: 'custom', oauthClientId: 'old-id', url: 'https://mcp.exa.ai/mcp' },
      onChange: (patch) => patches.push(patch),
      idPrefix: 'test-mcp',
    }))
  })
  const firstInput = fieldsTree.root.findAllByType('input')[0]
  await act(async () => { firstInput.props.onChange({ target: { value: 'new-id' } }) })
  assert.deepEqual(structuredClone(patches), [{ oauthClientId: 'new-id' }], 'OauthFields must pass incremental patch only')
  await act(async () => { fieldsTree.unmount() })

  const addFn = findFn(ast, 'AddMcpDialog')
  const addSrc = clientSource.slice(addFn.start, addFn.end)
  assert.match(addSrc, /h\(McpConnectionStatus\b/, 'AddMcpDialog should render shared McpConnectionStatus in bottom-left')
  assert.match(addSrc, /useConnectionProbe\(/, 'AddMcpDialog should use non-interactive probe hook for 测试连接')
  assert.match(addSrc, /h\(KeyValueEditor\b/, 'AddMcpDialog should use shared KeyValueEditor')
  assert.match(addSrc, /if \(isLogin\)[\s\S]*oauthFlow\.start\(payload\)[\s\S]*else[\s\S]*connProbe\.start\(payload\)/)
  assert.doesNotMatch(addSrc, /const save = async \(payload,\s*quiet\s*=/, 'AddMcpDialog save must not keep unused quiet parameter')

  // AddMcpDialog oauthFlow.onFinished must mark oauthBaseline authenticated even if post-OAuth save fails
  const addStart = addSrc.indexOf('onFinished: async (res) => {')
  const addEnd = addSrc.indexOf('onCancel:', addStart)
  const addBaselines = []
  const addCallbacks = runInNewContext('({' + addSrc.slice(addStart, addEnd) + '})', {
    verifiedPayloadRef: { current: { name: 'exa', transport: 'http', url: 'https://mcp.exa.ai/mcp', oauth: 'auto_register' } },
    setOauthBaseline: (val) => addBaselines.push(val),
    setConnState: () => {},
    save: async () => {},
    showToast: () => {},
    toProbeErrorState: (e) => ({ status: 'error', statusMessage: e.message }),
  })
  await addCallbacks.onFinished({ ok: true, message: 'ok' })
  assert.equal(addBaselines.length, 1, 'AddMcpDialog must update oauthBaseline when OAuth finishes')
  assert.equal(addBaselines[0].oauthAuthenticated, true)

  // PluginDetail authDialog: all fields must reset via functional update (zero stale spread `{ ...authDialog, ... }`)
  const manageFn = findFn(ast, 'ManagePageContent')
  const manageSrc = clientSource.slice(manageFn.start, manageFn.end)
  assert.doesNotMatch(manageSrc, /setAuthDialog\(\s*\{\s*\.\.\.authDialog/, 'PluginDetail must not spread stale authDialog snapshot on edits')
  assert.match(manageSrc, /updateAuthDialog\(/, 'PluginDetail should funnel authDialog form edits through unified updater')

  // PluginDetail authDialog onFinished: locks `saving: true` during async save, unlocks on error, falls back to verifiedConnectorRef when res.server omitted
  const detailStart = clientSource.indexOf('const closeAuthDialog = ', clientSource.indexOf('function PluginDetail('))
  const pluginStart = clientSource.lastIndexOf('onFinished: async (res) => {', detailStart)
  const pluginEnd = clientSource.indexOf('onCancel:', pluginStart)
  let closed = false
  let toasted = null
  const loadedTools = []
  const pluginSaves = []
  const dialogTransitions = []
  let resolveSave
  const verifiedPayloadRef = { current: { transport: 'http', oauth: 'auto_register', url: 'https://mcp.exa.ai/mcp' } }
  const verifiedConnectorRef = { current: 'exa' }
  const applyDialogUpdate = (updater) => {
    const next = typeof updater === 'function'
      ? updater(dialogTransitions.at(-1) || { connectorName: 'exa', transport: 'http', oauth: 'auto_register', testing: true, saving: false, oauthBaseline: null })
      : updater
    dialogTransitions.push(next)
  }
  const callbacks = runInNewContext('({' + clientSource.slice(pluginStart, pluginEnd) + '})', {
    setAuthDialog: applyDialogUpdate,
    refreshState: async () => {},
    loadConnectorTools: async (name) => { loadedTools.push(name) },
    verifiedPayloadRef,
    verifiedConnectorRef,
    persistAuthDialog: payload => new Promise((r) => { pluginSaves.push(payload); resolveSave = r }),
    showToast() {},
    cleanMcpError: (e) => e?.message || String(e),
    showApplicationToast: (_st, _res, title, body) => { toasted = { title, body } },
    closeAuthDialog: () => { closed = true },
  })
  const pendingSave = callbacks.onFinished({ ok: true, message: 'OAuth ok' })
  assert.equal(dialogTransitions.at(-1).testing, false)
  assert.equal(dialogTransitions.at(-1).saving, true, 'PluginDetail must set saving: true before awaiting persistAuthDialog')
  resolveSave({ ok: true, application: 'applied' })
  await pendingSave
  assert.equal(pluginSaves.length, 1)
  assert.equal(closed, true)
  assert.deepEqual(loadedTools, ['exa'], 'loadConnectorTools must still run using connector fallback when res.server is absent')
  assert.match(toasted?.body || '', /已成功保存 exa 认证信息/, 'toast must include connector name even when res.server is absent')

  // If persistAuthDialog fails, saving lock must release back to false
  const failToasts = []
  const failTransitions = []
  const failCallbacks = runInNewContext('({' + clientSource.slice(pluginStart, pluginEnd) + '})', {
    setAuthDialog: (u) => failTransitions.push(typeof u === 'function' ? u(failTransitions.at(-1) || { connectorName: 'exa', transport: 'http', oauth: 'auto_register', testing: true, saving: false }) : u),
    refreshState: async () => {},
    loadConnectorTools: async () => {},
    verifiedPayloadRef,
    verifiedConnectorRef,
    persistAuthDialog: async () => ({ ok: false, error: 'backend failed' }),
    showToast: (t, m) => failToasts.push({ t, m }),
    cleanMcpError: (e) => e?.message || String(e),
    showApplicationToast: () => {},
    closeAuthDialog: () => {},
  })
  await failCallbacks.onFinished({ ok: true, server: 'exa', message: 'OAuth ok' })
  assert.equal(failTransitions.at(-1).saving, false, 'failed post-OAuth save must reset saving back to false')
  assert.equal(failToasts.length, 1)

  // Public oauth session exposes server & toolsCount; no dead CSS/FORM_UI_KEYS leftovers
  const oauthModule = await import('../src/oauth.js')
  const s = oauthModule.beginOAuthVerification('test-plugin', 'exa', { url: 'http://127.0.0.1:1/mcp', oauth: 'auto_register' }, { noBrowser: true, callbackTimeout: 200 })
  const pub = oauthModule.getOAuthVerification(s.id)
  assert.equal(pub.server, 'exa', 'publicSession must expose connector server name')
  oauthModule.cancelOAuthVerification(s.id)

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.version, '1.3.1', 'package version must be upgraded to 1.3.1')
  const routesSource = readFileSync(new URL('../src/routes.js', import.meta.url), 'utf8')
  assert.match(routesSource, /if \(method === 'POST' && path === '\/mcps\/verify'\)\s*\{[\s\S]*?normalizeMcpName\(body\.name\)/, '/mcps/verify should reuse normalizeMcpName')
  const bridgeSource = readFileSync(new URL('../src/oauth-bridge.js', import.meta.url), 'utf8')
  assert.doesNotMatch(bridgeSource, /请在连接器设置中重新登录/, 'oauth-bridge should not hardcode plugin-only connector phrasing')
  assert.doesNotMatch(clientSource, /\.cpm-mcp-diag-header\.is-neutral/, 'dead .is-neutral CSS must be removed')
  const uiKeysLine = clientSource.match(/const FORM_UI_KEYS = .*$/m)?.[0] || ''
  assert.doesNotMatch(uiKeysLine, /"oauthSessionId"|"diagHover"/, 'FORM_UI_KEYS should not keep unused keys')
})
