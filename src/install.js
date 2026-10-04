/**
 * Install / uninstall / toggle / update lifecycle for plugins.
 *
 * On install the plugin directory is copied into the hub's own
 * `installed/` tree and its `skills/` directory is registered in the
 * dsh-agent-skills scan state (`$DSH_HOME/agent-skills/state.json`), so the
 * next DSH restart (or registry re-scan) exposes the plugin's skills to
 * agents.
 */
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, renameSync, readdirSync, copyFileSync, statSync, accessSync, constants as fsConstants } from 'node:fs'
import { dirname, join, basename, isAbsolute, resolve, extname, delimiter } from 'node:path'
import { spawn, execFile, execFileSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { homedir } from 'node:os'
import * as yaml from 'js-yaml'
import { installedDir, readState, writeState, slugify, dshHome, dshSkillsDir, safeRmDir } from './store.js'
import { materializePlugin, pullSource } from './market.js'
import { copyDir, listSkills, listAgents, listPrompts, listConnectors, listHooks, listLspServers, readPluginManifest, resolveHookConfigPath, invalidateParserCaches } from './parser.js'
import { parseAgentDefinition, compileSubagentsHubSkill, cleanupLegacyPresets } from './agents-map.js'

/** Active profile name: env DSH_PROFILE -> desktop (if present) -> web. */
export function resolveActiveProfileName() {
  if (process.env.DSH_PROFILE) return process.env.DSH_PROFILE
  const desktopDir = join(dshHome(), 'profiles', 'desktop')
  if (existsSync(desktopDir)) return 'desktop'
  return 'web'
}

/** cordis.patch.yml path (auto-detects desktop or web profile). */
export function cordisPatchPath() {
  const profileName = resolveActiveProfileName()
  const profilePatch = join(dshHome(), 'profiles', profileName, 'cordis.patch.yml')
  if (existsSync(profilePatch)) return profilePatch
  const homePatch = join(dshHome(), 'cordis.patch.yml')
  if (existsSync(homePatch)) return homePatch
  return profilePatch
}

export function readCordisPatch() {
  const file = cordisPatchPath()
  if (!existsSync(file)) return []
  try {
    const parsed = yaml.load(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeCordisPatch(patch) {
  const file = cordisPatchPath()
  mkdirSync(dirname(file), { recursive: true })
  const content = yaml.dump(patch, { indent: 2, lineWidth: -1 })
  const tmp = join(dirname(file), `.cordis.patch.${process.pid}.${Date.now().toString(36)}.tmp`)
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

export function getConnectorId(pluginName, connectorName) {
  return `mcp-${slugify(pluginName)}-${slugify(connectorName)}`
}

export function getConnectorEntry(pluginName, connectorName) {
  const patch = readCordisPatch()
  const id = getConnectorId(pluginName, connectorName)
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      const found = block.insert.find((item) => item && item.id === id)
      if (found) return found
    }
  }
  return null
}

export function connectorRequiresAuth(cfg) {
  if (!cfg) return true
  const isHttp = (cfg.type === 'http' || cfg.type === 'sse' || (!cfg.command && (!!cfg.url || !cfg.args?.length)))
  
  // 1. If HTTP / SSE connector has NO valid URL or empty placeholder URL, it ALWAYS requires configuration/auth!
  if (isHttp) {
    if (!cfg.url || typeof cfg.url !== 'string' || !cfg.url.trim() || !/^https?:\/\//i.test(cfg.url.trim())) {
      return true
    }
  } else {
    // Stdio connector with NO command ALWAYS requires configuration/auth!
    if (!cfg.command || typeof cfg.command !== 'string' || !cfg.command.trim()) {
      return true
    }
  }

  // 2. If URL explicitly embeds a concrete API key / token query parameter (e.g. Tavily: ?api_key=tvly-...)
  if (cfg.url && typeof cfg.url === 'string' && /[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i.test(cfg.url)) {
    const match = cfg.url.match(/[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i)
    if (match && !match[2].includes('${') && match[2].trim().length > 3) {
      return false // Ready to connect directly without separate header
    }
  }
  // 3. Explicit template placeholders in headers (e.g. ${GITHUB_PERSONAL_ACCESS_TOKEN})
  if (cfg.headers && typeof cfg.headers === 'object') {
    if (Object.values(cfg.headers).some((v) => typeof v === 'string' && v.includes('${'))) return true
    if (Object.keys(cfg.headers).some((k) => /auth|token|key|secret/i.test(k) && !cfg.headers[k])) return true
  }
  // 4. Explicit template placeholders in env (e.g. ${NOTION_API_KEY} or ${API_KEY})
  if (cfg.env && typeof cfg.env === 'object') {
    if (Object.values(cfg.env).some((v) => typeof v === 'string' && v.includes('${'))) return true
    if (Object.keys(cfg.env).some((k) => /auth|token|key|secret|password/i.test(k) && !cfg.env[k])) return true
  }
  // 5. Known cloud MCP services that mandate authentication tokens
  const nameLower = String(cfg.name || '').toLowerCase()
  if (['github', 'notion', 'discord', 'gitlab', 'figma', 'linear', 'slack', 'sentry', 'atlassian', 'box', 'gong', 'granola', 'jira', 'confluence', 'hubspot', 'salesforce', 'zendesk', 'stripe', 'intercom', 'airtable', 'asana', 'clickup', 'trello', 'benchling'].includes(nameLower)) {
    return true
  }
  // 6. Headers with auth/token keywords
  if (cfg.headers && typeof cfg.headers === 'object' && Object.keys(cfg.headers).some((k) => /auth|token|key|secret/i.test(k))) {
    return true
  }
  // 7. Remote HTTP / SSE MCP services (public cloud endpoints require authentication unless local or public)
  if (isHttp) {
    if (cfg.url && /^https?:\/\//i.test(cfg.url) && !/localhost|127\.0\.0\.1/i.test(cfg.url)) {
      const authHeader = cfg.headers?.Authorization || cfg.headers?.authorization
      if (!authHeader || authHeader.includes('${')) {
        return true
      }
    }
  }
  return false
}

export function isConnectorAuthenticated(pluginName, connectorName) {
  const target = installedDir(pluginName)
  const connectors = existsSync(target) ? getPluginConnectors(target) : []
  const found = connectors.find((c) => c.name === connectorName)
  const entry = getConnectorEntry(pluginName, connectorName)
  const cfg = entry?.config || found || {}

  const isHttp = (entry?.config?.transport === 'streamable-http' || found?.type === 'http' || found?.type === 'sse' || (!found?.command && (found?.url || cfg.url)) || (!found?.command && !found?.args?.length))
  if (isHttp) {
    const url = cfg.url || found?.url || ''
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
      return false
    }
  } else {
    const cmd = cfg.command || found?.command || ''
    if (!cmd || typeof cmd !== 'string' || !cmd.trim()) {
      return false
    }
  }

  if (!found || !connectorRequiresAuth(found)) {
    return true
  }
  if (!entry) return false

  // Check embedded URL token
  const url = cfg.url || found.url || ''
  if (url && typeof url === 'string' && /[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i.test(url)) {
    const match = url.match(/[?&](api_key|apiKey|token|key|access_token)=([^&]+)/i)
    if (match && !match[2].includes('${') && match[2].trim().length > 3) {
      return true
    }
  }
  const authHeader = cfg.headers?.Authorization || cfg.headers?.authorization || ''
  if (authHeader && !authHeader.includes('${') && authHeader.trim().length > 0) {
    return true
  }
  if (cfg.headers && Object.values(cfg.headers).some((v) => typeof v === 'string' && !v.includes('${') && v.trim().length > 0)) {
    return true
  }
  if (cfg.env && Object.values(cfg.env).some((v) => typeof v === 'string' && !v.includes('${') && v.trim().length > 0)) {
    return true
  }
  return false
}

export function isConnectorActive(pluginName, connectorName) {
  const entry = getConnectorEntry(pluginName, connectorName)
  if (!entry) return false
  return isConnectorAuthenticated(pluginName, connectorName)
}

export const getPluginConnectors = listConnectors

export function substitutePluginRoot(val, pluginRoot) {
  if (typeof val === 'string') {
    const normalizedRoot = pluginRoot.replace(/\\/g, '/')
    return val
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, normalizedRoot)
      .replace(/\$CLAUDE_PLUGIN_ROOT\b/g, normalizedRoot)
  }
  if (Array.isArray(val)) {
    return val.map((item) => substitutePluginRoot(item, pluginRoot))
  }
  if (val && typeof val === 'object') {
    const res = {}
    for (const [k, v] of Object.entries(val)) {
      res[k] = substitutePluginRoot(v, pluginRoot)
    }
    return res
  }
  return val
}

export function registerConnector(pluginName, connectorName, connectorConfig) {
  const patch = readCordisPatch()
  const id = getConnectorId(pluginName, connectorName)
  const pluginRoot = installedDir(pluginName)
  const resolvedConfig = substitutePluginRoot(connectorConfig, pluginRoot)

  let insertBlock = patch.find((item) => item && Array.isArray(item.insert))
  if (!insertBlock) {
    insertBlock = { insert: [] }
    patch.push(insertBlock)
  }

  insertBlock.insert = insertBlock.insert.filter((item) => item && item.id !== id)

  const isHttp = resolvedConfig.type === 'http' || resolvedConfig.type === 'sse' || (!resolvedConfig.command && (!!resolvedConfig.url || !resolvedConfig.args?.length))
  if (isHttp && (!resolvedConfig.url || !resolvedConfig.url.trim() || !/^https?:\/\//i.test(resolvedConfig.url.trim()))) {
    return { ok: false, connected: false, error: '缺少有效的服务 URL' }
  }

  const clientConfig = {
    serverName: connectorName,
    transport: isHttp ? 'streamable-http' : 'stdio',
  }

  if (resolvedConfig.url) clientConfig.url = resolvedConfig.url
  if (resolvedConfig.headers && Object.keys(resolvedConfig.headers).length > 0) {
    clientConfig.headers = resolvedConfig.headers
  }
  if (resolvedConfig.command) clientConfig.command = resolvedConfig.command
  if (resolvedConfig.args && resolvedConfig.args.length > 0) clientConfig.args = resolvedConfig.args
  if (resolvedConfig.env && Object.keys(resolvedConfig.env).length > 0) clientConfig.env = resolvedConfig.env

  insertBlock.insert.push({
    id,
    name: '@deepseek-ai/dsh-mcp-client',
    config: clientConfig,
  })

  writeCordisPatch(patch)
  return { ok: true, connected: true }
}

export function unregisterConnector(pluginName, connectorName) {
  const patch = readCordisPatch()
  const id = getConnectorId(pluginName, connectorName)

  for (const item of patch) {
    if (item && Array.isArray(item.insert)) {
      item.insert = item.insert.filter((entry) => entry && entry.id !== id)
    }
  }

  const cleaned = patch.filter((item) => !item || !Array.isArray(item.insert) || item.insert.length > 0)
  writeCordisPatch(cleaned)
  return { ok: true, connected: false }
}

// ── LSP server registration (cordis.patch.yml → @deepseek-ai/dsh-lsp-stdio) ──
//
// DSH exposes LSP as a capability seam with three packages:
//   @deepseek-ai/dsh-lsp         (service definition, mounted once)
//   @deepseek-ai/dsh-lsp-stdio   (stdio provider, one instance per server)
//   @deepseek-ai/dsh-tool-lsp    (model-facing tool, mounted once)
// Claude plugin marketplaces declare these in the `lspServers` field, whose
// shape (command/args/extensionToLanguage/env) matches dsh-lsp-stdio's
// `servers` table directly, so registration is a straight pass-through.

/**
 * Replicate @deepseek-ai/dsh-subprocess-local's `resolveExecutable` check to
 * test whether a bare command name would be resolvable at DSH load time.
 *
 * Returns the resolved absolute path, or null when no PATH entry satisfies
 * `stat.isFile()` + `X_OK` — the same probe DSH runs when wiring up a
 * stdio LSP provider. Without this pre-flight, registering a server whose
 * binary is missing poisons `cordis.patch.yml`: the loader resolves the
 * package fine, then `lsp-stdio.apply()` rejects the command at load time
 * and the entire DSH plugin tree fails to come up.
 */
export function resolveCommandPath(command, env = process.env) {
  if (typeof command !== 'string') return null
  const trimmed = command.trim()
  if (!trimmed) return null
  if (isAbsolute(trimmed)) {
    try {
      if (!statSync(trimmed).isFile()) return null
      accessSync(trimmed, fsConstants.X_OK)
      return trimmed
    } catch {
      return null
    }
  }
  if (trimmed.includes('/') || (process.platform === 'win32' && trimmed.includes('\\'))) {
    return null
  }
  const pathEnv = (env && (env.PATH || env.Path)) || ''
  if (!pathEnv) return null
  const exts = process.platform === 'win32' && !extname(trimmed)
    ? String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : ['']
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = resolve(dir, trimmed + ext)
      try {
        if (!statSync(candidate).isFile()) continue
        accessSync(candidate, fsConstants.X_OK)
        return candidate
      } catch {
        // not a match, try next candidate
      }
    }
  }
  return null
}

export const LSP_CORE_ID = 'lsp-core'
export const LSP_TOOL_ID = 'lsp-tool'
const LSP_DEF_PKG = '@deepseek-ai/dsh-lsp'
const LSP_STDIO_PKG = '@deepseek-ai/dsh-lsp-stdio'
const LSP_TOOL_PKG = '@deepseek-ai/dsh-tool-lsp'

/** Host-side packages that LSP registration depends on (installed into the DSH installation). */
export const LSP_HOST_PACKAGES = [LSP_DEF_PKG, LSP_STDIO_PKG, LSP_TOOL_PKG]

/** DSH's Claude Code hook bridge + its wire-protocol peer, provisioned like LSP packages. */
const HOOK_BRIDGE_PKG = '@deepseek-ai/dsh-hooks-claude-code'
const HOOK_PROTOCOL_PKG = '@deepseek-ai/dsh-hook-protocol'
export const HOOK_HOST_PACKAGES = [HOOK_BRIDGE_PKG, HOOK_PROTOCOL_PKG]

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * Locate the running DSH installation's node_modules.
 *
 * A user-started `dsh web` (npx) boots the cordis loader without a
 * `bareModuleBaseUrl`, so bare package names in cordis.patch.yml resolve from
 * the loader's own location — the DSH installation's node_modules, which npm
 * puts under the npx cache (`~/.npm/_npx/<hash>/node_modules` on POSIX,
 * `%LocalAppData%\npm-cache\_npx\<hash>\node_modules` on Windows). We also
 * accept profile and global install trees so other install modes provision
 * host packages (hooks bridge, LSP) into the tree DSH actually loads from.
 */
/** Candidate base installation directories for DeepSeek Harness Desktop across platforms. */
function resolveDesktopCandidateDirs() {
  const dirs = [
    dirname(process.execPath),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness'),
    join(homedir(), 'AppData', 'Local', 'Programs', 'DeepSeek Harness'),
    '/Applications/DeepSeek Harness.app/Contents/Resources',
    '/opt/DeepSeek Harness/resources',
  ]
  if (process.platform === 'win32') {
    try {
      const regOut = String(execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'DeepSeek Harness'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }))
      const match = regOut.match(/InstallLocation\s+REG_SZ\s+(.+)/i)
      if (match && match[1]) dirs.unshift(match[1].trim())
    } catch {}
  }
  return dirs.filter(Boolean)
}

/**
 * Locate the `node_modules` root containing `@deepseek-ai/dsh-app-boot`.
 *
 * Scans in priority order:
 *   1) $DSH_HOME/profiles/node_modules (shared runtime directory)
 *   2) $DSH_HOME/profiles/<profile>/node_modules (per-profile directory)
 *   2.5) Desktop application bundle resources (Electron app)
 *   3) NODE_PATH (set by npx exec)
 *   4) npm npx cache (_npx/<hash>/node_modules)
 *   5) Global npm install (`npm root -g`)
 */
export function findDshMainNodeModules() {
  const hasLoader = (nm) => existsSync(join(nm, '@deepseek-ai', 'dsh-app-boot'))

  // 1) $DSH_HOME/profiles/node_modules — the DSH runtime tree the loader
  //    resolves from when running a profile (e.g. `dsh web`). Survives
  //    `npx` cache wipes; the npx cache is transient and must not be the
  //    primary target for host packages we want to persist across starts.
  const profilesShared = join(dshHome(), 'profiles', 'node_modules')
  if (hasLoader(profilesShared)) return profilesShared

  // 2) Per-profile node_modules ($DSH_HOME/profiles/<profile>/node_modules)
  const profilesRoot = join(dshHome(), 'profiles')
  try {
    if (existsSync(profilesRoot)) {
      for (const entry of readdirSync(profilesRoot)) {
        const nm = join(profilesRoot, entry, 'node_modules')
        if (hasLoader(nm)) return nm
      }
    }
  } catch {}

  // 2.5) Desktop application bundle resources (Electron app)
  for (const base of resolveDesktopCandidateDirs()) {
    for (const sub of [
      join(base, 'resources', 'app.asar.unpacked', 'dsh', 'node_modules'),
      join(base, 'resources', 'app.asar', 'dsh', 'node_modules'),
    ]) {
      try {
        if (existsSync(sub) && hasLoader(sub)) return sub
      } catch {}
    }
  }
  // 3) NODE_PATH (npx exec sets it to the cached install for bin scripts)
  const np = process.env.NODE_PATH
  if (np) {
    for (const p of np.split(/[;:]/).filter(Boolean)) {
      if (hasLoader(p)) return p
    }
  }
  // 4) npm npx cache scan (Windows then POSIX) — transient, last resort.
  const cacheRoots = []
  if (process.platform === 'win32') {
    cacheRoots.push(join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx'))
  } else {
    cacheRoots.push(join(homedir(), '.npm', '_npx'))
  }
  for (const cacheRoot of cacheRoots) {
    try {
      if (!existsSync(cacheRoot)) continue
      for (const hash of readdirSync(cacheRoot)) {
        const nm = join(cacheRoot, hash, 'node_modules')
        if (hasLoader(nm)) return nm
      }
    } catch {
      // keep scanning
    }
  }
  // 5) Global npm install (`npm i -g @deepseek-ai/dsh`)
  try {
    const g = globalNpmRoot()
    if (g && hasLoader(g)) return g
  } catch {}
  return null
}

/** `npm root -g` (sync; used by the install-tree discovery fallback). */
function globalNpmRoot() {
  const args = ['root', '-g']
  if (process.platform === 'win32') {
    return String(execFileSync('cmd', ['/c', NPM_BIN, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })).trim()
  }
  return String(execFileSync(NPM_BIN, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim()
}

function execFileP(bin, args, cwd) {
  // Windows: npm ships as a .cmd shim, which execFile cannot spawn directly
  // (EINVAL) — route through `cmd /c`. POSIX spawns the binary as-is.
  const useCmd = process.platform === 'win32'
  const realBin = useCmd ? 'cmd' : bin
  const realArgs = useCmd ? ['/c', bin, ...args] : args
  return new Promise((resolve, reject) => {
    execFile(realBin, realArgs, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || err.message || '').trim().split('\n').filter(Boolean).slice(-3).join(' | ')
        reject(Object.assign(new Error(tail || `${bin} ${args[0]} 失败 (${err.message})`), { code: err.code }))
        return
      }
      resolve(String(stdout))
    })
  })
}

function runNpm(args, cwd) {
  // npm may exist as `npm.cmd` (native Windows install) or as a bare script
  // (nvm / managed shims); probe the candidates when the first is missing.
  const bins = [NPM_BIN, ...(NPM_BIN === 'npm' ? [] : ['npm'])]
  const attempt = (i) => {
    if (i >= bins.length) return Promise.reject(new Error(`npm 命令不可用（尝试了 ${bins.join(', ')}）`))
    return execFileP(bins[i], args, cwd).catch((e) => {
      if (e.code === 'ENOENT') return attempt(i + 1)
      throw e
    })
  }
  return attempt(0)
}

/** Major.minor line of a semver string (e.g. "1.2.3-rc.1" -> "1.2"). */
function versionLine(v) {
  return String(v).split('-')[0].split('.').slice(0, 2).join('.')
}

/** Read the running DSH release version from its installation, or '' when unknown. */
export function findDshVersion() {
  const main = findDshMainNodeModules()
  if (main) {
    for (const anchor of ['dsh-app-boot', 'dsh-session', 'dsh']) {
      try {
        const pkg = JSON.parse(readFileSync(join(main, '@deepseek-ai', anchor, 'package.json'), 'utf8'))
        if (typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim()
      } catch {}
    }
  }
  // Desktop runtime metadata fallback (reads Electron runtime manifest)
  for (const desktopDir of resolveDesktopCandidateDirs()) {
    try {
      const runtimeJsonPath = join(desktopDir, 'resources', 'runtime', 'primary-runtime', 'runtime.json')
      if (existsSync(runtimeJsonPath)) {
        const meta = JSON.parse(readFileSync(runtimeJsonPath, 'utf8'))
        if (typeof meta.desktopVersion === 'string' && meta.desktopVersion.trim()) return meta.desktopVersion.trim()
      }
    } catch {}
  }
  return ''
}

/**
 * Highest published version of a package whose major.minor line matches the
 * running DSH release — the host bridge packages the hub provisions
 * (@deepseek-ai/dsh-hooks-claude-code, dsh-lsp-stdio, ...) are published in
 * lockstep with DSH, so the same line is the compatible one. Falls back to the
 * highest overall when the running DSH's line has no published match. This is
 * deliberately neither the `latest` dist-tag (which can lag behind — e.g. the
 * hooks bridge latest=0.0.1-rc.5 while 0.1.1-rc.2 exists) nor a hard pin (which
 * would break once the user's DSH moves to a new line).
 */
export async function matchingPublishedVersion(packageName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, { headers: { accept: 'application/json' } })
    let versions = []
    if (res.ok) {
      const data = await res.json()
      versions = Object.keys(data.versions || {})
    } else {
      const out = await runNpm(['view', packageName, 'versions', '--json'], dirname(cordisPatchPath()))
      const parsed = JSON.parse(out)
      if (Array.isArray(parsed)) versions = parsed.filter((v) => typeof v === 'string')
    }
    if (versions.length === 0) return ''
    const line = versionLine(findDshVersion())
    const pool = line ? versions.filter((v) => versionLine(v) === line) : []
    const candidates = pool.length > 0 ? pool : versions
    let best = ''
    for (const v of candidates) {
      if (semverGt(v, best)) best = v
    }
    return best
  } catch {
    return ''
  }
}

/** Compare two semver strings (prerelease-aware). */
function semverGt(a, b) {
  if (!b) return true
  const parse = (v) => {
    const [core, pre] = String(v).split('-')
    const [maj, min, pat] = core.split('.').map((n) => parseInt(n, 10) || 0)
    return { maj, min, pat, pre: pre || '' }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (const k of ['maj', 'min', 'pat']) {
    if (pa[k] !== pb[k]) return pa[k] > pb[k]
  }
  if (!pa.pre && !pb.pre) return false
  if (!pa.pre) return true
  if (!pb.pre) return false
  return pa.pre > pb.pre
}

/**
 * Provision host-side packages into the DSH installation's node_modules,
 * pinned to the newest published version. Packages already present are left
 * untouched. This mirrors what installing a forum plugin does — the plugin
 * brings its host dependencies with it, and DSH picks them up on restart.
 */
export async function installProfilePackages(packageNames) {
  const names = Array.from(new Set((packageNames || []).filter((n) => typeof n === 'string' && n.trim())))
  if (names.length === 0) return { ok: true, installed: [] }

  let main = findDshMainNodeModules()
  if (!main) {
    const activeNm = join(dshHome(), 'profiles', resolveActiveProfileName(), 'node_modules')
    const sharedNm = join(dshHome(), 'profiles', 'node_modules')
    main = existsSync(activeNm) ? activeNm : sharedNm
    try { mkdirSync(main, { recursive: true }) } catch {}
  }

  const need = []
  for (const name of names) {
    if (!existsSync(join(main, name, 'package.json'))) need.push(name)
  }
  if (need.length === 0) return { ok: true, installed: [] }

  // Install each package by downloading its tarball and extracting it into the
  // installation's node_modules. Do NOT run `npm install` against the DSH
  // installation root: npm's reify re-resolves the whole tree and prunes
  // packages that are not in the manifest, which has deleted DSH runtime
  // packages in the wild. A raw tarball extract has zero side effects.
  const installed = []
  for (const name of need) {
    try {
      // Resolve a version compatible with the running DSH release (same major.minor
      // line as the installed DSH), not the `latest` dist-tag which can lag behind.
      const ver = await matchingPublishedVersion(name)
      if (!ver) return { ok: false, error: `无法确定 ${name} 的匹配版本`, installed }
      let url = null
      try {
        const resMeta = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { headers: { accept: 'application/json' } })
        if (resMeta.ok) {
          const meta = await resMeta.json()
          url = meta.versions?.[ver]?.dist?.tarball
        }
      } catch {}
      if (!url) {
        try {
          const tarballOut = await runNpm(['view', `${name}@${ver}`, 'dist.tarball'], dirname(main))
          url = tarballOut.trim().split('\n').pop()?.trim()
        } catch {}
      }
      if (!url) return { ok: false, error: `无法获取 ${name} 的 tarball 地址`, installed }
      const res = await fetch(url)
      if (!res.ok) throw new Error(`tarball 下载失败 (HTTP ${res.status})`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const dest = join(main, name)
      mkdirSync(dirname(dest), { recursive: true })
      safeRmDir(dest)
      untarStripFirst(buffer, dest)
      // Verify the tarball actually unpacked a usable package — `untarStripFirst`
      // walks the UStar header stream and silently exits on any malformed input
      // (e.g. a 404 HTML page mistakenly returned as a gzipped stream), which
      // would leave the package directory empty and downstream gates blind.
      if (!existsSync(join(dest, 'package.json'))) {
        safeRmDir(dest)
        return { ok: false, error: `${name} 解包后缺少 package.json（tarball 可能不完整）`, installed }
      }
      installed.push(name)
    } catch (error) {
      return { ok: false, error: `${name} 安装失败: ${error.message}`, installed }
    }
  }
  return { ok: true, installed }
}

/** Minimal UStar tar extractor that strips the leading `package/` component. */
function untarStripFirst(tgz, dest) {
  const data = gunzipSync(tgz)
  let offset = 0
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0
    const type = header[156] || 0x30
    const body = data.subarray(offset + 512, offset + 512 + size)
    if ((type === 0x30 || type === 0) && name) { // regular file
      const rel = name.split('/').slice(1).join('/')
      if (rel) {
        const file = join(dest, rel)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, body)
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
}

export function getLspServerId(pluginName, serverName) {
  return `lsp-${slugify(pluginName)}-${slugify(serverName)}`
}

function getLspEntry(pluginName, serverName) {
  const patch = readCordisPatch()
  const id = getLspServerId(pluginName, serverName)
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      const found = block.insert.find((item) => item && item.id === id)
      if (found) return found
    }
  }
  return null
}

function hasLspEntryWithName(patch, pkgName) {
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      if (block.insert.some((item) => item && item.name === pkgName)) return true
    }
  }
  return false
}

function ensureInsertBlock(patch) {
  let block = patch.find((item) => item && Array.isArray(item.insert))
  if (!block) {
    block = { insert: [] }
    patch.push(block)
  }
  return block
}

/** Mount the shared LSP service definition + model tool once (idempotent). */
function ensureLspInfra(patch) {
  const block = ensureInsertBlock(patch)
  if (!hasLspEntryWithName(patch, LSP_DEF_PKG)) {
    block.insert.push({ id: LSP_CORE_ID, name: LSP_DEF_PKG })
  }
  if (!hasLspEntryWithName(patch, LSP_TOOL_PKG)) {
    block.insert.push({ id: LSP_TOOL_ID, name: LSP_TOOL_PKG })
  }
}

/** Read LSP servers declared by an installed plugin (from its manifest copy). */
export function getPluginLspServers(pluginName) {
  const target = installedDir(pluginName)
  if (!existsSync(target)) return []
  return listLspServers(target)
}

/** Register one LSP server into cordis.patch.yml (idempotent). */
export function registerLspServer(pluginName, serverName, serverConfig) {
  const patch = readCordisPatch()
  const id = getLspServerId(pluginName, serverName)
  const pluginRoot = installedDir(pluginName)
  const resolved = substitutePluginRoot(serverConfig || {}, pluginRoot)

  if (!resolved.command || typeof resolved.command !== 'string' || !resolved.command.trim()) {
    return { ok: false, active: false, error: `LSP server ${serverName} 缺少有效的 command` }
  }
  if (!resolved.extensionToLanguage || typeof resolved.extensionToLanguage !== 'object' || Object.keys(resolved.extensionToLanguage).length === 0) {
    return { ok: false, active: false, error: `LSP server ${serverName} 缺少 extensionToLanguage 映射` }
  }

  // Pre-flight: refuse to write the patch entry when the binary cannot be
  // resolved. DSH's lsp-stdio provider calls `resolveExecutable` at load
  // time and throws if the command is missing — that exception aborts the
  // entire plugin tree. Returning here keeps DSH bootable and surfaces a
  // concrete remediation hint to the caller (UI / install result).
  if (!resolveCommandPath(resolved.command)) {
    return {
      ok: false,
      active: false,
      error: `LSP server ${serverName} 注册失败：未找到可执行文件 "${resolved.command}"。` +
        `请先安装并确保其在 PATH 中（常见做法：npm install -g ${resolved.command}），` +
        `然后在管理页点击「更新」重新注册。`,
    }
  }

  ensureLspInfra(patch)

  const block = ensureInsertBlock(patch)
  block.insert = block.insert.filter((item) => item && item.id !== id)

  const serverEntry = {
    command: resolved.command,
    extensionToLanguage: resolved.extensionToLanguage,
  }
  if (Array.isArray(resolved.args) && resolved.args.length > 0) serverEntry.args = resolved.args
  if (resolved.env && typeof resolved.env === 'object' && Object.keys(resolved.env).length > 0) serverEntry.env = resolved.env
  if (resolved.initializationOptions != null) serverEntry.initializationOptions = resolved.initializationOptions
  if (resolved.configuration != null) serverEntry.configuration = resolved.configuration

  block.insert.push({
    id,
    name: LSP_STDIO_PKG,
    config: { servers: { [serverName]: serverEntry } },
  })

  writeCordisPatch(patch)
  return { ok: true, active: true }
}

/** Remove a plugin's LSP server entries; reclaim shared infra when unused. */
export function unregisterPluginLsp(pluginName) {
  const patch = readCordisPatch()
  const prefix = `lsp-${slugify(pluginName)}-`
  let changed = false
  for (const block of patch) {
    if (block && Array.isArray(block.insert)) {
      const before = block.insert.length
      block.insert = block.insert.filter((item) => !(item && item.id && item.id.startsWith(prefix)))
      if (block.insert.length !== before) changed = true
    }
  }

  if (changed) {
    const hasAnyServer = patch.some((block) => block && Array.isArray(block.insert) && block.insert.some((item) => item && item.name === LSP_STDIO_PKG))
    if (!hasAnyServer) {
      for (const block of patch) {
        if (block && Array.isArray(block.insert)) {
          block.insert = block.insert.filter((item) => !(item && (item.id === LSP_CORE_ID || item.id === LSP_TOOL_ID)))
        }
      }
    }
  }

  const cleaned = patch.filter((item) => !item || !Array.isArray(item.insert) || item.insert.length > 0)
  writeCordisPatch(cleaned)
  return { ok: true, active: false }
}

/** Register every LSP server of an installed plugin. */
export function registerPluginLsp(pluginName) {
  const servers = getPluginLspServers(pluginName)
  const results = []
  for (const s of servers) {
    results.push(registerLspServer(pluginName, s.name, s))
  }
  return results
}

/** Patch id of a plugin's Claude hooks bridge entry. */
export function getHookBridgeId(pluginName) {
  return `hooks-${slugify(pluginName)}`
}

/**
 * Register an installed plugin's Claude/Codex hooks into DSH by inserting a
 * `@deepseek-ai/dsh-hooks-claude-code` bridge entry into cordis.patch.yml. The
 * bridge runs an unmodified Claude Code hooks.json on DSH's interception points
 * (SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop /
 * SubagentStart / SubagentStop), with `${CLAUDE_PLUGIN_ROOT}` substituted from
 * `pluginRoot`. DSH's HMR re-applies the tree within ~1s, no restart needed.
 *
 * The bridge and its hook-protocol peer are pre-provisioned by the hub's
 * `apply()` on DSH startup, so a per-plugin install is a single patch write.
 */
export async function registerPluginHooks(pluginName) {
  const target = installedDir(pluginName)
  const configPath = resolveHookConfigPath(target)
  if (!configPath) return { ok: true, registered: [] }

  const patch = readCordisPatch()
  const id = getHookBridgeId(pluginName)
  const block = ensureInsertBlock(patch)
  block.insert = block.insert.filter((item) => item && item.id !== id)
  block.insert.push({
    id,
    name: HOOK_BRIDGE_PKG,
    config: {
      configPath,
      pluginRoot: target,
    },
  })
  writeCordisPatch(patch)
  return { ok: true, registered: [configPath] }
}

/** Remove a plugin's hooks bridge entry from cordis.patch.yml. */
export function unregisterPluginHooks(pluginName) {
  const patch = readCordisPatch()
  const id = getHookBridgeId(pluginName)
  for (const item of patch) {
    if (item && Array.isArray(item.insert)) {
      item.insert = item.insert.filter((entry) => entry && entry.id !== id)
    }
  }
  const cleaned = patch.filter((item) => !item || !Array.isArray(item.insert) || item.insert.length > 0)
  writeCordisPatch(cleaned)
  return { ok: true }
}

/** Active state for one LSP server of an installed plugin. */
export function isLspActive(pluginName, serverName) {
  return !!getLspEntry(pluginName, serverName)
}

/**
 * LSP servers this process has already auto-activated via `installedDetails`.
 * Once a server is auto-registered, we never auto-register it again, even if
 * it later disappears from the patch — the user manually removing the entry
 * (e.g. to disable the LSP without uninstalling the plugin) must be honored.
 */
const autoActivatedLspServers = new Set()

export function toggleConnector(pluginName, connectorName, enabled) {
  const target = installedDir(pluginName)
  const connectors = getPluginConnectors(target)
  const found = connectors.find((c) => c.name === connectorName) || { name: connectorName }

  if (enabled) {
    if (connectorRequiresAuth(found) && !isConnectorAuthenticated(pluginName, connectorName)) {
      throw new Error(`请先验证并配置 ${connectorName} 的授权访问 Token`)
    }
    return registerConnector(pluginName, connectorName, found)
  } else {
    return unregisterConnector(pluginName, connectorName)
  }
}

export async function verifyConnectorAuth(pluginName, connectorName, payload) {
  const target = installedDir(pluginName)
  const connectors = getPluginConnectors(target)
  const found = connectors.find((c) => c.name === connectorName)

  const token = typeof payload === 'string' ? payload : (payload?.token || '')
  const customHeaders = (typeof payload === 'object' && payload?.headers) ? { ...payload.headers } : {}
  const transport = (typeof payload === 'object' && payload?.transport) ? payload.transport : (found?.type || 'http')
  const url = (typeof payload === 'object' && payload?.url) || found?.url || (connectorName === 'notion' ? 'https://mcp.notion.com/mcp' : null)
  const command = (typeof payload === 'object' && payload?.command) || found?.command || null

  if (transport === 'stdio') {
    if (found && found.url && !command) {
      return {
        ok: false,
        status: 400,
        message: `${connectorName} 仅支持远程 HTTP 连接，未提供本地可执行程序`,
        server: connectorName,
        transport: 'stdio',
        endpoint: 'local stdio',
        errorDetails: 'Remote-only MCP server does not support stdio transport',
        duration: 5,
      }
    }
    if (!command) {
      return {
        ok: false,
        status: 400,
        message: '未配置有效的 stdio 启动命令 (command)',
        server: connectorName,
        transport: 'stdio',
        endpoint: 'local stdio',
        errorDetails: 'Missing executable command in connector configuration',
        duration: 5,
      }
    }
    const args = (typeof payload === 'object' && Array.isArray(payload?.args)) ? payload.args : (found?.args || [])
    return {
      ok: true,
      message: '本地 Connector (stdio) 服务已就绪',
      server: connectorName,
      transport: 'stdio',
      endpoint: `${command} ${args.join(' ')}`.trim(),
      duration: 10,
    }
  }
  if (!url) {
    return {
      ok: false,
      message: '请输入有效的服务 URL',
      server: connectorName,
      transport,
      endpoint: '',
    }
  }

  const reqHeaders = {
    'Content-Type': 'application/json',
    ...customHeaders,
  }
  if (token && token.trim()) {
    if (!reqHeaders.Authorization && !reqHeaders.authorization) {
      reqHeaders['Authorization'] = token.trim().startsWith('Bearer ') ? token.trim() : `Bearer ${token.trim()}`
    }
  }

  const startTime = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }).finally(() => clearTimeout(timer))

    const duration = Date.now() - startTime
    if (res.status === 200) {
      return {
        ok: true,
        message: '验证成功！已连接到 MCP 远程服务并激活权限。',
        server: connectorName,
        transport: transport === 'sse' ? 'sse' : 'http',
        endpoint: url,
        status: 200,
        duration,
      }
    } else {
      const body = await res.json().catch(() => ({}))
      const desc = body.error_description || body.error?.message || body.error || `HTTP 错误状态码 ${res.status}`
      const authHeader = res.headers.get('www-authenticate') || ''
      let userFriendly = `认证未通过：${desc}`
      if ((res.status === 401 || res.status === 403) && !reqHeaders.Authorization && !/[?&](api_key|apiKey|token|key)=/i.test(url)) {
        if (authHeader.includes('Bearer') || authHeader.includes('oauth') || /token|oauth|unauthorized|access token/i.test(String(desc))) {
          userFriendly = `认证未通过：缺少访问令牌 (Access Token) 或需要 OAuth 授权`
        }
      }
      return {
        ok: false,
        message: userFriendly,
        server: connectorName,
        transport: transport === 'sse' ? 'sse' : 'http',
        endpoint: url,
        status: res.status,
        errorDetails: String(desc),
        duration,
      }
    }
  } catch (e) {
    const duration = Date.now() - startTime
    if (e.name === 'AbortError') {
      return {
        ok: false,
        message: '连接超时（8 秒未响应），请检查服务 URL 与网络',
        server: connectorName,
        transport,
        endpoint: url,
        errorDetails: 'Connection timed out (8s limit)',
        duration,
      }
    }
    return {
      ok: false,
      message: `连接异常：${e.message}`,
      server: connectorName,
      transport,
      endpoint: url,
      errorDetails: e.message,
      duration,
    }
  }
}

export function saveConnectorAuth(pluginName, connectorName, payload) {
  const target = installedDir(pluginName)
  const connectors = getPluginConnectors(target)
  const found = connectors.find((c) => c.name === connectorName) || { name: connectorName }

  let token = typeof payload === 'string' ? payload : (payload?.token || '')
  let url = (typeof payload === 'object' && payload?.url) || found.url || null
  let transport = (typeof payload === 'object' && payload?.transport) || found.type || (url ? 'http' : 'stdio')
  let customHeaders = typeof payload === 'object' && payload?.headers ? { ...payload.headers } : {}
  let customEnv = typeof payload === 'object' && payload?.env ? { ...payload.env } : { ...(found.env || {}) }
  let customArgs = typeof payload === 'object' && Array.isArray(payload?.args) ? payload.args : (found.args || [])
  let oauth = typeof payload === 'object' && payload?.oauth ? payload.oauth : 'none'

  if (token && token.trim()) {
    const authVal = token.trim().startsWith('Bearer ') ? token.trim() : `Bearer ${token.trim()}`
    customHeaders['Authorization'] = authVal
  }

  const baseHeaders = { ...(found.headers || {}) }
  for (const [k, v] of Object.entries(baseHeaders)) {
    if (typeof v === 'string' && v.includes('${')) delete baseHeaders[k]
  }

  const baseEnv = { ...(found.env || {}) }
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === 'string' && v.includes('${')) delete baseEnv[k]
  }

  const isStdio = (transport === 'stdio')
  const result = registerConnector(pluginName, connectorName, {
    ...found,
    type: isStdio ? 'stdio' : (transport === 'sse' ? 'sse' : 'http'),
    url: isStdio ? null : (url || found.url || null),
    command: (typeof payload === 'object' && payload?.command) || found.command || null,
    args: customArgs,
    env: { ...baseEnv, ...customEnv },
    headers: { ...baseHeaders, ...customHeaders },
    oauth: isStdio ? 'none' : oauth,
  })
  // Re-auth (or transport switch) changes which remote the connector talks to.
  // The cached tool list was captured against the old connection, so drop it
  // here — fetchConnectorTools will repopulate on the next list call.
  const toolsKey = `${pluginName}::${connectorName}`
  if (MEMORY_TOOLS_CACHE.has(toolsKey)) {
    const mem = MEMORY_TOOLS_CACHE.get(toolsKey)
    MEMORY_TOOLS_CACHE.set(toolsKey, { ...mem, tools: [], disabledTools: mem.disabledTools || [] })
  }
  return result
}

/** MCP Tools Cache & State store */
const MCP_TOOLS_STATE_PATH = () => join(dshHome(), '.mcp-tools-state.json')

export function readMcpToolsState() {
  const file = MCP_TOOLS_STATE_PATH()
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')) || {}
  } catch {
    return {}
  }
}

export function writeMcpToolsState(state) {
  try {
    const file = MCP_TOOLS_STATE_PATH()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  } catch {}
}

export function getDisabledTools(pluginName, connectorName) {
  const state = readMcpToolsState()
  const key = `${pluginName}::${connectorName}`
  return Array.isArray(state[key]?.disabledTools) ? state[key].disabledTools : []
}

export function setToolDisabled(pluginName, connectorName, toolName, disabled) {
  const state = readMcpToolsState()
  const key = `${pluginName}::${connectorName}`
  if (!state[key]) state[key] = { disabledTools: [], cachedTools: [] }
  const list = new Set(Array.isArray(state[key].disabledTools) ? state[key].disabledTools : [])
  if (disabled) {
    list.add(toolName)
  } else {
    list.delete(toolName)
  }
  state[key].disabledTools = Array.from(list)
  writeMcpToolsState(state)

  // Immediately synchronize in-memory cache
  if (MEMORY_TOOLS_CACHE.has(key)) {
    const mem = MEMORY_TOOLS_CACHE.get(key)
    MEMORY_TOOLS_CACHE.set(key, { ...mem, disabledTools: state[key].disabledTools })
  } else {
    MEMORY_TOOLS_CACHE.set(key, { tools: state[key].cachedTools || [], disabledTools: state[key].disabledTools })
  }

  return state[key].disabledTools
}

function queryStdioToolsList(cmd, args, extraEnv = {}) {
  return new Promise((resolve) => {
    let cp
    try {
      cp = spawn(cmd, args, {
        shell: true,
        env: { ...process.env, ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      return resolve([])
    }

    let output = ''
    let resolved = false

    const cleanup = () => {
      if (!resolved) {
        resolved = true
        try {
          cp.kill()
        } catch {}
      }
    }

    cp.stdout.on('data', (d) => {
      output += d.toString()
      const lines = output.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line.trim())
          if (json.id === 1 && Array.isArray(json.result?.tools)) {
            resolved = true
            cleanup()
            return resolve(json.result.tools)
          }
        } catch {}
      }
    })

    const initReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'claude-market', version: '1.0' } }
    }) + '\n'

    const toolsReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }) + '\n'

    try {
      cp.stdin.write(initReq)
      setTimeout(() => {
        if (!resolved) {
          try {
            cp.stdin.write(toolsReq)
          } catch {}
        }
      }, 300)
    } catch {}

    setTimeout(() => {
      if (!resolved) {
        cleanup()
        resolve([])
      }
    }, 25000)
  })
}

const MEMORY_TOOLS_CACHE = new Map()

export async function fetchConnectorTools(pluginName, connectorName, forceFresh = false) {
  const key = `${pluginName}::${connectorName}`
  const state = readMcpToolsState()
  const disabledTools = Array.isArray(state[key]?.disabledTools) ? state[key].disabledTools : []

  if (!forceFresh && MEMORY_TOOLS_CACHE.has(key)) {
    const mem = MEMORY_TOOLS_CACHE.get(key)
    return { ok: true, tools: mem.tools || [], disabledTools }
  }

  const target = installedDir(pluginName)
  const connectors = existsSync(target) ? getPluginConnectors(target) : []
  const found = connectors.find((c) => c.name === connectorName)
  const entry = getConnectorEntry(pluginName, connectorName)
  const entryCfg = entry?.config || {}

  const cached = state[key]?.cachedTools || []

  // If cached tools exist, cache in memory and return immediately (0ms instant response)
  if (!forceFresh && cached.length > 0) {
    MEMORY_TOOLS_CACHE.set(key, { tools: cached, disabledTools })
    return { ok: true, tools: cached, disabledTools }
  }

  const transport = entryCfg.transport === 'stdio' ? 'stdio' : (found?.type === 'stdio' ? 'stdio' : 'http')
  const url = entryCfg.url || found?.url
  const headers = entryCfg.headers || found?.headers || {}

  // 1. HTTP / SSE fetch
  if (transport !== 'stdio' && url) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }).finally(() => clearTimeout(timer))

      if (res.status === 200) {
        const text = await res.text()
        let tools = []
        try {
          const data = JSON.parse(text)
          if (Array.isArray(data.result?.tools)) tools = data.result.tools
        } catch {
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5).trim())
                if (Array.isArray(data.result?.tools)) {
                  tools = data.result.tools
                  break
                }
              } catch {}
            }
          }
        }

        if (tools.length > 0) {
          if (!state[key]) state[key] = { disabledTools, cachedTools: [] }
          state[key].cachedTools = tools
          writeMcpToolsState(state)
          return { ok: true, tools, disabledTools }
        }
      }
    } catch {}
  }

  // 2. Stdio fetch
  if (transport === 'stdio') {
    const cmd = entryCfg.command || found?.command
    const args = entryCfg.args || found?.args || []
    if (cmd) {
      try {
        const tools = await queryStdioToolsList(cmd, args, entryCfg.env || found?.env || {})
        if (tools.length > 0) {
          if (!state[key]) state[key] = { disabledTools, cachedTools: [] }
          state[key].cachedTools = tools
          writeMcpToolsState(state)
          return { ok: true, tools, disabledTools }
        }
      } catch {}
    }
  }

  // 3. Return cached fallback
  if (cached.length > 0) {
    return { ok: true, tools: cached, disabledTools }
  }

  return { ok: true, tools: [], disabledTools }
}

export function isScanDirRegistered(path) {
  const state = readState()
  const target = (path || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
  const plugin = state.plugins.find((p) => {
    const pPath = join(installedDir(p.name), 'skills').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    return pPath === target
  })
  return plugin ? plugin.enabled !== false : existsSync(path)
}

function ensureSkillFrontmatter(content, skillName, description) {
  const desc = description || skillName
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3)
    if (end > 0) {
      const yamlStr = content.slice(3, end)
      let extra = ''
      if (!/^\s*name\s*:/m.test(yamlStr)) {
        extra += `name: ${skillName}\n`
      }
      if (!/^\s*description\s*:/m.test(yamlStr)) {
        extra += `description: ${desc}\n`
      }
      if (!/^\s*user-invocable\s*:/m.test(yamlStr)) {
        extra += `user-invocable: true\n`
      }
      if (extra) {
        return `---\n${extra}${yamlStr.trim()}\n---` + content.slice(end + 3)
      }
      return content
    }
  }
  return `---\nname: ${skillName}\ndescription: ${desc}\nuser-invocable: true\n---\n\n` + content
}

/**
 * Synchronize all skills from an installed plugin into $DSH_HOME/skills.
 * This ensures DSH Desktop's @deepseek-ai/dsh-skill-filesystem discovers them
 * natively and hot-reloads them into the composer's "/" slash command menu.
 */
export function syncPluginSkillsToDsh(pluginName) {
  const target = installedDir(pluginName)
  const pluginSkillsDir = join(target, 'skills')
  if (!existsSync(pluginSkillsDir)) return []

  const dshSkills = dshSkillsDir()
  mkdirSync(dshSkills, { recursive: true })

  const synced = []
  for (const entry of readdirSync(pluginSkillsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const srcSkillDir = join(pluginSkillsDir, entry.name)
      const srcSkillFile = join(srcSkillDir, 'SKILL.md')
      if (existsSync(srcSkillFile)) {
        const destSkillDir = join(dshSkills, entry.name)
        safeRmDir(destSkillDir)
        copyDir(srcSkillDir, destSkillDir)
        synced.push(entry.name)
      }
    }
  }
  return synced
}

/**
 * Remove a plugin's skills from $DSH_HOME/skills upon uninstall or disabling.
 */
export function removePluginSkillsFromDsh(pluginName) {
  const target = installedDir(pluginName)
  const pluginSkillsDir = join(target, 'skills')
  const dshSkills = dshSkillsDir()
  if (!existsSync(dshSkills)) return

  // 1. If installed copy exists, remove matching skill directories
  if (existsSync(pluginSkillsDir)) {
    for (const entry of readdirSync(pluginSkillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const destSkillDir = join(dshSkills, entry.name)
        safeRmDir(destSkillDir)
      }
    }
  }

  // 2. Also remove any skills prefixed with plugin name or compiled subagent hub
  const subagentHubName = `${pluginName}-agents`
  safeRmDir(join(dshSkills, subagentHubName))
}

/**
 * Sync all installed and enabled plugins into $DSH_HOME/skills.
 * Called at boot or after configuration change.
 */
export function syncAllInstalledSkillsToDsh() {
  const state = readState()
  const dshSkills = dshSkillsDir()
  mkdirSync(dshSkills, { recursive: true })

  const results = {}
  for (const plugin of state.plugins || []) {
    if (plugin.enabled !== false) {
      results[plugin.name] = syncPluginSkillsToDsh(plugin.name)
    }
  }
  return results
}

/**
 * Install a plugin from the marketplace into the installed tree.
 * Returns a result summary for the UI.
 */
export async function installPlugin({ sourceId, pluginName }) {
  const state = readState()
  const source = state.sources.find((s) => s.id === sourceId)
  if (!source) throw new Error(`unknown source: ${sourceId}`)

  const row = await findMarketRow(sourceId, pluginName)
  if (!row) throw new Error(`plugin not found in marketplace: ${pluginName}`)

  const { dir } = await materializePlugin(sourceId, pluginName, row.source)
  const target = installedDir(pluginName)

  // Idempotent reinstall: clear the previous copy first.
  safeRmDir(target)
  mkdirSync(dirname(target), { recursive: true })
  copyDir(dir, target)

  // Persist marketplace-declared LSP servers into the installed copy's
  // manifest, so installedDetails / detail views can read them back even when
  // the plugin directory itself is only a README placeholder (official LSP
  // plugins declare `lspServers` in marketplace.json, not in the plugin tree).
  if (row.lspServers && typeof row.lspServers === 'object' && !Array.isArray(row.lspServers)) {
    const manifestDir = join(target, '.claude-plugin')
    mkdirSync(manifestDir, { recursive: true })
    const manifestPath = join(manifestDir, 'plugin.json')
    let installedManifest = {}
    try {
      if (existsSync(manifestPath)) installedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      // ignore malformed existing manifest
    }
    installedManifest.lspServers = row.lspServers
    writeFileSync(manifestPath, JSON.stringify(installedManifest, null, 2), 'utf8')
  }

  // Ensure skills/ directory exists
  const skillsDir = join(target, 'skills')
  mkdirSync(skillsDir, { recursive: true })

  // 1. If the plugin uses commands/ (Claude Code slash commands), mirror them into skills/
  const commandsDir = join(target, 'commands')
  if (existsSync(commandsDir)) {
    for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const cmdName = entry.name.replace(/\.md$/, '')
        const cmdSkillDir = join(skillsDir, cmdName)
        mkdirSync(cmdSkillDir, { recursive: true })
        const rawContent = readFileSync(join(commandsDir, entry.name), 'utf8')
        const formatted = ensureSkillFrontmatter(rawContent, cmdName)
        writeFileSync(join(cmdSkillDir, 'SKILL.md'), formatted, 'utf8')
      } else if (entry.isDirectory()) {
        const subSkillDir = join(skillsDir, entry.name)
        mkdirSync(subSkillDir, { recursive: true })
        copyDir(join(commandsDir, entry.name), subSkillDir)
      }
    }
  }

  // 2. If the plugin has a root SKILL.md, mirror it into skills/<pluginName>/SKILL.md
  const rootSkillMd = join(target, 'SKILL.md')
  if (existsSync(rootSkillMd)) {
    const rootSkillDir = join(skillsDir, pluginName)
    if (!existsSync(rootSkillDir)) {
      mkdirSync(rootSkillDir, { recursive: true })
      const rawContent = readFileSync(rootSkillMd, 'utf8')
      const formatted = ensureSkillFrontmatter(rawContent, pluginName)
      writeFileSync(join(rootSkillDir, 'SKILL.md'), formatted, 'utf8')
    }
  }

  // 2.5. If the plugin repository has skill directories directly under root, mirror into skills/
  try {
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        entry.name !== 'skills' &&
        entry.name !== 'commands' &&
        entry.name !== 'agents' &&
        entry.name !== '.agents' &&
        entry.name !== 'node_modules' &&
        entry.name !== '.git'
      ) {
        const sMd = join(target, entry.name, 'SKILL.md')
        if (existsSync(sMd) && !existsSync(join(skillsDir, entry.name))) {
          const subDir = join(skillsDir, entry.name)
          mkdirSync(subDir, { recursive: true })
          copyDir(join(target, entry.name), subDir)
        }
      }
    }
  } catch {}

  // 4. Compile Claude Agents into a clean Subagents Hub Skill (task-level specialized delegates)
  const agents = listAgents(target)
  const validAgents = []
  const convertErrors = []

  for (const agent of agents) {
    const text = readAgentYaml(target, agent.file)
    const parsed = parseAgentDefinition(pluginName, agent.file, text)
    if (parsed?.error) {
      convertErrors.push(parsed.error)
    } else if (parsed) {
      validAgents.push(parsed)
      // Also generate individual skill for direct user invocation and model task-delegation
      const agentSkillDir = join(skillsDir, parsed.name)
      mkdirSync(agentSkillDir, { recursive: true })
      const agentSkillContent = ensureSkillFrontmatter(
        `# ${parsed.displayName || parsed.name}\n\n` +
        `Specialized subagent from **${pluginName}**.\n\n` +
        `${parsed.description}\n\n` +
        `## Autonomous Subagent Delegation\n` +
        `When delegating a task to this specialized agent using the \`subagent\` tool:\n\n` +
        '```markdown\n' +
        parsed.instructions + '\n' +
        '```\n',
        parsed.name,
        parsed.description
      )
      writeFileSync(join(agentSkillDir, 'SKILL.md'), agentSkillContent, 'utf8')
    }
  }

  let subagentsHub = null
  if (validAgents.length > 0) {
    subagentsHub = compileSubagentsHubSkill(pluginName, row.displayName || pluginName, validAgents, skillsDir)
  }

  // Ensure all SKILL.md in skills/ have valid frontmatter with name:
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const skillFile = join(skillsDir, entry.name, 'SKILL.md')
      if (existsSync(skillFile)) {
        const raw = readFileSync(skillFile, 'utf8')
        const fixed = ensureSkillFrontmatter(raw, entry.name)
        if (fixed !== raw) {
          writeFileSync(skillFile, fixed, 'utf8')
        }
      }
    }
  }

  // Clean any legacy preset directories left by prior versions
  cleanupLegacyPresets(pluginName)

  const skills = listSkills(target)
  const prompts = listPrompts(target)
  const connectors = listConnectors(target)
  const hooks = listHooks(target)

  // Sync skills and subagent delegates to DSH native skills directory.
  if (existsSync(skillsDir)) {
    syncPluginSkillsToDsh(pluginName)
  }

  // Auto-register and connect any MCP connectors defined in the plugin that do NOT require auth and have valid URLs/commands.
  const pluginConnectors = getPluginConnectors(target)
  for (const c of pluginConnectors) {
    if (!connectorRequiresAuth(c)) {
      const isHttp = (c.type === 'http' || c.type === 'sse' || (!c.command && (!!c.url || !c.args?.length)))
      if (isHttp && (!c.url || !c.url.trim() || !/^https?:\/\//i.test(c.url.trim()))) {
        continue
      }
      registerConnector(pluginName, c.name, c)
    }
  }

  // Auto-register LSP servers declared by the plugin. The host packages
  // (dsh-lsp / dsh-lsp-stdio / dsh-tool-lsp) were pre-provisioned by the
  // hub's `apply()` at DSH startup — this step is a single, race-free
  // patch write. `lspErrors` still surface other failures (the user-installed
  // language server binary not on PATH, missing extensionToLanguage, etc.).
  const lspServers = listLspServers(target)
  const lspErrors = []
  for (const r of registerPluginLsp(pluginName)) {
    if (!r.ok && r.error) lspErrors.push(r.error)
  }

  // Register the plugin's Claude/Codex hooks into DSH via the hooks bridge.
  // The bridge package was pre-provisioned by the hub's `apply()`; this is a
  // single patch write.
  await registerPluginHooks(pluginName)

  const record = {
    id: `${sourceId}/${pluginName}`,
    sourceId,
    name: pluginName,
    displayName: row.displayName || pluginName,
    description: row.description || '',
    author: row.author ?? null,
    enabled: true,
    installedAt: Date.now(),
    skillCount: skills.length,
    agentCount: agents.length,
    promptCount: prompts.length,
    connectorCount: connectors.length,
    hookCount: hooks.length,
    lspServerCount: lspServers.length,
    version: readInstalledVersion(target) ?? row.version ?? null,
  }
  // Same-name replace: installed files live under a name-only directory, so a
  // plugin with the same name from any source supersedes the previous record.
  state.plugins = state.plugins.filter((p) => p.name !== pluginName)
  state.plugins.push(record)
  writeState(state)
  invalidateParserCaches()

  // Proactively warm up and cache tools for local stdio/npx MCP servers in the background
  for (const c of pluginConnectors) {
    if (c.command === 'npx' || (c.args && c.args.some((a) => typeof a === 'string' && a.includes('@')))) {
      setTimeout(() => {
        fetchConnectorTools(pluginName, c.name, true).catch(() => {});
      }, 500);
    }
  }

  return {
    ok: true,
    plugin: record,
    skills: skills.map((s) => s.command),
    subagents: validAgents,
    converted: validAgents,
    subagentsHub,
    connectors: connectors.map((c) => c.name),
    lspServers: lspServers.map((s) => s.name),
    lspErrors: lspErrors.length > 0 ? lspErrors : undefined,
    convertErrors,
    droppedFields: [],
    restartRequired: false,
  }
}

function readAgentYaml(target, file) {
  const candidates = [
    join(target, 'agents', file),
    join(target, file),
    join(target, '.well-known', file),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf8')
      } catch {}
    }
  }
  return ''
}

function readInstalledVersion(target) {
  const manifest = readPluginManifest(target)
  return manifest?.version
}

/** Uninstall: remove copy, unregister scan dir, clean legacy presets and connectors. */
export function uninstallPlugin(pluginName) {
  const state = readState()
  const target = installedDir(pluginName)
  if (existsSync(target)) {
    const pluginConnectors = getPluginConnectors(target)
    for (const c of pluginConnectors) {
      unregisterConnector(pluginName, c.name)
    }
    unregisterPluginLsp(pluginName)
    unregisterPluginHooks(pluginName)
  }
  removePluginSkillsFromDsh(pluginName)
  try { safeRmDir(target) } catch {}
  
  // Clean any legacy preset directories left by prior versions
  cleanupLegacyPresets(pluginName)

  // Clean MCP tools state and memory cache for this plugin
  const mcpToolsState = readMcpToolsState()
  let mcpToolsStateChanged = false
  for (const k of Object.keys(mcpToolsState)) {
    if (k.startsWith(`${pluginName}::`)) {
      delete mcpToolsState[k]
      mcpToolsStateChanged = true
      MEMORY_TOOLS_CACHE.delete(k)
    }
  }
  if (mcpToolsStateChanged) {
    writeMcpToolsState(mcpToolsState)
  }

  state.plugins = state.plugins.filter((p) => p.name !== pluginName)
  writeState(state)
  invalidateParserCaches()
  return { ok: true }
}

/** Toggle a plugin's skills scanning and connectors on/off. */
export async function togglePlugin(pluginName, enabled) {
  const state = readState()
  const rec = state.plugins.find((p) => p.name === pluginName)
  if (!rec) throw new Error(`plugin not installed: ${pluginName}`)
  const target = installedDir(pluginName)
  const skillsDir = join(target, 'skills')
  const skills = listSkills(target)
  const skillNames = skills.map((s) => s.command || s.name || pluginName)
  const pluginConnectors = getPluginConnectors(target)
  const lspErrors = []

  if (enabled) {
    if (existsSync(skillsDir)) {
      syncPluginSkillsToDsh(pluginName)
    }
    for (const c of pluginConnectors) {
      registerConnector(pluginName, c.name, c)
    }
    for (const r of registerPluginLsp(pluginName)) {
      if (!r.ok && r.error) lspErrors.push(r.error)
    }
    await registerPluginHooks(pluginName)
  } else {
    removePluginSkillsFromDsh(pluginName)
    for (const c of pluginConnectors) {
      unregisterConnector(pluginName, c.name)
    }
    unregisterPluginLsp(pluginName)
    unregisterPluginHooks(pluginName)
  }
  rec.enabled = enabled
  writeState(state)
  return { ok: true, enabled, lspErrors: lspErrors.length > 0 ? lspErrors : undefined }
}

/**
 * Update: pull the source (for local sources) or re-clone the remote, then
 * reinstall the plugin copy and re-run conversions.
 */
export async function updatePlugin(pluginName) {
  const state = readState()
  const rec = state.plugins.find((p) => p.name === pluginName)
  if (!rec) throw new Error(`plugin not installed: ${pluginName}`)
  const source = state.sources.find((s) => s.id === rec.sourceId)
  if (source && typeof source.url === 'string') {
    const cacheDir = join(marketRoot(), 'market', rec.sourceId)
    if (existsSync(join(cacheDir, '.git'))) {
      await pullSource(rec.sourceId)
    }
  }

  // Clear memory cache so fresh MCP tool lists can be queried
  for (const k of Array.from(MEMORY_TOOLS_CACHE.keys())) {
    if (k.startsWith(`${pluginName}::`)) {
      MEMORY_TOOLS_CACHE.delete(k)
    }
  }

  // Freshly materialized install (re-copies, re-registers, re-converts).
  return installPlugin({ sourceId: rec.sourceId, pluginName })
}

/** Find one marketplace row by name. */
export async function findMarketRow(sourceId, pluginName) {
  const { readMarketplace } = await import('./parser.js')
  const rows = readMarketplace(sourceId)
  return rows.find((r) => r.name === pluginName) ?? null
}

/** Re-exported for routes: list installed plugins with details. */
export function installedDetails() {
  const state = readState()
  return state.plugins.map((rec) => {
    const target = installedDir(rec.name)
    if (existsSync(target)) {
      const skillsDir = join(target, 'skills')
      if (!existsSync(skillsDir)) {
        try { mkdirSync(skillsDir, { recursive: true }) } catch {}
      }
      try {
        for (const entry of readdirSync(target, { withFileTypes: true })) {
          if (
            entry.isDirectory() &&
            entry.name !== 'skills' &&
            entry.name !== 'commands' &&
            entry.name !== 'agents' &&
            entry.name !== '.agents' &&
            entry.name !== 'node_modules' &&
            entry.name !== '.git'
          ) {
            const sMd = join(target, entry.name, 'SKILL.md')
            if (existsSync(sMd) && !existsSync(join(skillsDir, entry.name))) {
              const subDir = join(skillsDir, entry.name)
              mkdirSync(subDir, { recursive: true })
              copyDir(join(target, entry.name), subDir)
            }
          }
        }
      } catch {}
    }
    const connectors = existsSync(target) ? getPluginConnectors(target).map((c) => {
      const needsAuth = connectorRequiresAuth(c)
      const authenticated = isConnectorAuthenticated(rec.name, c.name)
      const connected = isConnectorActive(rec.name, c.name)
      const savedEntry = getConnectorEntry(rec.name, c.name)
      const savedConfig = savedEntry?.config || {}
      const savedHeaders = (savedConfig.headers && Object.keys(savedConfig.headers).length > 0) ? savedConfig.headers : c.headers
      const savedEnv = (savedConfig.env && Object.keys(savedConfig.env).length > 0) ? savedConfig.env : c.env
      const savedUrl = savedConfig.url || c.url
      const savedArgs = (savedConfig.args && savedConfig.args.length > 0) ? savedConfig.args : c.args
      const savedTransport = savedConfig.transport ? (savedConfig.transport === 'streamable-http' ? 'http' : (savedConfig.transport === 'stdio' ? 'stdio' : c.type)) : c.type

      return {
        ...c,
        type: savedTransport,
        url: savedUrl,
        headers: savedHeaders,
        env: savedEnv,
        args: savedArgs,
        oauth: savedConfig.oauth || c.oauth || 'none',
        needsAuth,
        authenticated,
        connected,
      }
    }) : []
    let lspServers = existsSync(target) ? listLspServers(target) : []
    // Auto-activate: if an LSP server's binary is now on PATH but the entry
    // hasn't been written to cordis.patch.yml yet (e.g. the user installed the
    // binary after the plugin — registration was previously skipped because the
    // command was missing), register it on the spot. Registration is idempotent
    // and only writes the patch; it does not require a manual "Update" click.
    // DSH's HMR watches this patch file and re-applies the plugin tree within
    // ~1s, so the newly registered server becomes truly active immediately —
    // no DSH restart needed (verified against @deepseek-ai/dsh-app-boot's
    // `watchUserPatches`, which registers cordis.patch.yml with Cordis HMR).
    if (existsSync(target) && lspServers.length > 0) {
      const autoRegistered = lspServers.filter((s) => {
        if (isLspActive(rec.name, s.name)) return false
        // Honor an explicit removal: if we already auto-activated this server
        // once but it is no longer in the patch, the user (or a manual patch
        // edit) removed it deliberately — do not silently re-add it.
        if (autoActivatedLspServers.has(`${rec.name}::${s.name}`)) return false
        // Host packages must actually be in DSH's node_modules — otherwise
        // auto-registering would write a patch entry that DSH can't load.
        return !!s.command
          && resolveCommandPath(s.command)
          && Object.keys(s.extensionToLanguage || {}).length > 0
      })
      if (autoRegistered.length > 0) {
        for (const s of autoRegistered) {
          try {
            const r = registerLspServer(rec.name, s.name, s)
            if (r.ok) autoActivatedLspServers.add(`${rec.name}::${s.name}`)
          } catch {}
        }
        lspServers = listLspServers(target)
      }
    }
    lspServers = lspServers.map((s) => {
      const active = isLspActive(rec.name, s.name)
      // For inactive servers, surface *why*: a missing command is the only
      // reason registration fails that the UI can help the user resolve
      // (install the binary, then hit Update). Other reasons (missing
      // extensionToLanguage) are manifest bugs and don't need this hint.
      const missingCommand = !active && !!s.command && !resolveCommandPath(s.command)
      return { ...s, active, missingCommand }
    })
    const detail = existsSync(target) ? {
      skills: listSkills(target),
      agents: listAgents(target),
      prompts: listPrompts(target),
      connectors,
      hooks: listHooks(target),
      lspServers,
      version: readInstalledVersion(target) ?? null,
    } : { skills: [], agents: [], prompts: [], connectors: [], hooks: [], lspServers: [], version: null }
    return {
      ...rec,
      ...detail,
      skillCount: detail.skills.length,
      agentCount: detail.agents.length,
      promptCount: detail.prompts.length,
      connectorCount: connectors.length,
      hookCount: detail.hooks.length,
      lspServerCount: lspServers.length,
      dir: target,
    }
  })
}
