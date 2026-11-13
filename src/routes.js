/**
 * webServer REST routes bridging the browser UI to the host.
 * This layer only parses requests, calls service modules, and serializes.
 * Mutations are same-origin only.
 */
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { sendJson, readJsonBody, sameOrigin } from './http.js'
import {
  readState, writeState, slugify, suggestSourceName, parseGitUrl, normalizeGitRepoUrl, findDuplicateSource, installedDir, sourceCacheDir, safeRmDir,
} from './store.js'
import { ensureSourceCloned, pullSource, safeSegment, materializePlugin } from './market.js'
import { readMarketplace, pluginDetail, invalidateMarketplaceCache, resolveMarketplacePluginDir } from './parser.js'
import { getOrFetchIcon, readLocalIconCached, invalidateLocalIconCache } from './icons.js'
import {
  installPlugin, uninstallPlugin, togglePlugin, updatePlugin, installedDetails, isScanDirRegistered, toolCallIconGroups,
  toggleConnector, isConnectorActive, isOAuthConnectorAuthenticated, verifyConnectorAuth, saveConnectorAuth, enableConnector, probeConnectorAuth, probeUserMcpUpdate,
  fetchConnectorTools, setToolDisabled, isLspActive, readCordisPatch, unregisterConnector, removeUserMcp, renameUserMcp, getConnectorEntry, getConnectorId, readMcpToolsState, userMcpConfig,
  withPluginLock, withSourceLock, removeManagedDirAsync, cancelActivePluginProbes,
} from './install.js'
import { inspectLocalPlugin, importLocalPlugin, importLocalSkills, importLocalMarketplace, saveUploadedZip, saveUploadedStream, MAX_UPLOAD_BYTES } from './local.js'
import { uninstallUploadedSkill, uploadedSkillRecord } from './skill-uploads.js'
import { getOAuthVerification, cancelOAuthVerification, readSavedOAuthClient } from './oauth.js'
import { remoteConfigFromEntry } from './oauth-config.js'
import { scheduledResult } from './runtime.js'

function scheduledIfOk(result, applyProfile, ids) {
  if (!result || result.ok === false) return result
  return scheduledResult(result, applyProfile, ids)
}

const API_PREFIX = '/universal-plugin-hub/api'
const STAGED_UPLOADS = new Map()
const STAGED_UPLOAD_TTL = 3_600_000
const STAGED_UPLOAD_LIMIT = 8

function sweepStagedUploads() {
  const cutoff = Date.now() - STAGED_UPLOAD_TTL
  for (const [id, entry] of STAGED_UPLOADS) {
    if (entry.createdAt < cutoff) {
      STAGED_UPLOADS.delete(id)
      safeRmDir(entry.uploadDir)
    }
  }
}

function registerStagedUpload(file, uploadDir) {
  sweepStagedUploads()
  while (STAGED_UPLOADS.size >= STAGED_UPLOAD_LIMIT) {
    const oldestKey = STAGED_UPLOADS.keys().next().value
    const oldest = STAGED_UPLOADS.get(oldestKey)
    STAGED_UPLOADS.delete(oldestKey)
    if (oldest?.uploadDir) safeRmDir(oldest.uploadDir)
  }
  const id = randomUUID()
  STAGED_UPLOADS.set(id, { file, uploadDir, createdAt: Date.now() })
  return id
}

function discardStagedUpload(id) {
  const key = String(id || '').trim()
  if (!key) return false
  const entry = STAGED_UPLOADS.get(key)
  if (!entry) return false
  STAGED_UPLOADS.delete(key)
  safeRmDir(entry.uploadDir)
  return true
}

function cleanupAllStagedUploads() {
  for (const [, entry] of STAGED_UPLOADS) {
    if (entry?.uploadDir) safeRmDir(entry.uploadDir)
  }
  STAGED_UPLOADS.clear()
}

function disableUploadTimeouts(req, res) {
  try { req?.setTimeout?.(0) } catch {}
  try { req?.socket?.setTimeout?.(0) } catch {}
  try { res?.setTimeout?.(0) } catch {}
}

async function resolveLocalImportTarget(body) {
  if (body?.uploadId) {
    sweepStagedUploads()
    const id = String(body.uploadId)
    const entry = STAGED_UPLOADS.get(id)
    if (!entry || !existsSync(entry.file)) {
      const error = new Error('上传缓存已过期，请重新选择文件上传')
      error.status = 410
      throw error
    }
    return { target: entry.file, stagedId: id, tempUploadDir: null }
  }
  if (body?.data) {
    const target = await saveUploadedZip(body.data, body.filename)
    return { target, stagedId: null, tempUploadDir: dirname(target) }
  }
  return { target: body?.path, stagedId: null, tempUploadDir: null }
}

export function mountRoutes(webServer, skills = null, applyProfile = null) {
  const r = webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: (req, res) => handle(req, res, API_PREFIX, skills, applyProfile),
  })
  return () => {
    cleanupAllStagedUploads()
    try { if (typeof r === 'function') r() } catch {}
  }
}

function normalizeMcpName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|-+$/g, '') || 'mcp'
}

const ICON_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"

function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false
  const raw = Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : String(ifNoneMatch)
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (trimmed === '*') return true
  const bare = (tag) => (tag.startsWith('W/') ? tag.slice(2) : tag)
  const target = bare(etag.trim())
  const tokens = trimmed.match(/(?:W\/)?"(?:\\.|[^"])*"|\*/g)
  if (!tokens) return false
  return tokens.some((token) => token === '*' || bare(token) === target)
}

function sendIconResponse(req, res, { buffer, contentType, etag, cacheControl }) {
  const baseHeaders = {
    'Cache-Control': cacheControl,
    ...(etag ? { 'ETag': etag } : {}),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': ICON_CSP,
  }
  if (etag && etagMatches(req.headers?.['if-none-match'], etag)) {
    res.writeHead(304, baseHeaders)
    return res.end()
  }
  res.writeHead(200, {
    'Content-Type': contentType || 'image/png',
    ...baseHeaders,
  })
  return res.end(buffer)
}

/**
 * Resolve one plugin's directory in O(1) without calling readMarketplace()
 * across every sibling plugin and icon in the marketplace.
 */
function resolvePluginIconDir(sourceId, name) {
  const cleanName = name.toLowerCase()
  const record = readState().plugins.find((p) => p.name.toLowerCase() === cleanName && p.sourceId === sourceId)
  if (record) {
    const inst = installedDir(record.name)
    if (existsSync(inst)) return inst
  }
  return resolveMarketplacePluginDir(sourceId, name)
}


async function handle(req, res, prefix = API_PREFIX, skills = null, applyProfile = null) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname.slice(prefix.length).replace(/\/+$/, '') || '/'
  const method = req.method ?? 'GET'

  try {
    // ── icon local cache & proxy ─────────────────────────────────────────
    if (method === 'GET' && path === '/icon') {
      const targetUrl = url.searchParams.get('u')
      if (!targetUrl) return sendJson(res, 400, { error: 'missing u parameter' })
      try {
        const { buffer, contentType, etag, immutable } = await getOrFetchIcon(targetUrl)
        return sendIconResponse(req, res, {
          buffer,
          contentType,
          etag,
          cacheControl: immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=604800',
        })
      } catch (err) {
        return sendJson(res, 502, { error: err.message })
      }
    }

    if (method === 'GET' && path === '/plugin-icon') {
      try {
        const sourceId = safeSegment(url.searchParams.get('sourceId'), 'source id')
        const name = safeSegment(url.searchParams.get('name'), 'plugin name')
        const relPath = url.searchParams.get('path')
        const dir = resolvePluginIconDir(sourceId, name)
        if (!dir) return sendJson(res, 404, { error: 'Plugin icon not found' })
        const { buffer, contentType, etag, fileVersion } = await readLocalIconCached(dir, relPath, [sourceId, name, relPath])
        const requestedVersion = url.searchParams.get('v')
        const cacheControl = requestedVersion
          ? (requestedVersion === fileVersion ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate')
          : 'public, max-age=604800'
        return sendIconResponse(req, res, { buffer, contentType, etag, cacheControl })
      } catch {
        return sendJson(res, 404, { error: 'Plugin icon not found' })
      }
    }

    // ── state ────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/tool-call-icons') {
      return sendJson(res, 200, { groups: toolCallIconGroups() })
    }

    if (method === 'GET' && path === '/state') {
      const state = readState()
      const details = installedDetails()
      let sources = state.sources.map((source) => source.id === 'local' ? { ...source, pluginCount: new Set([...readMarketplace('local').map(p => p.name), ...details.filter(p => p.sourceId === 'local' && existsSync(installedDir(p.name))).map(p => p.name)]).size } : source)
      if (skills && skills.entries().length) {
        const skillSource = { id: 'skills-local', name: 'Skills', virtual: true }
        const ordered = Array.isArray(state.tabOrder) ? state.tabOrder : []
        if (ordered.includes(skillSource.id)) {
          const order = new Map(ordered.map((id, index) => [id, index]))
          sources = [...sources, skillSource].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
        } else {
          const anthropic = sources.findIndex(s => s.id === 'anthropic')
          sources.splice(anthropic < 0 ? 0 : anthropic + 1, 0, skillSource)
        }
      }
      return sendJson(res, 200, {
        sources,
        plugins: details.map((p) => ({
          ...p,
          skillsEnabled: isScanDirRegistered(join(installedDir(p.name), 'skills')),
        })),
      })
    }

    // The runtime outcome of the last saved change. It is intentionally a
    // separate read: applying a change can restart this plugin, so the write
    // answers immediately and the result arrives here.
    if (method === 'GET' && path === '/apply-status') {
      const token = Number(url.searchParams.get('token'))
      return sendJson(res, 200, {
        ok: true,
        ...(typeof applyProfile?.status === 'function'
          ? applyProfile.status(Number.isFinite(token) ? token : undefined)
          : { application: 'unknown' }),
      })
    }

    if (path === '/skills' && method === 'GET' && skills) return sendJson(res, 200, { skills: await skills.list() })
    if (path === '/skills/refresh' && method === 'POST' && skills) {
      requireSameOrigin(req); skills.refresh()
      return sendJson(res, 200, { skills: await skills.list() })
    }
    if (path === '/skills/toggle' && method === 'POST' && skills) {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      if (typeof body.enabled !== 'boolean') throw new Error('无效的开关状态')
      return sendJson(res, 200, await skills.toggle(body.id, body.enabled))
    }
    if (path === '/skills/detail' && method === 'GET' && skills) {
      const skill = skills.detail(url.searchParams.get('id'), false)
      return sendJson(res, 200, { skill: { ...skill, uploaded: !!uploadedSkillRecord(skill.name) } })
    }
    if (path === '/skills/uninstall' && method === 'POST' && skills) {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const name = String(body.name || '')
      if (!uploadedSkillRecord(name)) throw new Error('只能卸载通过本插件上传的 Skill')
      uninstallUploadedSkill(name)
      skills.refresh()
      return sendJson(res, 200, { ok: true, skills: await skills.list() })
    }
    if (path === '/skills/resource' && method === 'GET' && skills) return sendJson(res, 200, { content: skills.resource(url.searchParams.get('id'), url.searchParams.get('path')) })
    if (path === '/skills/icon' && method === 'GET' && skills) {
      try {
        const item = skills.detail(url.searchParams.get('id'), false)
        const { buffer, contentType, etag } = await readLocalIconCached(item.directory, item.iconPath, ['skill', item.id, item.iconPath])
        return sendIconResponse(req, res, { buffer, contentType, etag, cacheControl: 'public, max-age=3600' })
      } catch { return sendJson(res, 404, { error: 'Icon not found' }) }
    }

    // ── market listing / refresh ─────────────────────────────────────────
    if (method === 'GET' && path === '/market') {
      const rawSource = url.searchParams.get('sourceId') || url.searchParams.get('source') || 'anthropic'
      const sourceId = safeSegment(rawSource, 'source id')
      await ensureSourceCloned(sourceId, sourceUrlOf(sourceId))
      let rows = readMarketplace(sourceId)
      if (sourceId === 'local') {
        const names = new Set(rows.map(r => r.name))
        rows = [...rows, ...installedDetails().filter(p => p.sourceId === 'local' && existsSync(installedDir(p.name)) && !names.has(p.name)).map(p => ({ ...p, sourceMissing: true }))]
      }
      return sendJson(res, 200, { plugins: rows })
    }

    if (method === 'POST' && path === '/market/refresh') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const sourceId = safeSegment(body.sourceId || 'anthropic', 'source id')
      const plugins = await withSourceLock(sourceId, async () => {
        // Clone first if the source has never been fetched (fresh install), so a
        // first-launch refresh does not fail with "尚未克隆".
        await ensureSourceCloned(sourceId, sourceUrlOf(sourceId))
        await pullSource(sourceId)
        invalidateMarketplaceCache(sourceId)
        invalidateLocalIconCache(sourceId)
        let rows = readMarketplace(sourceId)
        if (sourceId === 'local') {
          const names = new Set(rows.map(r => r.name))
          rows = [...rows, ...installedDetails().filter(p => p.sourceId === 'local' && existsSync(installedDir(p.name)) && !names.has(p.name)).map(p => ({ ...p, sourceMissing: true }))]
        }
        return rows
      })
      return sendJson(res, 200, { ok: true, plugins })
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

      const count = await withSourceLock(id, async () => {
        // Check duplicates BEFORE cloning
        const state = readState()
        const duplicate = findDuplicateSource(state, id, url)
        if (duplicate) {
          throw new Error(`该插件源已存在（${duplicate.name}）`)
        }
        // Validate by cloning into the cache
        await ensureSourceCloned(id, url)
        const rows = readMarketplace(id)
        return Array.isArray(rows) ? rows.length : 0
      })

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
      disableUploadTimeouts(req, res)
      const contentType = String(req.headers?.['content-type'] || '').toLowerCase()
      let target = ''
      let stagedUpload = null
      if (contentType.includes('application/octet-stream')) {
        const rawHeaderName = String(req.headers?.['x-upload-filename'] || '')
        let filename = url.searchParams.get('filename') || ''
        if (rawHeaderName) {
          try { filename = decodeURIComponent(rawHeaderName) } catch { filename = rawHeaderName }
        }
        stagedUpload = await saveUploadedStream(req, filename, MAX_UPLOAD_BYTES)
        target = stagedUpload.file
      } else {
        const body = await readJsonBody(req, 30_000_000)
        if (body.data) {
          const file = await saveUploadedZip(body.data, body.filename)
          stagedUpload = { file, uploadDir: dirname(file) }
          target = file
        } else {
          target = body.path
        }
      }
      let result
      try {
        result = await inspectLocalPlugin(target)
      } catch (err) {
        if (stagedUpload) safeRmDir(stagedUpload.uploadDir)
        throw err
      }
      // The extraction is only for this preview: clean up the temp extract dir,
      // while staging valid streamed uploads behind an opaque token so confirm does not re-upload.
      if (result.tempExtractDir) safeRmDir(result.tempExtractDir)
      if (!result.ok && stagedUpload) {
        safeRmDir(stagedUpload.uploadDir)
      }
      const uploadId = (result.ok && stagedUpload) ? registerStagedUpload(stagedUpload.file, stagedUpload.uploadDir) : undefined
      const { tempExtractDir, effectiveDir, entries, ...preview } = result
      return sendJson(res, 200, uploadId ? { ...preview, uploadId } : preview)
    }

    if (method === 'POST' && path === '/plugins/local/upload-cancel') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      discardStagedUpload(body?.uploadId)
      return sendJson(res, 200, { ok: true })
    }

    if (method === 'POST' && path === '/plugins/local/import') {
      requireSameOrigin(req)
      disableUploadTimeouts(req, res)
      const body = await readJsonBody(req, 30_000_000)
      const { target, stagedId, tempUploadDir } = await resolveLocalImportTarget(body)
      let result
      try {
        result = await importLocalPlugin({ path: target, overwrite: body.overwrite, sourceName: body.sourceName })
      } finally {
        if (tempUploadDir) safeRmDir(tempUploadDir)
      }
      if (stagedId) discardStagedUpload(stagedId)
      invalidateLocalIconCache('local')
      return sendJson(res, 200, result)
    }

    // Pure skill packages bypass the plugin pipeline: upload, private copy,
    // junction into $DSH_HOME/skills, then a hot refresh of the Skills tab.
    if (method === 'POST' && path === '/skills/import') {
      requireSameOrigin(req)
      disableUploadTimeouts(req, res)
      const body = await readJsonBody(req, 30_000_000)
      const { target, stagedId, tempUploadDir } = await resolveLocalImportTarget(body)
      let result
      try {
        result = await importLocalSkills(target, {
          overwrite: body.overwrite === true,
          overwriteNames: Array.isArray(body.overwriteNames) ? body.overwriteNames.map(String) : null,
        })
      } finally {
        if (tempUploadDir) safeRmDir(tempUploadDir)
      }
      if (stagedId) discardStagedUpload(stagedId)
      skills?.refresh()
      return sendJson(res, 200, result)
    }

    // An uploaded marketplace becomes its own plugin source tab.
    if (method === 'POST' && path === '/marketplaces/import') {
      requireSameOrigin(req)
      disableUploadTimeouts(req, res)
      const body = await readJsonBody(req, 30_000_000)
      const { target, stagedId, tempUploadDir } = await resolveLocalImportTarget(body)
      let result
      try {
        result = await importLocalMarketplace(target, { sourceName: body.sourceName, overwrite: body.overwrite === true, target: body.target })
      } finally {
        if (tempUploadDir) safeRmDir(tempUploadDir)
      }
      if (stagedId) discardStagedUpload(stagedId)
      if (result?.sourceId) {
        invalidateLocalIconCache(result.sourceId)
      }
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

      const validateUnique = (state) => {
        const duplicate = findDuplicateSource(state, id, url)
        if (duplicate) {
          throw new Error(`该插件源已存在（${duplicate.name}）`)
        }
        if (state.sources.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
          throw new Error(`已存在同名的插件源「${name}」，请换一个名称`)
        }
      }

      return sendJson(res, 200, await withSourceLock(id, async () => {
        validateUnique(readState())
        await ensureSourceCloned(id, url)
        const rows = readMarketplace(id)
        const count = Array.isArray(rows) ? rows.length : 0

        // Re-read state after awaiting clone so concurrent mutations (e.g. plugin toggles) are preserved.
        const latestState = readState()
        validateUnique(latestState)
        const source = { id, name, url, addedAt: Date.now() }
        latestState.sources.push(source)
        writeState(latestState)
        return { ok: true, source, pluginCount: count }
      }))
    }

    if (method === 'POST' && path === '/sources/reorder') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds : []
      if (sourceIds.length === 0) throw new Error('无效的插件源列表')
      const state = readState()
      const order = sourceIds.filter((id, index) => typeof id === 'string' && sourceIds.indexOf(id) === index)
      if (!order.includes('skills-local') && state.tabOrder?.includes('skills-local')) {
        order.splice(Math.min(state.tabOrder.indexOf('skills-local'), order.length), 0, 'skills-local')
      }
      state.tabOrder = order
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
      await withSourceLock(sourceId, async () => {
        const state = readState()
        const source = state.sources.find((s) => s.id === sourceId)
        if (!source) throw new Error('插件源不存在')
        if (source.builtin) throw new Error('内置源不可删除')
        const used = state.plugins.some((p) => p.sourceId === sourceId)
        if (used) throw new Error('该源下仍有已安装插件，请先卸载')
        // The remote checkout pool is shared by marketplaces. Only remove this
        // source's own clone or uploaded marketplace copy.
        if (sourceId === 'local') cleanupAllStagedUploads()
        if (sourceId !== 'remote') await removeManagedDirAsync(sourceCacheDir(sourceId), { allowTrash: false })
        const latestState = readState()
        latestState.sources = latestState.sources.filter((s) => s.id !== sourceId)
        if (Array.isArray(latestState.tabOrder)) latestState.tabOrder = latestState.tabOrder.filter((id) => id !== sourceId)
        writeState(latestState)
        invalidateMarketplaceCache(sourceId)
        invalidateLocalIconCache(sourceId)
      })
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
      const pluginTools = state.plugins.some(plugin => plugin.name === 'user-mcp') ? readMcpToolsState() : null
      for (const block of patch) {
        if (!block || !Array.isArray(block.insert)) continue
        for (const item of block.insert) {
          if (!item || typeof item.id !== 'string' || !item.id.startsWith(getConnectorId('user-mcp', ''))) continue
          const cfg = item.config || {}
          const ownership = pluginTools?.[`user-mcp::${cfg.serverName}`]
          if (ownership?.pluginConnectorOwned || (ownership?.pluginOAuthOwned && remoteConfigFromEntry(cfg))) continue
          if (cfg.serverName && !state.userMcps.some((x) => x && x.name === cfg.serverName)) {
            state.userMcps.push(userMcpConfig(cfg.serverName, {
              transport: cfg.transport, url: cfg.url, command: cfg.command,
              args: Array.isArray(cfg.args) ? cfg.args : [], cwd: cfg.cwd,
              env: cfg.env || {}, headers: cfg.headers || {}, oauth: cfg.oauth || 'none',
            }))
            changed = true
          }
        }
      }
      if (changed) writeState(state)
      const toolsState = readMcpToolsState()
      const mcps = state.userMcps
        .filter((x) => x && x.name)
        .map((x) => {
          const entry = getConnectorEntry('user-mcp', x.name)
          const remote = remoteConfigFromEntry(entry?.config) || toolsState[`user-mcp::${x.name}`]?.savedOAuthRemoteConfig
          const client = remote?.oauth === 'custom' ? readSavedOAuthClient('user-mcp', x.name, remote.url, remote.oauth) : null
          const oauthAuthenticated = isOAuthConnectorAuthenticated('user-mcp', x.name, remote, toolsState)
          // The live registration says what is *running*; the saved definition
          // says what the editor should show. The client id comes from the
          // credential record, since the definition never stores the secret.
          return {
            ...x,
            ...(remote ? {
              transport: 'http', url: remote.url, headers: remote.headers,
              oauth: remote.oauth,
              oauthClientId: client?.clientId || x.oauthClientId || remote.oauthClientId,
              oauthHasClientSecret: client?.hasClientSecret || false,
              // Fall back to the live config only when the definition has no
              // opinion, so a cleared field stays cleared.
              oauthCallbackPort: x.oauthCallbackPort ?? remote.oauthCallbackPort ?? null,
              oauthScope: x.oauthScope ?? remote.oauthScope ?? '',
            } : entry?.config?.headers ? { headers: entry.config.headers } : {}),
            oauthAuthenticated,
            enabled: enabledIds.has(getConnectorId('user-mcp', x.name)),
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
      const name = normalizeMcpName(body.name)
      const result = await verifyConnectorAuth('user-mcp', name, body)
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path === '/mcps') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const name = safeSegment(normalizeMcpName(body.name), 'MCP 名称')
      const probe = await probeConnectorAuth('user-mcp', name, body)
      if (!probe.ok) return sendJson(res, 200, { ok: false, error: probe.error })
      const result = saveConnectorAuth('user-mcp', name, body, { probe })
      if (result && result.ok) {
        const state = readState()
        if (!Array.isArray(state.userMcps)) state.userMcps = []
        state.userMcps = state.userMcps.filter((x) => x && x.name !== name)
        state.userMcps.push(userMcpConfig(name, { ...body, ...probe.definition }))
        writeState(state)
      }
      // A rejected create registered nothing, so there is nothing to apply.
      if (!result || !result.ok) return sendJson(res, 200, result)
      return sendJson(res, 200, scheduledResult(result, applyProfile, [getConnectorId('user-mcp', name)]))
    }

    if (method === 'POST' && path === '/mcps/update') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      // `previousName` is only sent when the user renamed the server in the
      // editor; without it the name in the body is also the stored one.
      const previousName = body.previousName
        ? safeSegment(normalizeMcpName(body.previousName), 'MCP 名称')
        : null
      const name = safeSegment(normalizeMcpName(body.name), 'MCP 名称')
      let state = readState()
      if (!Array.isArray(state.userMcps)) state.userMcps = []
      let idx = state.userMcps.findIndex((x) => x && x.name === (previousName || name))
      if (idx < 0) throw new Error(`MCP 不存在：${previousName || name}`)
      const oldName = previousName || name
      if (oldName !== name && state.userMcps.some(item => item?.name === name)) {
        throw new Error(`已存在同名 MCP：${name}`)
      }
      const saved = state.userMcps[idx]
      const wasEnabled = !!getConnectorEntry('user-mcp', oldName)
      const enable = wasEnabled || body.enable === true
      const cfg = { ...userMcpConfig(name, body, saved), oauthClientSecret: body.oauthClientSecret }
      let probe
      if (enable) {
        probe = await probeUserMcpUpdate(oldName, name, cfg)
        if (!probe.ok) return sendJson(res, 200, { ok: false, error: probe.error })
        state = readState()
        idx = state.userMcps?.findIndex(x => x?.name === oldName) ?? -1
        if (idx < 0 || JSON.stringify(state.userMcps[idx]) !== JSON.stringify(saved)
          || !!getConnectorEntry('user-mcp', oldName) !== wasEnabled) {
          return sendJson(res, 200, { ok: false, error: 'MCP 配置或开关已变更，请刷新后重试' })
        }
        Object.assign(cfg, probe.definition)
      }
      if (previousName && previousName !== name) {
        const renamed = renameUserMcp(previousName, name, cfg, { enable, probe })
        // A rename that failed registered nothing, so there is nothing to apply.
        if (!renamed || !renamed.ok) return sendJson(res, 200, renamed)
        return sendJson(res, 200, scheduledResult(
          renamed, applyProfile, enable ? [getConnectorId('user-mcp', name)] : []))
      }
      let result = { ok: true }
      if (enable) {
        result = saveConnectorAuth('user-mcp', name, cfg, { probe })
        if (!result || !result.ok) return sendJson(res, 200, result)
      }
      // Pass the stored record so an edit keeps the URL history a later delete
      // needs to find every credential this server ever issued.
      state.userMcps[idx] = userMcpConfig(name, cfg, state.userMcps[idx])
      writeState(state)
      return sendJson(res, 200, enable ? scheduledResult(result, applyProfile, [getConnectorId('user-mcp', name)]) : result)
    }

    // One segment only: `/mcps/<name>/tools` belongs to the tool routes below.
    // Decode and validate before the single-segment test, or an encoded slash
    // slips past it; and reject a name that normalizes to nothing rather than
    // falling back to the literal "mcp", which could match a real server.
    if (method === 'DELETE' && path.startsWith('/mcps/')) {
      // Check segments *after* decoding: `prod%2Fdb` decodes to a two-segment
      // path and must not fall through to the server named `prod-db`.
      const decoded = decodeURIComponent(path.slice('/mcps/'.length))
      if (decoded.includes('/')) return sendJson(res, 404, { error: 'not found' })
      requireSameOrigin(req)
      const normalized = String(decoded || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|-+$/g, '')
      if (!normalized) throw new Error('无效的 MCP 名称')
      const name = safeSegment(normalized, 'MCP 名称')
      const result = removeUserMcp(name)
      return sendJson(res, 200, scheduledResult(result, applyProfile))
    }

    if (method === 'POST' && path === '/mcps/toggle') {
      requireSameOrigin(req)
      const body = await readJsonBody(req)
      const name = safeSegment(normalizeMcpName(body.name), 'MCP 名称')
      const state = readState()
      const cfg = (state.userMcps || []).find((x) => x && x.name === name)
      if (!cfg) throw new Error(`MCP 不存在：${name}`)
      if (body.enabled !== false) {
        const result = await enableConnector('user-mcp', name, cfg, {
          canEnable: () => readState().userMcps?.some(item => item?.name === name && JSON.stringify(item) === JSON.stringify(cfg)),
        })
        // A rejected enable registered nothing: do not schedule a reconcile.
        if (!result || !result.ok) return sendJson(res, 200, result)
        return sendJson(res, 200, scheduledResult(result, applyProfile, [getConnectorId('user-mcp', name)]))
      }
      const liveHeaders = getConnectorEntry('user-mcp', name)?.config?.headers
      if (liveHeaders) writeState({ ...state, userMcps: state.userMcps.map(item => item === cfg ? { ...cfg, headers: liveHeaders } : item) })
      unregisterConnector('user-mcp', name)
      return sendJson(res, 200, scheduledResult({ ok: true }, applyProfile))
    }

    // ── user MCP tool list / per-tool toggle (same shape as plugin connectors) ──
    if (method === 'GET' && path.startsWith('/mcps/') && path.endsWith('/tools')) {
      const name = safeSegment(normalizeMcpName(path.slice('/mcps/'.length, -'/tools'.length)), 'MCP 名称')
      const result = await fetchConnectorTools('user-mcp', name, url.searchParams.get('fresh') === '1')
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
      cancelActivePluginProbes(pluginName, connectorName)
      const outcome = await withPluginLock(pluginName, async () => {
        const pluginRec = readState().plugins.find(plugin => plugin.name === pluginName)
        if (!pluginRec) return { ok: false, error: '插件未安装或已卸载' }
        const canEnable = () => readState().plugins.some(plugin => plugin.name === pluginName && plugin.enabled !== false)
        if (!canEnable() && body.enabled !== false) return { ok: false, error: '请先启用所属插件' }
        return body.enabled !== false
          ? await enableConnector(pluginName, connectorName, undefined, { pluginOwned: true, canEnable })
          : toggleConnector(pluginName, connectorName, false)
      })
      return sendJson(res, 200, scheduledIfOk(outcome, applyProfile, body.enabled !== false ? [getConnectorId(pluginName, connectorName)] : []))
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/verify')) {
      requireSameOrigin(req)
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const body = await readJsonBody(req)
      if (!readState().plugins.some(plugin => plugin.name === pluginName)) {
        return sendJson(res, 404, { ok: false, error: '插件未安装或已卸载' })
      }
      const result = await verifyConnectorAuth(pluginName, connectorName, body, { pluginOwned: true })
      return sendJson(res, 200, result)
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.includes('/connectors/') && path.endsWith('/auth')) {
      requireSameOrigin(req)
      const parts = path.slice('/plugins/'.length).split('/')
      const pluginName = safeSegment(parts[0], 'plugin name')
      const connectorName = safeSegment(parts[2], 'connector name')
      const body = await readJsonBody(req)
      cancelActivePluginProbes(pluginName, connectorName)
      const outcome = await withPluginLock(pluginName, async () => {
        if (!readState().plugins.some(plugin => plugin.name === pluginName)) {
          return { status: 404, body: { ok: false, error: '插件未安装或已卸载' } }
        }
        const canEnable = () => readState().plugins.some(plugin => plugin.name === pluginName && plugin.enabled !== false)
        if (!canEnable()) return { status: 200, body: { ok: false, error: '请先启用所属插件' } }
        const result = await enableConnector(pluginName, connectorName, body, { pluginOwned: true, canEnable })
        return { status: 200, body: scheduledIfOk(result, applyProfile, [getConnectorId(pluginName, connectorName)]) }
      })
      return sendJson(res, outcome.status, outcome.body)
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
        invalidateLocalIconCache(sourceId)
        row = readMarketplace(sourceId).find((r) => r.name === pluginName) || row
        detail = pluginDetail(sourceId, pluginName, row.source, row)
      }
      // One pass over the installed tree per request: `installedDetails()` re-reads
      // every connector, skill and LSP entry for every plugin, so it must not run
      // twice in the same handler.
      let installed = null
      const findInstalled = () => {
        if (!installed) installed = installedDetails().find((p) => p.name === pluginName)
        return installed
      }
      if (!detail) {
        const inst = findInstalled()
        if (inst) {
          detail = inst
          if (!row) row = inst
        }
      }
      if (detail && Array.isArray(detail.connectors)) {
        // `pluginDetail` reads the marketplace copy, which knows nothing about
        // what the user saved here (OAuth mode, client id, callback port, the
        // URL they edited). Take the installed row's entry whenever one exists,
        // so opening a connector's settings reflects the saved configuration
        // instead of silently reverting it to `None` and the manifest URL.
        const installedConnectors = new Map(((findInstalled()?.connectors) || []).map((c) => [c.name, c]))
        detail.connectors = detail.connectors.map((c) => ({
          ...c,
          ...(installedConnectors.get(c.name) || {}),
          name: c.name,
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
      invalidateLocalIconCache(sourceId)
      return sendJson(res, 200, scheduledIfOk(result, applyProfile))
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.endsWith('/toggle')) {
      requireSameOrigin(req)
      const pluginName = safeSegment(path.slice('/plugins/'.length, -'/toggle'.length), 'plugin name')
      const body = await readJsonBody(req)
      return sendJson(res, 200, scheduledIfOk(await togglePlugin(pluginName, body.enabled === true), applyProfile))
    }

    if (method === 'POST' && path.startsWith('/plugins/') && path.endsWith('/update')) {
      requireSameOrigin(req)
      const pluginName = safeSegment(path.slice('/plugins/'.length, -'/update'.length), 'plugin name')
      const result = await updatePlugin(pluginName)
      invalidateMarketplaceCache()
      invalidateLocalIconCache()
      return sendJson(res, 200, scheduledIfOk(result, applyProfile))
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
      const result = await uninstallPlugin(pluginName)
      invalidateMarketplaceCache()
      invalidateLocalIconCache()
      return sendJson(res, 200, scheduledIfOk(result, applyProfile))
    }

    return sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    const status = (error && typeof error === 'object' && error.status) ? error.status : 500
    if (status === 413 && res) {
      try { res.setHeader?.('Connection', 'close') } catch {}
    }
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
