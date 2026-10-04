import { existsSync, readdirSync, statSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sourceCacheDir, readState, writeState, safeRmDir } from './store.js'
import { safeSegment } from './market.js'
import { parsePluginRowFromDir, listSkills, listAgents, readPluginManifest, invalidateMarketplaceCache } from './parser.js'

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

/** Native tar extraction for .zip archives */
export async function extractZip(zipPath, destDir) {
  sweepTemp()
  mkdirSync(destDir, { recursive: true })
  await execFileAsync('tar', ['-xf', zipPath, '-C', destDir], { windowsHide: true })
}

// ponytail: base64-in-JSON upload (uniform with the all-JSON API, capped at ~22MB decoded);
// switch to multipart/octet-stream streaming if large archives ever become a real use case.
/** Persist a dropped .zip (base64 request body) to .temp so the path-based flow can process it. */
export function saveUploadedZip(dataBase64, filename) {
  const safe = String(filename || 'plugin.zip').replace(/[^a-zA-Z0-9._-]/g, '_') || 'plugin.zip'
  const file = join(TEMP_ROOT(), `upload-${Date.now()}-${safe}`)
  mkdirSync(TEMP_ROOT(), { recursive: true })
  writeFileSync(file, Buffer.from(String(dataBase64 || ''), 'base64'))
  return file
}

function isPluginDir(dir) {
  if (!dir || !existsSync(dir)) return false
  const rootSkill = existsSync(join(dir, 'SKILL.md')) || existsSync(join(dir, 'skill.md'))
  const hasSkillsDir = existsSync(join(dir, 'skills'))
  const hasManifest = existsSync(join(dir, '.claude-plugin', 'plugin.json')) || existsSync(join(dir, 'plugin.json')) || existsSync(join(dir, 'package.json'))
  const hasMcp = existsSync(join(dir, 'mcp.json')) || existsSync(join(dir, '.mcp.json')) || existsSync(join(dir, 'server.json'))
  const hasAgents = existsSync(join(dir, 'agents'))
  const hasCommands = existsSync(join(dir, 'commands'))
  return Boolean(rootSkill || hasSkillsDir || hasManifest || hasMcp || hasAgents || hasCommands)
}

export function resolvePluginDir(rootDir) {
  if (!existsSync(rootDir)) return null
  if (isPluginDir(rootDir)) return rootDir

  // Unwrap 1-level directory wrapper if present (common in zip files)
  try {
    const subs = readdirSync(rootDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    if (subs.length === 1 && isPluginDir(join(rootDir, subs[0].name))) {
      return join(rootDir, subs[0].name)
    }
  } catch {}
  return null
}

export async function inspectLocalPlugin(rawPath) {
  let targetPath = String(rawPath || '').trim().replace(/^file:\/\/\/?/, '')
  if (/^\/[a-zA-Z]:/.test(targetPath)) targetPath = targetPath.slice(1)
  if (!existsSync(targetPath)) {
    return { ok: false, error: '指定的本地路径或文件不存在' }
  }

  let inspectDir = targetPath
  const isZip = targetPath.toLowerCase().endsWith('.zip')
  let tempExtractDir = null

  if (isZip) {
    tempExtractDir = join(sourceCacheDir('local'), '.temp', `inspect-${Date.now()}`)
    try {
      await extractZip(targetPath, tempExtractDir)
      inspectDir = tempExtractDir
    } catch (e) {
      if (tempExtractDir) safeRmDir(tempExtractDir)
      return { ok: false, error: `解压压缩包失败: ${e.message}` }
    }
  }

  const effectiveDir = resolvePluginDir(inspectDir)
  if (!effectiveDir) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    return { ok: false, error: '不符合规范，不可以上传：未检测到有效 skill.md 或插件配置结构' }
  }

  const rawFallbackName = basename(effectiveDir).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'local-plugin'
  const fallbackName = safeSegment(rawFallbackName, 'plugin name')
  const row = parsePluginRowFromDir(effectiveDir, fallbackName, 'local')
  if (!row) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    return { ok: false, error: '不符合规范，不可以上传：未检测到有效 skill.md 或插件配置结构' }
  }

  const cleanPluginName = safeSegment(row.name, 'plugin name')
  row.name = cleanPluginName

  const skills = listSkills(effectiveDir)
  const agents = listAgents(effectiveDir)

  const localDest = join(sourceCacheDir('local'), cleanPluginName)
  let exists = false
  let existingVersion = undefined
  let existingUpdatedAt = undefined
  if (existsSync(localDest)) {
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

  const { plugin, effectiveDir, tempExtractDir, exists } = inspectRes
  const cleanPluginName = safeSegment(plugin.name, 'plugin name')

  if (exists && !overwrite) {
    if (tempExtractDir) safeRmDir(tempExtractDir)
    throw new Error(`已存在同名插件「${cleanPluginName}」`)
  }

  const localDir = sourceCacheDir('local')
  mkdirSync(localDir, { recursive: true })
  const destDir = join(localDir, cleanPluginName)

  try {
    cpSync(effectiveDir, destDir, { recursive: true, force: true })
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
  }
}
