import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { suggestSourceName } from '../src/store.js'

const repo = 'anthropics/knowledge-work-plugins'

test('Knowledge Work and the official Anthropic marketplace get distinct names', () => {
  for (const url of [repo, `https://github.com/${repo}.git`, `git@github.com:${repo}.git`]) {
    assert.equal(suggestSourceName(url), 'Knowledge Work')
  }
  assert.equal(suggestSourceName('anthropics/claude-plugins-official'), 'Anthropic')
})

test('going back and reopening the naming step starts with a blank custom field', async () => {
  const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('\tfunction AddSourceDialog(')
  const end = source.indexOf('function AddMcpDialog(', start)
  assert.ok(start >= 0 && end > start)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const posted = []
  const context = {
    ...React,
    h: React.createElement,
    backdropDismissProps: () => ({}),
    ClearBtn: () => null,
    api: async (path, options) => {
      if (path === '/sources/ensure') return { repoLabel: repo, suggestedName: suggestSourceName(repo) }
      assert.equal(path, '/sources')
      posted.push(JSON.parse(options.body).name)
      return { source: { id: 'knowledge-work' } }
    },
  }
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.Dialog = AddSourceDialog;', context)
  let view
  await act(() => { view = create(React.createElement(context.Dialog, { onAdded() {}, showToast() {} })) })
  const field = () => view.root.findByProps({ className: 'cpm-input cpm-source-custom-input' })
  const button = label => view.root.findAllByType('button').find(node => node.children.includes(label))
  const click = async label => { await act(async () => button(label).props.onClick()) }
  const paste = async value => {
    await act(() => field().props.onChange({ target: { value: field().props.value + value } }))
  }

  try {
    await act(() => view.root.findByProps({ id: 'cpm-source-url' }).props.onChange({ target: { value: repo } }))
    await click('下一步')
    assert.equal(view.root.findByProps({ className: 'cpm-tag-preview' }).children[0], 'Knowledge Work')
    await paste('knowledge-work-plugins')
    await click('上一步')
    await click('下一步')
    assert.equal(field().props.value, '')
    assert.equal(button('确认添加').props.disabled, false)
    await paste('knowledge-work-plugins')
    await click('确认添加')
    assert.deepEqual(posted, ['knowledge-work-plugins'])
  } finally {
    await act(() => view.unmount())
  }
})
