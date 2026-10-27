import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { createSkillsManager, discoverSkills } from '../src/skills.js'
import { installedDir, writeState } from '../src/store.js'
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
    const nested = add('collection/nested', 'nested', 'user-invocable: false\n')
    add('broken', 'bad name')
    write(join(root, 'collection/nested/scripts/run.py'), 'print("hello")')
    write(join(root, 'collection/nested/agents/worker.md'), 'Agent instructions')
    try { symlinkSync(join(root, 'native'), join(root, 'alias'), 'junction') } catch {}
    const discovered = discoverSkills(root)
    assert.equal(discovered.filter(s => s.name === 'native').length, 1)
    assert.equal(discovered.find(s => s.name === 'nested').nested, true)
    assert.ok(discovered.find(s => s.name === 'bad name').error)
    const original = readFileSync(native, 'utf8')

    let provider, foreignCandidate = null, ignoreOverride = false
    const registry = {
      registerProvider(factory) { provider = factory({ invalidate() {} }); return () => {} },
      async list() {
        const candidates = [
          { name: 'native', path: native, invocation: { modelInvocable: true, userInvocable: true }, rank: 500 },
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
    const second = items.find(s => s.name === 'nested')
    assert.equal(first.available, true)
    assert.equal(second.available, true)
    assert.equal(second.actualInvocation.userInvocable, false)
    const definition = await provider.get((await provider.list()).find(s => s.name === 'nested'))
    assert.equal(definition.resourceBase.path, dirname(nested))
    assert.match(definition.content, /Instructions for nested/)

    await manager.toggle(first.id, false)
    assert.equal(catalogChanges, 1)
    let active = (await registry.list()).find(s => s.name === 'native')
    assert.deepEqual(active.invocation, { modelInvocable: false, userInvocable: false })
    assert.equal((await registry.list()).filter(s => s.invocation.userInvocable).some(s => s.name === 'native'), false)
    assert.equal((await manager.list()).find(s => s.id === first.id).enabled, false)
    assert.equal(createSkillsManager(root).entries().find(s => s.id === first.id).enabled, false)
    await manager.toggle(first.id, true)
    assert.equal(catalogChanges, 2)
    active = (await registry.list()).find(s => s.name === 'native')
    assert.deepEqual(active.invocation, { modelInvocable: true, userInvocable: true })
    foreignCandidate = { name: 'native', path: join(temp, 'other', 'SKILL.md'), invocation: { modelInvocable: true, userInvocable: true }, rank: 400 }
    await assert.rejects(manager.toggle(first.id, false), /同名 Skill/)
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
    assert.equal((await registry.list()).find(s => s.name === 'nested').invocation.userInvocable, false)
    assert.equal(readFileSync(native, 'utf8'), original)
    const detail = manager.detail(second.id)
    assert.deepEqual(detail.files.map(f => f.path).sort(), ['agents/worker.md', 'scripts/run.py'])
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
