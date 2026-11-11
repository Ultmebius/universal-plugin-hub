import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { mountRoutes } from '../src/routes.js'
import { installedDir, writeState } from '../src/store.js'
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
  const labels = vm.runInNewContext(source.slice(start, end) + '\ncreateToolCallLabels()', {
    MutationObserver: class { observe() {} disconnect() {} },
    Highlight: Set,
    CSS: { highlights },
    document: {
      body: {},
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

test('chat branding mounts outside the Hub panel and clears stale or broken icons', async () => {
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
  let refresh, onPresence
  let visible = false
  let requests = 0
  let finishSlowIcon
  const slowIcon = new Promise(resolve => { finishSlowIcon = resolve })
  const group = name => ({ plugin: { name }, tools: [{ name: `mcp__${name}__search`, rawName: 'search' }] })
  let groups = [group('exa'), group('slow')]
  const context = {
    api: async () => { requests++; return { groups } },
    getPluginIconCandidates: plugin => plugin.name === 'exa' ? ['broken', icon] : [plugin.name],
    isDarkMode: () => false,
    Image: class {
      async decode() {
        if (this.src === 'broken') throw new Error('broken image')
        if (this.src === 'slow') await slowIcon
      }
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback }
      observe(_node, options) { if (!options.characterData) onPresence = this.callback }
      disconnect() {}
    },
    document: {
      hidden: false,
      body: {},
      createElement: () => style,
      head: { append() {} },
      querySelector: () => visible ? {} : null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    },
    setInterval(fn) { refresh = fn; return 1 },
    clearInterval() {},
  }
  const cssStart = source.indexOf('\tconst ICON_SHAPE_CSS =')
  const cssEnd = source.indexOf('\tconst CSS =', cssStart)
  const dispose = vm.runInNewContext(source.slice(cssStart, cssEnd) + source.slice(start, end) + '\ninstallToolCallIcons({})', context)
  await refresh()
  assert.equal(requests, 0, 'no branding request before the first MCP row')
  visible = true
  onPresence([{ target: {}, addedNodes: [{ nodeType: 1, matches: () => true }] }])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests, 1)
  assert.ok(style.sheet.cssRules.some(rule => rule.includes(icon)))
  groups = [group('broken')]
  await refresh()
  finishSlowIcon()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(style.sheet.cssRules.length, 0)
  assert.match(style.textContent, /uph-mcp-brand/)
  visible = false
  await refresh()
  assert.equal(requests, 2, 'refresh pauses after leaving the MCP conversation')
  dispose()
  assert.equal(style.removed, true)
})
