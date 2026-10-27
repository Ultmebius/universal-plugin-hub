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

test('skill detail displays instructions and loads resources only on request', async () => {
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
  assert.match(JSON.stringify(view.toJSON()), /agents\/reviewer.md/)
  const toggle = view.root.findByProps({ role: 'switch' })
  assert.equal(toggle.props['aria-checked'], true)
  await act(async () => { toggle.props.onClick({ stopPropagation() {} }) })
  assert.deepEqual(toggled, ['abc'])
  const resource = view.root.findAllByType('button').find(button => button.children.includes('scripts/check.py'))
  await act(async () => { await resource.props.onClick() })
  assert.equal(requests.length, 2)
  assert.match(JSON.stringify(view.toJSON()), /resource contents/)
  await act(async () => view.unmount())
})
