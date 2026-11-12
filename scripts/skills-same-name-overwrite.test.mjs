import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const temp = mkdtempSync(join(tmpdir(), 'hub-same-name-'))
process.env.DSH_HOME = join(temp, 'dsh')
process.env.DSH_AGENTS_HOME = join(temp, 'agents')

const { createSkillsManager } = await import('../src/skills.js')
const { installUploadedSkills, takenSkillNames } = await import('../src/skill-uploads.js')
const { inspectLocalPlugin } = await import('../src/local.js')
const { dshSkillsDir, readState, writeState } = await import('../src/store.js')

const agentsRoot = join(process.env.DSH_AGENTS_HOME, 'skills')

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content))
}

function manifest(name, description, body) {
  return ['---', `name: ${name}`, `description: ${description}`, '---', body, ''].join('\n')
}

function reset() {
  rmSync(dshSkillsDir(), { recursive: true, force: true })
  rmSync(agentsRoot, { recursive: true, force: true })
  // Records outlive the files they point at, so a later test would inherit
  // the names an earlier one imported.
  writeState({ ...readState(), uploadedSkills: [] })
}

test('同名技能：DSH 目录优先，覆盖后一张卡片', async (t) => {
  await t.test('agents 里已有同名时，上传先报告名字被占用', () => {
    reset()
    write(join(agentsRoot, 'skill-a', 'SKILL.md'), manifest('skill-a', 'Mine', 'My body'))
    assert.equal(takenSkillNames().has('skill-a'), true, '要先提示，让用户选覆盖或取消')

    const src = join(temp, 'up-x', 'skill-a')
    write(join(src, 'SKILL.md'), manifest('skill-a', 'Uploaded', 'Uploaded body'))
    assert.throws(
      () => installUploadedSkills([{ dir: src, row: { name: 'skill-a', description: 'Uploaded' } }], {}),
      /已存在/,
    )
  })

  await t.test('覆盖后 DSH 目录生效，agents 那份保留但不再干扰，只剩一张卡片', () => {
    reset()
    write(join(agentsRoot, 'skill-a', 'SKILL.md'), manifest('skill-a', 'Mine', 'My body'))

    const src = join(temp, 'up-1', 'skill-a')
    write(join(src, 'SKILL.md'), manifest('skill-a', 'Uploaded', 'Uploaded body'))
    installUploadedSkills([{ dir: src, row: { name: 'skill-a', description: 'Uploaded' } }], { overwrite: true })

    assert.match(readFileSync(join(dshSkillsDir(), 'skill-a', 'SKILL.md'), 'utf8'), /Uploaded body/)
    assert.ok(existsSync(join(agentsRoot, 'skill-a', 'SKILL.md')), 'agents 那份不该被删')

    const manager = createSkillsManager()
    manager.refresh()
    const entries = manager.entries()
    assert.equal(entries.length, 1, '同名只应有一张卡片')
    assert.match(entries[0].path, /dsh/, '生效的是 DSH 目录那份')
    assert.equal(entries[0].locations.length, 2, '两份都被这张卡片覆盖，切一次全生效')
    assert.equal(entries[0].uploaded, true)
  })
})

test('冲突检测按 frontmatter 的 name 判断，不看目录名', async (t) => {
  await t.test('目录名与命令名不同时，认命令名', () => {
    reset()
    write(join(agentsRoot, 'disk-name', 'SKILL.md'), manifest('real-name', 'd', 'B'))
    assert.equal(takenSkillNames().has('real-name'), true, 'frontmatter 的 name 才是命令名')
    assert.equal(takenSkillNames().has('disk-name'), false, '目录名不是命令名')
  })

  await t.test('小写 skill.md 与平铺 <name>.md 都算', () => {
    reset()
    write(join(agentsRoot, 'lower-case', 'skill.md'), manifest('lower-case', 'd', 'B'))
    write(join(agentsRoot, 'flat-one.md'), manifest('flat-one', 'd', 'B'))
    assert.equal(takenSkillNames().has('lower-case'), true)
    assert.equal(takenSkillNames().has('flat-one'), true)
  })
})

test('覆盖更新自己的市场标签时，不会被 manifest 名误判为重名', async () => {
  const { importLocalMarketplace } = await import('../src/local.js')
  const { readState, writeState } = await import('../src/store.js')

  const market = (dirName, marketName) => {
    const dir = join(temp, dirName)
    write(join(dir, '.claude-plugin', 'marketplace.json'), { name: marketName, plugins: [{ name: marketName, source: './' }] })
    write(join(dir, '.claude-plugin', 'plugin.json'), { name: marketName, version: '1' })
    write(join(dir, 'skills', 's', 'SKILL.md'), manifest('s', 'd', 'B'))
    return dir
  }

  const first = await importLocalMarketplace(market('mk-a', 'remotion'), { sourceName: '我的工具' })
  assert.equal(readState().sources.find((s) => s.id === first.sourceId).name, '我的工具')

  // 另一个源恰好叫 manifest 名
  const state = readState()
  state.sources.push({ id: 'other', name: 'Remotion', url: 'https://x/y.git', addedAt: Date.now() })
  writeState(state)

  // 覆盖更新不该被自己的 manifest 名挡住
  await importLocalMarketplace(market('mk-a', 'remotion'), { overwrite: true })
  assert.equal(readState().sources.find((s) => s.id === first.sourceId).name, '我的工具', '覆盖后名字保持不变')
})

test('技能集合包：冲突检测覆盖每个成员，而不是包名', async () => {
  reset()
  write(join(agentsRoot, 'skill-b', 'SKILL.md'), manifest('skill-b', 'd', 'B'))

  const pack = join(temp, 'collect-pack')
  write(join(pack, 'skill-a', 'SKILL.md'), manifest('skill-a', 'd', 'A'))
  write(join(pack, 'skill-b', 'SKILL.md'), manifest('skill-b', 'd', 'B2'))

  const inspected = await inspectLocalPlugin(pack)
  assert.equal(inspected.kind, 'skills')
  assert.deepEqual(inspected.takenSkillNames, ['skill-b'], '要报出真正冲突的成员名')
  assert.equal(inspected.plugin.name, 'collect-pack', '聚合行仍是包名，不能用它做冲突判断')
})

test('只覆盖冲突的那一项，不误伤同包的其他技能', async () => {
  const { readFileSync: read } = await import('node:fs')
  reset()
  write(join(agentsRoot, 'skill-b', 'SKILL.md'), manifest('skill-b', 'd', 'B'))
  // skill-c 已存在于 DSH 根，但不属于冲突集合
  write(join(dshSkillsDir(), 'skill-c', 'SKILL.md'), manifest('skill-c', 'd', 'C-OLD'))

  const pack = join(temp, 'partial-pack')
  write(join(pack, 'skill-b', 'SKILL.md'), manifest('skill-b', 'd', 'B-NEW'))
  write(join(pack, 'skill-c', 'SKILL.md'), manifest('skill-c', 'd', 'C-NEW'))

  installUploadedSkills(
    [{ dir: join(pack, 'skill-b'), row: { name: 'skill-b' } }],
    { overwriteNames: ['skill-b'] },
  )
  const dsh = read(join(dshSkillsDir(), 'skill-c', 'SKILL.md'), 'utf8')
  assert.match(dsh, /C-OLD/, '未被指定的同名技能不该被替换')
})

test('覆盖会替换用户自己放进 DSH 根的同名技能', async () => {
  const { readFileSync: read } = await import('node:fs')
  reset()
  write(join(dshSkillsDir(), 'skill-a', 'SKILL.md'), manifest('skill-a', 'd', 'USER-OWN'))

  const src = join(temp, 'up-user', 'skill-a')
  write(join(src, 'SKILL.md'), manifest('skill-a', 'd', 'Uploaded'))

  // 不带覆盖先被拒绝
  assert.throws(
    () => installUploadedSkills([{ dir: src, row: { name: 'skill-a' } }], {}),
    /已存在|为避免覆盖/,
  )

  // 明确覆盖后成功，且内容换成了上传的
  installUploadedSkills([{ dir: src, row: { name: 'skill-a' } }], { overwrite: true })
  assert.match(read(join(dshSkillsDir(), 'skill-a', 'SKILL.md'), 'utf8'), /Uploaded/)
})

test('覆盖另一种形态时，旧的形态不能留下变成第二张卡片', async (t) => {
  const { readFileSync: read, existsSync: exists } = await import('node:fs')
  const { createSkillsManager } = await import('../src/skills.js')

  const cards = (name) => {
    const manager = createSkillsManager()
    manager.refresh()
    return manager.entries().filter((entry) => entry.name === name)
  }

  await t.test('目录技能被同名的裸 SKILL.md 覆盖', () => {
    reset()
    write(join(dshSkillsDir(), 'skill-a', 'SKILL.md'), manifest('skill-a', 'd', 'USER-DIR'))
    const src = join(temp, 'up-shape-file', 'skill-a')
    write(join(src, 'SKILL.md'), manifest('skill-a', 'd', 'Uploaded flat'))

    installUploadedSkills([{ dir: src, row: { name: 'skill-a' } }], { overwrite: true, singleFile: true })

    assert.equal(exists(join(dshSkillsDir(), 'skill-a')), false, '旧目录要被清掉')
    assert.match(read(join(dshSkillsDir(), 'skill-a.md'), 'utf8'), /Uploaded flat/)
    assert.equal(cards('skill-a').length, 1, '同名只能剩一张卡片')
  })

  await t.test('单文件技能被同名的目录技能覆盖', () => {
    reset()
    write(join(dshSkillsDir(), 'skill-b.md'), manifest('skill-b', 'd', 'USER-FILE'))
    const src = join(temp, 'up-shape-dir', 'skill-b')
    write(join(src, 'SKILL.md'), manifest('skill-b', 'd', 'Uploaded dir'))

    installUploadedSkills([{ dir: src, row: { name: 'skill-b' } }], { overwrite: true })

    assert.equal(exists(join(dshSkillsDir(), 'skill-b.md')), false, '旧的 <name>.md 要被清掉')
    assert.match(read(join(dshSkillsDir(), 'skill-b', 'SKILL.md'), 'utf8'), /Uploaded dir/)
    assert.equal(cards('skill-b').length, 1, '同名只能剩一张卡片')
  })
})

test('junction 暴露的技能同样算作已占用', () => {
  reset()
  const hidden = join(temp, 'elsewhere', 'skill-j')
  write(join(hidden, 'SKILL.md'), manifest('skill-j', 'd', 'J'))
  mkdirSync(agentsRoot, { recursive: true })
  symlinkSync(hidden, join(agentsRoot, 'skill-j'), 'junction')

  assert.equal(takenSkillNames().has('skill-j'), true, '标签页看得见的技能，上传时也要看得见')
})

test('插件镜像的同名技能不算占用，避免覆盖后插件永久丢掉自己的技能', async () => {
  const { installedDir } = await import('../src/store.js')
  reset()
  const body = manifest('plugin-skill', 'd', 'From plugin')
  write(join(installedDir('demo-plugin'), 'skills', 'plugin-skill', 'SKILL.md'), body)
  write(join(dshSkillsDir(), 'plugin-skill', 'SKILL.md'), body)
  writeState({ ...readState(), plugins: [{ name: 'demo-plugin', sourceId: 'local', enabled: true }] })

  assert.equal(
    takenSkillNames().has('plugin-skill'), false,
    'Skills 标签里本就隐藏它，报成占用等于让用户永久踢掉插件的技能',
  )

  // 用户自己改过的同名目录不是镜像，仍要算占用。
  write(join(dshSkillsDir(), 'plugin-skill', 'SKILL.md'), manifest('plugin-skill', 'd', 'Edited by user'))
  assert.equal(takenSkillNames().has('plugin-skill'), true)
})

