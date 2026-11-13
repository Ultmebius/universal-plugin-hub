import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, watch } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { readState, writeState, dshSkillsDir, installedDir } from './store.js'
import { isUploadedSkillTarget, uploadedSkillRecord } from './skill-uploads.js'
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
function parseYamlObject(source) {
  try {
    const value = parseYaml(source)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch { return undefined }
}
// Some SKILL.md files carry the metadata block twice: a template header that
// was never removed sits above the real one. Only the first block was read and
// cut, so the copy rendered as a `--- name: … ---` table at the top of the
// detail page — and the card took the template's name. The body starts after
// the last leading block instead; a `---` rule further down is page content.
function splitFrontmatter(raw) {
  // Both ends of a block pin the same line terminator: with `\r?` on only one
  // side, an LF file matches a range running from line 1's `---` to line 2's
  // closing one plus its leading `\r`, and the leftover `\n` throws the next
  // round off by a line — the second copy then never matched.
  const block = /^---[ \t]*(\r?\n)([\s\S]*?)\1---[ \t]*\1/
  // The blank line a copy sits under is skipped with it, so the check below
  // lands on the next block instead of stopping at the gap.
  const gap = /^(?:[ \t]*\r?\n)*/
  let yaml = '', end = 0
  while (end < raw.length) {
    const skip = raw.slice(end).match(gap)[0].length
    const next = raw.slice(end + skip).match(block)
    // Only consecutive metadata counts. A block further down sits under page
    // content, where it is a horizontal rule and a table, not a header.
    if (!next || parseYamlObject(next[2]) === undefined) break
    yaml = next[2]
    end += skip + next[0].length
  }
  return yaml ? { yaml, body: raw.slice(end) } : null
}
function readSkill(file, root, isNested) {
  let raw = '', meta = {}, content = '', error = ''
  let invocation = { modelInvocable: true, userInvocable: true }
  try {
    if (statSync(file).size > MAX_FILE) throw new Error('SKILL.md 文件过大')
    raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const parsed = splitFrontmatter(raw)
    if (!parsed) throw new Error('缺少完整的 YAML 元数据')
    meta = parseYaml(parsed.yaml) || {}
    if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('YAML 元数据必须是对象')
    content = parsed.body
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

function mergeSkillLocations(entries) {
  const identical = new Map(), merged = []
  for (const item of entries) {
    const key = JSON.stringify([item.name, item.metadata, item.content.replace(/\r\n/g, '\n')])
    const existing = !item.error && identical.get(key)
    const location = { id: item.id, path: item.path, relativePath: item.relativePath }
    if (existing) existing.locations.push(location)
    else { item.locations = [location]; merged.push(item); if (!item.error) identical.set(key, item) }
  }
  return merged
}

function discoverRootSkills(root) {
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
  return entries
}

export function discoverSkills(root = join(process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'), 'skills')) {
  const entries = discoverRootSkills(root)
  entries.sort((a, b) => a.path.localeCompare(b.path))
  const merged = mergeSkillLocations(entries)
  const counts = new Map()
  for (const item of merged) counts.set(item.name, (counts.get(item.name) || 0) + 1)
  for (const item of merged) item.duplicate = counts.get(item.name) > 1
  return merged.sort((a, b) => a.name.localeCompare(b.name))
}

function defaultSkillRoots() {
  return [
    { path: dshSkillsDir(), source: 'user-dsh', rank: 400 },
    { path: join(process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'), 'skills'), source: 'user-agents', rank: 500 },
  ]
}

/**
 * Keys must be produced and consumed by this one function: realpathSync returns
 * the mixed-case display path on Windows, so a raw canonical lookups never
 * matches a lowercased key.
 */
function pathKey(path) {
  const value = canonical(path)
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function readText(path) {
  try { return readFileSync(path, 'utf8') } catch { return null }
}

/**
 * Skills the hub mirrored into $DSH_HOME/skills on behalf of an installed
 * plugin. They belong to the plugin's own row and stay out of the Skills tab.
 *
 * Ownership is decided by content, not by name: the mirror is a byte copy of
 * the plugin's SKILL.md, so a same-named directory holding anything else is the
 * user's own skill (or a direct upload) and must stay visible. A disabled
 * plugin leaves no mirror behind, and a leftover one still matches its source,
 * so the check covers both states without reading `enabled`.
 */
function pluginOwnedSkillPaths() {
  const paths = new Set()
  for (const plugin of readState().plugins || []) {
    const root = join(installedDir(plugin.name), 'skills')
    let children
    try { children = readdirSync(root, { withFileTypes: true }) } catch { continue }
    for (const child of children) {
      if (!child.isDirectory() && !child.isSymbolicLink()) continue
      const source = readText(join(root, child.name, 'SKILL.md'))
      if (source === null) continue
      const target = join(dshSkillsDir(), child.name)
      if (isUploadedSkillTarget(target)) continue
      if (readText(join(target, 'SKILL.md')) !== source) continue
      paths.add(pathKey(target))
    }
  }
  return paths
}

/**
 * Merge the native user roots.
 *
 * Within one root the long-standing rule stands: identical copies share a card
 * and same-name/different-content skills stay visible as separate cards (the
 * detail view then reports which one DSH actually resolved). Across roots a
 * lower-ranked root never adds a second card for a name the higher root already
 * provides — its file locations are folded into the surviving cards instead, so
 * one switch writes every copy and a hidden copy cannot come back later with a
 * stale state.
 */
export function discoverSkillsFromRoots(roots = defaultSkillRoots()) {
  const sorted = [...roots].filter(root => root?.path).sort((a, b) => (a.rank || 300) - (b.rank || 300))
  const pluginPaths = pluginOwnedSkillPaths()
  const claimed = new Map()
  for (const root of sorted) {
    const items = discoverRootSkills(root.path)
      // A plugin mirror is dropped before merging, not after: it must not claim
      // its name at the higher user-dsh rank and take the user's own copy in
      // another root down with it.
      .filter(item => !pluginPaths.has(pathKey(item.directory)))
      .map(item => {
        item.skillSource = root.source
        item.rank = root.rank
        return item
      })
    for (const item of mergeSkillLocations(items)) {
      const current = claimed.get(item.name)
      if (!current) {
        claimed.set(item.name, { rank: root.rank, cards: [item], shadowed: [] })
      } else if (root.rank === current.rank) {
        current.cards.push(item)
      } else if (root.rank < current.rank) {
        for (const card of current.cards) current.shadowed.push(...card.locations)
        current.rank = root.rank
        current.cards = [item]
      } else {
        current.shadowed.push(...item.locations)
      }
    }
  }
  const result = []
  for (const { cards, shadowed } of claimed.values()) {
    for (const card of cards) {
      const ids = new Set(card.locations.map(location => location.id))
      for (const location of shadowed) {
        if (!ids.has(location.id)) { ids.add(location.id); card.locations.push(location) }
      }
      card.duplicate = cards.length > 1
      card.uploaded = card.skillSource === 'user-dsh' && !!uploadedSkillRecord(card.name)
      result.push(card)
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export function createSkillsManager(root) {
  const customRoot = typeof root === 'string' ? root : null
  const explicitRoots = Array.isArray(root) ? root : null
  // `customSkillDirs` / `bundledSkillDir` are evaluated JS expressions in the
  // profile patch, so the paths are not readable as text. DSH has already
  // resolved them into its catalog by the time we attach; collect those
  // directories here instead of parsing configuration ourselves.
  let registryRoots = null
  const baseRoots = () => explicitRoots
    || (customRoot
      // An explicit test root replaces the defaults (legacy single-root tests).
      // It stands in for the native user-agents root, so it keeps that rank and
      // the fallback candidate lands one step below it, as it always has.
      // In production this string is the native user-agents root, and the
      // user-dsh root must still be scanned alongside it.
      ? (customRoot === join(process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'), 'skills')
        ? defaultSkillRoots()
        : [{ path: customRoot, source: 'user-agents', rank: 500 }])
      : defaultSkillRoots())
  const roots = () => {
    if (explicitRoots) return explicitRoots
    const known = baseRoots()
    const seen = new Set(known.map(root => canonical(root.path).toLowerCase()))
    const extra = []
    for (const root of registryRoots || []) {
      const key = canonical(root.path).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      extra.push(root)
    }
    return [...known, ...extra]
  }
  let cache = null, registry = null, invalidate = null, catalogChanged = null, watchers = [], watchedRoots = new Set(), watchTimer = null, toggling = false
  const agentViews = new Map()
  const scopePolicies = new Map(), presetProviders = new Map()
  let createPolicyScope = null
  function invalidateAll() {
    invalidate?.()
    for (const preset of presetProviders.values()) preset.invalidate?.()
  }
  function ensureScope(scope, service = registry) {
    if (!scope || !createPolicyScope) return
    const existing = scopePolicies.get(scope)
    if (existing?.service === service) return existing.ready
    if (!existing) {
      const off = disabled()
      if (!scan().some(item => !item.error && isDisabled(item, off))) return
    }
    existing?.dispose()
    scopePolicies.delete(scope)
    let owner
    try { owner = createPolicyScope(service.ctx, scope) }
    catch { return }
    let settle
    const pending = new Promise(resolve => { settle = resolve })
    scopePolicies.set(scope, { service, ready: pending, dispose: () => { settle(); return owner.dispose() } })
    // Never reject: failing to register only means this one scope gets no
    // disabled-skill overlay. A rejected promise would be cached here and
    // re-thrown on every later read of this scope, and because catalogs()
    // reads through Promise.all it would blank the entire skills list rather
    // than just this scope.
    owner.ctx.inject(['skills'], target => {
      try { target.skills.registerProvider(() => disabledProvider()) }
      catch { scopePolicies.delete(scope); try { owner.dispose() } catch {} }
      finally { settle() }
    })
    // Cold catalog leases can mint scopes without live agents. Bound their
    // policy lifetimes — but only those: evicting a live agent's policy would
    // quietly report its switched-off skills as enabled again.
    if (scopePolicies.size > 128) {
      for (const key of scopePolicies.keys()) {
        if (agentViews.has(key)) continue
        scopePolicies.get(key).dispose(); scopePolicies.delete(key); break
      }
    }
    return pending
  }
  const scan = (force = false) => {
    if (force || !cache) cache = discoverSkillsFromRoots(roots())
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
      // One step below the native provider of the same root, so the native
      // filesystem provider still wins whenever it discovers the skill and this
      // stays a fallback. Ordering between roots is preserved: a user-dsh copy
      // (401) beats the user-agents fallback (501), matching the .dsh priority.
      // An explicit off choice must precede every native filesystem rank.
      provider: PROVIDER, source: item.skillSource || 'user-agents', rank: isDisabled ? 99 : (item.rank || 500) + 1,
      path: item.path, resourceBase: { kind: 'directory', path: item.directory }, locator: item.id,
    }
  }
  const provider = {
    name: PROVIDER,
    async list(options = {}) {
      await ensureScope(options.scope)
      const off = disabled()
      // The native filesystem provider (rank 500) wins whenever it discovers
      // the skill. Profiles that omit that user root still get a fallback.
      return scan().filter(item => !item.error).map(item => candidate(item, isDisabled(item, off)))
    },
    async get(entry) {
      const item = scan().find(s => s.id === entry.locator)
      if (!item || item.error) return undefined
      const fresh = readSkill(item.path, dirname(item.path), item.nested)
      if (fresh.error || fresh.name !== item.name) return undefined
      const { rank, locator, ...summary } = candidate(fresh, isDisabled(item))
      return { ...summary, content: fresh.content, metadata: fresh.metadata.metadata }
    },
  }
  function disabledProvider() {
    return { ...provider, async list() {
      const off = disabled()
      return scan().filter(item => !item.error && isDisabled(item, off)).map(item => candidate(item, true))
    } }
  }
  function refresh() { cache = null; invalidateAll(); catalogChanged?.(); return entries() }
  async function catalogs() {
    return Promise.all([registry.list(), ...[...agentViews.values()].map(view => view.registry().list(view.lookup()))])
  }
  async function status(item) {
    if (!registry) return { available: false, message: 'DSH Skills 服务不可用' }
    try {
      // A session that never surfaced this skill has nothing to enforce, and
      // must not veto the switch: requiring every agent catalogue to list it
      // would revert every toggle as soon as one preset scopes it away.
      const present = (await catalogs()).map(list => list.find(s => s.name === item.name)).filter(Boolean)
      if (!present.length) return { available: false, message: '当前管理视图未查到此 Skill，无法确认调用状态' }
      const foreign = present.find(s => !matches(item, s))
      if (foreign) return { available: false, message: `/${item.name} 当前使用另一份 Skill：${foreign.path || foreign.provider}` }
      return { available: true, invocations: present.map(s => s.invocation) }
    } catch (e) { return { available: false, message: e.message } }
  }
  async function list() {
    const list = entries()
    if (!registry) return list.map(x => ({ ...x, enabled: null, statusMessage: x.error || 'DSH Skills 服务不可用' }))
    let current
    try { current = await catalogs() } catch { return list.map(x => ({ ...x, enabled: null, available: false, statusMessage: x.error || '无法读取 DSH Skills 状态' })) }
    const catalogsByName = current.map(rows => new Map(rows.map(s => [s.name, s])))
    return list.map(item => {
      // Only the catalogues that actually surface this skill have a say, the
      // same rule status() uses, so a preset that scopes a skill away does not
      // show it as unavailable or reverted.
      const found = catalogsByName.map(rows => rows.get(item.name)).filter(Boolean)
      const foreign = found.find(s => !matches(item, s))
      const matching = found.length > 0 && !foreign
      const desired = item.enabled ? item.invocation : { modelInvocable: false, userInvocable: false }
      const applied = matching && found.every(s => s.invocation.modelInvocable === desired.modelInvocable && s.invocation.userInvocable === desired.userInvocable)
      const actualInvocation = matching ? { modelInvocable: found.some(s => s.invocation.modelInvocable), userInvocable: found.some(s => s.invocation.userInvocable) } : null
      return { ...item, enabled: matching ? applied ? item.enabled : actualInvocation.modelInvocable || actualInvocation.userInvocable : null,
        available: matching && !item.error, actualInvocation, verifiedViews: matching ? found.length : 0, activePath: matching ? found[0].path : null,
        statusMessage: item.error || (!matching && !foreign ? '当前管理视图未查到此 Skill，无法确认调用状态' : foreign ? `/${item.name} 当前使用另一份 Skill：${foreign.path || foreign.provider}` : !applied ? '开关状态尚未在所有会话中生效，请重新切换' : '') }
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
    writeState(state); invalidateAll()
    const after = await status(item)
    const desired = enabled ? item.invocation : { modelInvocable: false, userInvocable: false }
    if (!after.available || !after.invocations.every(policy => policy.modelInvocable === desired.modelInvocable && policy.userInvocable === desired.userInvocable)) {
      const current = readState()
      const restored = { ...(current.disabledLocalSkills || {}) }
      for (const location of item.locations) {
        if (Object.prototype.hasOwnProperty.call(previous, location.id)) restored[location.id] = previous[location.id]
        else delete restored[location.id]
      }
      current.disabledLocalSkills = restored
      writeState(current); invalidateAll()
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
  // Only the configured custom roots (rank 300) are scanned on top of the two
  // native user roots. Bundled skills (rank 600) belong to DSH itself and stay
  // out of the Skills tab.
  const CUSTOM_SOURCES = new Set(['custom'])
  const CUSTOM_RANKS = { custom: 300 }
  async function observeRegistryRoots() {
    if (!registry || explicitRoots || customRoot) return
    let catalog
    try { catalog = await registry.list() } catch { return }
    const roots = new Map()
    for (const entry of catalog) {
      if (!CUSTOM_SOURCES.has(entry.source) || typeof entry.path !== 'string') continue
      // A directory bundle is <root>/<name>/SKILL.md, a flat skill <root>/<name>.md.
      // Walk back to the scanned root, never to the skill directory itself.
      const directory = /^skill\.md$/i.test(basename(entry.path)) ? dirname(dirname(entry.path)) : dirname(entry.path)
      if (roots.has(directory)) continue
      roots.set(directory, { path: directory, source: entry.source, rank: CUSTOM_RANKS[entry.source] || 300 })
    }
    registryRoots = [...roots.values()]
    // The custom directories only become known here, after the catalog is read,
    // so their watchers have to be installed now rather than in attach().
    watchRoots()
  }
  /** Watch every scanned root that does not have a watcher yet, once each. */
  function watchRoots() {
    for (const root of roots()) {
      const key = canonical(root.path).toLowerCase()
      if (watchedRoots.has(key)) continue
      watchedRoots.add(key)
      try {
        const watcher = watch(root.path, { recursive: true }, (event, filename) => {
          if (filename) {
            const parts = String(filename).split(/[\\/]/)
            if (parts.length > 2 || (parts.length === 2 && !/^skill\.md$/i.test(parts[1]))) return
            if (event === 'change' && parts.length === 1 && !/\.md$/i.test(parts[0])) return
          }
          clearTimeout(watchTimer)
          watchTimer = setTimeout(() => { cache = null; invalidateAll(); catalogChanged?.() }, 150)
          watchTimer.unref?.()
        })
        watcher.on('error', () => {})
        watchers.push(watcher)
      } catch {}
    }
  }
  function attach(service, onCatalogChanged = null) {
    registry = service
    catalogChanged = onCatalogChanged
    const dispose = service.registerProvider(control => { invalidate = control.invalidate; return provider })
    watchRoots()
    void observeRegistryRoots()
    return () => { clearTimeout(watchTimer); for (const watcher of watchers) watcher.close(); watchers = []; watchedRoots.clear(); registry = null; invalidate = null; catalogChanged = null; dispose() }
  }
  function attachAgents(ctx, createScope = null) {
    createPolicyScope = createScope
    // Every per-agent registration is best effort: one agent whose context
    // lacks a skills service (or already holds this provider name) must not
    // abort the loop and leave the remaining agents unbound.
    function guard(what, run) {
      try { return run() } catch (error) { ctx.logger?.warn?.(`[universal-plugin-hub] ${what} skipped: ${error.message}`); return null }
    }
    const bind = (agent) => {
      if (agentViews.has(agent)) return
      // A preset's filesystem provider shadows the global layer regardless of
      // rank. Explicit off choices must also live in the exact agent scope.
      // Enabled skills continue to resolve through their native providers.
      const serviceFor = () => ctx.get?.('agentPresets')?.serviceFor(agent, 'skills') ?? registry
      const service = serviceFor()
      if (service !== registry && !presetProviders.has(service)) {
        let invalidatePreset
        const dispose = guard('preset provider', () => service.registerProvider(control => { invalidatePreset = control.invalidate; return { ...disabledProvider(), async list(options = {}) {
          await ensureScope(options.scope, service)
          return disabledProvider().list(options)
        } } }))
        // A provider that failed to register has no invalidation hook, so it
        // must not be tracked: doing so would hand out a users count for a
        // registration that does not exist.
        if (dispose) presetProviders.set(service, { dispose, invalidate: invalidatePreset, users: 0 })
      }
      if (service !== registry && presetProviders.has(service)) presetProviders.get(service).users++
      const dispose = (createScope ? (() => { const policy = scopePolicies.get(agent); scopePolicies.delete(agent); return policy?.dispose() })
        : guard('agent provider', () => agent.ctx.skills.registerProvider(() => disabledProvider()))) || (() => {})
      agentViews.set(agent, { dispose: () => {
        const pending = dispose()
        const preset = presetProviders.get(service)
        if (preset && --preset.users === 0) { preset.dispose(); presetProviders.delete(service) }
        return pending
      }, registry: serviceFor, lookup: () => ({ scope: agent, cwd: ctx.get?.('workingDirectory')?.get(agent.session) ?? agent.session?.header?.cwd }) })
    }
    const unbind = (agent) => { const view = agentViews.get(agent); agentViews.delete(agent); return view?.dispose() }
    const offCreated = ctx.on('agent/created', ({ agent }) => bind(agent))
    const offDisposed = ctx.on('agent/disposed', ({ agent }) => unbind(agent))
    const offPreset = ctx.on('agent-preset/selected', async id => {
      const agent = ctx.agents.get(id)
      if (agent) { await unbind(agent); bind(agent) }
    })
    for (const agent of ctx.agents.list()) bind(agent)
    invalidateAll()
    catalogChanged?.()
    return () => {
      offCreated(); offDisposed(); offPreset()
      const pending = [...agentViews.keys()].map(unbind)
      for (const policy of scopePolicies.values()) pending.push(policy.dispose())
      scopePolicies.clear(); createPolicyScope = null
      for (const { dispose } of presetProviders.values()) dispose()
      presetProviders.clear()
      return Promise.all(pending)
    }
  }
  return { attach, attachAgents, entries, list, toggle, detail, resource, refresh }
}
