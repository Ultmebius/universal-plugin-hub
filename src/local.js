import { existsSync, readdirSync, statSync, cpSync, copyFileSync, mkdirSync, writeFileSync, mkdtempSync, readFileSync, createWriteStream, rmSync } from 'node:fs'
import { join, basename, resolve, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { load as parseYaml } from 'js-yaml'
import { sourceCacheDir, readState, writeState, safeRmDir, slugify } from './store.js'
import { safeSegment, pluginPath } from './market.js'
import { parsePluginRowFromDir, parseMarketplaceFromDisk, listSkills, listAgents, readPluginManifest, invalidateMarketplaceCache, invalidateParserCaches, formatDisplayName, normalizeVersion } from './parser.js'
import { installUploadedSkills, takenSkillNames } from './skill-uploads.js'
import { invalidateLocalIconCache } from './icons.js'
import { refreshInstalledPluginsFromSource } from './install.js'

const execFileAsync = promisify(execFile)

const TEMP_ROOT = () => join(sourceCacheDir('local'), '.temp')

/** True when `child` is `root` itself or sits inside it. */
function containsPath(root, child) {
  const rel = relative(resolve(root), resolve(child))
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'))
}

/** Copy a directory's entries into an existing directory, not into a subdir of it. */
function copyTreeContents(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isDirectory()) cpSync(source, target, { recursive: true, force: true })
    else if (entry.isFile()) copyFileSync(source, target)
  }
}

/** Delete stale .temp artifacts (uploaded zips, inspect extraction dirs) older than 1h. */
function sweepTemp() {
  const root = TEMP_ROOT()
  try {
    for (const entry of readdirSync(root)) {
      try { if (Date.now() - statSync(join(root, entry)).mtimeMs > 3_600_000) safeRmDir(join(root, entry)) } catch {}
    }
  } catch {}
}

/** Native archive extraction (Windows bsdtar also handles ZIP). */
export async function extractZip(zipPath, destDir) {
  sweepTemp()
  mkdirSync(destDir, { recursive: true })
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  await execFileAsync(tar, ['-xf', zipPath, '-C', destDir], { windowsHide: true })
}

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

function uploadedTargetFilename(filename) {
  const raw = String(filename || '')
  if (!/\.(zip|tgz|tar\.gz)$/i.test(raw) && !/^skill\.md$/i.test(raw)) {
    const error = new Error('支持 .zip、.tgz、.tar.gz 压缩包或 SKILL.md 文件')
    error.status = 400
    throw error
  }
  return /^skill\.md$/i.test(raw)
    ? 'SKILL.md'
    : (raw.replace(/[^a-zA-Z0-9._-]/g, '_') || 'plugin.zip')
}

function createUploadFilePath(filename) {
  const targetName = uploadedTargetFilename(filename)
  sweepTemp()
  mkdirSync(TEMP_ROOT(), { recursive: true })
  const uploadDir = mkdtempSync(join(TEMP_ROOT(), 'upload-'))
  return { uploadDir, file: join(uploadDir, targetName) }
}

/** Persist an uploaded archive or SKILL.md from base64 JSON payload. */
export function saveUploadedZip(dataBase64, filename) {
  const targetName = uploadedTargetFilename(filename)
  const data = Buffer.from(String(dataBase64 || ''), 'base64')
  if (data.length > MAX_UPLOAD_BYTES) {
    const error = new Error('上传文件超出 500MB 上限')
    error.status = 413
    throw error
  }
  const { file } = createUploadFilePath(targetName)
  writeFileSync(file, data)
  return file
}

/**
 * Stream a raw application/octet-stream upload directly to disk with backpressure
 * and incremental byte limit enforcement so large archives never buffer in V8 heap.
 */
export async function saveUploadedStream(req, filename, maxBytes = MAX_UPLOAD_BYTES) {
  const targetName = uploadedTargetFilename(filename)
  const declaredLength = Number(req?.headers?.['content-length'] || 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    const error = new Error('上传文件超出 500MB 上限')
    error.status = 413
    throw error
  }
  try { req?.setTimeout?.(0) } catch {}
  try { req?.socket?.setTimeout?.(0) } catch {}
  const { uploadDir, file } = createUploadFilePath(targetName)
  const writer = createWriteStream(file)
  let received = 0
  try {
    await new Promise((resolve, reject) => {
      let settled = false
      let ended = false
      let finished = false
      const cleanupReqListeners = () => {
        req.removeListener('data', onData)
        req.removeListener('end', onEnd)
        req.removeListener('error', onReqError)
        req.removeListener('aborted', onAbort)
        req.removeListener('close', onReqClose)
      }
      const closeWriter = () => new Promise((done) => {
        if (writer.closed || typeof writer.once !== 'function') {
          done()
          return
        }
        let finishedClosing = false
        const timer = setTimeout(() => {
          if (finishedClosing) return
          finishedClosing = true
          writer.removeListener('close', onClosed)
          done()
        }, 300)
        timer.unref?.()
        const onClosed = () => {
          if (finishedClosing) return
          finishedClosing = true
          clearTimeout(timer)
          done()
        }
        writer.once('close', onClosed)
        try { writer.destroy() } catch { onClosed() }
      })
      const fail = (err) => {
        if (settled) return
        settled = true
        cleanupReqListeners()
        writer.removeListener('finish', onWriterFinish)
        writer.removeListener('error', fail)
        writer.removeListener('close', onWriterClose)
        writer.on('error', () => {})
        try { req.pause?.() } catch {}
        void closeWriter().then(() => reject(err))
      }
      const onData = (chunk) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        received += buf.length
        if (received > maxBytes) {
          const error = new Error('上传文件超出 500MB 上限')
          error.status = 413
          fail(error)
          return
        }
        if (!writer.write(buf)) {
          try { req.pause?.() } catch {}
          writer.once('drain', () => {
            if (!settled) {
              try { req.resume?.() } catch {}
            }
          })
        }
      }
      const onEnd = () => {
        ended = true
        if (!settled) writer.end()
      }
      const onReqError = (err) => fail(err)
      const onAbort = () => fail(Object.assign(new Error('上传已中断'), { status: 499 }))
      const onReqClose = () => {
        if (!ended && !req.complete && !req.readableEnded) {
          onAbort()
        }
      }
      const onWriterFinish = () => {
        finished = true
        if (writer.closed) onWriterClose()
      }
      const onWriterClose = () => {
        if (settled || !finished) return
        settled = true
        cleanupReqListeners()
        writer.removeListener('error', fail)
        resolve()
      }
      writer.on('finish', onWriterFinish)
      writer.on('close', onWriterClose)
      writer.on('error', fail)
      req.on('data', onData)
      req.on('end', onEnd)
      req.on('error', onReqError)
      req.on('aborted', onAbort)
      req.on('close', onReqClose)
    })
    return { file, uploadDir, bytes: received }
  } catch (error) {
    safeRmDir(uploadDir)
    throw error
  }
}

/**
 * The one way this codebase tells a marketplace from a plain plugin: a
 * marketplace carries its own manifest. A plugin never does.
 */
const MARKETPLACE_MANIFESTS = ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', 'marketplace.json']

function isMarketplaceDir(dir) {
  return MARKETPLACE_MANIFESTS.some((path) => existsSync(join(dir, path)))
}

function isPluginDir(dir) {
  if (!dir || !existsSync(dir)) return false
  const rootSkill = existsSync(join(dir, 'SKILL.md')) || existsSync(join(dir, 'skill.md'))
  const hasSkillsDir = existsSync(join(dir, 'skills'))
  const hasManifest = existsSync(join(dir, '.codex-plugin', 'plugin.json')) || existsSync(join(dir, '.claude-plugin', 'plugin.json')) || existsSync(join(dir, 'plugin.json')) || existsSync(join(dir, 'package.json'))
  const hasMcp = existsSync(join(dir, 'mcp.json')) || existsSync(join(dir, '.mcp.json')) || existsSync(join(dir, 'server.json'))
  const hasAgents = existsSync(join(dir, 'agents'))
  const hasCommands = existsSync(join(dir, 'commands'))
  return Boolean(rootSkill || hasSkillsDir || hasManifest || hasMcp || hasAgents || hasCommands)
}

export function resolvePluginDir(rootDir) {
  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) return null
  if (isMarketplaceDir(rootDir)) return rootDir
  if (isPluginDir(rootDir)) return rootDir

  // Unwrap nested directory wrappers (common in repository archives).
  try {
    const subs = readdirSync(rootDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    if (subs.length === 1) {
      return resolvePluginDir(join(rootDir, subs[0].name))
    }
    if (subs.some((e) => isPluginDir(join(rootDir, e.name)))) return rootDir
  } catch {}
  return null
}

function skillFileMetadata(file) {
  try {
    const raw = readFileSync(file, 'utf8').replace(/^﻿/, '')
    const match = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
    const meta = match ? parseYaml(match[1]) : null
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
    if (typeof meta.name !== 'string' || typeof meta.description !== 'string' || !meta.description.trim()) return null
    return meta
  } catch { return null }
}

function directSkillEntry(dir, fallbackName, file = null) {
  const manifest = file ? skillFileMetadata(file) : skillFileMetadata(['SKILL.md', 'skill.md'].map(name => join(dir, name)).find(existsSync))
  if (!manifest) return null
  const name = manifest.name.trim()
  if (!name) return null
  return {
    dir,
    file: file || undefined,
    singleFile: !!file,
    row: {
      id: `skills/${name}`, sourceId: 'skills-local', name,
      displayName: typeof manifest.displayName === 'string' ? manifest.displayName : formatDisplayName(name),
      description: manifest.description.trim(), version: '1.0.0', source: './',
    },
  }
}

/** A pure skill package is a root skill or one level of direct skill entries. */
function collectDirectSkills(dir, fallbackName) {
  const rootFile = ['SKILL.md', 'skill.md'].map(name => join(dir, name)).find(existsSync)
  if (rootFile) {
    const entry = directSkillEntry(dir, fallbackName)
    return entry ? [entry] : []
  }
  const root = existsSync(join(dir, 'skills')) ? join(dir, 'skills') : dir
  const entries = []
  try {
    for (const child of readdirSync(root, { withFileTypes: true })) {
      if (EXCLUDED_UPLOAD_DIRS.has(child.name) || child.name.startsWith('.')) continue
      const path = join(root, child.name)
      if (child.isDirectory()) {
        const entry = directSkillEntry(path, child.name)
        if (entry) entries.push(entry)
      } else if (child.isFile() && /\.md$/i.test(child.name)) {
        const entry = directSkillEntry(root, child.name.replace(/\.md$/i, ''), path)
        if (entry) entries.push(entry)
      }
    }
  } catch {}
  return entries
}

const EXCLUDED_UPLOAD_DIRS = new Set(['node_modules', '__pycache__', 'agents', 'commands', 'hooks', 'docs', 'assets'])

function isPureSkillPackage(dir) {
  return ![
    '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json', 'package.json',
    'mcp.json', '.mcp.json', 'server.json', 'agents', 'commands',
  ].some(path => existsSync(join(dir, path)))
}

function marketSourceName(dir, fallbackName) {
  for (const path of MARKETPLACE_MANIFESTS) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, path), 'utf8'))
      if (typeof raw.name === 'string' && raw.name.trim()) return raw.name.trim()
      if (typeof raw.title === 'string' && raw.title.trim()) return raw.title.trim()
    } catch {}
  }
  return formatDisplayName(fallbackName) || '本地市场'
}

export async function inspectLocalPlugin(rawPath) {
  let targetPath = String(rawPath || '').trim().replace(/^["']|["']$/g, '')
  if (/^file:/i.test(targetPath)) targetPath = fileURLToPath(targetPath)
  if (!existsSync(targetPath)) {
    return { ok: false, error: '指定的本地路径或文件不存在' }
  }

  let inspectDir = targetPath
  const isZip = /\.(zip|tgz|tar\.gz)$/i.test(targetPath)
  let tempExtractDir = null

  if (isZip) {
    mkdirSync(TEMP_ROOT(), { recursive: true })
    tempExtractDir = mkdtempSync(join(TEMP_ROOT(), 'inspect-'))
    try {
      await extractZip(targetPath, tempExtractDir)
      inspectDir = tempExtractDir
    } catch (e) {
      if (tempExtractDir) safeRmDir(tempExtractDir)
      return { ok: false, error: `解压压缩包失败: ${e.message}` }
    }
  }

  if (!isZip && statSync(targetPath).isFile()) {
    if (!/^skill\.md$/i.test(basename(targetPath))) return { ok: false, error: '请选择插件或技能文件夹、压缩包，或 SKILL.md 文件' }
    inspectDir = dirname(targetPath)
  }

  const effectiveDir = resolvePluginDir(inspectDir)
  if (!effectiveDir) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    return { ok: false, error: '不符合规范，不可以上传：未检测到有效 skill.md 或插件配置结构' }
  }

  const rawFallbackName = (isZip && effectiveDir === tempExtractDir ? basename(targetPath).replace(/\.(zip|tgz|tar\.gz)$/i, '') : basename(effectiveDir)).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'local-plugin'
  const fallbackName = safeSegment(rawFallbackName, 'plugin name')
  // Recognition follows the package formats, not the upload transport:
  // marketplace -> Claude -> Codex -> pure skills. Claude/Codex precedence in
  // readPluginManifest is shared with the existing source installation path.
  const isMarket = isMarketplaceDir(effectiveDir)
  const pureSkills = !isMarket && isPureSkillPackage(effectiveDir)
  const directSkills = pureSkills ? collectDirectSkills(effectiveDir, fallbackName) : []
  const singleFile = !isZip && statSync(targetPath).isFile()
  const kind = isMarket ? 'marketplace' : pureSkills ? 'skills' : existsSync(join(effectiveDir, '.claude-plugin', 'plugin.json')) ? 'claude' : existsSync(join(effectiveDir, '.codex-plugin', 'plugin.json')) ? 'codex' : 'plugin'
  let entries
  if (kind === 'skills') entries = directSkills
  try {
    if (isMarket) {
      entries = parseMarketplaceFromDisk('local-upload', effectiveDir).map((row) => {
        if (typeof row.source !== 'string' || !row.source.startsWith('./')) throw new Error(`市场条目「${row.name}」需要远程下载，请通过“添加插件市场”导入仓库`)
        const dir = resolve(effectiveDir, row.source)
        const rel = relative(resolve(effectiveDir), dir)
        if (rel.startsWith('..') || isAbsolute(rel) || !isPluginDir(dir)) throw new Error(`市场条目「${row.name}」缺少有效的本地插件目录`)
        return { row, dir }
      })
    } else if (kind !== 'skills') {
      const row = parsePluginRowFromDir(effectiveDir, fallbackName, 'local')
      entries = row ? [{ row, dir: effectiveDir }] : []
      if (!row) {
        entries = readdirSync(effectiveDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => ({ row: parsePluginRowFromDir(join(effectiveDir, e.name), e.name, 'local'), dir: join(effectiveDir, e.name) })).filter((e) => e.row)
      }
    }
  } catch (e) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    return { ok: false, error: e.message }
  }
  if (new Set(entries.map((e) => e.row.name)).size !== entries.length) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    return { ok: false, error: '集合中存在同名插件或技能，请使用不同的名称' }
  }
  const row = entries.length === 1 ? entries[0].row : (entries.length ? { name: fallbackName, displayName: `本地集合（${entries.length} 项）`, description: entries.map((e) => e.row.displayName || e.row.name).join('、'), version: '1.0.0' } : null)
  if (!row) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    return { ok: false, error: '不符合规范，不可以上传：未检测到有效 skill.md 或插件配置结构' }
  }

  const cleanPluginName = safeSegment(row.name, 'plugin name')
  row.name = cleanPluginName

  const names = kind === 'skills' ? takenSkillNames() : new Set()
  const skills = entries.flatMap((e) => listSkills(e.dir))
  const agents = entries.flatMap((e) => listAgents(e.dir))

  const localConflicts = kind === 'skills' ? [] : collectLocalConflicts(entries)
  const suggestedLabel = kind === 'marketplace' ? marketSourceName(effectiveDir, fallbackName) : ''
  let exists = false
  let existingVersion = undefined
  let existingUpdatedAt = undefined
  if (kind === 'marketplace') {
    // Only the same standalone market tab triggers immediate duplicate overwrite;
    // overlaps with `local` are reported via `localConflicts` so the user can still
    // pick an independent tab cleanly without false collision prompts.
    const marketSlugId = `local-${slugify(suggestedLabel) || 'market'}`
    const marketCache = sourceCacheDir(marketSlugId)
    const hasMarket = readState().sources.some((s) => s.id === marketSlugId) && existsSync(marketCache)
    if (hasMarket) {
      exists = true
      try {
        existingUpdatedAt = statSync(marketCache).mtimeMs
        const existingRows = parseMarketplaceFromDisk(marketSlugId, marketCache)
        const matched = existingRows.find((r) => r.name === row.name) || existingRows[0]
        existingVersion = normalizeVersion(matched?.version)
      } catch {}
    }
  } else if (kind === 'skills') {
    const duplicate = entries.find((e) => existsSync(join(sourceCacheDir('local'), safeSegment(e.row.name, 'plugin name'))))
      || entries.find((e) => (readState().uploadedSkills || []).some(record => record.name === e.row.name))
    if (duplicate) {
      const localDest = join(sourceCacheDir('local'), safeSegment(duplicate.row.name, 'plugin name'))
      exists = true
      try {
        existingUpdatedAt = statSync(localDest).mtimeMs
        existingVersion = normalizeVersion(readPluginManifest(localDest)?.version)
      } catch {}
    }
  } else if (localConflicts.length > 0) {
    exists = true
    existingVersion = localConflicts[0].existingVersion
    existingUpdatedAt = localConflicts[0].existingUpdatedAt
  }

  return {
    ok: true,
    kind,
    effectiveDir,
    tempExtractDir,
    entries,
    plugins: entries.map((e) => e.row),
    plugin: {
      ...row,
      skillsCount: skills.length,
      agentsCount: agents.length,
    },
    exists,
    existingVersion,
    existingUpdatedAt,
    localConflicts,
    suggestedName: kind === 'marketplace' ? formatDisplayName(suggestedLabel) : undefined,
    // Whether the local tab is already named decides if this upload still has
    // to ask for a name, so inspect reports it instead of the dialog guessing.
    localTabName: String(readState().sources.find((source) => source.id === 'local')?.name || ''),
    // Every skill in the package is checked, not just the aggregate row: a
    // collection with one clashing member must still offer the overwrite.
    takenSkillNames: kind === 'skills' ? entries.map((e) => e.row.name).filter((name) => names.has(name)) : [],
  }
}

function collectLocalConflicts(entries) {
  const localDir = sourceCacheDir('local')
  const conflicts = []
  for (const e of entries) {
    const dest = join(localDir, safeSegment(e.row.name, 'plugin name'))
    if (!existsSync(dest)) continue
    let existingUpdatedAt
    let existingVersion
    try {
      existingUpdatedAt = statSync(dest).mtimeMs
      existingVersion = normalizeVersion(readPluginManifest(dest)?.version)
    } catch {}
    conflicts.push({
      name: e.row.name,
      displayName: e.row.displayName || e.row.name,
      existingVersion,
      newVersion: normalizeVersion(e.row.version),
      existingUpdatedAt,
    })
  }
  return conflicts
}

/**
 * Pure skill packages go straight into the Skills tab instead of the plugin
 * install pipeline: no mirrored copy, no agents/commands conversion.
 */
export async function importLocalSkills(rawPath, { overwrite = false, overwriteNames = null } = {}) {
  const inspectRes = await inspectLocalPlugin(rawPath)
  if (!inspectRes.ok) throw new Error(inspectRes.error)
  if (inspectRes.kind !== 'skills') throw new Error('该内容不是纯 Skills 包')
  const { tempExtractDir, entries, singleFile } = inspectRes
  try {
    // A bare SKILL.md upload is one flat skill. When the folder it came from is
    // a collection, the walk up yields several entries, and flattening those
    // would drop each skill's assets along with its directory.
    const installed = installUploadedSkills(entries, { overwrite, overwriteNames, singleFile: singleFile && entries.length === 1 })
    return { ok: true, sourceId: 'skills-local', skills: installed, kind: 'skills' }
  } finally {
    if (tempExtractDir) safeRmDir(tempExtractDir)
  }
}

/**
 * An uploaded marketplace becomes its own plugin source tab: its declared
 * plugins are copied under the source cache and listed by the normal market
 * reader, so install/update/uninstall behave exactly like a Git source.
 */
const PLUGIN_MANIFEST_RELATIVE = ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'plugin.json']

function syncPluginManifestMetadata(destDir, row, { stripRootMarketplace = false } = {}) {
  if (stripRootMarketplace) {
    for (const relativePath of MARKETPLACE_MANIFESTS) {
      const mPath = join(destDir, relativePath)
      if (existsSync(mPath)) rmSync(mPath, { force: true })
    }
  }
  const fields = {
    name: row.name,
    ...(row.displayName ? { displayName: row.displayName } : {}),
    ...(row.version ? { version: row.version } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.author ? { author: row.author } : {}),
    ...(row.homepage ? { homepage: row.homepage } : {}),
    ...(row.category ? { category: row.category } : {}),
  }
  for (const rel of PLUGIN_MANIFEST_RELATIVE) {
    const file = join(destDir, rel)
    if (!existsSync(file)) continue
    try {
      const json = JSON.parse(readFileSync(file, 'utf8'))
      if (!json || typeof json !== 'object' || Array.isArray(json)) continue
      let changed = false
      if (!json.name && row.name) { json.name = row.name; changed = true }
      const hasVer = normalizeVersion(json.version)
        || normalizeVersion(json.extensions?.['com.openai']?.version)
        || normalizeVersion(json.interface?.version)
      if (!hasVer && row.version) { json.version = row.version; changed = true }
      if (!json.description && row.description) { json.description = row.description; changed = true }
      if (!json.displayName && !json.interface?.displayName && row.displayName) { json.displayName = row.displayName; changed = true }
      if (!json.author && !json.interface?.developerName && row.author) { json.author = row.author; changed = true }
      if (!json.homepage && !json.interface?.websiteURL && row.homepage) { json.homepage = row.homepage; changed = true }
      if (changed) writeFileSync(file, JSON.stringify(json, null, 2), 'utf8')
      return
    } catch {}
  }
  const out = join(destDir, '.claude-plugin', 'plugin.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(fields, null, 2), 'utf8')
}

async function copyEntriesToLocalCache(entries, { overwrite = false, tempExtractDir = null, stripRootMarketplace = false } = {}) {
  const localDir = sourceCacheDir('local')
  mkdirSync(localDir, { recursive: true })
  const clashing = []
  for (const { row, dir } of entries) {
    const cleanName = safeSegment(row.name, 'plugin name')
    const destDir = resolve(localDir, cleanName)
    const srcDir = resolve(dir)
    if (destDir !== srcDir && (containsPath(destDir, srcDir) || containsPath(srcDir, destDir))) {
      if (tempExtractDir) safeRmDir(tempExtractDir)
      throw new Error('导入源与目标目录重叠，请从独立文件夹导入')
    }
    if (existsSync(destDir)) clashing.push(cleanName)
  }
  if (clashing.length > 0 && !overwrite) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    if (clashing.length === 1) throw new Error(`已存在同名插件「${clashing[0]}」`)
    throw new Error(`本地插件标签中已存在同名插件：${clashing.join('、')}`)
  }
  const importedNames = []
  try {
    for (const { row, dir } of entries) {
      const cleanName = safeSegment(row.name, 'plugin name')
      const destDir = join(localDir, cleanName)
      if (resolve(destDir) !== resolve(dir)) {
        safeRmDir(destDir)
        cpSync(dir, destDir, { recursive: true, force: true })
      }
      if (stripRootMarketplace) {
        syncPluginManifestMetadata(destDir, row, { stripRootMarketplace: true })
      }
      importedNames.push(cleanName)
    }
  } finally {
    if (tempExtractDir) safeRmDir(tempExtractDir)
  }
  invalidateMarketplaceCache('local')
  invalidateParserCaches()
  invalidateLocalIconCache('local')
  if (overwrite && importedNames.length > 0) {
    await refreshInstalledPluginsFromSource('local', importedNames)
  }
  return importedNames
}

/**
 * Import an uploaded Claude/Codex marketplace locally. When `target === 'local'`,
 * entries merge cleanly into the existing `local` tab as individual plugin folders
 * without writing a root marketplace.json; otherwise plugins keep their manifest
 * layout inside `market/local-<slug>/` as an independent tab.
 */
export async function importLocalMarketplace(rawPath, { sourceName = '', overwrite = false, target = '' } = {}) {
  const inspectRes = await inspectLocalPlugin(rawPath)
  if (!inspectRes.ok) throw new Error(inspectRes.error)
  if (inspectRes.kind !== 'marketplace') throw new Error('该内容不是插件市场')
  const { effectiveDir, tempExtractDir, entries } = inspectRes
  const state = readState()

  if (target === 'local') {
    const localSource = state.sources.find((s) => s.id === 'local')
    if (!localSource) {
      if (tempExtractDir) safeRmDir(tempExtractDir)
      throw new Error('尚未创建本地插件标签，请先上传单个本地插件或将其作为独立标签页添加')
    }
    await copyEntriesToLocalCache(entries, { overwrite, tempExtractDir, stripRootMarketplace: true })
    return {
      ok: true,
      kind: 'marketplace',
      target: 'local',
      sourceId: 'local',
      source: localSource,
      plugins: entries.map((entry) => entry.row),
    }
  }

  const label = marketSourceName(effectiveDir, basename(effectiveDir))
  const name = String(sourceName || '').trim().slice(0, 30) || formatDisplayName(label)
  const sourceId = `local-${slugify(label) || 'market'}`
  const dest = sourceCacheDir(sourceId)
  const existing = state.sources.find(source => source.id === sourceId)
  // Only a *new* tab can collide with an existing one. An overwrite reuses its
  // own tab, and the name it compares here is the manifest's, not whatever the
  // user renamed that tab to.
  if (!existing && state.sources.some(source => String(source.name || '').trim() === name)) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    throw new Error(`分类标签「${name}」已存在，请换一个名称`)
  }
  if (existsSync(dest) && !overwrite && state.sources.some(source => source.id === sourceId)) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    throw new Error(`已存在同名插件市场「${label}」`)
  }
  // The destination is wiped below, so a source that is or contains it would be
  // destroyed along with the copy that is still being read from.
  if (containsPath(dest, effectiveDir) || containsPath(effectiveDir, dest)) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    throw new Error('导入源与插件市场存储目录重叠，请从独立文件夹导入')
  }
  try {
    safeRmDir(dest)
    mkdirSync(dest, { recursive: true })
    for (const { row, dir } of entries) {
      // Keep each plugin on the path its manifest declares: a rewritten layout
      // (`plugins/<name>`) would break `./external_plugins/x` and `./`, and the
      // reader resolves sources against the copied manifest after a restart.
      const targetDir = pluginPath(dest, `./${row.source.replace(/^\.\//, '')}`)
      mkdirSync(dirname(targetDir), { recursive: true })
      if (resolve(targetDir) !== resolve(dest)) cpSync(dir, targetDir, { recursive: true, force: true })
      else copyTreeContents(dir, targetDir)
    }
    // Carry the marketplace manifest itself so the standard reader finds the
    // same rows on the next start, not only during this upload.
    for (const relativePath of MARKETPLACE_MANIFESTS) {
      const file = join(effectiveDir, relativePath)
      if (!existsSync(file)) continue
      const out = join(dest, relativePath)
      mkdirSync(dirname(out), { recursive: true })
      copyFileSync(file, out)
    }
  } finally {
    if (tempExtractDir) safeRmDir(tempExtractDir)
  }
  if (existing) {
    // Overwriting keeps the tab's name unless the user typed a new one;
    // otherwise a plain "overwrite update" would revert their naming.
    const renamed = String(sourceName || '').trim().slice(0, 30)
    if (renamed && existing.name !== renamed) {
      existing.name = renamed
      writeState(state)
    }
  } else {
    state.sources.push({ id: sourceId, name, url: `local-market://${sourceId}`, addedAt: Date.now() })
    writeState(state)
  }
  invalidateMarketplaceCache(sourceId)
  invalidateParserCaches()
  invalidateLocalIconCache(sourceId)
  if (overwrite) {
    await refreshInstalledPluginsFromSource(sourceId, entries.map((entry) => entry.row.name))
  }
  return { ok: true, kind: 'marketplace', sourceId, source: state.sources.find(source => source.id === sourceId), plugins: entries.map(entry => entry.row) }
}

/** Legacy plugin-pipeline import; the UI routes pure skill packages elsewhere. */
export async function importLocalPlugin({ path: rawPath, overwrite = false, sourceName = '' }) {
  const inspectRes = await inspectLocalPlugin(rawPath)
  if (!inspectRes.ok) {
    throw new Error(inspectRes.error)
  }

  const { plugin, entries, tempExtractDir, exists } = inspectRes
  const cleanPluginName = safeSegment(plugin.name, 'plugin name')

  if (exists && !overwrite) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    throw new Error(`已存在同名插件「${cleanPluginName}」`)
  }

  await copyEntriesToLocalCache(entries, { overwrite, tempExtractDir, stripRootMarketplace: false })

  // The tab is named once, on the first import. Later imports land in that
  // same tab: re-applying a name here would silently rename a tab the user
  // already chose, and every upload would ask the same question again.
  const srcName = String(sourceName || '').trim().slice(0, 30)
  const state = readState()
  let localSource = state.sources.find((s) => s.id === 'local')
  if (!localSource) {
    localSource = {
      id: 'local',
      name: srcName || '本地插件',
      url: 'local://',
      addedAt: Date.now(),
    }
    state.sources.push(localSource)
    writeState(state)
  }

  return {
    ok: true,
    sourceId: 'local',
    plugin,
    plugins: entries.map((e) => e.row),
  }
}

const UPLOADED_MARKET_URL = 'local-market://'

function isUploadedMarket(source) {
  return Boolean(source) && String(source.url || '').startsWith(UPLOADED_MARKET_URL)
}

/**
 * Remove an uploaded marketplace tab that old versions created *beside* the
 * local tab under the very same name. That duplicate is what put two
 * identical labels in the tab bar.
 *
 * It is removed, never merged: an uploaded marketplace is a marketplace (its
 * cache root is a market, read through its own marketplace.json), while the
 * local tab is a flat list of plugin directories. Flattening one into the
 * other would silently turn a market into a plugin.
 *
 * Narrow on purpose: only an uploaded-market source, only when its display
 * name *exactly* equals the local tab's, only when its cache really holds a
 * marketplace manifest, and never when one of its plugins is still installed
 * (that deletion is the user's call, not a startup side effect).
 *
 * Idempotent: with nothing to remove it writes nothing.
 */
export function removeDuplicateLocalMarketTabs() {
  const state = readState()
  const localName = String(state.sources.find((source) => source.id === 'local')?.name || '').trim()
  if (!localName) return { removed: [] }

  const duplicates = state.sources.filter((source) =>
    source && isUploadedMarket(source) &&
    source.id !== 'local' &&
    String(source.name || '').trim() === localName &&
    isMarketplaceDir(sourceCacheDir(source.id)),
  )
  if (!duplicates.length) return { removed: [] }

  const ids = duplicates.map((source) => source.id)
  const installed = state.plugins.filter((record) => ids.includes(record.sourceId))
  if (installed.length) {
    // Keep the tab rather than orphan install records behind the user's back.
    return { removed: [], kept: ids, installed: installed.map((record) => record.name) }
  }

  for (const id of ids) safeRmDir(sourceCacheDir(id))
  state.sources = state.sources.filter((source) => !ids.includes(source.id))
  if (Array.isArray(state.tabOrder)) state.tabOrder = state.tabOrder.filter((id) => !ids.includes(id))
  writeState(state)
  for (const id of ids) invalidateMarketplaceCache(id)
  return { removed: ids }
}
