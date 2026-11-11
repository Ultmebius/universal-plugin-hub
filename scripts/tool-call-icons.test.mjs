import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { mountRoutes } from '../src/routes.js'
import { installedDir, sourceCacheDir, writeState } from '../src/store.js'
import { readMarketplace } from '../src/parser.js'
import { getConnectorId, writeCordisPatch, writeMcpToolsState } from '../src/install.js'

test('tool-call icon API exposes only unambiguous, installed plugin tool names and public icon data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'uph-tool-call-icons-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = root
  let handler
  mountRoutes({ register(route) { handler = route.handler } })
  const server = createServer((req, res) => handler(req, res))
  try {
    const connectors = [
      ['exa-plugin', 'exa'],
      ['disabled-plugin', 'disabled'],
      ['ambiguous-plugin', 'shared'],
      ['nested-plugin', 'exa__nested'],
      ['missing-plugin', 'missing'],
    ]
    for (const [plugin, connector] of connectors.slice(0, -1)) {
      mkdirSync(installedDir(plugin), { recursive: true })
      writeFileSync(join(installedDir(plugin), '.mcp.json'), JSON.stringify({
        mcpServers: { [connector]: { url: 'https://fixture.invalid/mcp' } },
      }))
    }
    writeState({ sources: [], plugins: connectors.map(([name]) => ({ name, displayName: name === 'exa-plugin' ? 'Exa' : name, sourceId: 'fixture', enabled: name !== 'disabled-plugin' })) })
    mkdirSync(sourceCacheDir('fixture'), { recursive: true })
    writeFileSync(join(sourceCacheDir('fixture'), 'marketplace.json'), JSON.stringify({
      plugins: [{ name: 'EXA-Plugin', homepage: 'https://example.test' }, { name: 'unrelated' }],
    }))
    assert.deepEqual(readMarketplace('fixture', new Set(['exa-plugin'])).map(row => row.name), ['exa-plugin'])
    const broken = sourceCacheDir('broken-fixture')
    mkdirSync(join(broken, '.claude-plugin'), { recursive: true })
    writeFileSync(join(broken, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      plugins: [
        { name: 'exa-plugin', homepage: 'https://wrong.example.test' },
        { name: 'unrelated', source: { source: 'git-subdir', url: 'https://example.test/repo', path: '../outside' } },
      ],
    }))
    writeFileSync(join(broken, 'marketplace.json'), JSON.stringify({
      plugins: [{ name: 'exa-plugin', homepage: 'https://fallback.example.test' }],
    }))
    const selected = readMarketplace('broken-fixture', new Set(['exa-plugin']))
    assert.equal(selected[0].homepage, readMarketplace('broken-fixture')[0].homepage)
    const entries = [...connectors, ['user-mcp', 'shared'], ['user-mcp', 'standalone']].map(([plugin, connector]) => ({
      id: getConnectorId(plugin, connector), name: '@deepseek-ai/dsh-mcp-client',
      config: { serverName: connector, headers: { 'x-api-key': 'fixture-secret' } },
    }))
    writeCordisPatch([{ insert: entries }])
    writeMcpToolsState(Object.fromEntries(connectors.map(([plugin, connector]) => [
      `${plugin}::${connector}`, { cachedTools: [{ name: 'search' }, { name: 'read.file' }, { name: 'nested__search' }] },
    ])))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/universal-plugin-hub/api/tool-call-icons`)
    assert.equal(response.status, 200)
    const data = await response.json()
    const suffix = createHash('sha256').update('exa\0read.file').digest('hex').slice(0, 12)
    assert.deepEqual(data.groups.map(({ plugin, tools }) => [plugin.displayName, tools]), [
      ['Exa', [
        { name: 'mcp__exa__search', rawName: 'search' },
        { name: `mcp__exa__read_file_${suffix}`, rawName: 'read.file' },
      ]],
    ])
    assert.doesNotMatch(JSON.stringify(data), /fixture-secret|fixture\.invalid|headers/)
    assert.equal(data.groups[0].plugin.homepage, 'https://example.test')
    assert.deepEqual(readMarketplace('fixture').map(row => row.name), ['exa-plugin', 'unrelated'])
  } finally {
    await new Promise(resolve => server.close(resolve))
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(root, { recursive: true, force: true })
  }
})

test('tool-call icon CSS targets only exact generic DSH rows and preserves native chevrons', () => {
  const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('\tconst TOOL_CALL_ROW =')
  const end = source.indexOf('\tfunction formatToolCallLabel(', start)
  assert.ok(start >= 0 && end > start, 'toolCallIconCss must be present')
  const css = vm.runInNewContext(source.slice(start, end) +
    '\ntoolCallIconCss(["mcp__exa__web_search_exa", "not a tool"], "data:image/png;base64,AAAA")')
  assert.match(css, /:is\(\[data-chat-call-id\], \[data-chat-call-id\] > \[data-slot="tool\.call\.toolview"\]\) > \[data-variant="others"\]\[data-tool="mcp__exa__web_search_exa"\]/)
  assert.match(css, /:not\(\[data-open\]\)/)
  assert.match(css, /svg:only-child/)
  assert.match(css, /border-radius: var\(--cpm-connector-icon-radius\)/)
  assert.match(source, /\.cpm-connector-owner-icon \{[^}]*border-radius: var\(--cpm-connector-icon-radius\)/)
  assert.match(css, /@supports \(corner-shape: squircle\) \{\s*border-radius: 50%;\s*corner-shape: var\(--cpm-icon-corner-shape\);/)
  assert.match(css, /data:image\/png;base64,AAAA/)
  assert.doesNotMatch(css, /not a tool|\[data-tool\^=/)
})

test('tool-call labels show plugin name, MCP and the raw tool name while preserving the query', () => {
  const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('\tfunction formatToolCallLabel(')
  const end = source.indexOf('\n\tfunction ', start + 1)
  assert.ok(start >= 0 && end > start, 'formatToolCallLabel must be present')
  const format = vm.runInNewContext(source.slice(start, end) + '\nformatToolCallLabel')
  const name = 'mcp__exa__web_search_exa'
  const summary = value => format(name, value, 'Exa', 'web_search_exa')
  assert.equal(summary(name + ' · latest_news from MCP'), 'Exa MCP web search exa · latest_news from MCP')
  assert.equal(summary(name), 'Exa MCP web search exa')
  assert.equal(summary('latest_news from ' + name), 'latest_news from ' + name)
  assert.equal(summary(name + '_other · latest'), name + '_other · latest')
})

test('only a rewritten plugin MCP summary hides the native title and colors its brand prefix', () => {
  const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('\tconst TOOL_CALL_ROW =')
  const end = source.indexOf('\tfunction installToolCallIcons(', start)
  function row(name, suffix) {
    const text = { isConnected: true, data: name + suffix }
    const attributes = new Map()
    const summary = {
      isConnected: true,
      querySelector: () => null,
      getAttribute: key => attributes.get(key) ?? null,
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: key => attributes.delete(key),
      text,
    }
    return {
      text, attributes,
      getAttribute: () => name,
      querySelector: () => ({ querySelectorAll: () => [summary] }),
    }
  }
  const exa = row('mcp__exa__search', ' · latest headlines')
  const standalone = row('mcp__standalone__search', ' · latest headlines')
  const highlights = new Map()
  const observed = new Map()
  const body = {}
  const labels = vm.runInNewContext(source.slice(start, end) + '\ncreateToolCallLabels()', {
    MutationObserver: class {
      observe(target, options) { observed.set(target, options) }
      disconnect() { observed.clear() }
    },
    Highlight: Set,
    CSS: { highlights },
    document: {
      body,
      querySelectorAll: selector => {
        assert.match(selector, /\[data-chat-call-id\] > \[data-slot="tool\.call\.toolview"\]/)
        return [exa, standalone]
      },
      createTreeWalker: summary => ({ nextNode: () => summary.text }),
      createRange: () => ({
        setStart(node, start) { this.node = node; this.start = start },
        setEnd(_node, end) { this.end = end },
      }),
    },
  })
  labels.update([{ plugin: { displayName: 'Exa' }, tools: [{ name: 'mcp__exa__search', rawName: 'search' }] }])
  assert.equal(!!observed.get(body).characterData, false, 'do not observe text across unrelated chats')
  assert.equal(observed.get(exa).characterData, true, 'observe streamed text on the branded row')
  assert.equal(observed.has(standalone), false)
  assert.equal(exa.text.data, 'Exa MCP search · latest headlines')
  assert.equal(exa.attributes.has('data-uph-tool-summary'), true)
  assert.equal(standalone.attributes.has('data-uph-tool-summary'), false)
  assert.match(source, /\[data-shimmer-decoration\]:has\(\+ \[data-uph-tool-summary\]\)/)
  const [brand] = highlights.get('uph-mcp-brand')
  assert.equal(brand.node.data.slice(brand.start, brand.end), 'Exa MCP')
  assert.equal(highlights.get('uph-mcp-brand').size, 1)
  assert.match(source, /::highlight\(uph-mcp-brand\)\s*\{\s*color: #4d6bfe/i)
  labels.dispose()
  assert.equal(exa.attributes.has('data-uph-tool-summary'), false)
  assert.equal(exa.text.data, 'mcp__exa__search · latest headlines')
  assert.equal(highlights.has('uph-mcp-brand'), false)
})

test('only successful ownership mutations invalidate chat branding', async () => {
  const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('\tasync function api(')
  const end = source.indexOf('\n\t//', start)
  let body = { ok: true }
  const events = []
  const api = vm.runInNewContext(source.slice(start, end) + '\napi', {
    Event,
    fetch: async () => ({ ok: true, json: async () => body }),
    document: { dispatchEvent: event => events.push(event.type) },
  })
  const post = { method: 'POST' }
  await api('/plugins/exa/connectors/exa/tools/toggle', post)
  await api('/mcps/custom/tools/toggle', post)
  body = { ok: false }
  await api('/plugins/exa/connectors/exa/toggle', post)
  assert.deepEqual(events, [])
  body = { ok: true }
  await api('/plugins/exa/connectors/exa/toggle', post)
  assert.deepEqual(events, ['uph-mcp-branding-changed'])
})

test('chat branding is ready before the first row and survives switching chats', async () => {
  const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('\tconst TOOL_CALL_ROW =')
  const end = source.indexOf('\tfunction Section(', start)
  const style = {
    dataset: {},
    sheet: { cssRules: [], insertRule(rule, index) { this.cssRules.splice(index, 0, rule) } },
    get textContent() { return this.base },
    set textContent(value) { this.base = value; this.sheet.cssRules.length = 0 },
    remove() { this.removed = true },
  }
  const icon = 'data:image/png;base64,AAAA'
  let refresh, onRows
  let visible = false
  let requests = 0
  const decoded = []
  const listeners = new Map()
  let pending
  let clock = 0
  let transientFailures = 1
  let finishSlowIcon
  const slowIcon = new Promise(resolve => { finishSlowIcon = resolve })
  const group = name => ({ plugin: { name }, tools: [{ name: `mcp__${name}__search`, rawName: 'search' }] })
  let groups = [group('exa'), group('slow')]
  const context = {
    AbortController,
    Date: { now: () => clock },
    api: async (_path, { signal }) => {
      requests++
      return pending ? pending(signal) : { groups }
    },
    getPluginIconCandidates: plugin => [plugin.name === 'exa' ? icon : plugin.icon || plugin.name],
    isDarkMode: () => false,
    Image: class {
      async decode() {
        decoded.push(this.src)
        if (this.src === 'broken') throw new Error('broken image')
        if (this.src === 'slow') await slowIcon
        if (this.src === 'transient' && transientFailures-- > 0) throw new Error('temporary failure')
      }
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback }
      observe() { onRows = this.callback }
      disconnect() {}
    },
    document: {
      hidden: false,
      body: {},
      createElement: () => style,
      head: { append() {} },
      querySelector: () => visible ? {} : null,
      querySelectorAll: () => [],
      addEventListener(type, fn) { listeners.set(type, fn) },
      removeEventListener(type) { listeners.delete(type) },
    },
    setInterval(fn) { refresh = fn; return 1 },
    clearInterval() {},
  }
  const cssStart = source.indexOf('\tconst ICON_SHAPE_CSS =')
  const cssEnd = source.indexOf('\tconst CSS =', cssStart)
  const dispose = vm.runInNewContext(source.slice(cssStart, cssEnd) + source.slice(start, end) + '\ninstallToolCallIcons({})', context)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests, 1, 'prefetch branding before the first MCP row')
  assert.deepEqual(decoded, [icon], 'warm up inline artwork only')
  assert.ok(style.sheet.cssRules.some(rule => rule.includes(icon)))
  await refresh()
  assert.equal(requests, 1, 'skip periodic metadata work without MCP rows')
  visible = true
  const row = {
    nodeType: 1, isConnected: true, matches: () => true, querySelectorAll: () => [],
    getAttribute: () => 'mcp__slow__search', querySelector: () => null,
  }
  onRows([{ target: {}, addedNodes: [row], removedNodes: [] }])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests, 1)
  assert.ok(style.sheet.cssRules.some(rule => rule.includes(icon)))
  assert.deepEqual(decoded, [icon, 'slow'])
  visible = false
  await refresh()
  assert.equal(requests, 1)
  assert.ok(style.sheet.cssRules.some(rule => rule.includes(icon)), 'switching to an empty chat preserves ready styles')
  visible = true
  groups = [group('broken')]
  await refresh()
  finishSlowIcon()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(style.sheet.cssRules.length, 0)
  assert.match(style.textContent, /uph-mcp-brand/)
  visible = false
  await refresh()
  assert.equal(requests, 2, 'refresh pauses after leaving the MCP conversation')

  let completeOldRequest, oldSignal
  pending = signal => {
    oldSignal = signal
    return new Promise(resolve => { completeOldRequest = resolve })
  }
  visible = true
  const oldRequest = refresh()
  pending = undefined
  groups = []
  listeners.get('uph-mcp-branding-changed')()
  assert.equal(oldSignal.aborted, true)
  completeOldRequest({ groups: [group('exa')] })
  await oldRequest
  assert.equal(style.sheet.cssRules.length, 0, 'a superseded response cannot restore removed branding')

  groups = [group('transient')]
  await refresh()
  const transientRow = { ...row, getAttribute: () => 'mcp__transient__search' }
  const added = [{ target: {}, addedNodes: [transientRow], removedNodes: [] }]
  onRows(added)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(style.sheet.cssRules.length, 0)
  onRows(added)
  assert.equal(decoded.filter(url => url === 'transient').length, 1, 'streaming cannot spin on failed artwork')
  clock += 10001
  onRows(added)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(style.sheet.cssRules.some(rule => rule.includes('transient')), 'a later row retries an icon after a transient failure')

  const oversized = group('oversized')
  oversized.plugin.icon = icon + 'A'.repeat(256 * 1024)
  groups = [oversized, ...Array.from({ length: 15 }, (_, index) => {
    const entry = group(`plugin${index}`)
    entry.plugin.icon = `${icon}#${index}`
    return entry
  })]
  decoded.length = 0
  await refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(decoded, Array.from({ length: 12 }, (_, index) => `${icon}#${index}`),
    'startup work is bounded by icon count and encoded size')
  dispose()
  assert.equal(listeners.size, 0)
  assert.equal(style.removed, true)
})
