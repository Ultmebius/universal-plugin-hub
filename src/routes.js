/**
 * webServer REST routes bridging the browser UI to the host.
 * This layer only parses requests, calls service modules, and serializes.
 * Mutations are same-origin only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { sendJson, readJsonBody, sameOrigin } from './http.js'
import {
  readState, writeState, slugify, suggestSourceName, parseGitUrl, normalizeGitRepoUrl, findDuplicateSource, installedDir, marketRoot,
} from './store.js'
import { ensureSourceCloned, pullSource, safeSegment } from './market.js'
import { readMarketplace, pluginDetail, invalidateMarketplaceCache } from './parser.js'
import {
  installPlugin, uninstallPlugin, togglePlugin, updatePlugin, installedDetails, isScanDirRegistered,
  toggleConnector, isConnectorActive, verifyConnectorAuth, saveConnectorAuth,
  fetchConnectorTools, setToolDisabled, isLspActive,
} from './install.js'

const API_PREFIX = '/universal-plugin-hub/api'

function iconCacheDir() {
  const dir = join(marketRoot(), 'icons')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function hashUrl(url) {
  return createHash('md5').update(String(url)).digest('hex')
}

const ICON_MEMORY_CACHE = new Map()
const MAX_ICON_MEMORY_ENTRIES = 200

function detectContentType(buffer, fallback) {
  if (!buffer || buffer.length < 4) return fallback || 'image/png'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp'
  const head = buffer.slice(0, 100).toString('utf8').trim()
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml'
  return fallback || 'image/png'
}

async function getOrFetchIcon(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('Invalid icon URL')
  }

  const memCached = ICON_MEMORY_CACHE.get(url)
  if (memCached) {
    return memCached
  }

  const filename = `icon_${hashUrl(url)}.bin`
  const filepath = join(iconCacheDir(), filename)

  if (existsSync(filepath)) {
    try {
      const buffer = readFileSync(filepath)
      if (buffer && buffer.length > 0) {
        const item = { buffer, contentType: detectContentType(buffer, 'image/png') }
        if (ICON_MEMORY_CACHE.size >= MAX_ICON_MEMORY_ENTRIES) {
          const firstKey = ICON_MEMORY_CACHE.keys().next().value
          ICON_MEMORY_CACHE.delete(firstKey)
        }
        ICON_MEMORY_CACHE.set(url, item)
        return item
      }
    } catch {
      // re-fetch on read error
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch icon: ${res.status} ${res.statusText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = detectContentType(buffer, res.headers.get('content-type') || 'image/png')

    try {
      writeFileSync(filepath, buffer)
    } catch (e) {
      console.warn('[universal-plugin-hub] Failed to save icon cache to disk:', e.message)
    }

    const item = { buffer, contentType }
    if (ICON_MEMORY_CACHE.size >= MAX_ICON_MEMORY_ENTRIES) {
      const firstKey = ICON_MEMORY_CACHE.keys().next().value
      ICON_MEMORY_CACHE.delete(firstKey)
    }
    ICON_MEMORY_CACHE.set(url, item)

    return item
  } finally {
    clearTimeout(timeout)
  }
}

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
          'Cache-Control': 'public, max-age=31536000, immutable',
        })
        return res.end(buffer)
      } catch (err) {
        return sendJson(res, 502, { error: err.message })
      }
    }

    // ── state ────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/state') {
      const state = readState()
      const details = installedDetails()
      return sendJson(res, 200, {
        sources: state.sources,
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

    // ── connector routes (must precede catch-all /plugins/ routes) ────────
    if (method === 'GET' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/tools')) {
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const result = await fetchConnectorTools(pluginName, connectorName)
      return sendJson(res, 200, result)
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
