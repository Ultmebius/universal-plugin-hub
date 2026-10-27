import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { parse } from 'acorn'

const require = createRequire(import.meta.url)
const React = require('react')
const { create, act } = require('react-test-renderer')
const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const start = source.indexOf('\tfunction PluginCard(')
const end = source.indexOf('\n\t// ────────────────────────────── Modern Vector SVG Icons', start)
assert.ok(start >= 0 && end > start)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const native = {
  NativeMarkdownText: ({ text }) => React.createElement('div', null, text),
  NativePathLabel: ({ path }) => React.createElement('span', { 'data-path-label': true }, path),
  SKILL_MARKDOWN_LABELS: { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '注释' },
}

test('skill detail displays instructions without showing or requesting resources', async () => {
  const requests = [], toggled = []
  const markdown = 'Skill instructions\n\n| Intent | Skill |\n| --- | --- |\n| Offer | [salary](salary/SKILL.md) |\n\n<instructions>Keep this content</instructions>'
  const context = { ...React, ...native, React, h: React.createElement, IconChevronLeft: () => null, PluginIcon: () => null, SmartMarkdown: ({ text }) => React.createElement('div', null, text),
    api: async path => {
      requests.push(path)
      return path.startsWith('/skills/detail')
        ? { skill: { content: markdown, files: [{ path: 'scripts/check.py' }, { path: 'agents/reviewer.md' }] } }
        : { content: 'resource contents' }
    },
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.SkillDetail = SkillDetail; globalThis.PluginCard = PluginCard; globalThis.SkillSwitch = SkillSwitch;', context)
  const skill = { id: 'abc', name: 'example', description: 'Example', enabled: true, available: true, path: 'C:/skills/example/SKILL.md', actualInvocation: { userInvocable: true, modelInvocable: true } }
  let view
  await act(async () => { view = create(React.createElement(context.SkillDetail, { skill, onBack() {}, onToggle(s) { toggled.push(s.id) } })) })
  assert.equal(requests.length, 1)
  assert.match(JSON.stringify(view.toJSON()), /Skill instructions/)
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /agents\/reviewer.md|scripts\/check.py|脚本、Agent 与资源|Skill 指令/)
  assert.equal(view.root.findByType(native.NativePathLabel).props.path, skill.path)
  assert.equal(view.root.findByType(native.NativeMarkdownText).props.text, markdown)
  assert.equal(view.root.findByType(native.NativeMarkdownText).props.omitHtml, undefined)
  assert.equal(view.root.findByProps({ className: 'cpm-back' }).children.at(-1), 'Back')
  assert.equal(view.root.findByType('h1').children.join(''), 'example')
  assert.equal(view.root.findAllByType('article').length, 1)
  const toggle = view.root.findByProps({ role: 'switch' })
  assert.equal(toggle.props.checked, true)
  assert.equal(toggle.props['data-cpm-tip'], undefined)
  assert.equal(toggle.props.title, undefined)
  await act(async () => { toggle.props.onChange({ currentTarget: { checked: false } }) })
  assert.deepEqual(toggled, ['abc'])
  assert.equal(requests.length, 1)
  await act(async () => view.unmount())
})

test('skill detail keeps metadata quiet and the active switch usable', async () => {
  const toggled = []
  const context = { ...React, ...native, React, h: React.createElement, IconChevronLeft: () => null, PluginIcon: () => null,
    SmartMarkdown: ({ text }) => React.createElement('div', null, text),
    api: async () => ({ skill: { content: 'Instructions', files: [] } }),
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.SkillDetail = SkillDetail;', context)
  let view
  const skill = { id: 'manual', name: 'manual', enabled: true, available: true, duplicate: true, invocation: { userInvocable: true, modelInvocable: false },
    path: 'C:/skills/manual/SKILL.md', locations: [{ id: 'a', path: 'C:/skills/manual/SKILL.md' }, { id: 'b', path: 'C:/skills/copy/SKILL.md' }] }
  await act(async () => { view = create(React.createElement(context.SkillDetail, { skill, onBack() {}, onToggle: (_skill, enabled) => toggled.push(enabled) })) })
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /仅手动调用|模型不可用|命令可用|位置已合并|Skill 指令/)
  const toggle = view.root.findByProps({ role: 'switch' })
  assert.equal(toggle.props.disabled, false)
  await act(async () => toggle.props.onChange({ currentTarget: { checked: false } }))
  assert.deepEqual(toggled, [false])
  await act(async () => view.update(React.createElement(context.SkillDetail, { skill: { ...skill, enabled: false }, onBack() {}, onToggle() {} })))
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /已关闭|手动调用和自动调用均已停用/)
  assert.equal(view.root.findByProps({ role: 'switch' }).props.checked, false)
  await act(async () => view.unmount())
})

test('skill detail omits the entire resources section when no files exist', async () => {
  const context = { ...React, ...native, React, h: React.createElement, IconChevronLeft: () => null, PluginIcon: () => null,
    SmartMarkdown: ({ text }) => React.createElement('div', null, text),
    api: async () => ({ skill: { content: 'Instructions remain visible', files: [] } }),
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.SkillDetail = SkillDetail;', context)
  let view
  await act(async () => { view = create(React.createElement(context.SkillDetail, { skill: { id: 'empty', name: 'empty', enabled: true, available: true }, onBack() {}, onToggle() {} })) })
  const output = JSON.stringify(view.toJSON())
  assert.match(output, /Instructions remain visible/)
  assert.doesNotMatch(output, /脚本、Agent 与资源|没有其他资源文件|cpm-skill-files/)
  await act(async () => view.unmount())
})

test('skill details share the scroll mask and reveal the last lines at the bottom', async () => {
  const scroller = { scrollHeight: 900, clientHeight: 400, scrollTop: 0, children: [] }
  const context = { ...React, ...native, React, h: React.createElement, IconChevronLeft: () => null, PluginIcon: () => null,
    api: async () => ({ skill: { content: 'Long instructions' } }),
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.SkillDetail = SkillDetail;', context)
  let view
  await act(async () => { view = create(React.createElement(context.SkillDetail, { skill: { id: 'long', name: 'long' }, onBack() {}, onToggle() {} }),
    { createNodeMock: node => node.props.className?.includes('cpm-skill-detail') ? scroller : null }) })
  const container = () => view.root.find(node => node.type === 'div' && node.props.className?.includes('cpm-skill-detail'))
  assert.match(container().props.className, /mask-bottom/)
  scroller.scrollTop = 500
  await act(async () => container().props.onScroll())
  assert.doesNotMatch(container().props.className, /mask-bottom/)
  scroller.scrollTop = 100
  await act(async () => container().props.onScroll())
  assert.match(container().props.className, /mask-bottom/)
  scroller.scrollHeight = 300
  await act(async () => container().props.onScroll())
  assert.doesNotMatch(container().props.className, /mask-bottom/)
  await act(async () => view.unmount())
})

test('Skills cards use the existing hover preview and close it before opening details', () => {
  let expression
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression' && node.callee.name === 'h' && node.arguments[0]?.name === 'PluginCard'
      && node.arguments[1]?.properties?.some(prop => prop.key.name === 'action' && prop.value.arguments?.[0]?.name === 'SkillSwitch')) expression = node
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child === 'object') walk(child)
  }
  walk(parse(source, { ecmaVersion: 'latest' }))
  assert.ok(expression)
  const calls = [], skill = { id: 'apple', name: 'apple-design' }, anchor = {}
  const context = { h: (type, props) => ({ type, props }), PluginCard: 'card', SkillSwitch: 'switch', skill, index: 0, isDark: false, skillBusy: null,
    toggleSkill() {}, handleCardMouseEnter: (...args) => calls.push(['enter', ...args]), handleCardMouseLeave: value => calls.push(['leave', value]),
    closePluginHover: () => calls.push(['close']), setView: value => calls.push(['open', value]),
  }
  const card = vm.runInNewContext(source.slice(expression.start, expression.end), context)
  card.props.onMouseEnter({ currentTarget: anchor, clientX: 20, clientY: 30, buttons: 0 })
  assert.equal(calls[0][1], skill)
  assert.equal(calls[0][2], anchor)
  card.props.onMouseLeave()
  assert.equal(calls[1][0], 'leave')
  card.props.onClick()
  assert.equal(calls[2][0], 'close')
  assert.equal(calls[3][1].type, 'skill-detail')
})
