import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from 'acorn'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const definitions = new Map()
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration' && ['groupAgentTools', 'AgentCard'].includes(node.id.name)) definitions.set(node.id.name, source.slice(node.start, node.end))
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) walk(child)
}
walk(parse(source, { ecmaVersion: 'latest' }))
const context = { h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }), SmartMarkdown: 'markdown' }
vm.runInNewContext([...definitions.values()].join('\n') + '\nglobalThis.group = groupAgentTools; globalThis.card = AgentCard;', context)
const plain = value => JSON.parse(JSON.stringify(value))
function all(node, predicate) {
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => all(child, predicate))]
}

test('shared MCP namespaces are displayed once while every complete tool name is retained', () => {
  const names = ['mcp__plugin_activecampaign_activecampaign__list_contacts', 'mcp__plugin_activecampaign_activecampaign__get_contact', 'Read', 'mcp__another__list_contacts']
  const input = names.join(', ')
  const groups = plain(context.group(input))
  assert.equal(groups.length, 3)
  assert.equal(groups[0].namespace, 'mcp__plugin_activecampaign_activecampaign')
  assert.deepEqual(groups[0].tools.map(tool => tool.name), ['list_contacts', 'get_contact'])
  assert.deepEqual(groups.flatMap(group => group.tools.map(tool => tool.fullName)), names)
  for (const group of groups) for (const tool of group.tools) {
    assert.equal(group.namespace ? group.namespace + '__' + tool.name : tool.name, tool.fullName)
  }
  const agent = { name: 'data-operations', model: 'opus', description: 'Preview changes before executing. Keep this final sentence.', tools: input }
  const card = context.card({ agent })
  assert.equal(card.type, 'li')
  assert.equal(all(card, node => node.props.className === 'cpm-agent-tool-source').length, 3)
  assert.deepEqual(all(card, node => node.type === 'code').map(node => node.props['data-tool-name']), names)
  assert.deepEqual(all(card, node => node.type === 'code').map(node => node.props['aria-label']), names)
  assert.equal(all(card, node => node.type === 'markdown')[0].props.text, agent.description)
  assert.equal(all(card, node => node.props.className === 'cpm-agent-model')[0].children[0], 'opus')
  assert.ok(all(card, node => node.type === 'span').some(node => node.children[0] === '4 tools'))
  assert.equal(all(card, node => ['button', 'details', 'dialog'].includes(node.type)).length, 0)
  assert.equal(agent.tools, input)
})

test('arrays, permission expressions, wildcard tools, and unqualified names retain their content', () => {
  const input = ['Read', 'Bash(git status, git diff)', 'mcp__server__*', 'mcp__incomplete', '*']
  const groups = plain(context.group(input))
  const names = groups.flatMap(group => group.tools.map(tool => tool.fullName))
  assert.deepEqual([...names].sort(), [...input].sort())
  assert.equal(names.length, input.length)
  assert.ok(groups.some(group => group.namespace === 'mcp__server' && group.tools[0].name === '*'))
  assert.equal(input[1], 'Bash(git status, git diff)')
})

test('agents with no tool declaration or only a file name remain readable without invented tool counts', () => {
  for (const tools of [undefined, null, '', '  ', []]) {
    assert.deepEqual(plain(context.group(tools)), [])
    const card = context.card({ agent: { name: 'planner', tools } })
    assert.equal(all(card, node => node.props.className === 'cpm-agent-tools').length, 0)
    assert.equal(all(card, node => node.props.className === 'cpm-agent-name')[0].children[0], 'planner')
  }
  const card = context.card({ agent: 'reviewer.md' })
  assert.equal(all(card, node => node.props.className === 'cpm-agent-name')[0].children[0], 'reviewer')
  assert.equal(all(card, node => node.type === 'markdown')[0].props.text, 'Autonomous sub-agent workflow')
})
