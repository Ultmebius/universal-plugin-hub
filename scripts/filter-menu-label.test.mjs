import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'

const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/** Extract concatenated visible text from a react-test-renderer node subtree. */
function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (Array.isArray(node.children)) return node.children.map(textOf).join('')
  return ''
}

function makeMockNode() {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 600,
    clientHeight: 400,
    scrollWidth: 600,
    clientWidth: 400,
    offsetLeft: 0,
    offsetWidth: 80,
    children: [],
    parentElement: null,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ top: 100, bottom: 160, left: 0, right: 240, width: 240, height: 60 }),
  }
}

/** Execute client.js in a minimal React harness and return its registered Main component. */
function loadMainComponent({ sources, plugins, rows }) {
  const storage = new Map()
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  }

  const fakeFetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    const cleanUrl = String(url).replace(/^\/universal-plugin-hub\/api/, '')
    if (method === 'GET' && cleanUrl === '/state') {
      return { ok: true, status: 200, json: async () => structuredClone({ sources, plugins }) }
    }
    if (method === 'GET' && cleanUrl === '/mcps') {
      return { ok: true, status: 200, json: async () => ({ mcps: [] }) }
    }
    if (method === 'GET' && cleanUrl === '/tool-call-icons') {
      return { ok: true, status: 200, json: async () => ({ groups: [] }) }
    }
    if (method === 'GET' && cleanUrl.startsWith('/market?sourceId=')) {
      const sourceId = decodeURIComponent(cleanUrl.split('sourceId=')[1])
      return { ok: true, status: 200, json: async () => ({ plugins: structuredClone(rows[sourceId] || []) }) }
    }
    if (method === 'POST' && cleanUrl === '/market/refresh') {
      const body = JSON.parse(options.body || '{}')
      return { ok: true, status: 200, json: async () => ({ plugins: structuredClone(rows[body.sourceId] || []) }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  let capturedModule = null
  const context = {
    React,
    fetch: fakeFetch,
    localStorage,
    URL,
    Buffer,
    Event: class Event { constructor(type) { this.type = type } },
    AbortController: class AbortController { constructor() { this.signal = {} } abort() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    ResizeObserver: undefined,
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout,
    clearTimeout,
    window: {
      __ModuleLoader__: {
        load: ({ factory }) => {
          capturedModule = factory((name) => (name === 'react' ? React : {}))
        },
      },
      fetch: fakeFetch,
      addEventListener() {},
      removeEventListener() {},
      setTimeout,
      clearTimeout,
      matchMedia: () => ({ matches: false }),
      getComputedStyle: () => ({ backgroundColor: '', color: '' }),
    },
    document: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
      head: { appendChild() {}, append() {} },
      getElementById: () => null,
      createElement: () => ({ setAttribute() {}, dataset: {}, style: {}, remove() {}, textContent: '', getContext: () => null }),
      querySelector: () => null,
      documentElement: { classList: { contains: () => false }, getAttribute: () => null },
      body: { classList: { contains: () => false }, getAttribute: () => null, contains: () => true },
    },
    navigator: { clipboard: { writeText() {} } },
  }

  vm.runInNewContext(clientSource, context)

  let MainComponent = null
  capturedModule.apply({
    slots: {
      inject: (_slot, fn) => fn(),
      register: (desc, Comp) => {
        if (desc.name === 'main') MainComponent = Comp
      },
    },
    on: () => () => {},
    theme: { current: 'light' },
  })
  assert.ok(MainComponent, 'Main component must register via apply')
  return MainComponent
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

test('filter menu omits parenthesized installed count on 已安装 while keeping 全部插件 count', async (t) => {
  const cases = [
    {
      label: 'with installed plugins across marketplaces',
      plugins: Array.from({ length: 8 }, (_, idx) => ({
        id: `anthropic/installed-${idx}`,
        name: `installed-${idx}`,
        sourceId: 'anthropic',
      })),
    },
    {
      label: 'with zero installed plugins',
      plugins: [],
    },
  ]

  for (const { label, plugins } of cases) {
    await t.test(label, async () => {
      const MainComponent = loadMainComponent({
        sources: [{ id: 'anthropic', name: 'Anthropic', builtin: true }],
        plugins,
        rows: {
          anthropic: [{ id: 'anthropic/only-one', name: 'only-one', description: 'Single catalog entry' }],
        },
      })

      let renderer
      try {
        await act(async () => {
          renderer = create(React.createElement(MainComponent), { createNodeMock: () => makeMockNode() })
        })
        await flush()

        const filterBtn = renderer.root.find((n) => n.type === 'button' && String(n.props?.className || '').includes('cpm-filter'))
        assert.equal(textOf(filterBtn), '全部插件')

        await act(async () => { filterBtn.props.onClick() })

        const menuItems = renderer.root.findAll((n) => n.props?.className === 'cpm-menu-item')
        assert.deepEqual(menuItems.map(textOf), ['全部插件 (1)', '已安装'])

        await act(async () => { menuItems[1].props.onClick() })
        await flush()

        const updatedFilterBtn = renderer.root.find((n) => n.type === 'button' && String(n.props?.className || '').includes('cpm-filter'))
        assert.equal(textOf(updatedFilterBtn), '已安装')
      } finally {
        if (renderer) {
          await act(async () => { renderer.unmount() })
        }
      }
    })
  }
})
