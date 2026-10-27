import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const React = require('react')
const { create, act } = require('react-test-renderer')
const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const start = source.indexOf('\tfunction PluginCard(')
const end = source.indexOf('\n\t// ────────────────────────────── Modern Vector SVG Icons', start)
assert.ok(start >= 0 && end > start)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

test('skill detail displays instructions without showing or requesting resources', async () => {
  const requests = [], toggled = []
  const context = { ...React, React, h: React.createElement, IconChevronLeft: () => null, PluginIcon: () => null, SmartMarkdown: ({ text }) => React.createElement('div', null, text),
    api: async path => {
      requests.push(path)
      return path.startsWith('/skills/detail')
        ? { skill: { content: 'Skill instructions', files: [{ path: 'scripts/check.py' }, { path: 'agents/reviewer.md' }] } }
        : { content: 'resource contents' }
    },
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.SkillDetail = SkillDetail; globalThis.PluginCard = PluginCard; globalThis.SkillSwitch = SkillSwitch;', context)
  const skill = { id: 'abc', name: 'example', description: 'Example', enabled: true, available: true, path: 'C:/skills/example/SKILL.md', actualInvocation: { userInvocable: true, modelInvocable: true } }
  let view
  await act(async () => { view = create(React.createElement(context.SkillDetail, { skill, onBack() {}, onToggle(s) { toggled.push(s.id) } })) })
  assert.equal(requests.length, 1)
  assert.match(JSON.stringify(view.toJSON()), /Skill instructions/)
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /agents\/reviewer.md|scripts\/check.py|脚本、Agent 与资源/)
  const toggle = view.root.findByProps({ role: 'switch' })
  assert.equal(toggle.props.checked, true)
  assert.equal(toggle.props['data-cpm-tip'], undefined)
  assert.equal(toggle.props.title, undefined)
  await act(async () => { toggle.props.onChange({ currentTarget: { checked: false } }) })
  assert.deepEqual(toggled, ['abc'])
  assert.equal(requests.length, 1)
  await act(async () => view.unmount())
})

test('manual-only policy explains author intent and duplicate flag does not lock the active switch', async () => {
  const toggled = []
  const context = { ...React, React, h: React.createElement, IconChevronLeft: () => null, PluginIcon: () => null,
    SmartMarkdown: ({ text }) => React.createElement('div', null, text),
    api: async () => ({ skill: { content: 'Instructions', files: [] } }),
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.SkillDetail = SkillDetail;', context)
  let view
  const skill = { id: 'manual', name: 'manual', enabled: true, available: true, duplicate: true, invocation: { userInvocable: true, modelInvocable: false } }
  await act(async () => { view = create(React.createElement(context.SkillDetail, { skill, onBack() {}, onToggle: (_skill, enabled) => toggled.push(enabled) })) })
  assert.match(JSON.stringify(view.toJSON()), /仅手动调用：输入 \/manual 使用/)
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /模型不可用|命令可用/)
  const toggle = view.root.findByProps({ role: 'switch' })
  assert.equal(toggle.props.disabled, false)
  await act(async () => toggle.props.onChange({ currentTarget: { checked: false } }))
  assert.deepEqual(toggled, [false])
  await act(async () => view.unmount())
})

test('skill detail omits the entire resources section when no files exist', async () => {
  const context = { ...React, React, h: React.createElement, IconChevronLeft: () => null, PluginIcon: () => null,
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
