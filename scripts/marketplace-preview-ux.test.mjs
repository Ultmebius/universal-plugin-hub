import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const start = source.indexOf('\tfunction AddSourceDialog(')
const end = source.indexOf('function AddMcpDialog(', start)
assert.ok(start >= 0 && end > start, 'AddSourceDialog 必须能在 client.js 中定位到')

const textOf = (node) => {
  if (!node) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node.children)) return node.children.map(textOf).join('')
  return ''
}

async function mount({ localTabName = '', inspect, imports = [], toasts = [] }) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const calls = { state: 0, added: [], imports, discards: [] }
  const context = {
    ...React,
    h: React.createElement,
    backdropDismissProps: () => ({}),
    ClearBtn: () => null,
    UploadDropIcon: () => null,
    PluginIcon: () => null,
    Promise,
    FileReader: class {
      readAsDataURL() { queueMicrotask(() => { this.result = 'data:;base64,AA=='; this.onload() }) }
    },
    api: async (path, options) => {
      calls.state += 1
      if (path === '/plugins/local/upload-cancel') {
        calls.discards.push(JSON.parse(options.body))
        return { ok: true }
      }
      if (path === '/plugins/local/inspect') {
        return { localTabName, ...inspect(JSON.parse(options.body)) }
      }
      const parsed = JSON.parse(options.body)
      calls.imports.push({ path, body: parsed })
      if (path === '/marketplaces/import') {
        if (parsed.target === 'local') {
          return {
            ok: true,
            kind: 'marketplace',
            target: 'local',
            sourceId: 'local',
            source: { id: 'local', name: localTabName || '本地插件' },
            plugins: [],
          }
        }
        return {
          ok: true,
          kind: 'marketplace',
          sourceId: 'local-newmarket',
          source: { id: 'local-newmarket', name: parsed.sourceName || 'New Market' },
          plugins: [],
        }
      }
      return { ok: true, kind: 'plugin', sourceId: 'local', plugin: { name: 'demo' }, plugins: [] }
    },
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.Dialog = AddSourceDialog;', context)
  let view
  await act(async () => {
    view = create(React.createElement(context.Dialog, {
      onAdded: (id, keepOpen) => calls.added.push([id, keepOpen]),
      onCancel: () => {},
      showToast: (title, detail) => toasts.push([title, detail]),
      initialPhase: 'upload',
    }))
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return {
    view,
    calls,
    button: (label) => view.root.findAllByType('button').find((n) => textOf(n).includes(label)),
    upload: async (name = 'market.zip') => {
      const input = view.root.findByProps({ type: 'file' })
      await act(async () => {
        input.props.onChange({ target: { files: [{ name, size: 10 }], value: '' } })
      })
    },
    unmount: () => act(() => view.unmount()),
  }
}

test('发现插件市场与发现插件在右侧渲染统一规范的版本号，缺失版本时不展示假版本号', async (t) => {
  await t.test('单插件市场在预览卡右侧显示版本号，且不重复拼接 vv', async () => {
    const ctx = await mount({
      localTabName: '',
      inspect: () => ({
        ok: true,
        kind: 'marketplace',
        suggestedName: 'Codex controls claude',
        plugin: { name: 'codex-controls-claude', displayName: 'Codex Controls Claude', version: 'v2.3.4', description: 'desc', skillsCount: 2, agentsCount: 0 },
        plugins: [{ name: 'codex-controls-claude', displayName: 'Codex Controls Claude', version: 'v2.3.4', description: 'desc', skillsCount: 2, agentsCount: 0 }],
      }),
    })
    await ctx.upload()
    const flags = ctx.view.root.findAll((n) => typeof n.props?.className === 'string' && n.props.className.includes('cpm-detect-flag'))
    assert.equal(flags.length, 1)
    assert.equal(textOf(flags[0]), 'v2.3.4', '单个市场插件卡片右侧必须展示唯一 v 前缀版本号')
    await ctx.unmount()
  })

  await t.test('多插件市场逐行显示各自版本号，未声明版本的条目不显示徽标', async () => {
    const ctx = await mount({
      localTabName: '',
      inspect: () => ({
        ok: true,
        kind: 'marketplace',
        suggestedName: 'Multi Market',
        plugin: { name: 'p1', displayName: 'P1', version: '1.0.0' },
        plugins: [
          { name: 'p1', displayName: 'P1', version: '1.0.0', description: 'a' },
          { name: 'p2', displayName: 'P2', version: 'v0.4.0', description: 'b' },
          { name: 'p3', displayName: 'P3', description: 'no version' },
        ],
      }),
    })
    await ctx.upload()
    const flags = ctx.view.root.findAll((n) => typeof n.props?.className === 'string' && n.props.className.includes('cpm-detect-flag'))
    assert.deepEqual(flags.map(textOf), ['v1.0.0', 'v0.4.0'])
    await ctx.unmount()
  })

  await t.test('单个插件识别也规范处理 v 前缀版本号，无版本时不编造', async () => {
    const ctx = await mount({
      localTabName: '本地插件',
      inspect: () => ({
        ok: true,
        kind: 'codex',
        plugin: { name: 'solo', displayName: 'Solo', version: 'v3.2.1', description: 'codex plugin' },
        plugins: [{ name: 'solo', displayName: 'Solo', version: 'v3.2.1', description: 'codex plugin' }],
      }),
    })
    await ctx.upload('solo.zip')
    const flags = ctx.view.root.findAll((n) => typeof n.props?.className === 'string' && n.props.className.includes('cpm-detect-flag'))
    assert.deepEqual(flags.map(textOf), ['v3.2.1'])
    await ctx.unmount()
  })
})

test('当存在本地插件标签时，发现插件市场在系统建议简化名上方提供「加入本地插件标签」选择框，默认仍选中建议名', async (t) => {
  await t.test('有 localTabName 时三项按顺序渲染（加入本地 -> 建议名 -> 自定义）且使用原生单选与 fieldset/legend', async () => {
    const ctx = await mount({
      localTabName: 'Local Plugins',
      inspect: () => ({
        ok: true,
        kind: 'marketplace',
        suggestedName: 'Demo Market',
        localConflicts: [],
        plugin: { name: 'm1', displayName: 'M1', version: '1.0.0' },
        plugins: [{ name: 'm1', displayName: 'M1', version: '1.0.0' }],
      }),
    })
    await ctx.upload()

    const fieldsets = ctx.view.root.findAllByType('fieldset')
    assert.equal(fieldsets.length, 1, '单选卡片组应包裹在语义化 fieldset 中')
    assert.equal(fieldsets[0].findAllByType('legend').length, 1, 'fieldset 应包含 legend')

    const cards = ctx.view.root.findAll((n) => n.type === 'label' && typeof n.props?.className === 'string' && n.props.className.includes('cpm-radio-card'))
    assert.equal(cards.length, 3, '存在本地标签时应展示三个选择卡片')
    assert.match(textOf(cards[0]), /加入本地插件标签/)
    assert.match(textOf(cards[0]), /Local Plugins/)
    assert.match(textOf(cards[1]), /使用系统建议简化名/)
    assert.match(textOf(cards[2]), /我自己命名/)

    const radios = cards.map((card) => card.findByProps({ type: 'radio' }))
    assert.equal(radios[0].props.checked, false)
    assert.equal(radios[1].props.checked, true, '默认选中仍为使用系统建议简化名')
    assert.equal(radios[2].props.checked, false)

    // 切换选中「加入本地插件标签」后顶部副标题联动更新，不再说成独立标签页
    await act(async () => cards[0].props.onClick())
    assert.equal(cards[0].findByProps({ type: 'radio' }).props.checked, true)
    assert.match(textOf(ctx.view.root), /Local Plugins/)
    assert.doesNotMatch(textOf(ctx.view.root), /将作为独立标签页添加/)

    // 确认添加发送 target: 'local'
    await act(async () => ctx.button('确认添加').props.onClick())
    assert.equal(ctx.calls.imports.length, 1)
    assert.equal(ctx.calls.imports[0].path, '/marketplaces/import')
    assert.equal(ctx.calls.imports[0].body.target, 'local')
    assert.equal(ctx.calls.imports[0].body.overwrite, false)
    assert.deepEqual(ctx.calls.added.at(-1), ['local', undefined])
    await ctx.unmount()
  })

  await t.test('无 localTabName 时不显示加入本地插件标签选项，保持两个命名选项', async () => {
    const ctx = await mount({
      localTabName: '',
      inspect: () => ({
        ok: true,
        kind: 'marketplace',
        suggestedName: 'Demo Market',
        plugin: { name: 'm1', displayName: 'M1', version: '1.0.0' },
        plugins: [{ name: 'm1', displayName: 'M1', version: '1.0.0' }],
      }),
    })
    await ctx.upload()
    const cards = ctx.view.root.findAll((n) => n.type === 'label' && typeof n.props?.className === 'string' && n.props.className.includes('cpm-radio-card'))
    assert.equal(cards.length, 2)
    assert.doesNotMatch(textOf(ctx.view.root), /加入本地插件标签/)
    await ctx.unmount()
  })
})

test('选择将市场加入本地插件标签且存在本地同名冲突时，拦截导入并显示覆盖更新或取消确认', async () => {
  const ctx = await mount({
    localTabName: '本地插件',
    inspect: () => ({
      ok: true,
      kind: 'marketplace',
      uploadId: 'up-conflict-1',
      suggestedName: 'Fresh Market',
      exists: false,
      localConflicts: [
        { name: 'alpha', displayName: 'Alpha Plugin', existingVersion: '1.0.0', newVersion: '2.0.0', existingUpdatedAt: Date.now() },
      ],
      plugin: { name: 'alpha', displayName: 'Alpha Plugin', version: '2.0.0' },
      plugins: [
        { name: 'alpha', displayName: 'Alpha Plugin', version: '2.0.0' },
        { name: 'beta', displayName: 'Beta Plugin', version: '1.1.0' },
      ],
    }),
  })
  await ctx.upload()

  // 选择加入本地插件标签
  const cards = ctx.view.root.findAll((n) => typeof n.props?.className === 'string' && n.props.className.includes('cpm-radio-card'))
  assert.match(textOf(cards[0]), /冲突|同名/, '本地冲突应在选择卡中预先提醒')
  await act(async () => cards[0].props.onClick())

  // 点击确认添加，不得直接覆盖提交，应进入冲突确认页
  await act(async () => ctx.button('确认添加').props.onClick())
  assert.equal(ctx.calls.imports.length, 0, '存在同名冲突时点击确认添加不得直接写入')
  const dupText = textOf(ctx.view.root)
  assert.match(dupText, /本地插件/)
  assert.match(dupText, /Alpha Plugin|alpha/)
  assert.match(dupText, /v1\.0\.0/)
  assert.match(dupText, /v2\.0\.0/)
  assert.ok(ctx.button('取消'))
  assert.ok(ctx.button('覆盖更新'))

  // 点击覆盖更新后带 target: 'local' 和 overwrite: true 提交（且中途不得提前丢弃 uploadId）
  assert.equal(ctx.calls.discards.length, 0)
  await act(async () => ctx.button('覆盖更新').props.onClick())
  assert.equal(ctx.calls.imports.length, 1)
  assert.equal(ctx.calls.imports[0].path, '/marketplaces/import')
  assert.equal(ctx.calls.imports[0].body.target, 'local')
  assert.equal(ctx.calls.imports[0].body.overwrite, true)
  await ctx.unmount()

  // 再验证冲突页点击「取消」会清理 staged uploadId 且不触发导入
  const cancelCtx = await mount({
    localTabName: '本地插件',
    inspect: () => ({
      ok: true,
      kind: 'marketplace',
      uploadId: 'up-conflict-cancel',
      suggestedName: 'Fresh Market',
      exists: false,
      localConflicts: [{ name: 'alpha', displayName: 'Alpha', existingVersion: '1.0.0', newVersion: '2.0.0' }],
      plugin: { name: 'alpha', displayName: 'Alpha', version: '2.0.0' },
      plugins: [{ name: 'alpha', displayName: 'Alpha', version: '2.0.0' }],
    }),
  })
  await cancelCtx.upload()
  const cancelCards = cancelCtx.view.root.findAll((n) => typeof n.props?.className === 'string' && n.props.className.includes('cpm-radio-card'))
  await act(async () => cancelCards[0].props.onClick())
  await act(async () => cancelCtx.button('确认添加').props.onClick())
  await act(async () => cancelCtx.button('取消').props.onClick())
  assert.equal(cancelCtx.calls.imports.length, 0)
  assert.deepEqual(cancelCtx.calls.discards, [{ uploadId: 'up-conflict-cancel' }])
  await cancelCtx.unmount()
})

test('样式规则符合 modern-web-guidance：无障碍视觉隐藏、焦点可见环、恒定边框防抖动及 Forced Colors 兜底', () => {
  assert.match(source, /\.cpm-sr-only\s*\{[\s\S]*clip-path:\s*inset\(50%\)/, '应使用 clip-path 隐藏原生 radio，不可用 display: none')
  assert.match(source, /\.cpm-radio-card:has\(>\s*input:checked\)/, '应支持原生 :has(:checked) 选择态样式')
  assert.match(source, /\.cpm-radio-card:has\(>\s*input:focus-visible\)/, '应支持键盘焦点圈样式')
  assert.match(source, /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.cpm-radio-card/, 'forced-colors 下选择卡应有高对比回退')
})

const browser = process.env.UPH_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

test('真实浏览器渲染验证：版本徽标对齐、暗/亮色选择卡无布局抖动与原生 :has(:checked) 生效', { skip: !existsSync(browser) }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-mkt-preview-css-'))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))
  const cssStart = source.indexOf('const CSS = `') + 'const CSS = `'.length
  const cssEnd = source.indexOf('`;', cssStart)
  const css = source.slice(cssStart, cssEnd)
  const htmlFile = join(dir, 'preview.html')
  writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>${css}
    body { margin: 0; font-family: sans-serif; }
    .cpm-dialog, .cpm-dialog-box { animation: none; }
    .cpm-radio-card, .cpm-custom-radio { transition: none; }
  </style>
  <div class="cpm-root" id="light-root" style="width:1280px;padding:24px;">
    <div class="cpm-dialog-box cpm-source-dialog-box" role="dialog" aria-modal="true" style="position:relative;margin:0 auto;">
      <div class="cpm-source-header cpm-detect-header">
        <div class="cpm-source-header-title">发现插件市场</div>
        <div class="cpm-detect-hint">检测到 marketplace 清单，将作为独立标签页添加</div>
      </div>
      <div class="cpm-detect-single" id="single-card">
        <div class="cpm-card-icon" style="background:#3b82f6;"></div>
        <div class="cpm-detect-body">
          <div class="cpm-detect-name-row">
            <div class="cpm-detect-name" id="single-name">Codex Controls Claude</div>
            <span class="cpm-detect-flag cpm-detect-flag-muted" id="single-ver">v1.0.0</span>
          </div>
          <div class="cpm-detect-desc">Codex designs the plan, delegates bounded tasks cleanly</div>
        </div>
      </div>
      <fieldset class="cpm-radio-fieldset">
        <legend class="cpm-source-prompt-label">选择该市场插件的添加方式</legend>
        <div class="cpm-radio-group">
          <label class="cpm-radio-card" id="card-local">
            <input class="cpm-sr-only" type="radio" name="m" value="local" id="radio-local">
            <div class="cpm-custom-radio"><div class="cpm-custom-radio-inner"></div></div>
            <div class="cpm-radio-card-content">
              <div class="cpm-radio-card-header">
                <div class="cpm-radio-card-title">加入本地插件标签</div>
                <span class="cpm-conflict-pill">1 项同名冲突</span>
              </div>
              <div class="cpm-radio-card-desc">直接合并到已有标签：<span class="cpm-tag-preview">本地插件</span></div>
            </div>
          </label>
          <label class="cpm-radio-card" id="card-suggest">
            <input class="cpm-sr-only" type="radio" name="m" value="suggest" id="radio-suggest" checked>
            <div class="cpm-custom-radio"><div class="cpm-custom-radio-inner"></div></div>
            <div class="cpm-radio-card-content">
              <div class="cpm-radio-card-header"><div class="cpm-radio-card-title">使用系统建议简化名</div></div>
              <div class="cpm-radio-card-desc">分类标签名：<span class="cpm-tag-preview">Codex controls claude</span></div>
            </div>
          </label>
        </div>
      </fieldset>
    </div>
  </div>
  <div class="cpm-root cpm-dark" id="dark-root" style="width:1280px;padding:24px;">
    <div class="cpm-dialog-box cpm-source-dialog-box" style="position:relative;margin:0 auto;">
      <div class="cpm-detect-well">
        <ul class="cpm-detect-list">
          <li class="cpm-detect-row">
            <div class="cpm-card-icon" style="background:#3b82f6;"></div>
            <div class="cpm-detect-body">
              <div class="cpm-detect-name-row">
                <div class="cpm-detect-name">Alpha</div>
                <span class="cpm-detect-flag cpm-detect-flag-muted" id="dark-row-ver">v2.1.0</span>
              </div>
              <div class="cpm-detect-desc">Dark mode list row</div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
  <pre id="metrics"></pre>
  <script>
    const singleCard = document.getElementById('single-card').getBoundingClientRect();
    const nameRect = document.getElementById('single-name').getBoundingClientRect();
    const verRect = document.getElementById('single-ver').getBoundingClientRect();
    const cardLocal = document.getElementById('card-local');
    const beforeRect = cardLocal.getBoundingClientRect();
    const beforeBorder = getComputedStyle(cardLocal).borderTopWidth;
    const radioLocal = document.getElementById('radio-local');
    const radioDisplay = getComputedStyle(radioLocal).display;
    const checkedBorderBefore = getComputedStyle(document.getElementById('card-suggest')).borderColor;
    radioLocal.click();
    const afterRect = cardLocal.getBoundingClientRect();
    const checkedBorderAfter = getComputedStyle(cardLocal).borderColor;
    const darkVerStyle = getComputedStyle(document.getElementById('dark-row-ver'));
    document.getElementById('metrics').textContent = JSON.stringify({
      verRightOfName: verRect.left >= nameRect.right - 1,
      verSameLineAsName: Math.abs((verRect.top + verRect.height / 2) - (nameRect.top + nameRect.height / 2)) < 6,
      verInsideCard: verRect.right <= singleCard.right - 8 && verRect.top >= singleCard.top,
      radioDisplay,
      localCheckedNow: radioLocal.checked,
      noHeightShift: Math.abs(afterRect.height - beforeRect.height) < 0.5,
      noWidthShift: Math.abs(afterRect.width - beforeRect.width) < 0.5,
      beforeBorder,
      checkedBorderBefore,
      checkedBorderAfter,
      darkVerColor: darkVerStyle.color,
    });
  </script>`)
  const dump = execFileSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${join(dir, 'profile')}`, '--window-size=1280,900', '--dump-dom', pathToFileURL(htmlFile).href,
  ], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] })
  const m = JSON.parse(dump.match(/<pre id="metrics">([^<]+)<\/pre>/)[1])
  assert.equal(m.verRightOfName, true, '版本号应紧贴插件名右侧排列')
  assert.equal(m.verSameLineAsName, true, '版本号应与插件名在同一水平中心线对齐')
  assert.equal(m.verInsideCard, true, '版本号必须稳稳落在预览卡内不得溢出')
  assert.notEqual(m.radioDisplay, 'none', '原生 radio 必须保留在无障碍树中')
  assert.equal(m.localCheckedNow, true, '点击「加入本地插件标签」应选中其原生 radio')
  assert.equal(m.noHeightShift, true, '切换选中状态不得产生卡片高度抖动')
  assert.equal(m.noWidthShift, true, '切换选中状态不得产生卡片宽度抖动')
  assert.equal(m.checkedBorderAfter, m.checkedBorderBefore, ':has(> input:checked) 应激活高亮边框色')
})
