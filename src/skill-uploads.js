/**
 * Direct skill imports live in the hub's private tree and are exposed through
 * DSH's native user-dsh root. Directory bundles use junctions on Windows (and
 * directory symlinks elsewhere); a bare SKILL.md is copied as <name>.md.
 */
import { cpSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { dshSkillsDir, readState, safeRmDir, uploadedSkillsDir, writeState } from './store.js'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function samePath(a, b) {
  if (!a || !b) return false
  const left = resolve(a), right = resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/**
 * The switch state is keyed by this hash (see skillId in skills.js), and the
 * junction means the discovered path resolves to the private original, so both
 * ends of the link have to be cleared.
 */
function skillLocationId(path) {
  let value
  try { value = realpathSync.native(path) } catch { value = resolve(path) }
  if (process.platform === 'win32') value = value.toLowerCase()
  return createHash('sha256').update(value).digest('hex')
}

function contains(root, child) {
  const rel = relative(resolve(root), resolve(child))
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
}

function recordPaths(name, kind) {
  if (!SKILL_NAME.test(name)) throw new Error('Skill 名称必须符合小写连字符格式')
  return {
    sourceDir: join(uploadedSkillsDir(), name),
    target: join(dshSkillsDir(), kind === 'file' ? `${name}.md` : name),
  }
}

export function isUploadedSkillTarget(path) {
  return (readState().uploadedSkills || []).some(record => samePath(record?.target, path))
}

export function uploadedSkillRecord(name) {
  return (readState().uploadedSkills || []).find(record => record?.name === name) || null
}

function pathExists(path) {
  try { lstatSync(path); return true } catch { return false }
}

function removeTarget(record) {
  const { target } = recordPaths(record.name, record.kind)
  if (!pathExists(target)) return
  const stat = lstatSync(target)
  if (stat.isSymbolicLink()) {
    // Remove the link itself. Never use safeRmDir's attrib fallback here:
    // its recursive wildcard could modify the private original's files.
    rmSync(target, { recursive: true, force: true })
  } else if (stat.isDirectory()) safeRmDir(target)
  else rmSync(target, { force: true })
}

function expose(record) {
  const { sourceDir, target } = recordPaths(record.name, record.kind)
  mkdirSync(dirname(target), { recursive: true })
  if (record.kind === 'file') copyFileSync(join(sourceDir, 'SKILL.md'), target)
  else symlinkSync(sourceDir, target, process.platform === 'win32' ? 'junction' : 'dir')
}

function rootSkillFile(dir) {
  return ['SKILL.md', 'skill.md'].map(file => join(dir, file)).find(existsSync)
}

function validateEntry(entry) {
  const name = String(entry?.row?.name || '')
  if (!SKILL_NAME.test(name)) throw new Error(`Skill「${name || basename(entry?.dir || '')}」的 name 必须是小写连字符格式`)
  // A flat `<name>.md` skill keeps its manifest in entry.file beside the other
  // skills of the same folder, so the shared folder has no SKILL.md of its own.
  const file = entry.file || rootSkillFile(entry.dir)
  if (!file) throw new Error(`Skill「${name}」缺少 SKILL.md`)
  const raw = readFileSyncSafe(file)
  if (!/^description\s*:/m.test(raw)) throw new Error(`Skill「${name}」缺少 description`)
  return { name, file }
}

function readFileSyncSafe(file) {
  try { return readFileSync(file, 'utf8') } catch { return '' }
}

/** Every rejection this import can raise, so a batch can be checked up front. */
function preflight(entry, { overwrite, singleFile, fileDir = null }) {
  const { name, file } = validateEntry(entry)
  const kind = singleFile ? 'file' : 'directory'
  const paths = recordPaths(name, kind)
  const previous = uploadedSkillRecord(name)
  if (previous && !overwrite) throw new Error(`已存在同名 Skill「${name}」`)
  if (!previous && pathExists(paths.target)) {
    throw new Error(`DSH Skills 目录已存在「${name}」，为避免覆盖你的文件，本次未导入`)
  }
  const source = resolve(entry.dir)
  if (contains(uploadedSkillsDir(), source) || contains(source, uploadedSkillsDir())) {
    throw new Error('导入源与技能存储目录重叠，请从独立文件夹导入')
  }
  return { name, file, kind, paths, previous, source }
}

function installOne(entry, options) {
  const { name, file, kind, paths, previous, source } = preflight(entry, options)
  // A bare SKILL.md file, or a flat `<name>.md` sitting beside other skills in
  // one folder, has no assets to carry: only the manifest is copied.
  const manifestOnly = options.singleFile || options.fileDir
  mkdirSync(uploadedSkillsDir(), { recursive: true })
  const staging = join(uploadedSkillsDir(), `.${name}-${process.pid}-${Date.now()}.tmp`)
  let staged = false, installed = false, exposed = false
  try {
    if (manifestOnly) {
      mkdirSync(staging, { recursive: true })
      copyFileSync(file, join(staging, 'SKILL.md'))
    } else {
      cpSync(source, staging, { recursive: true, force: true })
      const stagedRoot = join(staging, 'SKILL.md')
      if (!existsSync(stagedRoot)) copyFileSync(join(staging, basename(file)), stagedRoot)
    }
    staged = true

    if (previous) {
      removeTarget(previous)
      safeRmDir(recordPaths(previous.name, previous.kind).sourceDir)
    }
    renameSync(staging, paths.sourceDir)
    staged = false
    installed = true
    expose({ name, kind })
    exposed = true

    const state = readState()
    state.uploadedSkills = [...(state.uploadedSkills || []).filter(item => item.name !== name),
      { name, kind, ...paths, uploadedAt: previous?.uploadedAt || Date.now(), updatedAt: Date.now() }]
    writeState(state)
    return { name, kind }
  } catch (error) {
    // Roll back only what this attempt created; never delete an old original
    // that was already removed before the failure (its target is gone too, so
    // the previous entry stays recorded and can be restored from the source).
    if (exposed) { try { removeTarget({ name, kind }) } catch {} }
    if (installed) { try { safeRmDir(paths.sourceDir) } catch {} }
    throw error
  } finally {
    if (staged) { try { safeRmDir(staging) } catch {} }
  }
}

export function installUploadedSkills(entries, { overwrite = false, singleFile = false } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('未检测到可上传的 Skill')
  // A batch must not half-install: every rejection this import can predict is
  // raised before the first file moves, so a duplicate name in the middle of
  // the package cannot leave the earlier skills live while the UI reports a
  // failure.
  for (const entry of entries) preflight(entry, { overwrite, singleFile, fileDir: entry.singleFile })
  const installed = []
  try {
    for (const entry of entries) {
      const replaced = !!uploadedSkillRecord(String(entry?.row?.name || ''))
      installed.push({ ...installOne(entry, { overwrite, singleFile, fileDir: entry.singleFile }), replaced })
    }
    return installed.map(({ replaced, ...skill }) => skill)
  } catch (error) {
    // Only a failure preflight cannot see (disk, permissions) gets here. Undo
    // the entries this batch created; an overwrite has already replaced its
    // original, so deleting it would be worse than leaving the new copy.
    for (const skill of installed) {
      if (skill.replaced) continue
      try { uninstallUploadedSkill(skill.name) } catch {}
    }
    throw error
  }
}

export function uninstallUploadedSkill(name) {
  const record = uploadedSkillRecord(name)
  if (!record) throw new Error('只能卸载通过本插件上传的 Skill')
  const { sourceDir, target } = recordPaths(record.name, record.kind)
  // The switch key hashes the manifest file, not the folder.
  const removal = (record.kind === 'file' ? [target, join(sourceDir, 'SKILL.md')] : [join(target, 'SKILL.md'), join(sourceDir, 'SKILL.md')])
    .map(file => skillLocationId(file))
  removeTarget(record)
  safeRmDir(recordPaths(record.name, record.kind).sourceDir)
  const state = readState()
  state.uploadedSkills = (state.uploadedSkills || []).filter(item => item.name !== name)
  // The id hashes the canonical path, and a re-upload recreates that same path,
  // so a stale "off" left here would switch the fresh copy off on arrival.
  if (state.disabledLocalSkills) {
    for (const id of removal) delete state.disabledLocalSkills[id]
  }
  writeState(state)
  return { ok: true, name }
}

/** Repair links/copies after a restart without rewriting the originals. */
export function restoreUploadedSkills() {
  const restored = []
  for (const record of readState().uploadedSkills || []) {
    try {
      const paths = recordPaths(record.name, record.kind)
      if (!existsSync(join(paths.sourceDir, 'SKILL.md'))) continue
      if (!pathExists(paths.target)) {
        expose(record)
        restored.push(record.name)
      }
    } catch {}
  }
  return restored
}
