import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const start = source.indexOf('\tfunction AddSourceDialog(')
const end = source.indexOf('function AddMcpDialog(', start)
assert.ok(start >= 0 && end > start, 'AddSourceDialog 必须能在 client.js 中定位到')

// A local plugin zip drops straight into the existing tab once a name is
// settled; the marketplace path keeps its own naming step.
async function mount({ localTabName = '', inspect, imports = [], toasts = [], rejectImport = null }) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const calls = { ensure: 0, state: 0, added: [], imports }
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
      if (path === '/plugins/local/inspect') return { localTabName, ...inspect(JSON.parse(options.body)) }
      calls.imports.push({ path, body: JSON.parse(options.body) })
      if (rejectImport) throw new Error(String(rejectImport).replace(/^\/|\/$/g, ''))
      if (path === '/skills/import') return { ok: true, kind: 'skills', sourceId: 'skills-local', skills: [{ name: 'my-skill' }] }
      if (path === '/marketplaces/import') return { ok: true, kind: 'marketplace', sourceId: 'local-newmarket', source: { name: 'New Market' }, plugins: [] }
      return { ok: true, kind: 'plugin', sourceId: 'local', plugin: { name: 'demo' }, plugins: [] }
    },
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.Dialog = AddSourceDialog;', context)
  let view
  await act(async () => {
    view = create(React.createElement(context.Dialog, {
      onAdded: (id, keepOpen) => calls.added.push([id, keepOpen]),
      showToast: (title, detail) => toasts.push([title, detail]),
      initialPhase: 'upload',
    }))
  })
  // 让对话框拿到 /state，才知道本地标签此前是否已经命名。
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return {
    view,
    calls,
    button: (label) => view.root.findAllByType('button').find((n) => n.children.includes(label)),
    uploadPlugin: async (name = 'demo.zip') => {
      const input = view.root.findByProps({ type: 'file' })
      await act(async () => {
        input.props.onChange({ target: { files: [{ name, size: 10 }], value: '' } })
      })
    },
    unmount: () => act(() => view.unmount()),
  }
}

const pluginInspect = { ok: true, kind: 'claude', plugin: { name: 'demo', displayName: 'Demo', version: '1.0.0' }, plugins: [{ name: 'demo', displayName: 'Demo' }] }
const marketInspect = { ok: true, kind: 'marketplace', suggestedName: 'Remotion', plugin: { name: 'remotion', displayName: 'Remotion' }, plugins: [{ name: 'remotion' }] }

test('从未上传过：给出中文名/英文名两个选项，且不带 DEFAULT 徽章', async (t) => {
  const ctx = await mount({ sources: [], inspect: () => pluginInspect })
  try {
    await ctx.uploadPlugin()
    const text = JSON.stringify(ctx.view.toJSON())
    assert.match(text, /使用中文名/)
    assert.match(text, /使用英文名/)
    assert.match(text, /分类标签名/)
    assert.doesNotMatch(text, /DEFAULT/)
    assert.doesNotMatch(text, /RECOMMENDED/)
  } finally {
    await ctx.unmount()
  }
})

test('首次上传选「Local Plugins」后新建该名字的本地标签', async (t) => {
  const ctx = await mount({ sources: [], inspect: () => pluginInspect })
  try {
    await ctx.uploadPlugin()
    const card = ctx.view.root.findAll((n) => typeof n.props?.className === 'string' && n.props.className.includes('cpm-radio-card'))
      .find((n) => n.findAll((child) => child.children?.includes?.('使用英文名')).length > 0)
    assert.ok(card, '应当出现英文名卡片')
    await act(async () => card.props.onClick())
    await act(async () => ctx.button('确认添加').props.onClick())
    const localImport = ctx.calls.imports.find((c) => c.path === '/plugins/local/import')
    assert.equal(localImport.body.sourceName, 'Local Plugins')
  } finally {
    await ctx.unmount()
  }
})

test('已有本地标签：仍要先看预览，且不再询问名字', async (t) => {
  const ctx = await mount({ localTabName: '本地插件', inspect: () => pluginInspect })
  try {
    await ctx.uploadPlugin()
    // 解析不等于导入：必须先把识别结果摆出来，让人确认一次。
    assert.equal(ctx.calls.imports.length, 0, '解析后不能直接导入')
    const text = JSON.stringify(ctx.view.toJSON())
    assert.match(text, /发现插件/, '标题要说明识别到的是什么')
    assert.doesNotMatch(text, /分类标签名/, '标签已命名，不该再问名字')

    await act(async () => ctx.button('确认添加').props.onClick())
    const localImport = ctx.calls.imports.find((c) => c.path === '/plugins/local/import')
    assert.ok(localImport, '确认后才调用本地导入接口')
    // 不发送 sourceName（避免覆盖已有名字），服务端沿用既有名字。
    assert.equal(localImport.body.sourceName, undefined)
    assert.deepEqual(ctx.calls.added.at(-1), ['local', true])
  } finally {
    await ctx.unmount()
  }
})

test('市场包：命名步推荐 manifest 名，可自行输入', async (t) => {
  const ctx = await mount({ sources: [], inspect: () => marketInspect })
  try {
    await ctx.uploadPlugin('remotion.zip')
    const text = JSON.stringify(ctx.view.toJSON())
    assert.match(text, /Remotion/)
    assert.match(text, /我自己命名/)
  } finally {
    await ctx.unmount()
  }
})

test('市场标签重名被拒后，对话框停在命名步并提示改名', async (t) => {
  const toasts = []
  const ctx = await mount({ localTabName: '本地插件', inspect: () => marketInspect, toasts, rejectImport: /分类标签「本地插件」已存在/ })
  try {
    await ctx.uploadPlugin('remotion.zip')
    const input = ctx.view.root.findByProps({ className: 'cpm-input cpm-source-custom-input' })
    await act(async () => input.props.onChange({ target: { value: '本地插件' } }))
    await act(async () => ctx.button('确认添加').props.onClick())

    assert.equal(toasts.length, 1)
    assert.match(toasts[0][1], /已存在/)
    // 仍停在命名步：自定义输入框还在，标签没被创建。
    assert.ok(ctx.view.root.findByProps({ className: 'cpm-input cpm-source-custom-input' }))
    assert.deepEqual(ctx.calls.added, [])
  } finally {
    await ctx.unmount()
  }
})

test('市场包命名后走市场的导入接口', async (t) => {
  const ctx = await mount({ sources: [], inspect: () => marketInspect })
  try {
    await ctx.uploadPlugin('remotion.zip')
    await act(async () => ctx.button('确认添加').props.onClick())
    const marketImport = ctx.calls.imports.find((c) => c.path === '/marketplaces/import')
    assert.equal(marketImport.body.sourceName, 'Remotion')
    assert.deepEqual(ctx.calls.added.at(-1)[0], 'local-newmarket')
  } finally {
    await ctx.unmount()
  }
})

// 回归：第二次上传同一个市场包时，inspect 返回 exists:true，曾整块渲染成 null，
// 用户看到的就是一个全白的对话框。
test('重复上传同名市场包时对话框不能白屏，应进入覆盖确认', async (t) => {
  const ctx = await mount({
    localTabName: '本地插件',
    inspect: () => ({ ...marketInspect, exists: true, existingVersion: '4.0.541' }),
  })
  try {
    await ctx.uploadPlugin('remotion.zip')
    const text = JSON.stringify(ctx.view.toJSON())
    assert.ok(text && text !== 'null', '对话框不能渲染为空')
    assert.match(text, /覆盖更新/)
    assert.match(text, /存在同名插件/)
    // 覆盖确认里点「覆盖更新」会把 overwrite 传下去。
    await act(async () => ctx.button('覆盖更新').props.onClick())
    const marketImport = ctx.calls.imports.find((c) => c.path === '/marketplaces/import')
    assert.equal(marketImport.body.overwrite, true)
  } finally {
    await ctx.unmount()
  }
})

test('纯技能包：不问分类标签名，确认后直接进 Skills 标签页', async (t) => {
  const ctx = await mount({
    localTabName: '',
    inspect: () => ({ ok: true, kind: 'skills', plugin: { name: 'my-skill', displayName: 'My Skill' }, plugins: [{ name: 'my-skill', displayName: 'My Skill' }] }),
  })
  try {
    await ctx.uploadPlugin('my-skill.zip')
    const text = JSON.stringify(ctx.view.toJSON())
    assert.doesNotMatch(text, /分类标签名/, '技能包不该问分类标签名')
    assert.doesNotMatch(text, /使用中文名/)
    assert.doesNotMatch(text, /使用英文名/)
    // 预览仍然保留
    assert.match(text, /My Skill/)
    await act(async () => ctx.button('确认添加').props.onClick())
    const importCall = ctx.calls.imports.find((c) => c.path === '/skills/import')
    assert.ok(importCall, '应当直接走 skills 导入接口')
    assert.equal(importCall.body.sourceName, undefined, '技能包不需要 sourceName')
    assert.equal(ctx.calls.added.at(-1)[0], 'skills-local', '导入后应跳到 Skills 标签页')
  } finally {
    await ctx.unmount()
  }
})

test('技能包同名冲突：提示已存在，只能覆盖或取消', async (t) => {
  const conflictInspect = {
    ok: true, kind: 'skills', takenSkillNames: ['skill-a'],
    plugin: { name: 'skill-a', displayName: 'Skill A' },
    plugins: [{ name: 'skill-a', displayName: 'Skill A' }],
  }
  const ctx = await mount({ inspect: () => conflictInspect })
  try {
    await ctx.uploadPlugin('skill-a.zip')
    const text = JSON.stringify(ctx.view.toJSON())
    assert.match(text, /已存在同名/, '必须明确提示同名')
    assert.match(text, /skill-a/, '要显示真正冲突的技能名')
    assert.ok(ctx.button('取消'), '要能取消')
    assert.ok(ctx.button('覆盖'), '要能覆盖')
    assert.equal(ctx.button('改名并上传'), undefined, '不再提供改名')

    await act(async () => ctx.button('覆盖').props.onClick())
    const importCall = ctx.calls.imports.find((c) => c.path === '/skills/import')
    assert.equal(importCall.body.overwrite, true, '覆盖要带 overwrite')
    assert.equal(importCall.body.renameTo, undefined, '不该再传 renameTo')
  } finally {
    await ctx.unmount()
  }
})

test('单个技能/单个插件：一张卡片，不套列表外壳', async (t) => {
  const cases = [
    { name: '单个技能', inspect: () => ({ ok: true, kind: 'skills', plugin: { name: 'my-skill', displayName: 'My Skill' }, plugins: [{ name: 'my-skill', displayName: 'My Skill' }] }) },
    { name: '单个插件', inspect: () => ({ ok: true, kind: 'claude', plugin: { name: 'demo', displayName: 'Demo', version: '1.0.0' }, plugins: [{ name: 'demo', displayName: 'Demo' }] }) },
  ]
  for (const item of cases) {
    const ctx = await mount({ inspect: item.inspect })
    try {
      await ctx.uploadPlugin()
      const root = ctx.view.root
      assert.equal(root.findAll((n) => n.props?.className?.includes('cpm-detect-single')).length, 1, `${item.name} 应只有一张卡片`)
      assert.equal(root.findAll((n) => n.props?.className?.includes('cpm-detect-well')).length, 0, `${item.name} 不该套列表外壳`)
      assert.equal(root.findAll((n) => n.props?.className?.includes('cpm-detect-summary')).length, 0, `${item.name} 不需要计数行`)
    } finally {
      await ctx.unmount()
    }
  }
})

test('多个成员才用可滚动列表，并挂现成的 mask 类', async (t) => {
  const members = [1, 2, 3, 4, 5].map((i) => ({ name: `s${i}`, displayName: `S${i}` }))
  const ctx = await mount({
    inspect: () => ({ ok: true, kind: 'claude', plugin: { name: 'pack' }, plugins: members }),
  })
  try {
    await ctx.uploadPlugin()
    const root = ctx.view.root
    const list = root.findAll((n) => n.props?.className?.startsWith('cpm-detect-list'))
    assert.equal(list.length, 1, '多成员要给一个列表')
    assert.ok(list[0].props.onScroll, '列表要接滚动回调')
    assert.equal(root.findAll((n) => n.props?.className?.includes('cpm-detect-single')).length, 0, '多成员不该走单卡片')
  } finally {
    await ctx.unmount()
  }
})

test('市场预览的摘要行显示压缩包完整名，而不是固定文案', async (t) => {
  const members = [1, 2, 3].map((i) => ({ name: `m${i}`, displayName: `M${i}` }))
  const ctx = await mount({
    inspect: () => ({ ok: true, kind: 'marketplace', suggestedName: 'Remotion', plugin: { name: 'remotion' }, plugins: members }),
  })
  try {
    await ctx.uploadPlugin('remotion-full-name.zip')
    const summary = ctx.view.root.findAll((n) => n.props?.className === 'cpm-detect-source')
    assert.equal(summary.length, 1, '要有摘要行')
    assert.ok(
      summary[0].props.children.includes('remotion-full-name.zip'),
      `摘要要显示文件名，实际是 ${JSON.stringify(summary[0].props.children)}`,
    )
  } finally {
    await ctx.unmount()
  }
})

test('路径导入时摘要行只取文件名，不显示整条路径', async (t) => {
  const members = [1, 2].map((i) => ({ name: `m${i}`, displayName: `M${i}` }))
  const ctx = await mount({
    inspect: () => ({ ok: true, kind: 'marketplace', suggestedName: 'Kept', plugin: { name: 'kept' }, plugins: members }),
  })
  try {
    const input = ctx.view.root.findByProps({ id: 'cpm-upload-path' })
    await act(async () => { input.props.onChange({ target: { value: 'C:/work/remotion.zip' } }) })
    await act(async () => { await ctx.button('解析并添加').props.onClick() })
    const summary = ctx.view.root.findAll((n) => n.props?.className === 'cpm-detect-source')
    assert.ok(summary.length === 1, '要有摘要行')
    assert.equal(summary[0].props.children, 'remotion.zip', '只显示文件名')
  } finally {
    await ctx.unmount()
  }
})

test('空列表不显示「1 个」：计数按真实条数为 0', async (t) => {
  const ctx = await mount({
    inspect: () => ({ ok: true, kind: 'marketplace', suggestedName: 'Empty', plugin: { name: 'e' }, plugins: [] }),
  })
  try {
    await ctx.uploadPlugin('empty.zip')
    const summary = ctx.view.root.findAll((n) => n.props?.className === 'cpm-detect-count')
    assert.equal(summary.length, 1, '空市场也要有摘要行')
    assert.equal(summary[0].props.children, '0 个插件', '空数组必须显示 0，不能回落成 1')
  } finally {
    await ctx.unmount()
  }
})

test('列表挂载即溢出时就要有底部渐隐，无需先滚动', async (t) => {
  const members = Array.from({ length: 20 }, (_, i) => ({ name: `m${i}`, displayName: `M${i}` }))
  const ctx = await mount({
    inspect: () => ({ ok: true, kind: 'marketplace', suggestedName: 'Big', plugin: { name: 'b' }, plugins: members }),
  })
  try {
    await ctx.uploadPlugin('big.zip')
    const list = ctx.view.root.findAll((n) => typeof n.props?.scrollHeight === 'number' || n.type === 'ul')
      .find((n) => String(n.props?.className || '').startsWith('cpm-detect-list'))
    assert.ok(list, '要有列表')
    // 模拟未滚动但已溢出的真实布局：测试环境没有排版引擎，直接驱动测量。
    const el = { scrollHeight: 500, clientHeight: 208, scrollTop: 0 }
    await act(async () => { list.props.onScroll({ currentTarget: el }) })
    const after = ctx.view.root.findAll((n) => String(n.props?.className || '').startsWith('cpm-detect-list'))[0]
    assert.match(after.props.className, /mask-bottom/, '溢出且未滚动时要显示底部渐隐')
  } finally {
    await ctx.unmount()
  }
})

test('轻微溢出（不足遮罩高度）不套渐隐，避免吃掉最后一行', async (t) => {
  const members = [1, 2, 3, 4].map((i) => ({ name: `m${i}`, displayName: `M${i}` }))
  const ctx = await mount({
    inspect: () => ({ ok: true, kind: 'marketplace', suggestedName: 'Tiny', plugin: { name: 't' }, plugins: members }),
  })
  try {
    await ctx.uploadPlugin('tiny.zip')
    const list = ctx.view.root.findAll((n) => String(n.props?.className || '').startsWith('cpm-detect-list'))[0]
    await act(async () => { list.props.onScroll({ currentTarget: { scrollHeight: 212, clientHeight: 208, scrollTop: 0 } }) })
    const after = ctx.view.root.findAll((n) => String(n.props?.className || '').startsWith('cpm-detect-list'))[0]
    assert.doesNotMatch(after.props.className, /mask-/, '4px 溢出不该套 24px 遮罩')
  } finally {
    await ctx.unmount()
  }
})

test('取消市场预览后再传另一个市场，不继承上一次的命名状态', async (t) => {
  let current = { ok: true, kind: 'marketplace', suggestedName: 'Remotion', plugin: { name: 'r' }, plugins: [{ name: 'a' }, { name: 'b' }] }
  const ctx = await mount({ inspect: () => current })
  try {
    await ctx.uploadPlugin('a.zip')
    // 切到「我自己命名」并输入一个名字
    const input = ctx.view.root.findAll((n) => n.props?.className?.includes('cpm-source-custom-input'))[0]
    await act(async () => { input.props.onChange({ target: { value: '我的旧名字' } }) })
    await act(async () => { ctx.button('返回').props.onClick() })

    // 第二个市场没有建议名
    current = { ok: true, kind: 'marketplace', suggestedName: '', plugin: { name: 'r2' }, plugins: [{ name: 'c' }, { name: 'd' }] }
    await ctx.uploadPlugin('b.zip')

    const text = JSON.stringify(ctx.view.toJSON())
    assert.doesNotMatch(text, /我的旧名字/, '第二次上传不该带上次输入的名字')
    const confirm = ctx.view.root.findAllByType('button').find((n) => n.children.includes('确认添加'))
    assert.equal(confirm?.props.disabled, true, '没有建议名且未输入时不能提交')
  } finally {
    await ctx.unmount()
  }
})

test('onAdded 不引用 BrowseView 作用域内的 loadMarket', () => {
  // loadMarket 定义在 BrowseView 里，而 onAdded 在 MarketApp 的 return 中，
  // 两者不是同一作用域：引用会直接抛 ReferenceError，导入成功后崩溃。
  const i = source.indexOf('onAdded: async (newSourceId, keepOpen)')
  assert.ok(i > 0, '要能找到 onAdded')
  const seg = source.slice(i, i + 1200)
  const end = seg.indexOf('showToast,')
  const body = end > 0 ? seg.slice(0, end) : seg
  assert.doesNotMatch(body, /loadMarket/, 'onAdded 不能调用 BrowseView 内的 loadMarket')
})

test('单卡片预览仍显示技能数/智能体数/作者', async (t) => {
  const ctx = await mount({
    inspect: () => ({
      ok: true, kind: 'claude',
      plugin: { name: 'demo', displayName: 'Demo', version: '2.1.0', skillsCount: 3, agentsCount: 1, author: 'Remotion' },
      plugins: [{ name: 'demo', displayName: 'Demo' }],
    }),
  })
  try {
    await ctx.uploadPlugin('demo.zip')
    const meta = ctx.view.root.findAll((n) => n.props?.className === 'cpm-detect-meta')
    assert.equal(meta.length, 1, '要有元信息行')
    const labels = meta[0].findAllByType('span').map((n) => n.children.join(''))
    assert.ok(labels.includes('3 个技能'), `实际：${labels.join(' | ')}`)
    assert.ok(labels.includes('1 个智能体'), `实际：${labels.join(' | ')}`)
    assert.ok(labels.includes('by Remotion'), `实际：${labels.join(' | ')}`)
  } finally {
    await ctx.unmount()
  }
})

test('技能包覆盖只放行真正冲突的成员，不会整包要求覆盖', async (t) => {
  // takenSkillNames 由服务端只填入真正同名的成员，覆盖按钮原样回传即可。
  const members = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
  const ctx = await mount({
    inspect: () => ({ ok: true, kind: 'skills', plugin: { name: 'pack' }, plugins: members, takenSkillNames: ['b'] }),
  })
  try {
    await ctx.uploadPlugin('pack.zip')
    const text = JSON.stringify(ctx.view.toJSON())
    assert.match(text, /已存在同名 Skill：b/, '只提示真正冲突的那一个')
    await act(async () => ctx.button('覆盖').props.onClick())
    const call = ctx.calls.imports.find((c) => c.path === '/skills/import')
    assert.deepEqual(call.body.overwriteNames, ['b'], '只放行冲突成员，其余正常安装')
  } finally {
    await ctx.unmount()
  }
})
