/**
 * webServer REST routes bridging the browser UI to the host.
 * This layer only parses requests, calls service modules, and serializes.
 * Mutations are same-origin only.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { sendJson, readJsonBody, sameOrigin } from './http.js'
import {
  readState, writeState, slugify, suggestSourceName, parseGitUrl, normalizeGitRepoUrl, findDuplicateSource, installedDir,
} from './store.js'
import { ensureSourceCloned, pullSource, safeSegment, materializePlugin } from './market.js'
import { readMarketplace, pluginDetail, pluginContentDir, invalidateMarketplaceCache } from './parser.js'
import { getOrFetchIcon, readLocalIcon } from './icons.js'
import {
  installPlugin, uninstallPlugin, togglePlugin, updatePlugin, installedDetails, isScanDirRegistered,
  toggleConnector, isConnectorActive, verifyConnectorAuth, saveConnectorAuth,
  fetchConnectorTools, setToolDisabled, isLspActive, readCordisPatch, unregisterConnector, getConnectorEntry, readMcpToolsState,
} from './install.js'
import { inspectLocalPlugin, importLocalPlugin, saveUploadedZip } from './local.js'
import { getOAuthVerification, cancelOAuthVerification, readSavedOAuthClient } from './oauth.js'
import { remoteConfigFromEntry } from './oauth-config.js'

const API_PREFIX = '/universal-plugin-hub/api'

export function mountRoutes(webServer) {
  const r = webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: (req, res) => handle(req, res, API_PREFIX),
  })
  return () => {
    try { if (typeof r === 'function') r() } catch {}
  }
}

function normalizeMcpName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|-+$/g, '') || 'mcp'
}

function userMcpConfig(name, body) {
  return {
    name,
    transport: body.transport === 'http' ? 'http' : 'stdio',
    url: body.url || null,
    command: body.command || null,
    args: Array.isArray(body.args) ? body.args : [],
    env: body.env && typeof body.env === 'object' ? body.env : {},
    headers: body.headers && typeof body.headers === 'object' ? body.headers : {},
    oauth: body.oauth || 'none',
    oauthClientId: body.oauthClientId || '',
    oauthCallbackPort: body.oauthCallbackPort || null,
    oauthScope: body.oauthScope || '',
  }
}

async function handle(req, res, prefix = API_PREFIX) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname.slice(prefix.length).replace(/\/+$/, '') || '/'
  const method = req.method ?? 'GET'

  try {
    // ── icon local cache & proxy ─────────────────────────────────────────
    if (method === 'GET' && path === '/icon') {
      const targetUrl = url.searchParams.get('u')
      if (!targetUrl) return sendJson(res, 400, { error: 'missing u parameter' })
      try {
        const { buffer, contentType } = await getOrFetchIcon(targetUrl)
        res.writeHead(200, {
          'Content-Type': contentType || 'image/png',
          'Cache-Control': 'public, max-age=604800',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
        })
        return res.end(buffer)
      } catch (err) {
        return sendJson(res, 502, { error: err.message })
      }
    }

    if (method === 'GET' && path === '/plugin-icon') {
      try {
        const sourceId = safeSegment(url.searchParams.get('sourceId'), 'source id')
        const name = safeSegment(url.searchParams.get('name'), 'plugin name')
        const record = readState().plugins.find((p) => p.name === name && p.sourceId === sourceId)
        const row = readMarketplace(sourceId).find((p) => p.name === name)
        const dir = record && existsSync(installedDir(name)) ? installedDir(name) : (row ? pluginContentDir(sourceId, name, row.source, false) : null)
        if (!dir) return sendJson(res, 404, { error: 'Plugin icon not found' })
        const { buffer, contentType } = readLocalIcon(dir, url.searchParams.get('path'))
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" })
        return res.end(buffer)
      } catch {
        return sendJson(res, 404, { error: 'Plugin icon not found' })
      }
    }

    // ── state ────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/state') {
      const state = readState()
      const details = installedDetails()
      return sendJson(res, 200, {
        sources: state.sources.map((source) => source.id === 'local' ? { ...source, pluginCount: readMarketplace('local').length } : source),
        plugins: details.map((p) => ({
          ...p,
          skillsEnabled: isScanDirRegistered(join(installedDir(p.name), 'skills')),
        })),
      })
    }

    // ── market listing / refresh ─────────────────────────────────────────
    if (method === 'GET' && path === '/market') {
      const rawSource = url.searchParams.get('sourceId') || url.searchParams.get('source') || 'anthropic'
      const sourceId = safeSegment(rawSource, 'source id')
      await ensureSourceCloned(sourceId, sourceUrlOf(sourceId))
      const rows = readMarketplace(sourceId)
      return sendJson(res, 200, { plugins: rows })
    }

    if (method === 'POST' && path === '/market/refresh') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const sourceId = safeSegment(body.sourceId || 'anthropic', 'source id')
      // Clone first if the source has never been fetched (fresh install), so a
      // first-launch refresh does not fail with "尚未克隆".
      await ensureSourceCloned(sourceId, sourceUrlOf(sourceId))
      await pullSource(sourceId)
      invalidateMarketplaceCache(sourceId)
      return sendJson(res, 200, { ok: true, plugins: readMarketplace(sourceId) })
    }

    // ── sources ──────────────────────────────────────────────────────────
    if (method === 'POST' && path === '/sources/ensure') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const rawInput = String(body.url || '').trim()
      const url = normalizeGitRepoUrl(rawInput)
      if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error('请输入有效的 Git 仓库地址或 owner/repo（例如 anthropics/claude-plugins-community）')
      }
      const parsed = parseGitUrl(url)
      const id = slugify(parsed ? `${parsed.owner}-${parsed.repo}` : url)
      if (!id) throw new Error('无法从该地址识别仓库')

      // Check duplicates BEFORE cloning
      const state = readState()
      const duplicate = findDuplicateSource(state, id, url)
      if (duplicate) {
        throw new Error(`该插件源已存在（${duplicate.name}）`)
      }
      
      // Validate by cloning into the cache
      await ensureSourceCloned(id, url)
      const rows = readMarketplace(id)
      const count = Array.isArray(rows) ? rows.length : 0

      const repoLabel = parsed ? `${parsed.owner}/${parsed.repo}` : (url.replace(/^https?:\/\//i, '').replace(/\.git$/i, ''))

      return sendJson(res, 200, {
        ok: true,
        sourceId: id,
        repoLabel,
        normalizedUrl: url,
        pluginCount: count,
        suggestedName: suggestSourceName(url),
      })
    }

    // ── local plugin inspection & import ──────────────────────────────────
    if (method === 'POST' && path === '/plugins/local/inspect') {
      requireSameOrigin(req)
      const body = await readJsonBody(req, 30_000_000)
      const target = body.data ? await saveUploadedZip(body.data, body.filename) : body.path
      const result = await inspectLocalPlugin(target)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path === '/plugins/local/import') {
      requireSameOrigin(req)
      const body = await readJsonBody(req, 30_000_000)
      const target = body.data ? await saveUploadedZip(body.data, body.filename) : body.path
      const result = await importLocalPlugin({ path: target, overwrite: body.overwrite, sourceName: body.sourceName })
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path === '/sources') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const rawInput = String(body.url || '').trim()
      const url = normalizeGitRepoUrl(rawInput)
      const name = String(body.name || '').trim()
      if (!name) throw new Error('请输入源名称')
      if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error('请输入有效的 Git 仓库地址或 owner/repo')
      }
      const parsed = parseGitUrl(url)
      const id = slugify(parsed ? `${parsed.owner}-${parsed.repo}` : url)
      if (!id) throw new Error('无法从该地址识别仓库')

      const state = readState()
      const duplicate = findDuplicateSource(state, id, url)
      if (duplicate) {
        throw new Error(`该插件源已存在（${duplicate.name}）`)
      }

      // Check name duplication (e.g. user naming two sources with the same label)
      if (state.sources.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
        throw new Error(`已存在同名的插件源「${name}」，请换一个名称`)
      }
      
      await ensureSourceCloned(id, url)
      const rows = readMarketplace(id)
      const count = Array.isArray(rows) ? rows.length : 0

      state.sources.push({ id, name, url, addedAt: Date.now() })
      writeState(state)
      return sendJson(res, 200, {
        ok: true,
        source: state.sources[state.sources.length - 1],
        pluginCount: count,
      })
    }

    if (method === 'POST' && path === '/sources/reorder') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds : []
      if (sourceIds.length === 0) throw new Error('无效的插件源列表')
      const state = readState()
      const sourceMap = new Map(state.sources.map((s) => [s.id, s]))
      const reordered = []
      for (const id of sourceIds) {
        if (sourceMap.has(id)) {
          reordered.push(sourceMap.get(id))
          sourceMap.delete(id)
        }
      }
      // append any remaining sources not in the list
      for (const s of sourceMap.values()) {
        reordered.push(s)
      }
      state.sources = reordered
      writeState(state)
      return sendJson(res, 200, { ok: true, sources: state.sources })
    }

    if (method === 'DELETE' && path.startsWith('/sources/')) {
      requireSameOrigin(req)
      const sourceId = safeSegment(path.slice('/sources/'.length), 'source id')
      const state = readState()
      const source = state.sources.find((s) => s.id === sourceId)
      if (!source) throw new Error('插件源不存在')
      if (source.builtin) throw new Error('内置源不可删除')
      const used = state.plugins.some((p) => p.sourceId === sourceId)
      if (used) throw new Error('该源下仍有已安装插件，请先卸载')
      state.sources = state.sources.filter((s) => s.id !== sourceId)
      writeState(state)
      invalidateMarketplaceCache(sourceId)
      return sendJson(res, 200, { ok: true })
    }

    // ── user-added MCP servers (standalone, not tied to an installed plugin) ──
    if (method === 'GET' && path === '/mcps') {
      const state = readState()
      if (!Array.isArray(state.userMcps)) state.userMcps = []
      const patch = readCordisPatch()
      const enabledIds = new Set()
      for (const block of patch) {
        if (!block || !Array.isArray(block.insert)) continue
        for (const item of block.insert) {
          if (item && typeof item.id === 'string') enabledIds.add(item.id)
        }
      }
      // Migrate legacy patch-only entries (saved before userMcps state existed)
      let changed = false
      for (const block of patch) {
        if (!block || !Array.isArray(block.insert)) continue
        for (const item of block.insert) {
          if (!item || typeof item.id !== 'string' || !item.id.startsWith('mcp-user-mcp-')) continue
          const cfg = item.config || {}
          if (cfg.serverName && !state.userMcps.some((x) => x && x.name === cfg.serverName)) {
            state.userMcps.push(userMcpConfig(cfg.serverName, {
              transport: cfg.transport, url: cfg.url, command: cfg.command,
              args: Array.isArray(cfg.args) ? cfg.args : [], env: cfg.env || {},
              headers: cfg.headers || {}, oauth: cfg.oauth || 'none',
            }))
            changed = true
          }
        }
      }
      if (changed) writeState(state)
      const mcps = state.userMcps
        .filter((x) => x && x.name)
        .map((x) => {
          const entry = getConnectorEntry('user-mcp', x.name)
          const remote = remoteConfigFromEntry(entry?.config) || readMcpToolsState()[`user-mcp::${x.name}`]?.savedOAuthRemoteConfig
          const client = remote?.oauth === 'custom' ? readSavedOAuthClient('user-mcp', x.name, remote.url, remote.oauth) : null
          return {
            ...x,
            ...(remote ? {
              transport: 'http', url: remote.url, headers: remote.headers,
              oauth: remote.oauth, oauthClientId: client?.clientId || remote.oauthClientId,
              oauthHasClientSecret: client?.hasClientSecret || false,
              oauthCallbackPort: remote.oauthCallbackPort || null, oauthScope: remote.oauthScope || '',
            } : {}),
            enabled: enabledIds.has('mcp-user-mcp-' + x.name),
          }
        })
      return sendJson(res, 200, { ok: true, mcps })
    }
    if (path === '/mcps/oauth-status') {
      requireSameOrigin(req)
      if (method !== 'GET' && method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      const sessionId = String(method === 'GET' ? url.searchParams.get('sessionId') : (await readJsonBody(req)).sessionId || '')
      const result = getOAuthVerification(sessionId, { pluginName: 'user-mcp' })
      if (method === 'POST') return sendJson(res, 200, { ok: true, cancelled: result.found ? cancelOAuthVerification(sessionId, '已取消授权', { pluginName: 'user-mcp' }) : false })
      return sendJson(res, 200, result)
    }
    if (method === 'POST' && path === '/mcps/verify') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const name = String(body.name || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|-+$/g, '') || 'mcp'
      const result = await verifyConnectorAuth('user-mcp', name, body)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path === '/mcps') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const name = safeSegment(normalizeMcpName(body.name), 'MCP 名称')
      const result = saveConnectorAuth('user-mcp', name, body)
      if (result && result.ok) {
        const state = readState()
        if (!Array.isArray(state.userMcps)) state.userMcps = []
        state.userMcps = state.userMcps.filter((x) => x && x.name !== name)
        state.userMcps.push(userMcpConfig(name, body))
        writeState(state)
      }
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path === '/mcps/update') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const name = safeSegment(normalizeMcpName(body.name), 'MCP 名称')
      const state = readState()
      if (!Array.isArray(state.userMcps)) state.userMcps = []
      const idx = state.userMcps.findIndex((x) => x && x.name === name)
      if (idx < 0) throw new Error(`MCP 不存在：${name}`)
      const wasEnabled = !!getConnectorEntry('user-mcp', name)
      let result = { ok: true }
      if (wasEnabled) {
        result = saveConnectorAuth('user-mcp', name, body)
        if (!result || !result.ok) return sendJson(res, 200, result)
      }
      state.userMcps[idx] = userMcpConfig(name, body)
      writeState(state)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path === '/mcps/toggle') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const name = safeSegment(normalizeMcpName(body.name), 'MCP 名称')
      const state = readState()
      const cfg = (state.userMcps || []).find((x) => x && x.name === name)
      if (!cfg) throw new Error(`MCP 不存在：${name}`)
      if (body.enabled !== false) {
        const result = saveConnectorAuth('user-mcp', name, cfg)
        return sendJson(res, 200, result)
      }
      unregisterConnector('user-mcp', name)
      return sendJson(res, 200, { ok: true })
    }

    // ── user MCP tool list / per-tool toggle (same shape as plugin connectors) ──
    if (method === 'GET' && path.startsWith('/mcps/') && path.endsWith('/tools')) {
      const name = safeSegment(normalizeMcpName(path.slice('/mcps/'.length, -'/tools'.length)), 'MCP 名称')
      const result = await fetchConnectorTools('user-mcp', name)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path.startsWith('/mcps/') && path.endsWith('/tools/toggle')) {
      requireSameOrigin(req)
      const name = safeSegment(normalizeMcpName(path.slice('/mcps/'.length, -'/tools/toggle'.length)), 'MCP 名称')
      const body = await readJsonBody(req)
      const toolName = String(body.toolName || body.tool || '')
      const enabled = body.enabled !== false
      const disabledTools = setToolDisabled('user-mcp', name, toolName, !enabled)
      return sendJson(res, 200, { ok: true, disabledTools })
    }

    // ── connector routes (must precede catch-all /plugins/ routes) ────────
    if ((method === 'GET' || method === 'POST') && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/oauth-status')) {
      requireSameOrigin(req)
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const sessionId = String(method === 'GET' ? url.searchParams.get('sessionId') : (await readJsonBody(req)).sessionId || '')
      const result = getOAuthVerification(sessionId, { pluginName, connectorName })
      if (method === 'POST') return sendJson(res, 200, { ok: true, cancelled: result.found ? cancelOAuthVerification(sessionId, '已取消授权', { pluginName, connectorName }) : false })
      return sendJson(res, 200, result)
    }

    if (method === 'GET' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/tools')) {
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const result = await fetchConnectorTools(pluginName, connectorName, url.searchParams.get('fresh') === '1')
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/tools/toggle')) {
      requireSameOrigin(req)
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const body = await readJsonBody(req)
      const toolName = String(body.toolName || body.tool || '')
      const enabled = body.enabled !== false
      const disabledTools = setToolDisabled(pluginName, connectorName, toolName, !enabled)
      return sendJson(res, 200, { ok: true, disabledTools })
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/toggle')) {
      requireSameOrigin(req)
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const body = await readJsonBody(req)
      const result = toggleConnector(pluginName, connectorName, body.enabled !== false)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/verify')) {
      requireSameOrigin(req)
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const body = await readJsonBody(req)
      const result = await verifyConnectorAuth(pluginName, connectorName, body)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/auth')) {
      requireSameOrigin(req)
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const body = await readJsonBody(req)
      const result = saveConnectorAuth(pluginName, connectorName, body)
      return sendJson(res, 200, result)
    }

    // ── plugin detail ────────────────────────────────────────────────────
    if (method === 'GET' && path.startsWith('/plugins/') && !path.includes('/connectors/')) {
      const rest = path.slice('/plugins/'.length)
      const slash = rest.indexOf('/')
      const rawSource = slash < 0 ? 'anthropic' : rest.slice(0, slash) || 'anthropic'
      const rawPlugin = slash < 0 ? rest : rest.slice(slash + 1)
      const sourceId = safeSegment(rawSource, 'source id')
      const pluginName = safeSegment(rawPlugin, 'plugin name')
      const rows = readMarketplace(sourceId)
      let row = rows.find((r) => r.name === pluginName)
      let detail = pluginDetail(sourceId, pluginName, row ? row.source : undefined, row)
      // An external plugin may not have been installed or previewed before.
      // Fetch its content for the preview, then enrich the sparse marketplace row.
      if (!detail && row?.source && typeof row.source === 'object') {
        await materializePlugin(sourceId, pluginName, row.source)
        invalidateMarketplaceCache(sourceId)
        row = readMarketplace(sourceId).find((r) => r.name === pluginName) || row
        detail = pluginDetail(sourceId, pluginName, row.source, row)
      }
      if (!detail) {
        const inst = installedDetails().find((p) => p.name === pluginName)
        if (inst) {
          detail = inst
          if (!row) row = inst
        }
      }
      if (detail && Array.isArray(detail.connectors)) {
        detail.connectors = detail.connectors.map((c) => ({
          ...c,
          connected: isConnectorActive(pluginName, c.name),
        }))
      }
      if (detail && Array.isArray(detail.lspServers)) {
        detail.lspServers = detail.lspServers.map((s) => ({
          ...s,
          active: isLspActive(pluginName, s.name),
        }))
      }
      return sendJson(res, 200, {
        plugin: {
          ...(row || { name: pluginName, displayName: pluginName, sourceId }),
          detail,
        },
      })
    }

    // ── install / toggle / update / uninstall ────────────────────────────
    if (method === 'POST' && path === '/plugins/install') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const sourceId = safeSegment(body.sourceId || '', 'source id')
      const pluginName = safeSegment(body.pluginName || '', 'plugin name')
      const result = await installPlugin({
        sourceId,
        pluginName,
      })
      invalidateMarketplaceCache(sourceId)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.endsWith('/toggle')) {
      requireSameOrigin(req)
      const pluginName = safeSegment(path.slice('/plugins/'.length, -'/toggle'.length), 'plugin name')
      const body = await readJsonBody(req)
      return sendJson(res, 200, await togglePlugin(pluginName, body.enabled === true))
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.endsWith('/update')) {
      requireSameOrigin(req)
      const pluginName = safeSegment(path.slice('/plugins/'.length, -'/update'.length), 'plugin name')
      const result = await updatePlugin(pluginName)
      invalidateMarketplaceCache()
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path === '/restart') {
      requireSameOrigin(req)
      try {
        let restartFn = null
        try {
          const dshSkillsRestart = await import('dsh-agent-skills/lib/restart.js')
          if (dshSkillsRestart && typeof dshSkillsRestart.scheduleDshRestart === 'function') {
            restartFn = dshSkillsRestart.scheduleDshRestart
          }
        } catch {}

        if (restartFn) {
          const result = restartFn()
          return sendJson(res, 202, { ok: true, ...(result || {}) })
        }

        // Direct spawn fallback
        const { spawn } = await import('node:child_process')
        const nodeExe = process.argv0 || process.execPath
        const entry = process.argv[1]
        const args = process.argv.slice(2)
        const helper = spawn(nodeExe, [entry, ...args], {
          detached: true,
          stdio: 'ignore',
          env: process.env,
          cwd: process.cwd(),
        })
        helper.unref()
        setTimeout(() => process.exit(0), 500)
        return sendJson(res, 202, { ok: true })
      } catch (e) {
        return sendJson(res, 500, { error: e.message })
      }
    }

    if (method === 'DELETE' && path.startsWith('/plugins/')) {
      requireSameOrigin(req)
      const pluginName = safeSegment(path.slice('/plugins/'.length), 'plugin name')
      const result = uninstallPlugin(pluginName)
      invalidateMarketplaceCache()
      return sendJson(res, 200, result)
    }

    return sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    const status = (error && typeof error === 'object' && error.status) ? error.status : 500
    sendJson(res, status, { error: error instanceof Error ? error.message : String(error) })
  }
}

function requireSameOrigin(req) {
  if (!sameOrigin(req)) {
    const error = new Error('cross-origin request rejected')
    error.status = 403
    throw error
  }
}

function sourceUrlOf(sourceId) {
  const state = readState()
  const source = state.sources.find((s) => s.id === sourceId)
  if (!source) throw new Error(`unknown source: ${sourceId}`)
  return source.url
}

/** True when a plugin's skills dir is currently registered (used by UI). */
export function pluginScanState(pluginName) {
  return isScanDirRegistered(join(installedDir(pluginName), 'skills'))
}
