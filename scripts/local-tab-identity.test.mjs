import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const root = mkdtempSync(join(tmpdir(), 'hub-tab-identity-'))
process.env.DSH_HOME = join(root, 'dsh')

const { inspectLocalPlugin, importLocalPlugin, importLocalMarketplace, removeDuplicateLocalMarketTabs } = await import('../src/local.js')
const { readState, writeState, sourceCacheDir } = await import('../src/store.js')
const { readMarketplace } = await import('../src/parser.js')

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content))
}

function plugin(dir, name, version = '1.0.0') {
  write(join(dir, '.claude-plugin', 'plugin.json'), { name, version, description: `Plugin ${name}` })
  write(join(dir, 'skills', `${name}-skill`, 'SKILL.md'), `---\nname: ${name}-skill\ndescription: Skill\n---\nBody\n`)
}

function marketplace(dir, name) {
  write(join(dir, '.claude-plugin', 'marketplace.json'), {
    name,
    owner: { name: 'Test Owner' },
    plugins: [{ name, source: './', version: '4.0.541', description: `Marketplace ${name}` }],
  })
  write(join(dir, '.claude-plugin', 'plugin.json'), { name, version: '4.0.541', description: `Marketplace ${name}` })
  write(join(dir, 'skills', `${name}-skill`, 'SKILL.md'), `---\nname: ${name}-skill\ndescription: Skill\n---\nBody\n`)
}

test('本地标签复用', async (t) => {
  await t.test('每个导入结果都带上被复用/新建的本地标签 id', async () => {
    const first = join(root, 'first-plugin')
    plugin(first, 'reuse-first')
    const res = await importLocalPlugin({ path: first, sourceName: '我的插件' })
    assert.equal(res.sourceId, 'local')
    const state = readState()
    assert.equal(state.sources.filter((s) => s.id === 'local').length, 1)
    assert.equal(state.sources.find((s) => s.id === 'local').name, '我的插件')
  })

  await t.test('之后的上传不再改名、也不新建标签', async () => {
    const second = join(root, 'second-plugin')
    plugin(second, 'reuse-second')
    // 一个过期的名字被传进来也不能改变既有标签：命名只发生在第一次。
    const res = await importLocalPlugin({ path: second, sourceName: 'Local Plugins' })
    assert.equal(res.sourceId, 'local')
    const state = readState()
    assert.equal(state.sources.filter((s) => s.id === 'local').length, 1)
    assert.equal(state.sources.find((s) => s.id === 'local').name, '我的插件')
  })
})

test('inspect 报告本地标签是否已命名，前端据此决定要不要问', async () => {
  const fresh = join(root, 'probe-fresh')
  plugin(fresh, 'probe-fresh')
  assert.equal((await inspectLocalPlugin(fresh)).localTabName, '我的插件', '已有标签时返回它的名字')

  const state = readState()
  const saved = state.sources.find((s) => s.id === 'local')
  state.sources = state.sources.filter((s) => s.id !== 'local')
  writeState(state)
  try {
    const dir = join(root, 'probe-unnamed')
    plugin(dir, 'probe-unnamed')
    assert.equal((await inspectLocalPlugin(dir)).localTabName, '', '没有标签时返回空串')
  } finally {
    const restore = readState()
    restore.sources.push(saved)
    writeState(restore)
  }
})

test('市场包命名', async (t) => {
  await t.test('inspect 为市场包给出由 manifest name 派生的推荐名', async () => {
    const dir = join(root, 'remotion-pack')
    marketplace(dir, 'remotion')
    const res = await inspectLocalPlugin(dir)
    assert.equal(res.ok, true)
    assert.equal(res.kind, 'marketplace')
    assert.equal(res.suggestedName, 'Remotion')
  })

  await t.test('用户自定义名成为新标签的显示名', async () => {
    const dir = join(root, 'custom-market')
    marketplace(dir, 'custom-market')
    const res = await importLocalMarketplace(dir, { sourceName: '我的市场' })
    assert.equal(res.ok, true)
    const state = readState()
    assert.equal(state.sources.find((s) => s.id === res.sourceId).name, '我的市场')
  })

  await t.test('不传名字时用 manifest 的 name 作为标签名', async () => {
    const dir = join(root, 'default-name-market')
    marketplace(dir, 'default-name-market')
    const res = await importLocalMarketplace(dir, {})
    assert.equal(readState().sources.find((s) => s.id === res.sourceId).name, 'Default name market')
  })

  await t.test('重名被拒绝，且不留下半成品标签', async () => {
    const before = readState().sources.length
    // '我的插件' 已是 local 标签的显示名。
    const dir = join(root, 'clash-market')
    marketplace(dir, 'clash-market')
    await assert.rejects(
      () => importLocalMarketplace(dir, { sourceName: '我的插件' }),
      /重名|已存在/,
    )
    assert.equal(readState().sources.length, before)

    // 与另一个市场标签重名同样拒绝。
    const dir2 = join(root, 'clash-market-2')
    marketplace(dir2, 'clash-market-2')
    await assert.rejects(
      () => importLocalMarketplace(dir2, { sourceName: '我的市场' }),
      /重名|已存在/,
    )
    assert.equal(readState().sources.length, before)

    // 市场标签不能占用本地标签的名字：否则又会出现两个同名标签。
    const localTabName = readState().sources.find((s) => s.id === 'local').name
    const dir3 = join(root, 'clash-market-3')
    marketplace(dir3, 'clash-market-3')
    await assert.rejects(
      () => importLocalMarketplace(dir3, { sourceName: localTabName }),
      /重名|已存在/,
    )
    assert.equal(readState().sources.length, before)
  })
})

test('历史同名标签清理：删掉重复的市场标签，绝不把市场摊平成插件', async (t) => {
  await t.test('与本地标签同名的上传市场标签被删除，缓存一并清走', async () => {
    const state = readState()
    // 前面的用例会给 local 改过名，这里以它当时的名字为准。
    const localName = state.sources.find((s) => s.id === 'local').name
    state.sources = state.sources.filter((s) => s.id !== 'local-remotion')
    state.sources.push({ id: 'local-remotion', name: localName, url: 'local-market://local-remotion', addedAt: Date.now() })
    state.tabOrder = ['anthropic', 'local', 'local-remotion']
    writeState(state)
    write(join(sourceCacheDir('local-remotion'), '.claude-plugin', 'marketplace.json'), { name: 'remotion', plugins: [{ name: 'remotion', source: './' }] })
    write(join(sourceCacheDir('local-remotion'), 'skills', 'x', 'SKILL.md'), '---\nname: x\ndescription: d\n---\nBody\n')

    const result = removeDuplicateLocalMarketTabs()
    assert.deepEqual(result.removed, ['local-remotion'])

    const after = readState()
    assert.equal(after.sources.some((s) => s.id === 'local-remotion'), false)
    assert.equal(existsSync(sourceCacheDir('local-remotion')), false, '缓存必须清走')
    assert.equal(after.tabOrder.includes('local-remotion'), false)
    // 关键：绝不能出现在 local 的插件列表里——它是市场，不是插件。
    assert.equal(existsSync(join(sourceCacheDir('local'), 'remotion')), false, '市场不能被摊平成插件')
    assert.equal(readMarketplace('local').some((row) => row.name === 'remotion'), false)
  })

  await t.test('幂等：再跑一次什么都不做', async () => {
    const before = JSON.stringify(readState())
    assert.deepEqual(removeDuplicateLocalMarketTabs().removed, [])
    assert.equal(JSON.stringify(readState()), before)
  })

  await t.test('名字只是相近的市场标签不删', async () => {
    for (const name of ['local ABC', '本地插件 2', 'ABC local']) {
      const dir = join(root, `keep-${Buffer.from(name).toString('hex')}`)
      marketplace(dir, `keep-${Buffer.from(name).toString('hex')}`)
      const res = await importLocalMarketplace(dir, { sourceName: name })
      const before = JSON.stringify(readState())
      assert.deepEqual(removeDuplicateLocalMarketTabs().removed, [], `「${name}」不该被删`)
      assert.equal(JSON.stringify(readState()), before)
      assert.equal(existsSync(sourceCacheDir(res.sourceId)), true)
    }
  })

  await t.test('市场里还有已安装插件时不删，交给用户自己决定', async () => {
    const state = readState()
    const localName = state.sources.find((s) => s.id === 'local').name
    state.sources.push({ id: 'local-busy', name: localName, url: 'local-market://local-busy', addedAt: Date.now() })
    state.plugins.push({ id: 'local-busy/busyplugin', sourceId: 'local-busy', name: 'busyplugin', enabled: true, installedAt: Date.now() })
    writeState(state)
    write(join(sourceCacheDir('local-busy'), '.claude-plugin', 'marketplace.json'), { name: 'busy', plugins: [{ name: 'busyplugin', source: './' }] })

    const result = removeDuplicateLocalMarketTabs()
    assert.deepEqual(result.removed, [])
    assert.deepEqual(result.kept, ['local-busy'])
    assert.ok(readState().sources.some((s) => s.id === 'local-busy'), '不能悄悄删掉有安装记录的标签')
  })

  await t.test('不是上传市场的源一律不碰', async () => {
    const state = readState()
    const localName = state.sources.find((s) => s.id === 'local').name
    state.sources.push({ id: 'git-same-name', name: localName, url: 'https://github.com/x/y.git', addedAt: Date.now() })
    writeState(state)
    const before = JSON.stringify(readState())
    assert.deepEqual(removeDuplicateLocalMarketTabs().removed, [])
    assert.equal(JSON.stringify(readState()), before)
    assert.equal(before.includes('git-same-name'), true)
  })
})

test('市场标签重名判定：只拦完全相同的名字', async (t) => {
  await t.test('大小写不同可以共存', async () => {
    const dir = join(root, 'case-market')
    marketplace(dir, 'case-market')
    await importLocalMarketplace(dir, { sourceName: 'Video Tools' })
    const dir2 = join(root, 'case-market-2')
    marketplace(dir2, 'case-market-2')
    const res = await importLocalMarketplace(dir2, { sourceName: 'VIDEO TOOLS' })
    assert.equal(readState().sources.find((s) => s.id === res.sourceId).name, 'VIDEO TOOLS')
  })

  await t.test('完全相同的名字仍然拒绝', async () => {
    const dir = join(root, 'exact-market')
    marketplace(dir, 'exact-market')
    await assert.rejects(
      () => importLocalMarketplace(dir, { sourceName: 'Video Tools' }),
      /已存在/,
    )
  })

  await t.test('覆盖更新不会把用户起的名字冲掉', async () => {
    const dir = join(root, 'keep-name-market')
    marketplace(dir, 'keep-name-market')
    const first = await importLocalMarketplace(dir, { sourceName: '我的视频工具' })
    await importLocalMarketplace(dir, { overwrite: true })
    assert.equal(readState().sources.find((s) => s.id === first.sourceId).name, '我的视频工具')
  })

  await t.test('同一个市场重导入时可以改成新名字', async () => {
    const dir = join(root, 'rename-market')
    marketplace(dir, 'rename-market')
    const first = await importLocalMarketplace(dir, { sourceName: '旧名字' })
    const again = await importLocalMarketplace(dir, { sourceName: '新名字', overwrite: true })
    assert.equal(again.sourceId, first.sourceId)
    assert.equal(readState().sources.find((s) => s.id === first.sourceId).name, '新名字')
  })
})
