import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync, existsSync, lstatSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { createSkillsManager, discoverSkills } from '../src/skills.js'
import { installedDir, readState, writeState } from '../src/store.js'
import { mountRoutes } from '../src/routes.js'

const temp = mkdtempSync(join(tmpdir(), 'hub-skills-'))
process.env.DSH_HOME = join(temp, 'dsh')
const root = join(temp, 'agents', 'skills')
function write(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value) }
function add(dir, name, extra = '') {
  const file = join(root, dir, 'SKILL.md')
  write(file, `---\nname: ${name}\ndescription: >\n  Skill ${name}\n${extra}---\nInstructions for ${name}.\n`)
  return file
}

test('discovery, resources, provider control and persistence', async () => {
  try {
    const native = add('native', 'native')
    const repeated = add('repeated', 'repeated')
    write(join(root, 'repeated/plugins/repeated/skills/repeated/SKILL.md'), readFileSync(repeated))
    write(add('z-repeated-copy', 'repeated'), readFileSync(repeated))
    const collision = add('collision-a', 'collision')
    write(add('collision-b', 'collision'), readFileSync(collision, 'utf8') + 'Different instructions.\n')
    add('unlisted-native-root', 'unlisted-native-root')
    const collection = add('collection', 'collection', 'user-invocable: false\n')
    add('collection/nested', 'nested')
    add('container/hidden', 'hidden')
    write(join(root, 'flat.md'), '---\nname: flat\ndescription: Flat skill\n---\nFlat instructions.\n')
    add('broken', 'bad name')
    write(join(root, 'collection/scripts/run.py'), 'print("hello")')
    write(join(root, 'collection/agents/worker.md'), 'Agent instructions')
    try { symlinkSync(join(root, 'native'), join(root, 'alias'), 'junction') } catch {}
    const discovered = discoverSkills(root)
    assert.equal(discovered.filter(s => s.name === 'native').length, 1)
    assert.equal(discovered.some(s => s.name === 'nested' || s.name === 'hidden'), false)
    assert.equal(discovered.find(s => s.name === 'collection').nested, false)
    assert.equal(discovered.find(s => s.name === 'flat').path, join(root, 'flat.md'))
    assert.ok(discovered.find(s => s.name === 'bad name').error)
    const combined = discovered.filter(s => s.name === 'repeated')
    assert.equal(combined.length, 1)
    assert.equal(combined[0].path, repeated)
    assert.equal(combined[0].locations.length, 2)
    assert.equal(combined[0].duplicate, false)
    assert.equal(discovered.filter(s => s.name === 'collision').length, 2)
    const original = readFileSync(native, 'utf8')

    let provider, foreignCandidate = null, ignoreOverride = false
    const registry = {
      registerProvider(factory) { provider = factory({ invalidate() {} }); return () => {} },
      async list(options = {}) {
        const candidates = [
          // DSH's async realpath expands Windows short paths; its summaries
          // must match Skills scanned from the original short temp path.
          { name: 'native', path: realpathSync.native(native), invocation: { modelInvocable: true, userInvocable: true }, rank: options.cwd ? 200 : 500 },
          { name: 'repeated', path: realpathSync.native(repeated), invocation: { modelInvocable: true, userInvocable: true }, rank: 500 },
          { name: 'collision', path: realpathSync.native(collision), invocation: { modelInvocable: true, userInvocable: true }, rank: 500 },
          ...(foreignCandidate ? [foreignCandidate] : []),
          ...(await provider.list()).filter(p => !ignoreOverride || p.name !== 'native'),
        ].sort((a, b) => a.rank - b.rank)
        return [...new Map(candidates.map(x => [x.name, x]).reverse()).values()]
      },
    }
    const manager = createSkillsManager(root)
    let catalogChanges = 0
    const dispose = manager.attach(registry, () => { catalogChanges += 1 })
    let items = await manager.list()
    const first = items.find(s => s.name === 'native')
    const second = items.find(s => s.name === 'collection')
    assert.equal(items.some(s => s.name === 'nested' || s.name === 'hidden'), false)
    assert.equal((await provider.list()).some(s => s.name === 'nested' || s.name === 'hidden'), false)
    assert.equal(first.available, true)
    assert.equal((await registry.list()).find(s => s.name === 'native').rank, 500)
    const fallback = items.find(s => s.name === 'unlisted-native-root')
    assert.equal(fallback.available, true)
    assert.equal(fallback.enabled, true)
    assert.equal((await registry.list()).find(s => s.name === 'unlisted-native-root').rank, 501)
    assert.equal(second.available, true)
    assert.equal(second.actualInvocation.userInvocable, false)
    const definition = await provider.get((await provider.list()).find(s => s.name === 'collection'))
    assert.equal(definition.resourceBase.path, dirname(collection))
    assert.match(definition.content, /Instructions for collection/)

    await manager.toggle(first.id, false)
    assert.equal(catalogChanges, 1)
    let active = (await registry.list()).find(s => s.name === 'native')
    assert.deepEqual(active.invocation, { modelInvocable: false, userInvocable: false })
    assert.equal((await registry.list()).filter(s => s.invocation.userInvocable).some(s => s.name === 'native'), false)
    assert.equal((await registry.list({ cwd: temp })).find(s => s.name === 'native').invocation.userInvocable, false)
    assert.equal((await manager.list()).find(s => s.id === first.id).enabled, false)
    assert.equal(createSkillsManager(root).entries().find(s => s.id === first.id).enabled, false)
    await manager.toggle(first.id, true)
    assert.equal(catalogChanges, 2)
    active = (await registry.list()).find(s => s.name === 'native')
    assert.deepEqual(active.invocation, { modelInvocable: true, userInvocable: true })
    foreignCandidate = { name: 'native', path: join(temp, 'other', 'SKILL.md'), invocation: { modelInvocable: true, userInvocable: true }, rank: 400 }
    await assert.rejects(manager.toggle(first.id, false), /当前使用另一份 Skill/)
    assert.equal(catalogChanges, 2)
    assert.equal((await manager.list()).find(s => s.id === first.id).enabled, null)
    assert.equal(manager.entries().find(s => s.id === first.id).enabled, true)
    foreignCandidate = null
    ignoreOverride = true
    await assert.rejects(manager.toggle(first.id, false), /已恢复原状态/)
    assert.equal(catalogChanges, 3)
    assert.equal((await manager.list()).find(s => s.id === first.id).enabled, true)
    ignoreOverride = false
    await manager.toggle(second.id, false)
    await manager.toggle(second.id, true)
    assert.equal((await registry.list()).find(s => s.name === 'collection').invocation.userInvocable, false)
    const duplicate = (await manager.list()).find(s => s.name === 'repeated')
    assert.equal(duplicate.available, true)
    await manager.toggle(duplicate.id, false)
    assert.equal((await manager.list()).find(s => s.name === 'repeated').enabled, false)
    assert.deepEqual((await registry.list()).find(s => s.name === 'repeated').invocation, { modelInvocable: false, userInvocable: false })
    // A saved choice for an identical direct copy survives merging; enabling clears it.
    writeState({ ...readState(), disabledLocalSkills: { [duplicate.locations[1].id]: true } })
    assert.equal(manager.entries().find(s => s.name === 'repeated').enabled, false)
    await manager.toggle(duplicate.id, true)
    assert.equal((await manager.list()).find(s => s.name === 'repeated').enabled, true)
    assert.deepEqual(readState().disabledLocalSkills, {})
    const variants = (await manager.list()).filter(s => s.name === 'collision')
    const winner = variants.find(s => s.available)
    assert.ok(winner)
    assert.equal(winner.statusMessage, '')
    assert.match(variants.find(s => !s.available).statusMessage, /当前使用另一份 Skill/)
    await manager.toggle(winner.id, false)
    await manager.toggle(winner.id, true)
    assert.equal(readFileSync(native, 'utf8'), original)
    const detail = manager.detail(second.id)
    assert.deepEqual(detail.files.map(f => f.path).sort(), ['agents/worker.md', 'nested/SKILL.md', 'scripts/run.py'])
    assert.equal(manager.resource(second.id, 'scripts/run.py'), 'print("hello")')
    assert.throws(() => manager.resource(second.id, '../../native/SKILL.md'), /无效的资源路径/)
    write(join(installedDir('local-plugin'), '.claude-plugin/plugin.json'), JSON.stringify({ name: 'local-plugin', description: 'Installed' }))
    writeState({ sources: [{ id: 'anthropic', name: 'Anthropic', builtin: true }, { id: 'local', name: '本地插件', url: 'local://' }], plugins: [{ name: 'local-plugin', sourceId: 'local', enabled: true }] })
    let handler
    mountRoutes({ register(route) { handler = route.handler } }, manager)
    async function get(path) {
      const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
      await handler({ method: 'GET', url: '/universal-plugin-hub/api' + path, headers: {} }, res)
      assert.equal(res.status, 200)
      return res.body
    }
    const state = await get('/state')
    assert.deepEqual(state.sources.map(s => s.id), ['anthropic', 'skills-local', 'local'])
    assert.equal(state.sources[2].pluginCount, 1)
    const market = await get('/market?sourceId=local')
    assert.equal(market.plugins[0].name, 'local-plugin')
    assert.equal(market.plugins[0].sourceMissing, true)
    const req = Readable.from([JSON.stringify({ sourceIds: ['anthropic', 'local', 'skills-local'] })])
    Object.assign(req, { method: 'POST', url: '/universal-plugin-hub/api/sources/reorder', headers: {} })
    const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
    await handler(req, res)
    assert.equal(res.status, 200)
    assert.deepEqual((await get('/state')).sources.map(s => s.id), ['anthropic', 'local', 'skills-local'])
    dispose()
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('a plugin mirror stays out of the Skills tab, a user copy of the same name does not', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'hub-plugin-owned-'))
  const previousHome = process.env.DSH_HOME
  const previousAgents = process.env.DSH_AGENTS_HOME
  process.env.DSH_HOME = join(fixture, 'dsh')
  process.env.DSH_AGENTS_HOME = join(fixture, 'agents')
  try {
    const dshRoot = join(process.env.DSH_HOME, 'skills')
    const pluginSkills = join(installedDir('demo'), 'skills')
    write(join(pluginSkills, 'mirrored', 'SKILL.md'), '---\nname: mirrored\ndescription: from plugin\n---\nbody\n')
    write(join(pluginSkills, 'left-behind', 'SKILL.md'), '---\nname: left-behind\ndescription: from plugin\n---\nbody\n')
    // The hub mirrored these at install time; the user also keeps their own.
    write(join(dshRoot, 'mirrored', 'SKILL.md'), '---\nname: mirrored\ndescription: from plugin\n---\nbody\n')
    write(join(dshRoot, 'left-behind', 'SKILL.md'), '---\nname: left-behind\ndescription: from plugin\n---\nbody\n')
    // A same-named directory the user edited is theirs, not the plugin's.
    write(join(pluginSkills, 'edited', 'SKILL.md'), '---\nname: edited\ndescription: from plugin\n---\nplugin\n')
    write(join(dshRoot, 'edited', 'SKILL.md'), '---\nname: edited\ndescription: mine\n---\nmy own edits\n')
    write(join(process.env.DSH_AGENTS_HOME, 'skills', 'own', 'SKILL.md'), '---\nname: own\ndescription: mine\n---\nbody\n')
    writeState({ ...readState(), plugins: [{ name: 'demo', sourceId: 'local', enabled: false }] })
    assert.deepEqual(createSkillsManager().entries().map(s => s.name), ['edited', 'own'])
    writeState({ ...readState(), plugins: [{ name: 'demo', sourceId: 'local', enabled: true }] })
    assert.deepEqual(createSkillsManager().entries().map(s => s.name), ['edited', 'own'])

    // An upload at the same name as a shipped skill is the user's, never hidden.
    write(join(dshRoot, 'taken', 'SKILL.md'), '---\nname: taken\ndescription: uploaded\n---\nmine\n')
    write(join(pluginSkills, 'taken', 'SKILL.md'), '---\nname: taken\ndescription: from plugin\n---\nplugin\n')
    writeState({ ...readState(), uploadedSkills: [{ name: 'taken', kind: 'directory', sourceDir: join(fixture, 'private'), target: join(dshRoot, 'taken') }] })
    assert.deepEqual(createSkillsManager().entries().map(s => s.name), ['edited', 'own', 'taken'])
  } finally {
    writeState({ ...readState(), plugins: [], uploadedSkills: [] })
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    if (previousAgents === undefined) delete process.env.DSH_AGENTS_HOME
    else process.env.DSH_AGENTS_HOME = previousAgents
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('cross-root duplicates keep one card and switch both copies', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'hub-two-roots-'))
  const previousHome = process.env.DSH_HOME
  const previousAgents = process.env.DSH_AGENTS_HOME
  process.env.DSH_HOME = join(fixture, 'dsh')
  process.env.DSH_AGENTS_HOME = join(fixture, 'agents')
  try {
    const dshRoot = join(process.env.DSH_HOME, 'skills')
    const agentsRoot = join(process.env.DSH_AGENTS_HOME, 'skills')
    write(join(dshRoot, 'dup', 'SKILL.md'), '---\nname: dup\ndescription: dsh copy\n---\nbody\n')
    // Same name, different content: the .dsh copy must still win silently.
    write(join(agentsRoot, 'dup', 'SKILL.md'), '---\nname: dup\ndescription: agents copy\n---\nother body\n')
    write(join(agentsRoot, 'agents-only', 'SKILL.md'), '---\nname: agents-only\ndescription: only here\n---\nbody\n')
    const manager = createSkillsManager()
    const items = manager.entries()
    assert.deepEqual(items.map(s => s.name), ['agents-only', 'dup'])
    const dup = items.find(s => s.name === 'dup')
    assert.equal(dup.path, join(dshRoot, 'dup', 'SKILL.md'))
    // Both locations stay switchable, so a later removal cannot resurrect the
    // hidden copy with a stale on/off state.
    assert.equal(dup.locations.length, 2)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    if (previousAgents === undefined) delete process.env.DSH_AGENTS_HOME
    else process.env.DSH_AGENTS_HOME = previousAgents
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('a root SKILL.md makes a skill collection one skill, not its children', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'hub-aggregate-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(fixture, 'dsh')
  const pack = join(fixture, 'offer-toolkit-skill')
  try {
    const { inspectLocalPlugin, importLocalSkills } = await import('../src/local.js')
    const { uninstallUploadedSkill } = await import('../src/skill-uploads.js')
    write(join(pack, 'SKILL.md'), '---\nname: offer-toolkit-skill\ndescription: Full toolkit\n---\nroot\n')
    for (const child of ['bq-skill', 'resume-skill', 'salary-negotiation-skill']) {
      write(join(pack, child, 'SKILL.md'), `---\nname: ${child}\ndescription: sub\n---\nsub\n`)
    }
    const inspected = await inspectLocalPlugin(pack)
    assert.equal(inspected.kind, 'skills')
    assert.deepEqual(inspected.entries.map(entry => entry.row.name), ['offer-toolkit-skill'])
    const imported = await importLocalSkills(pack)
    assert.deepEqual(imported.skills.map(skill => skill.name), ['offer-toolkit-skill'])
    const target = join(process.env.DSH_HOME, 'skills', 'offer-toolkit-skill')
    const original = join(process.env.DSH_HOME, 'agent-skills', 'universal-plugin-hub', 'uploaded', 'offer-toolkit-skill')
    assert.equal(lstatSync(target).isSymbolicLink(), true)
    assert.equal(readFileSync(join(original, 'SKILL.md'), 'utf8').includes('root'), true)
    uninstallUploadedSkill('offer-toolkit-skill')
    assert.equal(existsSync(target), false)
    assert.equal(existsSync(original), false)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(pack, { recursive: true, force: true })
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('disabled skills override preset scopes for existing and future agents', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'hub-scoped-skills-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(fixture, 'dsh')
  const scopedRoot = join(fixture, 'skills'), file = join(scopedRoot, 'apple-design', 'SKILL.md')
  write(file, '---\nname: apple-design\ndescription: Apple design\ndisable-model-invocation: true\n---\nInstructions\n')
  const manager = createSkillsManager(scopedRoot), events = new Map(), scoped = new Map()
  let globalProvider
  const native = { name: 'apple-design', path: file, provider: 'filesystem', invocation: { userInvocable: true, modelInvocable: false } }
  const registry = {
    registerProvider(factory) { globalProvider = factory({ invalidate() {} }); return () => {} },
    async list(options = {}) {
      const globals = await globalProvider.list()
      if (!options.scope) return globals
      // A preset contribution replaces the global winner before rank matters.
      const local = await scoped.get(options.scope)?.list() || []
      return local.length ? local : [native]
    },
  }
  const agent = () => {
    const value = { session: { header: { cwd: fixture } } }
    value.ctx = { skills: { registerProvider(factory) {
      scoped.set(value, factory({ invalidate() {} }))
      return () => { scoped.delete(value) }
    } } }
    return value
  }
  const first = agent(), future = agent()
  const ctx = { agents: { list: () => [first] }, on(name, callback) { events.set(name, callback); return () => events.delete(name) } }
  const dispose = manager.attach(registry)
  let disposeAgents
  try {
    const item = (await manager.list())[0]
    await manager.toggle(item.id, false)
    assert.equal((await registry.list({ scope: first }))[0].invocation.userInvocable, true)
    disposeAgents = manager.attachAgents(ctx)
    assert.deepEqual((await registry.list({ scope: first }))[0].invocation, { userInvocable: false, modelInvocable: false })
    assert.equal((await manager.list())[0].enabled, false)
    assert.equal((await manager.list())[0].verifiedViews, 2)
    events.get('agent/created')({ agent: future })
    assert.deepEqual((await registry.list({ scope: future }))[0].invocation, { userInvocable: false, modelInvocable: false })
    const futureProvider = scoped.get(future)
    scoped.delete(future)
    const inconsistent = (await manager.list())[0]
    assert.equal(inconsistent.enabled, true)
    assert.match(inconsistent.statusMessage, /尚未在所有会话中生效/)
    scoped.set(future, futureProvider)
    await manager.toggle(item.id, true)
    for (const value of [first, future]) {
      const restored = (await registry.list({ scope: value }))[0]
      assert.equal(restored.provider, 'filesystem')
      assert.deepEqual(restored.invocation, native.invocation)
    }
    // A stale or overridden session must be reported and prevent false success.
    scoped.delete(future)
    await assert.rejects(manager.toggle(item.id, false), /已恢复原状态/)
    assert.equal((await manager.list())[0].enabled, true)
    events.get('agent/disposed')({ agent: future })
    events.get('agent/disposed')({ agent: first })
    assert.equal(scoped.size, 0)
  } finally {
    await disposeAgents?.(); dispose()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('a duplicated metadata block is stripped from the rendered body', () => {
  // Template copies that were never removed put a second `--- name: … ---`
  // above the real one. Only the first block was cut, so the copy rendered as
  // a stray table at the top of the detail page. The body now starts after the
  // last leading block, and a `---` rule further down stays content.
  const root = mkdtempSync(join(tmpdir(), 'hub-skills-fm-'))
  try {
    const doubled = join(root, 'doubled', 'SKILL.md')
    write(doubled, [
      '---',
      'name: "doubled-template"',
      'description: "Header that was left behind"',
      '---',
      '',
      '---',
      'name: doubled',
      'description: Real description',
      '---',
      '',
      '# Doubled',
      '',
      'Body text.',
      '',
      '---',
      '',
      '| Intent | Skill |',
      '| --- | --- |',
      '| Offer | salary |',
      '',
    ].join('\n'))
    // The card is named by the real block's `name`; the leftover template
    // header above it must not decide the entry's identity either.
    const found = discoverSkills(root)[0]
    assert.equal(found.error, '')
    assert.equal(found.description, 'Real description')
    assert.equal(found.content.trimStart().startsWith('---'), false)
    assert.equal(found.content.trimStart().startsWith('# Doubled'), true)
    // The table below the page's own rule survives untouched.
    assert.match(found.content, /\|\s*Intent\s*\|\s*Skill\s*\|/)
    // A CRLF file takes the same path.
    const crlf = join(root, 'crlf', 'SKILL.md')
    write(crlf, '---\r\nname: "old"\r\ndescription: "old"\r\n---\r\n\r\n---\r\nname: crlf\r\ndescription: CRLF body\r\n---\r\n\r\n# CRLF\r\n')
    const line = discoverSkills(root).find(item => item.name === 'crlf')
    assert.equal(line.description, 'CRLF body')
    assert.equal(line.content.trimStart().startsWith('# CRLF'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
