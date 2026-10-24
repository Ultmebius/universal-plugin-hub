import { existsSync, readdirSync, statSync, cpSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, basename, resolve, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sourceCacheDir, readState, writeState, safeRmDir } from './store.js'
import { safeSegment } from './market.js'
import { parsePluginRowFromDir, parseMarketplaceFromDisk, listSkills, listAgents, readPluginManifest, invalidateMarketplaceCache } from './parser.js'

const execFileAsync = promisify(execFile)

const TEMP_ROOT = () => join(sourceCacheDir('local'), '.temp')

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

// ponytail: base64-in-JSON upload (uniform with the all-JSON API, capped at ~22MB decoded);
// switch to multipart/octet-stream streaming if large archives ever become a real use case.
/** Persist an uploaded archive or SKILL.md for the path-based import flow. */
export function saveUploadedZip(dataBase64, filename) {
  if (!/\.(zip|tgz|tar\.gz)$/i.test(filename || '') && !/^skill\.md$/i.test(filename || '')) {
    throw new Error('支持 .zip、.tgz、.tar.gz 压缩包或 SKILL.md 文件')
  }
  const data = Buffer.from(String(dataBase64 || ''), 'base64')
  if (data.length > 22 * 1024 * 1024) throw new Error('上传文件大小上限为 22MB')
  const safe = String(filename || 'plugin.zip').replace(/[^a-zA-Z0-9._-]/g, '_') || 'plugin.zip'
  mkdirSync(TEMP_ROOT(), { recursive: true })
  const uploadDir = mkdtempSync(join(TEMP_ROOT(), 'upload-'))
  const file = join(uploadDir, /^skill\.md$/i.test(filename) ? 'SKILL.md' : safe)
  writeFileSync(file, data)
  return file
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
  if (existsSync(join(rootDir, '.agents', 'plugins', 'marketplace.json')) || existsSync(join(rootDir, '.claude-plugin', 'marketplace.json')) || existsSync(join(rootDir, 'marketplace.json'))) return rootDir
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
  const isMarket = ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json', 'marketplace.json'].some((p) => existsSync(join(effectiveDir, p)))
    && !existsSync(join(effectiveDir, '.codex-plugin', 'plugin.json')) && !existsSync(join(effectiveDir, '.claude-plugin', 'plugin.json'))
  let entries
  try {
    if (isMarket) {
      entries = parseMarketplaceFromDisk('local-upload', effectiveDir).map((row) => {
        if (typeof row.source !== 'string' || !row.source.startsWith('./')) throw new Error(`市场条目「${row.name}」需要远程下载，请通过“添加插件市场”导入仓库`)
        const dir = resolve(effectiveDir, row.source)
        const rel = relative(resolve(effectiveDir), dir)
        if (rel.startsWith('..') || isAbsolute(rel) || !isPluginDir(dir)) throw new Error(`市场条目「${row.name}」缺少有效的本地插件目录`)
        return { row, dir }
      })
    } else {
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

  const skills = entries.flatMap((e) => listSkills(e.dir))
  const agents = entries.flatMap((e) => listAgents(e.dir))

  const duplicate = entries.find((e) => existsSync(join(sourceCacheDir('local'), safeSegment(e.row.name, 'plugin name'))))
  const localDest = duplicate ? join(sourceCacheDir('local'), duplicate.row.name) : join(sourceCacheDir('local'), cleanPluginName)
  let exists = false
  let existingVersion = undefined
  let existingUpdatedAt = undefined
  if (duplicate) {
    exists = true
    try {
      const existingStat = statSync(localDest)
      existingUpdatedAt = existingStat.mtimeMs
      const existingManifest = readPluginManifest(localDest)
      existingVersion = existingManifest?.version || '1.0.0'
    } catch {}
  }

  return {
    ok: true,
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
  }
}

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

  const localDir = sourceCacheDir('local')
  mkdirSync(localDir, { recursive: true })
  for (const { row, dir } of entries) {
    const destDir = resolve(localDir, safeSegment(row.name, 'plugin name'))
    const srcDir = resolve(dir)
    const contains = (root, child) => {
      const rel = relative(root, child)
      return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../')
    }
    if (destDir !== srcDir && (contains(destDir, srcDir) || contains(srcDir, destDir))) {
      if (tempExtractDir) safeRmDir(tempExtractDir)
      throw new Error('导入源与目标目录重叠，请从独立文件夹导入')
    }
  }
  try {
    for (const { row, dir } of entries) {
      const destDir = join(localDir, safeSegment(row.name, 'plugin name'))
      if (resolve(destDir) !== resolve(dir)) {
        safeRmDir(destDir)
        cpSync(dir, destDir, { recursive: true, force: true })
      }
    }
  } finally {
    if (tempExtractDir) safeRmDir(tempExtractDir)
  }

  // Ensure 'local' source exists in state.sources; apply the user-chosen tab name if given
  const srcName = String(sourceName || '').trim().slice(0, 30)
  const state = readState()
  let localSource = state.sources.find((s) => s.id === 'local')
  if (localSource) {
    if (srcName && localSource.name !== srcName) {
      localSource.name = srcName
      writeState(state)
    }
  } else {
    localSource = {
      id: 'local',
      name: srcName || '本地插件',
      url: 'local://',
      addedAt: Date.now(),
    }
    state.sources.push(localSource)
    writeState(state)
  }

  invalidateMarketplaceCache('local')

  return {
    ok: true,
    sourceId: 'local',
    plugin,
    plugins: entries.map((e) => e.row),
  }
}
