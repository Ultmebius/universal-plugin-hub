import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { readState, writeState } from './store.js'
import { formatDisplayName } from './parser.js'

const PROVIDER = 'universal-plugin-hub-skills'
const EXCLUDED = new Set(['.git', 'node_modules', '__pycache__'])
const MAX_FILE = 2 * 1024 * 1024
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function canonical(path) {
  try { return realpathSync.native(path) } catch { return resolve(path) }
}
function samePath(a, b) {
  if (!a || !b) return false
  const left = canonical(a), right = canonical(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}
function skillId(file) {
  const path = canonical(file)
  return createHash('sha256').update(process.platform === 'win32' ? path.toLowerCase() : path).digest('hex')
}
function policyValue(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(normalized)) return true
  if (['false', 'no', 'off', '0'].includes(normalized)) return false
  throw new Error('调用策略必须是布尔值')
}
function readSkill(file, root, isNested) {
  let raw = '', meta = {}, content = '', error = ''
  let invocation = { modelInvocable: true, userInvocable: true }
  try {
    if (statSync(file).size > MAX_FILE) throw new Error('SKILL.md 文件过大')
    raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/)
    if (!match) throw new Error('缺少完整的 YAML 元数据')
    meta = parseYaml(match[1]) || {}
    if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('YAML 元数据必须是对象')
    content = raw.slice(match[0].length)
    if (typeof meta.name !== 'string' || !NAME.test(meta.name)) throw new Error('名称不符合 DSH 的小写连字符格式')
    if (typeof meta.description !== 'string' || !meta.description.trim()) throw new Error('缺少 description')
    invocation = { modelInvocable: !policyValue(meta['disable-model-invocation'], false), userInvocable: policyValue(meta['user-invocable'], true) }
  } catch (e) {
    error = String(e.message).split('\n')[0]
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {}
    if (!meta.name) meta.name = raw.match(/^name:\s*([^\r\n]+)/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
    if (!meta.description) meta.description = raw.match(/^description:\s*([^\r\n]+)/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || raw.match(/^#\s+(.+)/m)?.[1] || ''
  }
  const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name : /^skill\.md$/i.test(basename(file)) ? basename(dirname(file)) : basename(file).replace(/\.md$/i, '')
  const icons = [meta.icon, meta.logo, 'assets/icon.svg', 'assets/logo.svg', 'assets/icon.png', 'assets/logo.png', 'icon.svg', 'icon.png', 'logo.png']
  const iconPath = icons.find(path => typeof path === 'string' && !path.includes('..') && existsSync(join(dirname(file), path)))
  return {
    id: skillId(file), name, displayName: typeof meta.displayName === 'string' ? meta.displayName : formatDisplayName(name), description: typeof meta.description === 'string' ? meta.description : '',
    path: file, directory: dirname(file), relativePath: relative(root, file), nested: isNested,
    error, content: content || raw, metadata: meta, iconPath,
    invocation,
  }
}

export function discoverSkills(root = join(process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'), 'skills')) {
  const entries = [], seen = new Set()
  let children
  try { children = readdirSync(root, { withFileTypes: true }) } catch { return entries }
  // Match DSH's native boundary: <root>/<name>/SKILL.md or <root>/<name>.md.
  for (const entry of children) {
    if (EXCLUDED.has(entry.name)) continue
    const path = join(root, entry.name)
    try {
      const stat = entry.isSymbolicLink() ? statSync(path) : entry
      let file
      if (stat.isDirectory()) {
        const manifest = readdirSync(path).find(name => /^skill\.md$/i.test(name) && statSync(join(path, name)).isFile())
        if (manifest) file = join(path, manifest)
      } else if (stat.isFile() && /\.md$/i.test(entry.name)) file = path
      if (!file) continue
      const id = skillId(file)
      if (!seen.has(id)) { seen.add(id); entries.push(readSkill(file, root, false)) }
    } catch {}
  }
  // Identical direct entries share one card and one provider candidate.
  entries.sort((a, b) => a.path.localeCompare(b.path))
  const identical = new Map(), merged = []
  for (const item of entries) {
    const key = JSON.stringify([item.name, item.metadata, item.content.replace(/\r\n/g, '\n')])
    const existing = !item.error && identical.get(key)
    const location = { id: item.id, path: item.path, relativePath: item.relativePath }
    if (existing) existing.locations.push(location)
    else { item.locations = [location]; merged.push(item); if (!item.error) identical.set(key, item) }
  }
  const counts = new Map()
  for (const item of merged) counts.set(item.name, (counts.get(item.name) || 0) + 1)
  for (const item of merged) item.duplicate = counts.get(item.name) > 1
  return merged.sort((a, b) => a.name.localeCompare(b.name))
}

export function createSkillsManager(root) {
  root ||= join(process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'), 'skills')
  let cache = null, registry = null, invalidate = null, catalogChanged = null, watcher = null, watchTimer = null, toggling = false
  const scan = (force = false) => {
    if (force || !cache) cache = discoverSkills(root)
    return cache
  }
  const disabled = () => readState().disabledLocalSkills || {}
  const isDisabled = (item, off = disabled()) => item.locations.some(location => off[location.id])
  const matches = (item, current) => current && item.locations.some(location => samePath(current.path, location.path))
  const entries = () => {
    const off = disabled()
    return scan().map(item => {
      const { content, metadata, ...summary } = item
      const icon = item.iconPath ? `/universal-plugin-hub/api/skills/icon?id=${encodeURIComponent(item.id)}` : null
      return { ...summary, sourceId: 'skills-local', enabled: !isDisabled(item, off), available: !!registry, icons: { light: icon ? [icon] : [], dark: icon ? [icon] : [] } }
    })
  }
  function candidate(item, isDisabled) {
    return {
      name: item.name, description: item.description, invocation: isDisabled ? { modelInvocable: false, userInvocable: false } : item.invocation,
      // The same ~/.agents file can be discovered as a project root (rank 200).
      // An explicit off choice must precede every native filesystem rank.
      provider: PROVIDER, source: 'user-agents', rank: isDisabled ? 99 : 501,
      path: item.path, resourceBase: { kind: 'directory', path: item.directory }, locator: item.id,
    }
  }
  const provider = {
    name: PROVIDER,
    async list() {
      const off = disabled()
      // The native filesystem provider (rank 500) wins whenever it discovers
      // the skill. Profiles that omit that user root still get a fallback.
      return scan().filter(item => !item.error).map(item => candidate(item, isDisabled(item, off)))
    },
    async get(entry) {
      const item = scan().find(s => s.id === entry.locator)
      if (!item || item.error) return undefined
      const fresh = readSkill(item.path, root, item.nested)
      if (fresh.error || fresh.name !== item.name) return undefined
      const { rank, locator, ...summary } = candidate(fresh, isDisabled(item))
      return { ...summary, content: fresh.content, metadata: fresh.metadata.metadata }
    },
  }
  function refresh() { cache = null; invalidate?.(); catalogChanged?.(); return entries() }
  async function status(item) {
    if (!registry) return { available: false, message: 'DSH Skills 服务不可用' }
    try {
      const current = (await registry.list()).find(s => s.name === item.name)
      if (!current) return { available: false, message: '当前管理视图未查到此 Skill，无法确认调用状态' }
      if (!matches(item, current)) return { available: false, message: `/${item.name} 当前使用另一份 Skill：${current.path || current.provider}` }
      return { available: true, invocation: current.invocation }
    } catch (e) { return { available: false, message: e.message } }
  }
  async function list() {
    const list = entries()
    if (!registry) return list.map(x => ({ ...x, enabled: null, statusMessage: x.error || 'DSH Skills 服务不可用' }))
    let current
    try { current = await registry.list() } catch { return list.map(x => ({ ...x, enabled: null, available: false, statusMessage: x.error || '无法读取 DSH Skills 状态' })) }
    const byName = new Map(current.map(s => [s.name, s]))
    return list.map(item => {
      const found = byName.get(item.name)
      const matching = matches(item, found)
      return { ...item, enabled: matching ? item.enabled : null, available: !!matching && !item.error, actualInvocation: matching ? found.invocation : null,
        activePath: matching ? found.path : null,
        statusMessage: item.error || (!found ? '当前管理视图未查到此 Skill，无法确认调用状态' : !matching ? `/${item.name} 当前使用另一份 Skill：${found.path || found.provider}` : '') }
    })
  }
  async function toggle(id, enabled) {
    if (toggling) throw new Error('正在更新另一个 Skill，请稍后重试')
    toggling = true
    try {
    const item = scan().find(s => s.id === id)
    if (!item) throw new Error('Skill 不存在，请刷新列表')
    if (item.error) throw new Error(item.error)
    const before = await status(item)
    if (!before.available) throw new Error(before.message)
    const state = readState(), previous = { ...(state.disabledLocalSkills || {}) }
    state.disabledLocalSkills = { ...previous }
    for (const location of item.locations) {
      if (enabled) delete state.disabledLocalSkills[location.id]
      else state.disabledLocalSkills[location.id] = true
    }
    writeState(state); invalidate?.()
    const after = await status(item)
    const desired = enabled ? item.invocation : { modelInvocable: false, userInvocable: false }
    if (!after.available || after.invocation?.modelInvocable !== desired.modelInvocable || after.invocation?.userInvocable !== desired.userInvocable) {
      state.disabledLocalSkills = previous; writeState(state); invalidate?.()
      catalogChanged?.()
      throw new Error(after.message || 'DSH 未确认开关状态，已恢复原状态')
    }
    catalogChanged?.()
    return { ok: true, skills: await list() }
    } finally { toggling = false }
  }
  function detail(id, includeFiles = true) {
    const item = scan().find(s => s.id === id)
    if (!item) throw new Error('Skill 不存在，请刷新列表')
    const files = []
    function walk(dir, depth) {
      if (depth > 8 || files.length >= 500) return
      let children; try { children = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of children) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path, depth + 1)
        else if (entry.isFile() && path !== item.path) files.push({ path: relative(item.directory, path).split(sep).join('/'), category: relative(item.directory, path).split(sep)[0] })
      }
    }
    if (includeFiles) walk(item.directory, 0)
    return { ...item, enabled: !isDisabled(item), files }
  }
  function resource(id, name) {
    const item = scan().find(s => s.id === id)
    if (!item) throw new Error('Skill 不存在')
    const file = resolve(item.directory, String(name || ''))
    const base = canonical(item.directory), real = canonical(file), rel = relative(base, real)
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || resolve(base, rel) !== real) throw new Error('无效的资源路径')
    if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size > MAX_FILE) throw new Error('资源不存在或文件过大')
    const data = readFileSync(file)
    if (data.includes(0)) throw new Error('该资源不是文本文件')
    return data.toString('utf8')
  }
  function attach(service, onCatalogChanged = null) {
    registry = service
    catalogChanged = onCatalogChanged
    const dispose = service.registerProvider(control => { invalidate = control.invalidate; return provider })
    try {
      watcher = watch(root, { recursive: true }, (event, filename) => {
        if (filename) {
          const parts = String(filename).split(/[\\/]/)
          if (parts.length > 2 || (parts.length === 2 && !/^skill\.md$/i.test(parts[1]))) return
          if (event === 'change' && parts.length === 1 && !/\.md$/i.test(parts[0])) return
        }
        clearTimeout(watchTimer)
        watchTimer = setTimeout(() => { cache = null; invalidate?.(); catalogChanged?.() }, 150)
        watchTimer.unref?.()
      })
      watcher.on('error', () => {})
    } catch {}
    return () => { clearTimeout(watchTimer); watcher?.close(); watcher = null; registry = null; invalidate = null; catalogChanged = null; dispose() }
  }
  return { attach, entries, list, toggle, detail, resource, refresh }
}
