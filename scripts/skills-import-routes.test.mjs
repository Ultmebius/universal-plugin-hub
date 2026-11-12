import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { mountRoutes } from '../src/routes.js'
import { createSkillsManager } from '../src/skills.js'
import { dshSkillsDir, readState, writeState } from '../src/store.js'

const temp = mkdtempSync(join(tmpdir(), 'hub-import-routes-'))
process.env.DSH_HOME = join(temp, 'dsh')
process.env.DSH_AGENTS_HOME = join(temp, 'native-agents')
const agentsRoot = join(process.env.DSH_AGENTS_HOME, 'skills')

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function manifest(name, body) {
  return ['---', `name: ${name}`, 'description: d', '---', body, ''].join('\n')
}

function reset() {
  rmSync(dshSkillsDir(), { recursive: true, force: true })
  rmSync(agentsRoot, { recursive: true, force: true })
  writeState({ ...readState(), uploadedSkills: [] })
}

let handler
function mount() {
  const manager = createSkillsManager()
  mountRoutes({ register(route) { handler = route.handler } }, manager)
  return manager
}

async function post(path, body) {
  const req = Readable.from([JSON.stringify(body)])
  Object.assign(req, { method: 'POST', url: '/universal-plugin-hub/api' + path, headers: {} })
  const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
  await handler(req, res)
  return res
}

test('inspect 不透出临时解压目录，也不把它留在磁盘上', async () => {
  reset()
  mount()
  const pack = join(temp, 'inspect-pack')
  write(join(pack, 'skill-a', 'SKILL.md'), manifest('skill-a', 'A'))

  const res = await post('/plugins/local/inspect', { path: pack })
  assert.equal(res.status, 200)
  assert.equal(res.body.kind, 'skills')
  assert.equal(res.body.tempExtractDir, undefined, '服务端路径不该进响应')
  assert.equal(res.body.effectiveDir, undefined)
  assert.equal(res.body.entries, undefined)
  assert.ok(res.body.plugin?.name, '预览仍要有插件信息')
})

test('inspect 解压出的临时目录会被清理', async () => {
  reset()
  mount()
  const { default: AdmZip } = await import('adm-zip').catch(() => ({ default: null }))
  if (!AdmZip) return // 打包器不可用时跳过：这条路已由上面的响应裁剪覆盖

  const zipPath = join(temp, 'preview.zip')
  const zip = new AdmZip()
  zip.addFile('skill-a/SKILL.md', Buffer.from(manifest('skill-a', 'A')))
  zip.writeZip(zipPath)

  const before = readdirSync(tmpdir()).filter((name) => name.startsWith('inspect-'))
  await post('/plugins/local/inspect', { path: zipPath })
  const after = readdirSync(tmpdir()).filter((name) => name.startsWith('inspect-'))
  assert.equal(after.length, before.length, '预览结束后不该多出解压目录')
})

test('overwriteNames 通过路由生效：只替换被点名的成员', async () => {
  reset()
  mount()
  write(join(agentsRoot, 'skill-b', 'SKILL.md'), manifest('skill-b', 'B-OLD'))
  write(join(dshSkillsDir(), 'skill-c', 'SKILL.md'), manifest('skill-c', 'C-OLD'))

  const pack = join(temp, 'partial-pack')
  write(join(pack, 'skill-b', 'SKILL.md'), manifest('skill-b', 'B-NEW'))
  write(join(pack, 'skill-c', 'SKILL.md'), manifest('skill-c', 'C-NEW'))

  // 只有 skill-b 被点名；skill-c 同名但没被同意，整包必须被拒而不是顺手覆盖。
  const refused = await post('/skills/import', { path: pack, overwrite: true, overwriteNames: ['skill-b'] })
  assert.equal(refused.status, 500)
  assert.match(String(refused.body.error), /skill-c/)
  assert.match(readFileSync(join(dshSkillsDir(), 'skill-c', 'SKILL.md'), 'utf8'), /C-OLD/)

  // 点名全部冲突项时才放行，且两份都换成上传的。
  const accepted = await post('/skills/import', { path: pack, overwrite: true, overwriteNames: ['skill-b', 'skill-c'] })
  assert.equal(accepted.status, 200)
  assert.match(readFileSync(join(dshSkillsDir(), 'skill-b', 'SKILL.md'), 'utf8'), /B-NEW/)
  assert.match(readFileSync(join(dshSkillsDir(), 'skill-c', 'SKILL.md'), 'utf8'), /C-NEW/)
})

test('覆盖用户自有技能后第二个条目失败，新副本必须留下', async () => {
  const { installUploadedSkills } = await import('../src/skill-uploads.js')
  reset()
  write(join(dshSkillsDir(), 'skill-a', 'SKILL.md'), manifest('skill-a', 'USER-OWN'))

  const first = join(temp, 'rollback', 'skill-a')
  write(join(first, 'SKILL.md'), manifest('skill-a', 'Uploaded'))
  // 第二个条目把 manifest 报在 file 上、目录却不存在：预检读得到 manifest 因而放行，
  // 复制时才炸——正是预检覆盖不到的那类失败，第一个条目此时已经覆盖完毕。
  const orphanManifest = join(temp, 'rollback-manifests', 'SKILL.md')
  write(orphanManifest, manifest('skill-z', 'Z'))
  const second = { dir: join(temp, 'rollback', 'missing'), file: orphanManifest, row: { name: 'skill-z' } }

  const entries = [{ dir: first, row: { name: 'skill-a' } }, second]
  assert.throws(() => installUploadedSkills(entries, { overwrite: true }))

  assert.ok(
    existsSync(join(dshSkillsDir(), 'skill-a', 'SKILL.md')),
    '用户原文件已被覆盖删除，新副本绝不能再被回滚删掉，否则这个技能彻底消失',
  )
  assert.match(readFileSync(join(dshSkillsDir(), 'skill-a', 'SKILL.md'), 'utf8'), /Uploaded/)
})
