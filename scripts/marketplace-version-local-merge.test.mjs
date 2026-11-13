import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const root = mkdtempSync(join(tmpdir(), 'hub-mkt-merge-ver-'))
process.env.DSH_HOME = join(root, 'dsh')
process.env.HOME = join(root, 'home')
process.env.USERPROFILE = join(root, 'home')

const {
  inspectLocalPlugin,
  importLocalPlugin,
  importLocalMarketplace,
} = await import('../src/local.js')
const {
  readMarketplace,
  readPluginManifest,
  invalidateMarketplaceCache,
  invalidateParserCaches,
} = await import('../src/parser.js')
const { installPlugin, togglePlugin } = await import('../src/install.js')
const { readState, writeState, sourceCacheDir, installedDir, dshSkillsDir } = await import('../src/store.js')
const { readLocalIconCached } = await import('../src/icons.js')

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

function makeSkill(dir, skillName, body = 'Skill instructions') {
  write(join(dir, 'skills', skillName, 'SKILL.md'), `---\nname: ${skillName}\ndescription: ${skillName} desc\n---\n${body}\n`)
}

test('parser 与 inspectLocalPlugin 准确提取 Codex / Claude 市场与插件版本号且不编造缺失版本', async () => {
  const mkDir = join(root, 'codex-claude-version-mk')
  write(join(mkDir, '.agents', 'plugins', 'marketplace.json'), {
    name: 'Mixed Version Market',
    metadata: { version: '3.1.0' },
    plugins: [
      // 条目带 v 前缀 + 空白
      { name: 'entry-ver', source: { source: 'local', path: './plugins/entry-ver' }, version: ' v2.4.1 ' },
      // 条目 version 为空串，应由插件自己的 .codex-plugin/plugin.json 补位
      { name: 'codex-ver', source: { source: 'local', path: './plugins/codex-ver' }, version: '' },
      // .codex-plugin/plugin.json 未写 version，同目录 package.json 声明了 version
      { name: 'pkg-ver', source: { source: 'local', path: './plugins/pkg-ver' } },
      // 条目与 plugin.json 均未声明，继承 marketplace.metadata.version
      { name: 'mkt-inherited', source: { source: 'local', path: './plugins/mkt-inherited' } },
    ],
  })

  write(join(mkDir, 'plugins', 'entry-ver', '.claude-plugin', 'plugin.json'), { name: 'entry-ver' })
  makeSkill(join(mkDir, 'plugins', 'entry-ver'), 'entry-skill')

  write(join(mkDir, 'plugins', 'codex-ver', '.codex-plugin', 'plugin.json'), {
    name: 'codex-ver',
    extensions: { 'com.openai': { version: '1.8.0' } },
  })
  makeSkill(join(mkDir, 'plugins', 'codex-ver'), 'codex-skill')

  write(join(mkDir, 'plugins', 'pkg-ver', '.codex-plugin', 'plugin.json'), { name: 'pkg-ver' })
  write(join(mkDir, 'plugins', 'pkg-ver', 'package.json'), { name: 'pkg-ver', version: '0.9.3' })
  makeSkill(join(mkDir, 'plugins', 'pkg-ver'), 'pkg-skill')

  write(join(mkDir, 'plugins', 'mkt-inherited', '.claude-plugin', 'plugin.json'), { name: 'mkt-inherited' })
  makeSkill(join(mkDir, 'plugins', 'mkt-inherited'), 'inherited-skill')

  const inspected = await inspectLocalPlugin(mkDir)
  assert.equal(inspected.kind, 'marketplace')
  const byName = Object.fromEntries(inspected.plugins.map((p) => [p.name, p]))
  assert.equal(byName['entry-ver'].version, '2.4.1')
  assert.equal(byName['codex-ver'].version, '1.8.0')
  assert.equal(byName['pkg-ver'].version, '0.9.3')
  assert.equal(byName['mkt-inherited'].version, '3.1.0')

  // 完全未声明版本号的市场/插件保持 undefined，绝不编造 1.0.0
  const noVerMk = join(root, 'no-version-mk')
  write(join(noVerMk, '.claude-plugin', 'marketplace.json'), {
    name: 'No Version Market',
    plugins: [{ name: 'plain-one', source: './' }],
  })
  makeSkill(noVerMk, 'plain-skill')
  const noVerRes = await inspectLocalPlugin(noVerMk)
  assert.equal(noVerRes.plugins[0].version, undefined)
  assert.equal(readPluginManifest(join(mkDir, 'plugins', 'pkg-ver'))?.version, '0.9.3')
})

test('冲突判定分离：独立市场不与本地插件标签互相干扰，同时上报 localConflicts', async () => {
  // 先在本地插件标签中放入 alpha@1.0.0
  const localAlpha = join(root, 'seed-local-alpha')
  write(join(localAlpha, '.claude-plugin', 'plugin.json'), {
    name: 'alpha',
    displayName: 'Local Alpha',
    version: '1.0.0',
    description: 'existing local alpha',
  })
  makeSkill(localAlpha, 'alpha-v1')
  await importLocalPlugin({ path: localAlpha, sourceName: '本地插件' })

  // 扫描一个新市场 mk-mix（其中包含与 local 同名的 alpha@2.0.0，以及全新的 beta@1.2.0）
  const mkMix = join(root, 'mk-mix')
  write(join(mkMix, '.claude-plugin', 'marketplace.json'), {
    name: 'MK Mix',
    plugins: [
      { name: 'alpha', source: './plugins/alpha', version: '2.0.0', description: 'market alpha' },
      { name: 'beta', source: './plugins/beta', version: '1.2.0', description: 'market beta' },
    ],
  })
  write(join(mkMix, 'plugins', 'alpha', '.claude-plugin', 'plugin.json'), { name: 'alpha', version: '2.0.0' })
  makeSkill(join(mkMix, 'plugins', 'alpha'), 'alpha-v2')
  write(join(mkMix, 'plugins', 'beta', '.claude-plugin', 'plugin.json'), { name: 'beta', version: '1.2.0' })
  makeSkill(join(mkMix, 'plugins', 'beta'), 'beta-v1')

  // local-mk-mix 尚未添加，所以 exists 必须为 false，不能因 local 里有 alpha 而误跳覆盖界面
  const firstInspect = await inspectLocalPlugin(mkMix)
  assert.equal(firstInspect.kind, 'marketplace')
  assert.equal(firstInspect.exists, false, '独立市场尚不存在时，不得因 local 存在同名插件而触发覆盖确认')
  assert.equal(firstInspect.localTabName, '本地插件')
  assert.equal(firstInspect.localConflicts?.length, 1)
  assert.deepEqual(
    {
      name: firstInspect.localConflicts[0].name,
      existingVersion: firstInspect.localConflicts[0].existingVersion,
      newVersion: firstInspect.localConflicts[0].newVersion,
    },
    { name: 'alpha', existingVersion: '1.0.0', newVersion: '2.0.0' },
  )

  // 将 mk-mix 添加为独立市场，应直接成功且各自保留自己的 alpha
  const standaloneRes = await importLocalMarketplace(mkMix, { sourceName: 'MK Mix' })
  assert.equal(standaloneRes.sourceId, 'local-mk-mix')
  assert.equal(readMarketplace('local').find((r) => r.name === 'alpha')?.version, '1.0.0')
  assert.equal(readMarketplace('local-mk-mix').find((r) => r.name === 'alpha')?.version, '2.0.0')

  // 再次扫描 mk-mix，此时同名独立市场 local-mk-mix 已存在，应报 exists: true
  const secondInspect = await inspectLocalPlugin(mkMix)
  assert.equal(secondInspect.exists, true)
  assert.equal(secondInspect.existingVersion, '2.0.0')
})

test('支持将扫描出的市场合并到已有本地插件标签（不写根目录 marketplace.json、冲突必须确认覆盖）', async () => {
  // 无冲突场景：导入 mk-add（包含 delta@3.1.0 继承自 metadata，与无 plugin.json 仅靠 marketplace 条目声明的 epsilon@1.5.0）
  const mkAdd = join(root, 'mk-add')
  write(join(mkAdd, '.claude-plugin', 'marketplace.json'), {
    name: 'Add To Local',
    metadata: { version: '3.1.0', author: { name: 'Team' } },
    plugins: [
      { name: 'delta', source: './plugins/delta', description: 'Delta from manifest' },
      { name: 'epsilon', source: './plugins/epsilon', version: '1.5.0', description: 'Epsilon entry-only' },
    ],
  })
  write(join(mkAdd, 'plugins', 'delta', '.claude-plugin', 'plugin.json'), { name: 'delta' })
  makeSkill(join(mkAdd, 'plugins', 'delta'), 'delta-skill')
  // epsilon intentionally omits plugin.json to test metadata preservation
  makeSkill(join(mkAdd, 'plugins', 'epsilon'), 'epsilon-skill')

  const mergeRes = await importLocalMarketplace(mkAdd, { target: 'local', overwrite: false })
  assert.equal(mergeRes.sourceId, 'local')
  assert.equal(mergeRes.target, 'local')
  // 不应在 market/local 根目录写入 marketplace.json，避免遮蔽本地扁平目录扫描
  assert.equal(existsSync(join(sourceCacheDir('local'), 'marketplace.json')), false)
  assert.equal(existsSync(join(sourceCacheDir('local'), '.claude-plugin', 'marketplace.json')), false)

  const localRows = readMarketplace('local')
  assert.equal(localRows.find((r) => r.name === 'alpha')?.version, '1.0.0')
  assert.equal(localRows.find((r) => r.name === 'delta')?.version, '3.1.0')
  assert.equal(localRows.find((r) => r.name === 'epsilon')?.version, '1.5.0')
  assert.equal(readState().sources.some((s) => s.id === 'local-add-to-local'), false)

  // 根路径 source: './' 的单插件市场并入 local 时，也不得把父目录 marketplace.json 遗留在 local 根目录
  const singleRootMk = join(root, 'mk-single-root')
  write(join(singleRootMk, '.agents', 'plugins', 'marketplace.json'), {
    name: 'Single Root Market',
    plugins: [{ name: 'theta', source: { source: 'local', path: './' }, version: '4.2.0', description: 'Root plugin' }],
  })
  makeSkill(singleRootMk, 'theta-skill')
  await importLocalMarketplace(singleRootMk, { target: 'local', overwrite: false })
  const afterSingle = readMarketplace('local')
  assert.equal(afterSingle.find((r) => r.name === 'theta')?.version, '4.2.0')
  assert.equal(existsSync(join(sourceCacheDir('local'), 'theta', '.agents', 'plugins', 'marketplace.json')), false)

  // 有冲突场景：尝试不带 overwrite 把包含新版 delta@4.0.0 的市场并入 local，应拒绝
  const mkConflict = join(root, 'mk-conflict')
  write(join(mkConflict, '.claude-plugin', 'marketplace.json'), {
    name: 'Conflict Market',
    plugins: [{ name: 'delta', source: './', version: '4.0.0', description: 'Delta v4' }],
  })
  write(join(mkConflict, '.claude-plugin', 'plugin.json'), { name: 'delta', version: '4.0.0', description: 'Delta v4' })
  makeSkill(mkConflict, 'delta-new-skill')

  await assert.rejects(() => importLocalMarketplace(mkConflict, { target: 'local', overwrite: false }), /同名|已存在/)

  // 带 overwrite: true 应完全覆盖 delta 且保留 local 下其它插件
  await importLocalMarketplace(mkConflict, { target: 'local', overwrite: true })
  const afterOverwrite = readMarketplace('local')
  assert.equal(afterOverwrite.find((r) => r.name === 'delta')?.version, '4.0.0')
  assert.equal(afterOverwrite.find((r) => r.name === 'alpha')?.version, '1.0.0')
  assert.equal(afterOverwrite.find((r) => r.name === 'epsilon')?.version, '1.5.0')
})

test('覆盖更新彻底清理旧文件、失效缓存并同步刷新已安装插件（含禁用态保持、不误伤其他源）', async () => {
  // 1. 安装一个本地插件 zeta@1.0.0（含 legacy.txt 与 old-skill），以及另一个来源的独立插件 other-p@1.0.0
  const zetaV1 = join(root, 'zeta-v1')
  write(join(zetaV1, '.claude-plugin', 'plugin.json'), { name: 'zeta', version: '1.0.0', description: 'Zeta v1' })
  write(join(zetaV1, 'legacy.txt'), 'old file should be removed')
  write(join(zetaV1, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')
  makeSkill(zetaV1, 'zeta-old-skill', 'v1 body')
  await importLocalPlugin({ path: zetaV1 })

  await installPlugin({ sourceId: 'local', pluginName: 'zeta' })
  assert.equal(existsSync(join(installedDir('zeta'), 'legacy.txt')), true)
  assert.equal(existsSync(join(dshSkillsDir(), 'zeta-old-skill', 'SKILL.md')), true)
  assert.equal(readState().plugins.find((p) => p.name === 'zeta')?.version, '1.0.0')

  // 预热本地图标缓存以验证覆盖后缓存会立即失效
  const cachedIconV1 = await readLocalIconCached(join(sourceCacheDir('local'), 'zeta'), 'icon.svg', ['local', 'zeta'])
  assert.ok(cachedIconV1, 'v1 icon should be cached')

  // 2. 通过本地插件直接覆盖更新为 zeta@2.0.0（删除 legacy.txt 和 zeta-old-skill，更换 icon.svg，新增 zeta-new-skill）
  const zetaV2 = join(root, 'zeta-v2')
  write(join(zetaV2, '.claude-plugin', 'plugin.json'), { name: 'zeta', version: '2.0.0', description: 'Zeta v2' })
  write(join(zetaV2, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="8" height="8"/></svg>')
  makeSkill(zetaV2, 'zeta-new-skill', 'v2 body')
  await importLocalPlugin({ path: zetaV2, overwrite: true })

  // 验证 market 缓存目录无旧文件残留、icon 缓存立即返回新图标、catalog 立即为 2.0.0
  assert.equal(existsSync(join(sourceCacheDir('local'), 'zeta', 'legacy.txt')), false)
  assert.equal(existsSync(join(sourceCacheDir('local'), 'zeta', 'skills', 'zeta-old-skill')), false)
  assert.equal(readMarketplace('local').find((r) => r.name === 'zeta')?.version, '2.0.0')
  const cachedIconV2 = await readLocalIconCached(join(sourceCacheDir('local'), 'zeta'), 'icon.svg', ['local', 'zeta'])
  assert.match(cachedIconV2.buffer.toString('utf8'), /<rect/, '覆盖后同路径图标缓存必须失效并立刻读出新图标')

  // 验证 installed/zeta、DSH skills 与 state.plugins 全部无缝刷新到 2.0.0 且无残留
  assert.equal(existsSync(join(installedDir('zeta'), 'legacy.txt')), false)
  assert.equal(existsSync(join(dshSkillsDir(), 'zeta-old-skill')), false)
  assert.equal(existsSync(join(dshSkillsDir(), 'zeta-new-skill', 'SKILL.md')), true)
  assert.equal(readState().plugins.find((p) => p.name === 'zeta')?.version, '2.0.0')
  assert.equal(readState().plugins.find((p) => p.name === 'zeta')?.enabled, true)

  // 3. 若用户此前已禁用 zeta，再通过市场并入 local 覆盖成 zeta@3.0.0，应刷新安装文件与版本号同时保留禁用态
  await togglePlugin('zeta', false)
  assert.equal(readState().plugins.find((p) => p.name === 'zeta')?.enabled, false)

  const zetaV3Mk = join(root, 'zeta-v3-mk')
  write(join(zetaV3Mk, '.claude-plugin', 'marketplace.json'), {
    name: 'Zeta Update Market',
    plugins: [{ name: 'zeta', source: './', version: '3.0.0', description: 'Zeta v3' }],
  })
  write(join(zetaV3Mk, '.claude-plugin', 'plugin.json'), { name: 'zeta', version: '3.0.0', description: 'Zeta v3' })
  makeSkill(zetaV3Mk, 'zeta-v3-skill', 'v3 body')
  await importLocalMarketplace(zetaV3Mk, { target: 'local', overwrite: true })

  const zetaRec = readState().plugins.find((p) => p.name === 'zeta')
  assert.equal(zetaRec?.version, '3.0.0')
  assert.equal(zetaRec?.enabled, false, '禁用状态的插件在覆盖更新后应保持禁用，同时内容与版本号已同步到最新版')
  assert.equal(existsSync(join(installedDir('zeta'), 'skills', 'zeta-v3-skill', 'SKILL.md')), true)
  assert.equal(existsSync(join(installedDir('zeta'), 'skills', 'zeta-new-skill')), false)
  assert.equal(existsSync(join(dshSkillsDir(), 'zeta-v3-skill')), false, '禁用插件不得重新向 DSH 暴露 skill')

  // 4. 安装不同 sourceId 的独立市场插件 eta，并验证 local 覆盖不会误伤 eta
  const otherSrcRaw = join(root, 'other-src-raw')
  write(join(otherSrcRaw, '.claude-plugin', 'marketplace.json'), {
    name: 'Other Source',
    plugins: [{ name: 'eta', source: './', version: '1.0.0' }],
  })
  write(join(otherSrcRaw, '.claude-plugin', 'plugin.json'), { name: 'eta', version: '1.0.0' })
  makeSkill(otherSrcRaw, 'eta-from-other', 'other body')
  const otherMktRes = await importLocalMarketplace(otherSrcRaw, { sourceName: 'Other Source' })
  await installPlugin({ sourceId: otherMktRes.sourceId, pluginName: 'eta' })
  assert.equal(readState().plugins.find((p) => p.name === 'eta')?.sourceId, otherMktRes.sourceId)

  const localEtaMk = join(root, 'local-eta-mk')
  write(join(localEtaMk, '.claude-plugin', 'marketplace.json'), {
    name: 'Local Eta',
    plugins: [{ name: 'eta', source: './', version: '9.9.9' }],
  })
  write(join(localEtaMk, '.claude-plugin', 'plugin.json'), { name: 'eta', version: '9.9.9' })
  makeSkill(localEtaMk, 'eta-from-local', 'local body')
  await importLocalMarketplace(localEtaMk, { target: 'local', overwrite: true })

  const etaRec = readState().plugins.find((p) => p.name === 'eta')
  assert.equal(etaRec?.sourceId, otherMktRes.sourceId, '不同来源的同名已安装插件不得被越权覆盖')
  assert.equal(etaRec?.version, '1.0.0')

  // 确保清理 parser 缓存不报错
  invalidateParserCaches()
  rmSync(root, { recursive: true, force: true })
})
