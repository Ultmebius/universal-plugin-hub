import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'

const temp = mkdtempSync(join(tmpdir(), 'hub-empty-skills-'))
process.env.DSH_HOME = join(temp, 'dsh')
process.env.DSH_AGENTS_HOME = join(temp, 'agents')

const { createSkillsManager } = await import('../src/skills.js')
const { mountRoutes } = await import('../src/routes.js')
const { dshSkillsDir } = await import('../src/store.js')

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

test('一台什么 Skills 都没有的机器，上传一个 Skill 后就出现 Skills 标签页', async () => {
  try {
    const manager = createSkillsManager()
    let handler
    mountRoutes({ register(route) { handler = route.handler } }, manager)

    const call = async (method, path, body) => {
      const req = Readable.from([JSON.stringify(body ?? {})])
      Object.assign(req, { method, url: '/universal-plugin-hub/api' + path, headers: {} })
      const res = { writeHead(status) { this.status = status }, end(payload) { this.body = JSON.parse(payload) } }
      await handler(req, res)
      return { status: res.status, body: res.body }
    }

    // 前提：确实什么都没有
    assert.equal(manager.entries().length, 0)
    const before = await call('GET', '/state')
    assert.equal(before.body.sources.some((s) => s.id === 'skills-local'), false, '空机器上不该有 Skills 标签')

    // 上传一个 Skill
    const src = join(temp, 'upload', 'my-skill')
    write(join(src, 'SKILL.md'), '---\nname: my-skill\ndescription: Uploaded skill\n---\nBody\n')
    const imported = await call('POST', '/skills/import', { path: src })
    assert.equal(imported.status, 200)
    assert.equal(imported.body.kind, 'skills')

    // 导入后刷新，标签出现
    manager.refresh()
    const after = await call('GET', '/state')
    assert.ok(after.body.sources.some((s) => s.id === 'skills-local'), '上传后应出现 Skills 标签')
    assert.ok(manager.entries().some((s) => s.name === 'my-skill'))
    assert.ok(dshSkillsDir().length > 0)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
