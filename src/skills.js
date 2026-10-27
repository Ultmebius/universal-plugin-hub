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
  const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name : basename(dirname(file))
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
  const entries = [], visited = new Set(), seen = new Set()
  function walk(dir, depth) {
    let actual, children
    try { actual = canonical(dir); if (visited.has(actual)) return; visited.add(actual); children = readdirSync(dir, { withFileTypes: true }) } catch { return }
    const manifest = children.find(e => /^skill\.md$/i.test(e.name) && (e.isFile() || (e.isSymbolicLink() && (() => { try { return statSync(join(dir, e.name)).isFile() } catch { return false } })())))
    if (manifest) {
      const file = join(dir, manifest.name), id = skillId(file)
      if (!seen.has(id)) { seen.add(id); entries.push(readSkill(file, root, depth > 1)) }
    }
    for (const entry of children) {
      if (EXCLUDED.has(entry.name)) continue
      const path = join(dir, entry.name)
      try { if (entry.isDirectory() || (entry.isSymbolicLink() && statSync(path).isDirectory())) walk(path, depth + 1) } catch {}
    }
  }
  walk(root, 0)
  const counts = new Map()
  for (const item of entries) counts.set(item.name, (counts.get(item.name) || 0) + 1)
  for (const item of entries) item.duplicate = counts.get(item.name) > 1
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export function createSkillsManager(root) {
  root ||= join(process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'), 'skills')
  let cache = null, registry = null, invalidate = null, catalogChanged = null, watcher = null, watchTimer = null, toggling = false
  const scan = (force = false) => {
    if (force || !cache) cache = discoverSkills(root)
    return cache
  }
  const disabled = () => readState().disabledLocalSkills || {}
  const entries = () => {
    const off = disabled()
    return scan().map(item => {
      const { content, metadata, ...summary } = item
      const icon = item.iconPath ? `/universal-plugin-hub/api/skills/icon?id=${encodeURIComponent(item.id)}` : null
      return { ...summary, sourceId: 'skills-local', enabled: !off[item.id], available: !!registry, icons: { light: icon ? [icon] : [], dark: icon ? [icon] : [] } }
    })
  }
  function candidate(item, isDisabled) {
    return {
      name: item.name, description: item.description, invocation: isDisabled ? { modelInvocable: false, userInvocable: false } : item.invocation,
      provider: PROVIDER, source: 'user-agents', rank: isDisabled ? 499 : 501,
      path: item.path, resourceBase: { kind: 'directory', path: item.directory }, locator: item.id,
    }
  }
  const provider = {
    name: PROVIDER,
    async list() {
      const off = disabled()
      // The native filesystem provider (rank 500) wins whenever it discovers
      // the skill. Profiles that omit that user root still get a fallback.
      return scan().filter(item => !item.error && !item.duplicate).map(item => candidate(item, !!off[item.id]))
    },
    async get(entry) {
      const item = scan().find(s => s.id === entry.locator)
      if (!item || item.error) return undefined
      const fresh = readSkill(item.path, root, item.nested)
      if (fresh.error || fresh.name !== item.name) return undefined
      const { rank, locator, ...summary } = candidate(fresh, !!disabled()[item.id])
      return { ...summary, content: fresh.content, metadata: fresh.metadata.metadata }
    },
  }
  function refresh() { cache = null; invalidate?.(); catalogChanged?.(); return entries() }
  async function status(item) {
    if (!registry) return { available: false, message: 'DSH Skills 服务不可用' }
    try {
      const current = (await registry.list()).find(s => s.name === item.name)
      if (!current) return { available: false, message: '当前管理视图未查到此 Skill，无法确认调用状态' }
      if (!samePath(current.path, item.path)) return { available: false, message: '同名 Skill 已由其他来源加载' }
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
      const matching = found && samePath(found.path, item.path)
      return { ...item, enabled: matching ? item.enabled : null, available: !!matching, actualInvocation: matching ? found.invocation : null,
        statusMessage: item.error || (item.duplicate ? '存在同名 Skill' : !found ? '当前管理视图未查到此 Skill，无法确认调用状态' : !matching ? '同名 Skill 已由其他来源加载' : '') }
    })
  }
  async function toggle(id, enabled) {
    if (toggling) throw new Error('正在更新另一个 Skill，请稍后重试')
    toggling = true
    try {
    const item = scan().find(s => s.id === id)
    if (!item) throw new Error('Skill 不存在，请刷新列表')
    if (item.error || item.duplicate) throw new Error(item.error || '存在同名 Skill，无法安全切换')
    const before = await status(item)
    if (!before.available) throw new Error(before.message)
    const state = readState(), previous = { ...(state.disabledLocalSkills || {}) }
    state.disabledLocalSkills = { ...previous }
    if (enabled) delete state.disabledLocalSkills[id]
    else state.disabledLocalSkills[id] = true
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
    return { ...item, enabled: !disabled()[id], files }
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
        if (event === 'change' && filename && !/^skill\.md$/i.test(basename(String(filename)))) return
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
