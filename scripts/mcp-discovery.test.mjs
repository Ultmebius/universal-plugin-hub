import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { parse } from 'acorn'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const backend = readFileSync(new URL('../src/install.js', import.meta.url), 'utf8')
function functions(source) {
  const found = new Map()
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'FunctionDeclaration') found.set(node.id.name, source.slice(node.start, node.end))
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) walk(child)
  }
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return found
}
const serverFns = functions(backend), clientFns = functions(client)

test('concurrent discovery joins one server process and a later retry starts fresh', async () => {
  const pending = new Map(), releases = []
  let calls = 0
  const context = { MCP_TOOLS_INFLIGHT: pending, MEMORY_TOOLS_CACHE: new Map(), discoverConnectorTools: () => { calls++; return new Promise(resolve => { releases.push(resolve) }) } }
  vm.runInNewContext(serverFns.get('fetchConnectorTools') + '\nglobalThis.fetch = fetchConnectorTools', context)
  const first = context.fetch('p', 'c')
  // Same freshness joins the process already running.
  const joined = context.fetch('p', 'c')
  assert.equal(calls, 1)
  // A forced refresh must not be answered by an older background probe.
  const second = context.fetch('p', 'c', true)
  assert.equal(calls, 2)
  assert.notEqual(joined, second)
  releases[0]({ ok: false, message: 'network offline', tools: [] })
  assert.equal((await first).message, 'network offline')
  releases[1]({ ok: false, message: 'network offline', tools: [] })
  assert.equal((await second).message, 'network offline')
  assert.equal(context.MEMORY_TOOLS_CACHE.has('p::c'), false, 'a transient failure must not be remembered')
  const retry = context.fetch('p', 'c', true)
  assert.equal(calls, 3)
  releases[2]({ ok: true, tools: [] }); await retry
  assert.equal(pending.size, 0)
})

test('both UI loaders keep cached counts during navigation and show progress for cold loads and explicit retries', async () => {
  const declarations = new Map()
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'VariableDeclarator' && ['loadGlobalTools', 'loadConnectorTools'].includes(node.id.name)) declarations.set(node.id.name, client.slice(node.init.start, node.init.end))
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) walk(child)
  }
  walk(parse(client, { ecmaVersion: 'latest' }))
  for (const name of ['loadGlobalTools', 'loadConnectorTools']) {
    const key = name === 'loadGlobalTools' ? 'p::c' : 'c'
    let state = {}, fail = false
    const requests = [], cache = { 'p::c': { tools: [{ name: 'previous' }], disabledTools: ['previous'] } }
    const context = { record: { name: 'p' }, GLOBAL_MCP_TOOLS_CACHE: cache, useCallback: fn => fn,
      setGlobalToolData: fn => { state = fn(state) }, setConnectorToolsData: fn => { state = fn(state) },
      saveMcpToolsCache: (key, value) => { cache[key] = value },
      api: async url => {
        requests.push(url)
        if (fail) throw new Error('Network reset')
        return { ok: true, tools: [{ name: 'previous' }], disabledTools: [] }
      } }
    const load = vm.runInNewContext(declarations.get(name), context)
    const args = name === 'loadGlobalTools' ? ['p', 'c'] : ['c']
    const revisit = load(...args)
    assert.equal(state[key].loading, false)
    assert.equal(state[key].tools[0].name, 'previous')
    assert.equal(state[key].disabledTools.length, 1)
    await revisit
    assert.equal(state[key].disabledTools.length, 0)
    fail = true
    const first = load(...args, true)
    assert.equal(state[key].loading, true)
    await first
    assert.equal(state[key].error, 'Network reset')
    assert.equal(state[key].tools[0].name, 'previous')
    fail = false
    context.api = async url => { requests.push(url); return { ok: true, tools: [], disabledTools: [] } }
    await load(...args, true)
    assert.equal(state[key].error, null)
    assert.equal(state[key].tools.length, 0)
    assert.ok(requests.slice(1).every(url => url.endsWith('?fresh=1')))
    assert.equal(cache['p::c'].tools.length, 0)
    state = {}
    const empty = load(...args)
    assert.equal(state[key].loading, false, 'a successful empty list is already resolved')
    await empty
    state = {}
    delete cache['p::c']
    const cold = load(...args)
    assert.equal(state[key].loading, true)
    await cold
  }
})

test('connected servers discover automatically, once per configuration and reconnect', async () => {
  const helper = clientFns.get('useAutoMcpTools')
  assert.ok(helper)
  const calls = [], load = (...args) => calls.push(args)
  const context = { ...React }
  vm.runInNewContext(helper + '\nglobalThis.auto = useAutoMcpTools', context)
  function Auto({ servers }) { context.auto(servers, load); return null }
  let view, servers = [{ owner: 'p', name: 'local', connected: true, revision: 1 }, { owner: 'p', name: 'auth', connected: false }]
  await act(async () => { view = create(React.createElement(Auto, { servers })) })
  assert.deepEqual(calls, [['p', 'local']])
  await act(async () => view.update(React.createElement(Auto, { servers: [...servers] })))
  assert.equal(calls.length, 1, 'a render or failed discovery cannot cause a retry loop')
  servers = [{ ...servers[0], connected: false }]
  await act(async () => view.update(React.createElement(Auto, { servers })))
  servers = [{ ...servers[0], connected: true }]
  await act(async () => view.update(React.createElement(Auto, { servers })))
  assert.equal(calls.length, 2)
  servers = [{ ...servers[0], revision: 2 }]
  await act(async () => view.update(React.createElement(Auto, { servers })))
  assert.equal(calls.length, 3)
  await act(async () => view.unmount())
})

test('server rows expose loading and actionable failure inline without expanding tools', () => {
  const component = clientFns.get('McpDiscoveryStatus')
  assert.ok(component)
  const context = { h: (type, props, ...children) => ({ type, props: props || {}, children }), IconArrow: () => null }
  vm.runInNewContext(component + '\nglobalThis.status = McpDiscoveryStatus', context)
  const all = node => typeof node === 'object' && node ? [node, ...node.children.flat(Infinity).flatMap(all)] : []
  let retries = 0
  const loading = context.status({ info: { loading: true } })
  assert.match(JSON.stringify(loading), /正在解析/)
  const failed = context.status({ info: { error: 'Network connection reset' }, onRetry: () => retries++ })
  assert.match(JSON.stringify(failed), /Network connection reset/)
  assert.equal(failed.props.role, 'status')
  const retry = all(failed).find(n => n.type === 'button')
  assert.match(JSON.stringify(retry), /重新解析/)
  retry.props.onClick({ stopPropagation() {} })
  assert.equal(retries, 1)
  assert.ok((client.match(/h\(McpDiscoveryStatus,/g) || []).length >= 2)
})

test('bottom notification content is centered and uses the detail popover material', () => {
  const rules = selector => {
    const start = client.indexOf('\n' + selector + ' {\n')
    assert.ok(start >= 0)
    return client.slice(start, client.indexOf('}', start))
  }
  const property = (rule, name) => rule.match(new RegExp('(?:^|[;\\n])\\s*' + name + ':\\s*([^;]+)'))?.[1]
  for (const theme of ['', '.cpm-dark ']) {
    for (const prop of ['background', 'border', 'box-shadow', 'backdrop-filter']) {
      assert.equal(property(rules(theme + '.cpm-toast'), prop), property(rules(theme + '.cpm-mcp-tool-popover'), prop), prop)
    }
  }
  assert.equal(property(rules('.cpm-toast-content'), 'text-align'), 'center')
  assert.equal(property(rules('.cpm-toast-title'), 'justify-content'), 'center')
})
