import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'

const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

function textOf(node) {
  if (node == null || typeof node === 'boolean') return ''
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

function mountHub({
  initialSources,
  initialPlugins = [],
  initialTabOrder,
  initialRows = {},
  onFetch,
  seedCachedState,
} = {}) {
  let stateData = {
    sources: structuredClone(initialSources),
    plugins: structuredClone(initialPlugins),
    ...(initialTabOrder ? { tabOrder: structuredClone(initialTabOrder) } : {}),
  }
  const rowsData = structuredClone(initialRows)
  const localStorage = createMemoryStorage(
    seedCachedState ? { cpm_cached_state_v1: JSON.stringify(seedCachedState) } : {},
  )

  const fetchCalls = []
  const fakeFetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    const cleanUrl = String(url).replace(/^\/universal-plugin-hub\/api/, '')
    fetchCalls.push({ url: cleanUrl, method, options })
    if (onFetch) {
      const custom = await onFetch({ url: cleanUrl, method, options, stateData, rowsData })
      if (custom !== undefined) return custom
    }
    if (method === 'GET' && cleanUrl === '/state') {
      return { ok: true, status: 200, json: async () => structuredClone(stateData) }
    }
    if (method === 'GET' && cleanUrl === '/mcps') {
      return { ok: true, status: 200, json: async () => ({ mcps: [] }) }
    }
    if (method === 'GET' && cleanUrl === '/tool-call-icons') {
      return { ok: true, status: 200, json: async () => ({ groups: [] }) }
    }
    if (method === 'GET' && cleanUrl.startsWith('/market?sourceId=')) {
      const sourceId = decodeURIComponent(cleanUrl.split('sourceId=')[1])
      return { ok: true, status: 200, json: async () => ({ plugins: structuredClone(rowsData[sourceId] || []) }) }
    }
    if (method === 'POST' && cleanUrl === '/market/refresh') {
      const body = JSON.parse(options.body || '{}')
      return { ok: true, status: 200, json: async () => ({ plugins: structuredClone(rowsData[body.sourceId] || []) }) }
    }
    if (method === 'POST' && cleanUrl === '/sources/ensure') {
      return { ok: true, status: 200, json: async () => ({ ok: true, suggestedName: 'Custom A', normalizedUrl: 'https://github.com/example/custom-a.git', pluginCount: 2 }) }
    }
    if (method === 'POST' && cleanUrl === '/sources') {
      const added = { id: 'custom-a', name: 'Custom A' }
      stateData = {
        ...stateData,
        sources: [...stateData.sources.filter((s) => s.id !== 'custom-a'), added],
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, source: added, pluginCount: 2 }) }
    }
    if (method === 'DELETE' && cleanUrl.startsWith('/sources/')) {
      const sourceId = decodeURIComponent(cleanUrl.slice('/sources/'.length))
      stateData = {
        ...stateData,
        sources: stateData.sources.filter((s) => s.id !== sourceId),
        ...(Array.isArray(stateData.tabOrder) ? { tabOrder: stateData.tabOrder.filter((id) => id !== sourceId) } : {}),
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  let capturedModule = null
  const instrumentedSource = clientSource.replace(
    'const SESSION_STORE = {',
    'const SESSION_STORE = globalThis.__TEST_SESSION_STORE__ = {',
  )
  assert.notEqual(instrumentedSource, clientSource, 'client.js must contain SESSION_STORE')

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

  vm.runInNewContext(instrumentedSource, context)

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

  let renderer
  const flush = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }

  return {
    context,
    localStorage,
    fetchCalls,
    get sessionStore() {
      return context.__TEST_SESSION_STORE__
    },
    setServerState(next) {
      stateData = structuredClone(next)
    },
    setServerRows(next) {
      Object.assign(rowsData, structuredClone(next))
    },
    async render() {
      await act(async () => {
        renderer = create(React.createElement(MainComponent), {
          createNodeMock: () => makeMockNode(),
        })
      })
      await flush()
      return renderer
    },
    flush,
    getTabs() {
      return renderer.root.findAll((n) => n.type === 'button' && String(n.props?.className || '').includes('cpm-tab'))
    },
    findTab(name) {
      return this.getTabs().find((t) => textOf(t).includes(name))
    },
    async clickTab(name) {
      const tab = this.findTab(name)
      assert.ok(tab, `tab "${name}" should exist`)
      await act(async () => {
        tab.props.onPointerDown?.({ button: 0, pointerId: 1, clientX: 10, clientY: 10, currentTarget: makeMockNode() })
        tab.props.onPointerUp?.({ button: 0, pointerId: 1, clientX: 10, clientY: 10, currentTarget: makeMockNode() })
        tab.props.onClick?.({ stopPropagation() {} })
      })
      await flush()
    },
    async deleteSourceViaUi(name) {
      const tab = this.findTab(name)
      assert.ok(tab, `tab "${name}" should exist before delete`)
      const delZone = tab.find((n) => String(n.props?.className || '').includes('cpm-tab-del-zone'))
      await act(async () => {
        delZone.props.onClick({ stopPropagation() {} })
      })
      const confirmBtn = renderer.root.findAllByType('button').find((b) => b.children.includes('确认删除'))
      assert.ok(confirmBtn, 'confirm delete button should appear')
      await act(async () => {
        await confirmBtn.props.onClick()
      })
      await flush()
    },
    async unmount() {
      if (renderer) {
        await act(async () => { renderer.unmount() })
      }
    },
  }
}

test('deleting the active tab does not resurrect SESSION_STORE.sourceViews and picks valid fallback', async () => {
  const hub = mountHub({
    initialSources: [
      { id: 'anthropic', name: 'Anthropic', builtin: true },
      { id: 'custom-a', name: 'Custom A' },
      { id: 'custom-b', name: 'Custom B' },
    ],
    initialRows: {
      anthropic: [{ name: 'claude-plugin', id: 'anthropic/claude-plugin' }],
      'custom-a': [{ name: 'alpha', id: 'custom-a/alpha', description: 'Alpha plugin' }],
      'custom-b': [{ name: 'beta', id: 'custom-b/beta' }],
    },
  })

  try {
    const renderer = await hub.render()
    await hub.clickTab('Custom A')

    // Open detail view on active tab custom-a so SESSION_STORE.view & sourceViews['custom-a'] hold a detail view
    const card = renderer.root.find((n) => n.props?.className === 'cpm-card')
    await act(async () => {
      card.props.onClick()
    })
    await hub.flush()
    assert.equal(hub.sessionStore.view.type, 'detail')
    assert.equal(hub.sessionStore.view.sourceId, 'custom-a')

    // Delete active tab custom-a
    await hub.deleteSourceViaUi('Custom A')

    // Active tab falls back to anthropic, and sourceViews['custom-a'] MUST NOT be resurrected!
    assert.equal(hub.sessionStore.activeSourceId, 'anthropic')
    assert.equal(Object.prototype.hasOwnProperty.call(hub.sessionStore.sourceViews, 'custom-a'), false, 'deleted sourceViews entry must stay deleted')
    assert.equal(hub.sessionStore.view.type, 'browse')
    assert.notEqual(hub.sessionStore.view.sourceId, 'custom-a')

    // Fallback when anthropic is absent picks the first remaining non-deleted source (not hardcoded anthropic)
    const hubNoAnthropic = mountHub({
      initialSources: [
        { id: 'custom-a', name: 'Custom A' },
        { id: 'custom-b', name: 'Custom B' },
      ],
      initialRows: {
        'custom-a': [{ name: 'alpha', id: 'custom-a/alpha' }],
        'custom-b': [{ name: 'beta', id: 'custom-b/beta' }],
      },
    })
    try {
      hubNoAnthropic.sessionStore.activeSourceId = 'custom-a'
      hubNoAnthropic.sessionStore.view = { type: 'browse', sourceId: 'custom-a' }
      await hubNoAnthropic.render()
      await hubNoAnthropic.deleteSourceViaUi('Custom A')
      assert.equal(hubNoAnthropic.sessionStore.activeSourceId, 'custom-b')
      assert.equal(Object.prototype.hasOwnProperty.call(hubNoAnthropic.sessionStore.sourceViews, 'custom-a'), false)
      assert.equal(hubNoAnthropic.sessionStore.view.type, 'browse')
      assert.equal(hubNoAnthropic.sessionStore.view.sourceId, 'custom-b')
    } finally {
      await hubNoAnthropic.unmount()
    }
  } finally {
    await hub.unmount()
  }
})

test('source delete evicts detailCacheRef entries and blocks in-flight prefetchDetail from repopulating stale detail', async () => {
  let resolvePrefetch
  let detailFetchCount = 0
  let betaFetchCount = 0
  let anthropicFetchCount = 0

  const hub = mountHub({
    initialSources: [
      { id: 'anthropic', name: 'Anthropic', builtin: true },
      { id: 'custom-a', name: 'Custom A' },
    ],
    initialRows: {
      anthropic: [{ name: 'pw', id: 'anthropic/pw' }],
      'custom-a': [
        { name: 'alpha', id: 'custom-a/alpha' },
        { name: 'beta', id: 'custom-a/beta' },
      ],
    },
    onFetch: ({ url, method }) => {
      if (method === 'GET' && url === '/plugins/anthropic/pw') {
        anthropicFetchCount++
        return { ok: true, status: 200, json: async () => ({ plugin: { name: 'pw', skills: [{ name: 'pw-skill' }] } }) }
      }
      if (method === 'GET' && url === '/plugins/custom-a/beta') {
        betaFetchCount++
        return { ok: true, status: 200, json: async () => ({ plugin: { name: 'beta', skills: [{ name: 'old-beta-skill' }] } }) }
      }
      if (method === 'GET' && url === '/plugins/custom-a/alpha') {
        detailFetchCount++
        if (detailFetchCount === 1) {
          return new Promise((resolve) => {
            resolvePrefetch = () => resolve({
              ok: true,
              status: 200,
              json: async () => ({ plugin: { name: 'alpha', skills: [{ name: 'stale-prefetched-skill' }] } }),
            })
          })
        }
        return { ok: true, status: 200, json: async () => ({ plugin: { name: 'alpha', skills: [{ name: 'fresh-alpha-skill' }] } }) }
      }
    },
  })

  try {
    const renderer = await hub.render()

    // Populate anthropic:pw detail cache (must survive deletion of custom-a)
    const anthCard = renderer.root.find((n) => n.props?.className === 'cpm-card')
    await act(async () => { anthCard.props.onClick() })
    await hub.flush()
    assert.equal(anthropicFetchCount, 1)
    const backFromAnth = renderer.root.find((n) => n.props?.className === 'cpm-back')
    await act(async () => { backFromAnth.props.onClick() })
    await hub.flush()

    // Switch to custom-a, open beta detail (populates detailCacheRef['custom-a:beta']), then go back
    await hub.clickTab('Custom A')
    const betaCard = renderer.root.findAll((n) => n.props?.className === 'cpm-card')[1]
    await act(async () => { betaCard.props.onClick() })
    await hub.flush()
    assert.equal(betaFetchCount, 1)
    const backFromBeta = renderer.root.find((n) => n.props?.className === 'cpm-back')
    await act(async () => { backFromBeta.props.onClick() })
    await hub.flush()

    // Hover alpha card to start an in-flight prefetchDetail('custom-a', 'alpha')
    const alphaCard = renderer.root.findAll((n) => n.props?.className === 'cpm-card')[0]
    await act(async () => {
      alphaCard.props.onMouseEnter({
        currentTarget: makeMockNode(),
        clientX: 40,
        clientY: 120,
        buttons: 0,
      })
    })
    assert.equal(detailFetchCount, 1)
    assert.ok(resolvePrefetch, 'prefetchDetail request must be in flight')

    // Delete custom-a BEFORE the in-flight prefetch resolves
    await hub.deleteSourceViaUi('Custom A')

    // Now resolve the pre-delete in-flight prefetch
    resolvePrefetch()
    await hub.flush()

    // Verify anthropic detail cache survived deletion of custom-a
    const anthCardAgain = renderer.root.find((n) => n.props?.className === 'cpm-card')
    await act(async () => { anthCardAgain.props.onClick() })
    await hub.flush()
    assert.equal(anthropicFetchCount, 1, 'other source detail cache must remain intact')
    const backAgain = renderer.root.find((n) => n.props?.className === 'cpm-back')
    await act(async () => { backAgain.props.onClick() })
    await hub.flush()

    // Trigger /state reload by toggling a plugin or calling refreshState via clicking Manage/etc. — or inspect via re-adding source via AddSourceDialog or custom state refresh:
    // Actually we can verify by clicking Install on nothing — even simpler, simulate AddSourceDialog adding custom-a via UI or refreshing state:
    // Notice clicking '+' -> '添加插件市场' or triggering refresh: wait, let's open AddSourceDialog and submit custom-a!
    const addMenuBtn = renderer.root.find((n) => String(n.props?.className || '').includes('cpm-add-btn'))
    await act(async () => { addMenuBtn.props.onClick() })
    const addMarketItem = renderer.root.findAll((n) => n.props?.className === 'cpm-menu-item').find((n) => n.children.includes('添加插件市场'))
    await act(async () => { addMarketItem.props.onClick() })
    const urlInput = renderer.root.find((n) => n.type === 'input' && String(n.props?.placeholder || '').includes('github'))
    await act(async () => { urlInput.props.onChange({ target: { value: 'https://github.com/example/custom-a.git' } }) })
    // Click next/add button
    const nextBtn = renderer.root.findAllByType('button').find((b) => b.children.some((c) => typeof c === 'string' && (c.includes('下一步') || c.includes('添加'))))
    if (nextBtn) {
      await act(async () => { await nextBtn.props.onClick() })
      await hub.flush()
    }
    const confirmAddBtn = renderer.root.findAllByType('button').find((b) => b.children.includes('确认添加'))
    if (confirmAddBtn) {
      await act(async () => { await confirmAddBtn.props.onClick() })
      await hub.flush()
    }

    // If re-added tab exists, click it and open alpha & beta details
    if (!hub.findTab('Custom A')) {
      // Fallback: unmount & don't rely on AddSourceDialog phrasing if dialog uses different flow
      assert.fail('Expected AddSourceDialog to restore Custom A')
    }
    await hub.clickTab('Custom A')

    const cards = renderer.root.findAll((n) => n.props?.className === 'cpm-card')
    await act(async () => { cards[0].props.onClick() })
    await hub.flush()
    assert.equal(detailFetchCount, 2, 'stale pre-delete prefetch must NOT populate detailCacheRef for alpha')
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /stale-prefetched-skill/)
    assert.match(JSON.stringify(renderer.toJSON()), /fresh-alpha-skill/)

    const backAlpha = renderer.root.find((n) => n.props?.className === 'cpm-back')
    await act(async () => { backAlpha.props.onClick() })
    await hub.flush()

    const cards2 = renderer.root.findAll((n) => n.props?.className === 'cpm-card')
    await act(async () => { cards2[1].props.onClick() })
    await hub.flush()
    assert.equal(betaFetchCount, 2, 'evicted beta detailCacheRef entry must be refetched')
  } finally {
    await hub.unmount()
  }
})

test('source delete cleans sourceFilters, browseSortSnapshots, checkedCatalogs, and immediately removes source from cached state and tabOrder even if refreshState fails', async () => {
  let failNextState = false
  const hub = mountHub({
    initialSources: [
      { id: 'anthropic', name: 'Anthropic', builtin: true },
      { id: 'custom-a', name: 'Custom A' },
      { id: 'skills-local', name: 'Skills', virtual: true },
    ],
    initialTabOrder: ['anthropic', 'custom-a', 'skills-local'],
    initialRows: {
      anthropic: [{ name: 'p1', id: 'anthropic/p1' }],
      'custom-a': [{ name: 'a1', id: 'custom-a/a1' }],
    },
    seedCachedState: {
      sources: [
        { id: 'anthropic', name: 'Anthropic', builtin: true },
        { id: 'custom-a', name: 'Custom A' },
        { id: 'skills-local', name: 'Skills', virtual: true },
      ],
      plugins: [],
      tabOrder: ['anthropic', 'custom-a', 'skills-local'],
    },
    onFetch: ({ url, method }) => {
      if (method === 'GET' && url === '/state' && failNextState) {
        return { ok: false, status: 500, json: async () => ({ error: 'state failed' }) }
      }
    },
  })

  try {
    const renderer = await hub.render()
    await hub.clickTab('Custom A')

    // Change filter on Custom A so SESSION_STORE.sourceFilters['custom-a'] is populated
    const filterBtn = renderer.root.find((n) => n.type === 'button' && String(n.props?.className || '').includes('cpm-filter'))
    await act(async () => { filterBtn.props.onClick() })
    const installedMenuItem = renderer.root.findAll((n) => n.props?.className === 'cpm-menu-item').find((n) => textOf(n).includes('已安装'))
    await act(async () => { installedMenuItem.props.onClick() })
    await hub.flush()

    assert.equal(hub.sessionStore.sourceFilters['custom-a'], 'installed')
    assert.ok(hub.sessionStore.browseSortSnapshots['custom-a'], 'browseSortSnapshots should exist before delete')
    assert.equal(hub.sessionStore.checkedCatalogs.has('custom-a'), true)

    // Fail the follow-up refreshState() after DELETE /sources/custom-a succeeds
    failNextState = true
    await hub.deleteSourceViaUi('Custom A')

    // Per-source session artifacts must all be cleaned
    assert.equal(Object.prototype.hasOwnProperty.call(hub.sessionStore.sourceViews || {}, 'custom-a'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(hub.sessionStore.sourceFilters || {}, 'custom-a'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(hub.sessionStore.browseSortSnapshots || {}, 'custom-a'), false)
    assert.equal(hub.sessionStore.checkedCatalogs.has('custom-a'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(hub.sessionStore.scrollTops || {}, 'custom-a'), false)

    // Tab and cached state/tabOrder must be updated immediately even though refreshState failed
    assert.equal(hub.findTab('Custom A'), undefined, 'deleted source tab must vanish immediately even if refreshState fails')
    assert.equal(hub.sessionStore.state.sources.some((s) => s.id === 'custom-a'), false)
    assert.deepEqual(hub.sessionStore.state.tabOrder, ['anthropic', 'skills-local'])

    const cachedState = JSON.parse(hub.localStorage.getItem('cpm_cached_state_v1'))
    assert.equal(cachedState.sources.some((s) => s.id === 'custom-a'), false)
    assert.deepEqual(cachedState.tabOrder, ['anthropic', 'skills-local'])
  } finally {
    await hub.unmount()
  }
})
