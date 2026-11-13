import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const React = require('react')
const { create, act } = require('react-test-renderer')

import { dshSkillsDir, installedDir, marketRoot, readState, writeState } from '../src/store.js'
import { invalidateMarketplaceCache, invalidateParserCaches } from '../src/parser.js'
import { invalidateLocalIconCache } from '../src/icons.js'
import { mountRoutes } from '../src/routes.js'
import { apply as applyHub } from '../src/index.js'
import {
  AT_PLUGINS_BOOT_LIMIT,
  attachAtPluginsAgentHook,
  atPluginsBootPayload,
  collectPluginCapabilities,
  extractPluginMentions,
  formatPluginMention,
  invalidateAtPluginsCache,
  listAtPlugins,
  renderExplicitPluginInstructions,
} from '../src/at-plugins.js'

function setupEnv() {
  const previousDsh = process.env.DSH_HOME
  const previousProfile = process.env.DSH_PROFILE
  const root = mkdtempSync(join(tmpdir(), 'uph-at-plugins-'))
  process.env.DSH_HOME = root
  process.env.DSH_PROFILE = 'web'
  invalidateMarketplaceCache()
  invalidateParserCaches()
  invalidateAtPluginsCache()
  mkdirSync(join(root, 'profiles', 'web'), { recursive: true })
  return {
    root,
    cleanup() {
      invalidateMarketplaceCache()
      invalidateParserCaches()
      invalidateAtPluginsCache()
      if (previousDsh === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDsh
      if (previousProfile === undefined) delete process.env.DSH_PROFILE
      else process.env.DSH_PROFILE = previousProfile
      rmSync(root, { recursive: true, force: true })
    },
  }
}

function writeJson(file, data) {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2))
}

function writeSkill(pluginDir, dirName, { fmName, description }) {
  const dir = join(pluginDir, 'skills', dirName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${fmName}\ndescription: ${description}\n---\n\n# ${fmName}\nBody.\n`)
}

test('listAtPlugins filters enabled plugins, reuses browse smart descriptions, excludes user-mcp and standalone skills', async () => {
  const env = setupEnv()
  try {
    const marketDir = join(marketRoot(), 'market', 'curated', '.claude-plugin')
    mkdirSync(marketDir, { recursive: true })
    writeJson(join(marketDir, 'marketplace.json'), {
      name: 'curated',
      plugins: [
        {
          name: 'computer-use',
          displayName: 'Computer Use',
          shortDescription: 'Control Windows apps natively.',
          description: 'Full long computer-use description that should not beat shortDescription.',
          author: { name: 'TeamA' },
          source: './plugins/computer-use',
        },
        {
          name: 'fallback-author',
          author: { name: 'Jane Doe' },
          source: './plugins/fallback-author',
        },
      ],
    })

    const cuDir = installedDir('computer-use')
    writeJson(join(cuDir, '.codex-plugin', 'plugin.json'), {
      name: 'computer-use',
      description: 'Full manifest description.',
      interface: {
        displayName: 'Computer Use',
        shortDescription: 'Control Windows desktop apps cleanly.',
      },
    })
    writeJson(join(cuDir, 'plugin.json'), { name: 'computer-use' })

    const remotionDir = installedDir('remotion')
    writeJson(join(remotionDir, 'plugin.json'), {
      name: 'remotion',
      displayName: 'Remotion',
      description: 'Create videos programmatically with React.',
    })

    const authorOnlyDir = installedDir('fallback-author')
    writeJson(join(authorOnlyDir, 'plugin.json'), {
      name: 'fallback-author',
      author: 'Jane Doe',
    })

    const disabledDir = installedDir('disabled-one')
    writeJson(join(disabledDir, 'plugin.json'), {
      name: 'disabled-one',
      displayName: 'Disabled Plugin',
      description: 'Should never show up in @ menu.',
    })

    // Standalone uploaded/local skills in $DSH_HOME/skills must never appear as plugins.
    mkdirSync(join(dshSkillsDir(), 'my-uploaded-skill'), { recursive: true })
    writeFileSync(join(dshSkillsDir(), 'my-uploaded-skill', 'SKILL.md'), '---\nname: my-uploaded-skill\ndescription: Standalone\n---\n')

    writeState({
      version: 1,
      sources: [{ id: 'curated', name: 'Curated', url: 'https://example.invalid/curated.git' }],
      uploadedSkills: [{ name: 'my-uploaded-skill', uploadedAt: 1 }],
      plugins: [
        { name: 'remotion', sourceId: 'curated', enabled: true, installedAt: 1 },
        { name: 'computer-use', sourceId: 'curated', installedAt: 2 },
        { name: 'fallback-author', sourceId: 'curated', enabled: true, installedAt: 3 },
        { name: 'disabled-one', sourceId: 'curated', enabled: false, installedAt: 4 },
        { name: 'ghost-missing', sourceId: 'curated', enabled: true, installedAt: 5 },
        { name: 'user-mcp', sourceId: 'local', enabled: true, installedAt: 6 },
      ],
    })

    const list = listAtPlugins()
    assert.deepEqual(list.map(p => p.name), ['computer-use', 'fallback-author', 'remotion'])
    assert.equal(list[0].displayName, 'Computer Use')
    assert.equal(list[0].shortDescription, 'Control Windows desktop apps cleanly.')
    assert.equal(list[0].summary, 'Control Windows desktop apps cleanly.')
    assert.equal(list[1].displayName, 'Fallback author')
    assert.equal(list[1].summary, 'by Jane Doe')
    assert.equal(list[2].displayName, 'Remotion')
    assert.equal(list[2].summary, 'Create videos programmatically with React.')

    // HTTP endpoint & cache invalidation
    let registeredHandler = null
    mountRoutes({
      register(def) { registeredHandler = def.handler; return () => {} },
    })
    const httpRes = await new Promise((resolve) => {
      const server = createServer((req, res) => registeredHandler(req, res))
      server.listen(0, '127.0.0.1', async () => {
        const { port } = server.address()
        const r = await fetch(`http://127.0.0.1:${port}/universal-plugin-hub/api/at-plugins`)
        const json = await r.json()
        server.close(() => resolve(json))
      })
    })
    assert.deepEqual(httpRes.plugins.map(p => p.name), ['computer-use', 'fallback-author', 'remotion'])

    // Toggle plugin -> cache invalidates cleanly
    const current = JSON.parse(readFileSync(join(marketRoot(), 'state.json'), 'utf8'))
    current.plugins = current.plugins.map(p => p.name === 'remotion' ? { ...p, enabled: false } : p)
    writeState(current)
    invalidateAtPluginsCache()
    assert.deepEqual(listAtPlugins().map(p => p.name), ['computer-use', 'fallback-author'])
  } finally {
    env.cleanup()
  }
})

test('atPluginsBootPayload enforces 128KB budget by stripping bulky previews first without dropping plugins', () => {
  const env = setupEnv()
  try {
    const hugePng = 'data:image/png;base64,' + 'A'.repeat(70 * 1024)
    const plugins = []
    for (const id of ['alpha', 'beta', 'gamma']) {
      const dir = installedDir(id)
      mkdirSync(dir, { recursive: true })
      writeJson(join(dir, 'plugin.json'), {
        name: id,
        displayName: `Plugin ${id}`,
        description: `Description for ${id}`,
        icon: './icon.png',
      })
      plugins.push({
        name: id,
        sourceId: 'curated',
        enabled: true,
        installedAt: 1,
        icons: {
          light: ['/universal-plugin-hub/api/plugin-icon?name=' + id],
          dark: ['/universal-plugin-hub/api/plugin-icon?name=' + id],
          previews: { ['/universal-plugin-hub/api/plugin-icon?name=' + id]: hugePng },
        },
      })
    }
    writeState({ version: 1, sources: [], plugins })
    const payload = atPluginsBootPayload()
    assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') <= AT_PLUGINS_BOOT_LIMIT)
    assert.deepEqual(payload.map(p => p.name), ['alpha', 'beta', 'gamma'])
    assert.equal(payload[0].icons.previews, undefined)
  } finally {
    env.cleanup()
  }
})

test('extractPluginMentions enforces wire mentions and strict single-token manual @boundaries', () => {
  const known = new Map([
    ['computer-use', { name: 'computer-use', displayName: 'Computer Use' }],
    ['remotion', { name: 'remotion', displayName: 'Remotion' }],
  ])

  const wireText = `Use ${formatPluginMention('computer-use', 'Computer Use')} to automate.`
  const wireHits = extractPluginMentions(wireText, known)
  assert.equal(wireHits.length, 1)
  assert.equal(wireHits[0].plugin.name, 'computer-use')
  assert.equal(wireHits[0].via, 'chip')

  // Multi-word "@computer use" MUST NOT match "computer-use" (only checks single token "computer")
  assert.deepEqual(extractPluginMentions('Use @computer use right now', known), [])
  // Path scopes and extensions MUST NOT match @remotion
  assert.deepEqual(extractPluginMentions('Import @remotion/player from npm', known), [])
  assert.deepEqual(extractPluginMentions('Check @remotion.ts and email@remotion.com', known), [])
  assert.deepEqual(extractPluginMentions('Ignore @[Disabled](uph-plugin:disabled-plugin)', known), [])

  // Valid single-token mentions (including CJK neighbors & trailing sentence punctuation)
  const valid = extractPluginMentions('请用@remotion。并且试下 @Computer-Use, (@remotion)', known)
  assert.deepEqual(valid.map(m => m.plugin.name), ['remotion', 'computer-use', 'remotion'])
})

test('collectPluginCapabilities & agent/pre-step resolve live skill slugs, active MCP only, agents, and inject Codex notice', async () => {
  const env = setupEnv()
  try {
    const exaDir = installedDir('exa-mcp-search')
    writeJson(join(exaDir, 'plugin.json'), {
      name: 'exa-mcp-search',
      displayName: 'Exa Search',
      description: 'Web search and research.',
      mcpServers: {
        exa: { command: 'npx', args: ['-y', 'exa-mcp'] },
        disabledConnector: { url: 'https://disabled.example.invalid/mcp' },
      },
    })
    writeSkill(exaDir, 'exa-agent', { fmName: 'Exa Agent', description: 'Run deep search agents.' })
    writeSkill(exaDir, 'exa-disabled', { fmName: 'exa-disabled', description: 'Disabled skill.' })
    mkdirSync(join(exaDir, 'agents'), { recursive: true })
    writeFileSync(join(exaDir, 'agents', 'researcher.md'), '---\nname: exa-researcher\ndescription: Research helper agent\n---\n')
    mkdirSync(join(exaDir, 'prompts'), { recursive: true })
    writeFileSync(join(exaDir, 'prompts', 'quick.md'), '---\ndescription: Quick web search prompt\n---\nPrompt body')

    // Register ONLY the active MCP server (`exa`) in cordis.patch.yml; `disabledConnector` is disabled.
    const patchPath = join(env.root, 'profiles', 'web', 'cordis.patch.yml')
    writeFileSync(patchPath, [
      '- insert:',
      '    - id: mcp-exa-mcp-search-exa',
      '      name: mcp',
      '      enabled: true',
      '      config:',
      '        type: stdio',
      '        command: npx',
      '- insert:',
      '    - id: mcp-exa-mcp-search-disabledconnector',
      '      name: mcp',
      '      enabled: false',
      '      config:',
      '        type: http',
      '        url: https://disabled.example.invalid/mcp',
    ].join('\n'))

    writeState({
      version: 1,
      sources: [{ id: 'curated', name: 'Curated', url: 'https://example.invalid/curated.git' }],
      plugins: [{ name: 'exa-mcp-search', sourceId: 'curated', enabled: true, installedAt: 1 }],
    })

    const handlers = new Map()
    const hostCtx = {
      on(ev, fn) { handlers.set(ev, fn); return () => handlers.delete(ev) },
      workingDirectory: { ensure: async () => env.root },
      skills: {
        snapshot: async () => ({
          complete: true,
          skills: [
            { name: 'exa-agent', description: 'Live exa-agent skill', modelInvocable: true },
            { name: 'exa-disabled', description: 'Should be skipped', modelInvocable: false },
          ],
        }),
      },
    }

    const caps = collectPluginCapabilities('exa-mcp-search', {
      snapshotSkills: (await hostCtx.skills.snapshot()).skills,
    })
    assert.deepEqual(caps.skills.map(s => s.name), ['exa-agent'])
    assert.deepEqual(caps.mcpServers.map(m => m.name), ['exa'])
    assert.deepEqual(caps.agents.map(a => a.name), ['exa-researcher'])
    assert.deepEqual(caps.prompts.map(p => p.name), ['quick'])

    const detach = attachAtPluginsAgentHook(hostCtx)
    try {
      const preStep = handlers.get('agent/pre-step')
      assert.equal(typeof preStep, 'function')

      const baseDecision = {
        kind: 'continue',
        messages: [{ role: 'user', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'sys' }] }],
      }

      // Unmentioned user message passes through untouched
      const plain = await preStep({
        agent: 'default',
        messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hello @exa-mcp-search/foo' }] }],
      }, async () => baseDecision)
      assert.equal(plain.messages.length, 1)

      // Mentioned plugin injects Codex-style notice AFTER baseDecision messages
      const withChip = await preStep({
        agent: 'default',
        messages: [{
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'text', text: `Find docs with ${formatPluginMention('exa-mcp-search', 'Exa Search')} and @exa-mcp-search` }],
        }],
      }, async () => baseDecision)
      assert.equal(withChip.messages.length, 2)
      const injected = withChip.messages[1]
      assert.equal(injected.source.kind, 'plugin-routing')
      assert.equal(injected.source.form, 'notice')
      assert.ok(injected.source.summary.length <= 120)
      assert.match(injected.content[0].text, /<explicit_plugin name="Exa Search" id="exa-mcp-search"/)
      assert.match(injected.content[0].text, /- exa-agent: Live exa-agent skill/)
      assert.match(injected.content[0].text, /- exa \(mcp-exa-mcp-search-exa\)/)
      assert.doesNotMatch(injected.content[0].text, /disabledConnector/)
      assert.match(injected.content[0].text, /exa-researcher/)
      assert.match(injected.content[0].text, /- quick/)
      assert.match(injected.content[0].text, /call the `skill` tool \(`\{ "name": "<skill-name>" \}`\) ONLY for the skill\(s\) clearly needed/)
      assert.ok(Object.isFrozen(injected))

      // Reject decisions pass through without extra injections
      const rejected = await preStep({
        agent: 'default',
        messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '@exa-mcp-search' }] }],
      }, async () => ({ kind: 'reject', reason: 'aborted' }))
      assert.equal(rejected.kind, 'reject')
    } finally {
      detach()
    }
  } finally {
    env.cleanup()
  }
})

test('renderExplicitPluginInstructions handles plugins whose MCP connectors are all disabled cleanly', () => {
  const text = renderExplicitPluginInstructions([{
    plugin: { name: 'empty-plug', displayName: 'Empty Plug', summary: 'Waiting config' },
    capabilities: { skills: [], mcpServers: [], agents: [], prompts: [] },
  }])
  assert.match(text, /No active skills or enabled MCP servers/)
})

test('client.js registers @ input trigger (order -1, scoped UI, reference chip) and userText rule (order 15) cleanly', async () => {
  const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  let loadedModule = null
  const appendedStyles = []
  const docListeners = new Map()
  const registeredSources = []
  const registeredRules = []
  const registeredSlots = []
  const cleanups = []
  let fetchCalls = 0
  let serverPlugins = [
    {
      name: 'computer-use',
      displayName: 'Computer Use',
      shortDescription: 'Control Windows apps natively.',
      description: 'Long desc',
      summary: 'Control Windows apps natively.',
      sourceId: 'curated',
      author: 'Team',
      icons: { light: [], dark: [] },
    },
    {
      name: 'remotion',
      displayName: 'Remotion',
      shortDescription: '',
      description: 'Write videos in React.',
      summary: 'Write videos in React.',
      sourceId: 'curated',
      author: 'Remotion',
      icons: { light: [], dark: [] },
    },
  ]

  const fakeDoc = {
    hidden: false,
    documentElement: {
      getAttribute: () => 'dark',
      classList: { contains: (c) => c === 'dark' },
    },
    body: {
      getAttribute: () => null,
      classList: { contains: () => false },
    },
    head: { append: (el) => appendedStyles.push(el) },
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      dataset: {},
      textContent: '',
      remove() {},
    }),
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set())
      docListeners.get(ev).add(fn)
    },
    removeEventListener(ev, fn) {
      docListeners.get(ev)?.delete(fn)
    },
    dispatchEvent(ev) {
      for (const fn of Array.from(docListeners.get(ev.type) || [])) fn(ev)
    },
    querySelectorAll: () => [],
  }

  const sandbox = {
    window: {
      __ModuleLoader__: { load(def) { loadedModule = def } },
      getComputedStyle: () => ({ backgroundColor: 'rgb(20, 20, 20)', color: 'rgb(240, 240, 240)' }),
      localStorage: null,
    },
    document: fakeDoc,
    globalThis: {},
    __UPH_AT_PLUGINS__: serverPlugins,
    Event: class { constructor(type) { this.type = type } },
    AbortController,
    MutationObserver: class { observe() {} disconnect() {} },
    CSS: {},
    Image: class {},
    fetch: async (url) => {
      const targetUrl = String(url)
      if (targetUrl.includes('/universal-plugin-hub/api/tool-call-icons')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ groups: [] }),
          text: async () => JSON.stringify({ groups: [] }),
        }
      }
      fetchCalls += 1
      assert.match(targetUrl, /\/universal-plugin-hub\/api\/at-plugins/)
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ plugins: serverPlugins }),
        text: async () => JSON.stringify({ plugins: serverPlugins }),
      }
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    Promise,
    Map,
    Set,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    encodeURIComponent,
    decodeURIComponent,
  }
  sandbox.globalThis = sandbox

  vm.runInNewContext(clientSource, sandbox)
  assert.ok(loadedModule && typeof loadedModule.factory === 'function')

  const pluginExports = loadedModule.factory((id) => {
    if (id === 'react') return React
    throw new Error(`Unexpected require(${id})`)
  })

  const mockCtx = {
    theme: { isDark: true },
    slots: {
      inject() { return () => {} },
      register(def, comp) { registeredSlots.push({ def, comp }); return () => {} },
    },
    effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d) },
    inject(services, fn) {
      if (services.includes('inputTriggers')) {
        fn({
          inputTriggers: { registerSource: (s) => { registeredSources.push(s); return () => {} } },
          effect: (cb) => { const d = cb(); if (typeof d === 'function') cleanups.push(d) },
        })
      }
      if (services.includes('uiConversation')) {
        fn({
          uiConversation: { userText: { register: (r) => { registeredRules.push(r); return () => {} } } },
          effect: (cb) => { const d = cb(); if (typeof d === 'function') cleanups.push(d) },
        })
      }
    },
  }

  pluginExports.apply(mockCtx)

  try {
    // 1. Eager scoped style injection covering menu rows, compact inline chips, & frosted squircle popover
    const atStyle = appendedStyles.find(s => 'uphAtPlugins' in s.dataset)
    assert.ok(atStyle, 'client must inject @ plugins scoped <style> on apply')
    assert.match(atStyle.textContent, /button\[id\^="dsh-slash-option-plugins-"\]/)
    assert.match(atStyle.textContent, /text-align:\s*left/)
    assert.match(atStyle.textContent, /\.cpm-at-plugin-chip/)
    assert.match(atStyle.textContent, /--dsw-alias-label-primary/)
    assert.match(atStyle.textContent, /width:\s*clamp\(13px,\s*1em,\s*16px\)/)
    assert.match(atStyle.textContent, /\[data-composer-chip="plugins"\]\[data-uph-plugin-resolved="true"\]\s*>\s*span:not\(\[data-uph-chip-icon\]\)\s*>\s*span:first-child[\s\S]*display:\s*none\s*!important/)
    assert.match(atStyle.textContent, /\.cpm-at-plugin-popover\s*\{[\s\S]*max-width:\s*min\(204px,\s*calc\(100vw - 24px\)\)[\s\S]*border-radius:\s*var\(--dsw-radius-lg,\s*16px\);[\s\S]*corner-shape:\s*squircle;[\s\S]*backdrop-filter:\s*blur\(20px\)\s*saturate\(180%\)/)
    assert.match(atStyle.textContent, /\.cpm-at-plugin-popover-desc\s*\{[\s\S]*text-wrap:\s*pretty;/)
    assert.match(atStyle.textContent, /@starting-style/)
    assert.match(atStyle.textContent, /transition-behavior:\s*allow-discrete/)
    assert.match(atStyle.textContent, /@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    assert.match(atStyle.textContent, /@media\s*\(prefers-reduced-transparency:\s*reduce\)/)
    assert.match(atStyle.textContent, /@media\s*\(prefers-contrast:\s*more\)/)

    // 2. InputTriggerSource contract (order -1, section 'Plugins', no alias, zero cold HTTP fetch)
    assert.equal(registeredSources.length, 1)
    const src = registeredSources[0]
    assert.equal(src.trigger, '@')
    assert.equal(src.name, 'plugins')
    assert.equal(src.order, -1)
    assert.equal(src.showGroupTitle, false)
    assert.deepEqual(Array.from(src.lexicon({ sessionId: 's1' })), ['computer-use', 'remotion'])

    const all = await src.candidates({ sessionId: 's1' }, { query: '', quoted: false, position: 'leading', drilled: false, signal: new AbortController().signal })
    assert.equal(fetchCalls, 0, 'boot cache prevents cold network fetch on @')
    assert.deepEqual(all.map(c => c.name), ['Computer Use', 'Remotion'])
    assert.equal(all[0].label, undefined, 'omits differing label so MenuView does not render duplicate itemAlias')
    assert.equal(all[0].section, 'Plugins')
    assert.equal(all[0].description, 'Control Windows apps natively.')
    assert.equal(all[1].description, 'Write videos in React.')

    // Memoized icon component stability across keystrokes + renders cleanly
    const filtered = await src.candidates({ sessionId: 's1' }, { query: 'comp', quoted: false, position: 'leading', drilled: false, signal: new AbortController().signal })
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].icon, all[0].icon)
    let menuIconTree
    act(() => {
      menuIconTree = create(React.createElement(filtered[0].icon, { size: 14 }))
    })
    assert.equal(menuIconTree.toJSON().props.className, 'cpm-at-plugin-icon')

    // Quoted @file search suppresses Plugins group cleanly
    const quoted = await src.candidates({ sessionId: 's1' }, { query: 'Computer', quoted: true, position: 'inline', drilled: false, signal: new AbortController().signal })
    assert.deepEqual(Array.from(quoted), [])

    // Pick returns ReferenceInsert + matching codec
    const pick = src.onPick({ candidate: filtered[0], action: 'pick', via: 'enter' })
    assert.equal(pick.insert.source, 'plugins')
    assert.equal(pick.insert.label, 'Computer Use')
    assert.equal(pick.insert.ref, '@[Computer Use](uph-plugin:computer-use)')
    assert.equal(src.codec.clipboardText(pick.insert.ref), pick.insert.ref)
    assert.equal(await src.codec.serialize(pick.insert.ref), pick.insert.ref)

    // 3. UserTextRule (order 15 < fileReferenceRule 30) & chip slot rendering
    const rule = registeredRules.at(-1)
    assert.equal(rule.id, 'uph-plugin')
    assert.equal(rule.order, 15)
    assert.equal(rule.match('Run @computer use now', 0), undefined)
    assert.equal(rule.match('Import @remotion/player please', 0), undefined)
    assert.equal(rule.match('Mail user@remotion.com now', 0), undefined)

    const chipText = '请用 @[Computer Use](uph-plugin:computer-use) 和 @remotion!'
    const firstNode = rule.match(chipText, 0)
    assert.deepEqual(JSON.parse(JSON.stringify(firstNode)), {
      id: 'uph-plugin',
      start: 3,
      end: '请用 @[Computer Use](uph-plugin:computer-use)'.length,
      data: { name: 'computer-use', label: 'Computer Use' },
    })
    const secondNode = rule.match(chipText, firstNode.end)
    assert.deepEqual(JSON.parse(JSON.stringify(secondNode)), {
      id: 'uph-plugin',
      start: chipText.indexOf('@remotion'),
      end: chipText.indexOf('!'),
      data: { name: 'remotion', label: 'Remotion' },
    })
    // Historical uninstalled wire mention still renders a readable chip
    const legacy = rule.match('Old @[Old Plug](uph-plugin:old-plug) msg', 0)
    assert.equal(legacy.data.label, 'Old Plug')

    const chipSlot = registeredSlots.find(s => s.def.name === 'conversation.user.text.node' && s.def.key === 'uph-plugin')
    assert.ok(chipSlot)
    let tree
    act(() => {
      tree = create(React.createElement(chipSlot.comp, { node: secondNode, raw: '@remotion', interactive: false }))
    })
    const jsonTree = tree.toJSON()
    assert.equal(jsonTree.props.className, 'cpm-at-plugin-chip')
    assert.equal(jsonTree.props.title, undefined, 'resolved sent chip must never attach native browser title tooltip')
    assert.equal(jsonTree.props['data-uph-plugin-name'], 'remotion')
    assert.equal(jsonTree.children.length, 2)
    assert.equal(jsonTree.children[0].props.className, 'cpm-at-plugin-chip-icon-wrap')
    assert.equal(jsonTree.children[1].props.className, 'cpm-at-plugin-chip-label')
    assert.equal(jsonTree.children[1].children.join(''), 'Remotion')

    let legacyTree
    act(() => {
      legacyTree = create(React.createElement(chipSlot.comp, { node: legacy, raw: '@[Old Plug](uph-plugin:old-plug)', interactive: false }))
    })
    const legacyJson = legacyTree.toJSON()
    assert.equal(legacyJson.props.className, 'cpm-at-plugin-chip is-unresolved')
    assert.equal(legacyJson.props.title, undefined)
    assert.equal(legacyJson.children[0].props.className, 'cpm-at-plugin-chip-marker')
    assert.equal(legacyJson.children[0].children.join(''), '@')

    // 4. Invalidation event refreshes cache, lexicon subscribers, and re-registers rule
    let lexNotified = 0
    src.subscribeLexicon({ sessionId: 's1' }, () => { lexNotified += 1 })
    serverPlugins = serverPlugins.slice(0, 1) // Remotion disabled
    fakeDoc.dispatchEvent(new sandbox.Event('uph-at-plugins-changed'))
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(fetchCalls, 1)
    assert.equal(lexNotified, 1)
    assert.deepEqual(Array.from(src.lexicon({ sessionId: 's1' })), ['computer-use'])
    assert.equal(registeredRules.at(-1).match('Use @remotion', 0), undefined)
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup()
  }
})

test('client composer Lexical chip sync, native title suppression, and top-layer hovercard placement', async () => {
  const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

  const createFakeElement = (tag, opts = {}) => {
    const attrs = new Map()
    let rect = opts.rect || { left: 260, top: 420, width: 88, height: 24, right: 348, bottom: 444 }
    let popoverOpen = false
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      children: [],
      parentElement: null,
      style: {},
      classList: { contains: () => false },
      textContent: opts.textContent || '',
      get isConnected() {
        if (el === fakeDoc.body || el === fakeDoc.documentElement) return true
        let p = el.parentElement
        while (p) {
          if (p === fakeDoc.body) return true
          p = p.parentElement
        }
        return false
      },
      dataset: new Proxy({}, {
        get(_t, prop) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase())
          return attrs.has(attr) ? attrs.get(attr) : undefined
        },
        set(_t, prop, value) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase())
          attrs.set(attr, String(value))
          return true
        },
        deleteProperty(_t, prop) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase())
          attrs.delete(attr)
          return true
        },
        has(_t, prop) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase())
          return attrs.has(attr)
        },
      }),
      setAttribute(name, value) { attrs.set(String(name), String(value)) },
      getAttribute(name) { return attrs.has(String(name)) ? attrs.get(String(name)) : null },
      hasAttribute(name) { return attrs.has(String(name)) },
      removeAttribute(name) { attrs.delete(String(name)) },
      append(...nodes) {
        for (const n of nodes) {
          if (n && typeof n === 'object') {
            if (n.parentElement) n.remove()
            n.parentElement = el
            el.children.push(n)
          }
        }
      },
      prepend(...nodes) {
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i]
          if (n && typeof n === 'object') {
            if (n.parentElement) n.remove()
            n.parentElement = el
            el.children.unshift(n)
          }
        }
      },
      remove() {
        if (!el.parentElement) return
        el.parentElement.children = el.parentElement.children.filter(c => c !== el)
        el.parentElement = null
      },
      contains(target) {
        let cur = target
        while (cur) {
          if (cur === el) return true
          cur = cur.parentElement
        }
        return false
      },
      closest(selector) {
        const selectors = String(selector).split(',').map(s => s.trim())
        let cur = el
        while (cur) {
          for (const sel of selectors) {
            if (sel === '[data-composer-chip="plugins"]' && cur.getAttribute('data-composer-chip') === 'plugins') return cur
            if (sel === '[data-composer-input]' && cur.hasAttribute('data-composer-input')) return cur
            if (sel.startsWith('.') && String(cur.className || '').split(/\s+/).includes(sel.slice(1))) return cur
          }
          cur = cur.parentElement
        }
        return null
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null },
      querySelectorAll(sel) {
        const out = []
        const walk = (node) => {
          for (const ch of node.children || []) {
            if (
              (sel === '[data-composer-chip="plugins"]' && ch.getAttribute('data-composer-chip') === 'plugins') ||
              (sel === '[data-composer-input]' && ch.hasAttribute('data-composer-input')) ||
              (sel === '[data-uph-at-plugins-overlay]' && ch.hasAttribute('data-uph-at-plugins-overlay')) ||
              (sel === '[data-uph-chip-icon]' && ch.hasAttribute('data-uph-chip-icon')) ||
              (sel === 'style[data-uph-at-plugins]' && ch.tagName === 'STYLE' && ch.hasAttribute('data-uph-at-plugins')) ||
              (sel === '[title]' && ch.hasAttribute('title'))
            ) out.push(ch)
            walk(ch)
          }
        }
        walk(el)
        return out
      },
      matches(sel) { return sel === ':popover-open' ? popoverOpen : false },
      showPopover() { popoverOpen = true },
      hidePopover() { popoverOpen = false },
      getBoundingClientRect() { return rect },
      _setRect(next) { rect = next },
      _isPopoverOpen() { return popoverOpen },
    }
    return el
  }

  const docListeners = new Map()
  const winListeners = new Map()
  const observers = []
  let fakeDoc
  fakeDoc = {
    hidden: false,
    activeElement: null,
    documentElement: null,
    body: null,
    head: null,
    createElement: (tag) => createFakeElement(tag),
    querySelector: (sel) => fakeDoc.body.querySelector(sel) || fakeDoc.head.querySelector(sel),
    querySelectorAll: (sel) => [...fakeDoc.head.querySelectorAll(sel), ...fakeDoc.body.querySelectorAll(sel)],
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set())
      docListeners.get(ev).add(fn)
    },
    removeEventListener(ev, fn) {
      docListeners.get(ev)?.delete(fn)
    },
    dispatchEvent(ev) {
      for (const fn of Array.from(docListeners.get(ev.type) || [])) fn(ev)
    },
  }
  fakeDoc.documentElement = createFakeElement('html')
  fakeDoc.head = createFakeElement('head')
  fakeDoc.body = createFakeElement('body')
  fakeDoc.body.parentElement = fakeDoc.documentElement

  // Build composer chip mimicking DSH Lexical ReferenceChipNode DOM
  const composer = createFakeElement('div')
  composer.setAttribute('data-composer-input', 'true')
  const composerChip = createFakeElement('span', { rect: { left: 260, top: 420, width: 92, height: 24, right: 352, bottom: 444 } })
  composerChip.setAttribute('data-composer-chip', 'plugins')
  const innerRefSpan = createFakeElement('span')
  innerRefSpan.className = 'reference chip'
  innerRefSpan.setAttribute('title', 'Remotion')
  const innerMarker = createFakeElement('span', { textContent: '@' })
  const innerLabel = createFakeElement('span', { textContent: 'Remotion' })
  innerRefSpan.append(innerMarker, innerLabel)
  // Seed a stale icon slot & overlay host (simulating leftover DOM across async React unmount / HMR)
  const staleSlot = createFakeElement('span')
  staleSlot.setAttribute('data-uph-chip-icon', '')
  const staleChild = createFakeElement('span')
  staleChild.className = 'cpm-at-plugin-chip-icon'
  staleSlot.append(staleChild)
  const staleOverlay = createFakeElement('div')
  staleOverlay.setAttribute('data-uph-at-plugins-overlay', '')
  fakeDoc.body.append(staleOverlay)

  composerChip.append(staleSlot, innerRefSpan)
  composer.append(composerChip)
  fakeDoc.body.append(composer)

  const serverPlugins = [
    {
      name: 'remotion',
      displayName: 'Remotion',
      shortDescription: 'Write videos in React and render to MP4.',
      description: 'Longer description fallback',
      summary: 'Summary fallback',
      sourceId: 'curated',
      author: 'Remotion',
      icons: { light: [], dark: [] },
    },
    {
      name: 'empty-desc',
      displayName: 'EmptyDesc',
      shortDescription: '',
      description: '',
      summary: '',
      sourceId: 'curated',
      author: '',
      icons: { light: [], dark: [] },
    },
  ]

  let overlayRenderer = null
  const mockPopupEl = createFakeElement('div', { rect: { left: 0, top: 0, width: 176, height: 42, right: 176, bottom: 42 } })

  const mockReactDOM = {
    createPortal(children, container, key) {
      return React.createElement('uph-portal', {
        key,
        containerTag: container?.tagName,
        isIconSlot: container?.hasAttribute?.('data-uph-chip-icon') || false,
      }, children)
    },
  }
  const mockReactDOMClient = {
    createRoot(container) {
      if (container && mockPopupEl.parentElement !== container) container.append(mockPopupEl)
      return {
        render(el) {
          act(() => {
            overlayRenderer = create(el, {
              createNodeMock(node) {
                if (node.type === 'div' && node.props?.id === 'uph-at-plugin-hover-popover') return mockPopupEl
                return createFakeElement(node.type || 'div')
              },
            })
          })
        },
        unmount() {
          act(() => {
            overlayRenderer?.unmount()
          })
        },
      }
    },
  }

  let loadedModule = null
  const sandbox = {
    window: {
      __ModuleLoader__: { load(def) { loadedModule = def } },
      innerWidth: 1280,
      innerHeight: 720,
      getComputedStyle: () => ({ backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(24, 24, 27)' }),
      localStorage: null,
      addEventListener(ev, fn) {
        if (!winListeners.has(ev)) winListeners.set(ev, new Set())
        winListeners.get(ev).add(fn)
      },
      removeEventListener(ev, fn) {
        winListeners.get(ev)?.delete(fn)
      },
    },
    document: fakeDoc,
    globalThis: {},
    __UPH_AT_PLUGINS__: serverPlugins,
    Event: class { constructor(type, extra = {}) { Object.assign(this, extra); this.type = type } },
    AbortController,
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.options = null; observers.push(this) }
      observe(_target, options) { this.options = options }
      disconnect() {}
      trigger(mutations) { this.cb(mutations) }
    },
    CSS: {},
    Image: class {},
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ plugins: serverPlugins }),
      text: async () => JSON.stringify({ plugins: serverPlugins }),
    }),
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    Promise,
    Map,
    Set,
    WeakMap,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    encodeURIComponent,
    decodeURIComponent,
  }
  sandbox.globalThis = sandbox

  vm.runInNewContext(clientSource, sandbox)
  const pluginExports = loadedModule.factory((id) => {
    if (id === 'react') return React
    if (id === 'react-dom') return mockReactDOM
    if (id === 'react-dom/client') return mockReactDOMClient
    throw new Error(`Unexpected require(${id})`)
  })

  const cleanups = []
  const registeredRules = []
  const registeredSlots = []
  await act(async () => {
    pluginExports.apply({
      theme: { isDark: false },
      slots: {
        inject() { return () => {} },
        register(def, comp) { registeredSlots.push({ def, comp }); return () => {} },
      },
      effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d) },
      inject(services, fn) {
        if (services.includes('uiConversation')) {
          fn({
            uiConversation: { userText: { register: (r) => { registeredRules.push(r); return () => {} } } },
            effect: (cb) => { const d = cb(); if (typeof d === 'function') cleanups.push(d) },
          })
        }
      },
    })
  })

  const findPopoverNode = () => {
    const json = overlayRenderer?.toJSON()
    const list = Array.isArray(json) ? json : [json]
    return list.find(n => n?.props?.id === 'uph-at-plugin-hover-popover') || null
  }
  const findIconPortals = () => {
    const json = overlayRenderer?.toJSON()
    const list = Array.isArray(json) ? json : [json]
    return list.filter(n => n?.type === 'uph-portal')
  }

  try {
    // 1. Composer chip sync strips stale slots & title, marks resolved, and mounts ONE fresh PluginIcon portal
    assert.equal(innerRefSpan.hasAttribute('title'), false, 'composer chip inner title stripped')
    assert.equal(composerChip.getAttribute('data-uph-plugin-resolved'), 'true')
    assert.equal(composerChip.getAttribute('data-uph-plugin-name'), 'remotion')
    const chipSlots = composerChip.children.filter(c => c.hasAttribute('data-uph-chip-icon'))
    assert.equal(chipSlots.length, 1, 'never renders duplicate icon slots on composer chip')
    assert.notEqual(chipSlots[0], staleSlot, 'replaces unowned stale slot cleanly rather than reusing it')
    assert.equal(staleSlot.isConnected, false, 'stale HMR icon slot detached')
    assert.equal(staleOverlay.isConnected, false, 'stale HMR overlay host detached')
    assert.equal(fakeDoc.querySelectorAll('[data-uph-at-plugins-overlay]').length, 1)
    assert.equal(findIconPortals().length, 1)

    // Injecting an extra unowned slot triggers MutationObserver cleanup back down to 1 owned slot
    const rogueSlot = createFakeElement('span')
    rogueSlot.setAttribute('data-uph-chip-icon', '')
    composerChip.append(rogueSlot)
    await act(async () => {
      const obs = observers.find(o => o.options?.attributeFilter?.includes('title'))
      obs.trigger([{ type: 'childList', target: composerChip, addedNodes: [rogueSlot], removedNodes: [] }])
      await Promise.resolve()
    })
    assert.equal(rogueSlot.isConnected, false, 'rogue/cloned duplicate icon slot stripped on mutation')
    assert.equal(composerChip.children.filter(c => c.hasAttribute('data-uph-chip-icon')).length, 1)
    assert.equal(composerChip.children[0], chipSlots[0], 'owned icon slot stays first child before text')

    // Re-adding title via Lexical update triggers MutationObserver attribute suppression
    const chipObserver = observers.find(o => o.options?.attributeFilter?.includes('title'))
    assert.ok(chipObserver, 'composer chip observer watches title attributes')
    innerRefSpan.setAttribute('title', 'Remotion')
    chipObserver.trigger([{ type: 'attributes', attributeName: 'title', target: innerRefSpan, addedNodes: [], removedNodes: [] }])
    assert.equal(innerRefSpan.hasAttribute('title'), false, 'MutationObserver suppresses re-applied title')

    // 2. Hovering composer chip opens top-layer description-only popover ABOVE chip after delay
    act(() => {
      fakeDoc.dispatchEvent({ type: 'pointerover', target: innerLabel, clientX: 300, clientY: 432, buttons: 0, pointerType: 'mouse' })
    })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 210))
    })

    let pop = findPopoverNode()
    assert.ok(pop)
    assert.equal(pop.props['data-placement'], 'top', 'popover renders above chip by default')
    assert.equal(pop.props.style.visibility, 'visible')
    assert.equal(composerChip.getAttribute('aria-describedby'), 'uph-at-plugin-hover-popover')
    assert.equal(mockPopupEl.getAttribute('popover'), 'hint')
    assert.equal(mockPopupEl._isPopoverOpen(), true)
    assert.equal(pop.children[0].children.join(''), 'Write videos in React and render to MP4.')
    // Verify centered above chip: chip center X = 306, popover width 176 => left = 306 - 88 = 218; top = 420 - 42 - 8 = 370
    assert.equal(pop.props.style.left, '218px')
    assert.equal(pop.props.style.top, '370px')

    // 3. Moving pointer onto the popover keeps it open (hoverable) and pressing Escape dismisses it
    act(() => {
      mockPopupEl._setRect({ left: 218, top: 370, width: 176, height: 42, right: 394, bottom: 412 })
      fakeDoc.dispatchEvent({ type: 'pointermove', target: mockPopupEl, clientX: 280, clientY: 390, buttons: 0, pointerType: 'mouse' })
    })
    assert.equal(findPopoverNode().props.style.visibility, 'visible', 'popover stays open while pointer enters it')

    act(() => {
      fakeDoc.dispatchEvent({ type: 'keydown', key: 'Escape', target: fakeDoc.body })
    })
    assert.equal(findPopoverNode().props.style.visibility, 'hidden', 'Escape dismisses popover')
    assert.equal(composerChip.getAttribute('aria-describedby'), null)

    // 4. Focus near top edge flips popover below chip + clamping at left viewport edge
    composerChip._setRect({ left: 4, top: 18, width: 60, height: 24, right: 64, bottom: 42 })
    act(() => {
      fakeDoc.activeElement = composerChip
      fakeDoc.dispatchEvent({ type: 'focusin', target: composerChip })
    })
    pop = findPopoverNode()
    assert.equal(pop.props['data-placement'], 'bottom', 'flips below when insufficient headroom above chip')
    assert.equal(pop.props.style.left, '12px', 'clamped to 12px horizontal viewport margin')
    assert.equal(pop.props.style.top, '50px', 'placed 8px below anchorRect.bottom (42 + 8)')

    // 5. Typing inside composer dismisses open popover
    act(() => {
      fakeDoc.dispatchEvent({ type: 'keydown', key: 'a', target: composer })
    })
    assert.equal(findPopoverNode().props.style.visibility, 'hidden')

    // 6. Fallback descriptions for empty description & unresolved sent chip
    const emptyChip = createFakeElement('span', { rect: { left: 200, top: 420, width: 80, height: 24, right: 280, bottom: 444 } })
    emptyChip.className = 'cpm-at-plugin-chip'
    emptyChip.setAttribute('data-uph-plugin-name', 'empty-desc')
    fakeDoc.body.append(emptyChip)
    act(() => {
      fakeDoc.activeElement = emptyChip
      fakeDoc.dispatchEvent({ type: 'focusin', target: emptyChip })
    })
    assert.equal(findPopoverNode().children[0].children.join(''), '暂无插件描述')

    const unresolvedChip = createFakeElement('span', { rect: { left: 200, top: 420, width: 80, height: 24, right: 280, bottom: 444 } })
    unresolvedChip.className = 'cpm-at-plugin-chip is-unresolved'
    unresolvedChip.setAttribute('data-uph-plugin-name', 'missing-plug')
    fakeDoc.body.append(unresolvedChip)
    act(() => {
      fakeDoc.activeElement = unresolvedChip
      fakeDoc.dispatchEvent({ type: 'focusin', target: unresolvedChip })
    })
    pop = findPopoverNode()
    assert.equal(pop.props['data-unresolved'], 'true')
    assert.equal(pop.children[0].children.join(''), '该插件当前未启用或未安装')

    // 7. Disconnecting hovered chip via MutationObserver dismisses popover cleanly
    unresolvedChip.remove()
    await act(async () => {
      chipObserver.trigger([{ type: 'childList', target: fakeDoc.body, addedNodes: [], removedNodes: [unresolvedChip] }])
      await Promise.resolve()
    })
    assert.equal(findPopoverNode().props.style.visibility, 'hidden')

    // 8. Overlapping re-apply (HMR reload without awaiting prior teardown) stays strictly single-icon & dispose cleans up
    await act(async () => {
      pluginExports.apply({
        theme: { isDark: false },
        slots: {
          inject() { return () => {} },
          register(def, comp) { registeredSlots.push({ def, comp }); return () => {} },
        },
        effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d) },
        inject() {},
      })
    })
    assert.equal(composerChip.children.filter(c => c.hasAttribute('data-uph-chip-icon')).length, 1, 'HMR reload keeps single icon slot')
    assert.equal(fakeDoc.querySelectorAll('[data-uph-at-plugins-overlay]').length, 1, 'HMR reload keeps single overlay host')
    assert.equal(fakeDoc.querySelectorAll('style[data-uph-at-plugins]').length, 1, 'HMR reload keeps single scoped stylesheet')
    assert.equal(findIconPortals().length, 1, 'HMR reload keeps single portal')
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup()
  }
  assert.equal(composerChip.children.filter(c => c.hasAttribute('data-uph-chip-icon')).length, 0, 'dispose removes icon slot cleanly')
  assert.equal(composerChip.hasAttribute('data-uph-plugin-resolved'), false, 'dispose restores resolved attribute')
  assert.equal(fakeDoc.querySelectorAll('[data-uph-at-plugins-overlay]').length, 0, 'dispose removes overlay host cleanly')
})

test('backend caches invalidate across nested manifests, marketplace refreshes, icon cache drops, and DSH_HOME switches', async () => {
  const envA = setupEnv()
  const envB = { root: mkdtempSync(join(tmpdir(), 'uph-at-plugins-homeb-')) }
  try {
    const dirA = installedDir('demo-plug')
    writeJson(join(dirA, '.codex-plugin', 'plugin.json'), {
      name: 'demo-plug',
      description: 'Full description A.',
      interface: { displayName: 'Demo A', shortDescription: 'Short v1' },
    })
    writeJson(join(marketRoot(), 'market', 'curated', '.claude-plugin', 'marketplace.json'), {
      name: 'curated',
      plugins: [{ name: 'demo-plug', displayName: 'Market v1', description: 'Market desc v1', source: './plugins/demo-plug' }],
    })
    writeState({
      version: 1,
      sources: [{ id: 'curated', name: 'Curated', url: 'https://example.invalid/curated.git' }],
      plugins: [{ name: 'demo-plug', sourceId: 'curated', enabled: true, installedAt: 1 }],
    })
    assert.equal(listAtPlugins()[0].shortDescription, 'Short v1')

    // Editing nested .codex-plugin/plugin.json inside installedDir without touching state.json busts catalog cache.
    writeJson(join(dirA, '.codex-plugin', 'plugin.json'), {
      name: 'demo-plug',
      description: 'Full description A.',
      interface: { displayName: 'Demo A', shortDescription: 'Short v2 updated inside subdir!' },
    })
    assert.equal(listAtPlugins()[0].shortDescription, 'Short v2 updated inside subdir!')

    // Invalidating marketplace cache picks up updated marketplace fallback fields even without state write.
    writeJson(join(dirA, '.codex-plugin', 'plugin.json'), {
      name: 'demo-plug',
      interface: { displayName: 'Demo A' },
    })
    writeJson(join(dirA, 'plugin.json'), { name: 'demo-plug' })
    writeJson(join(marketRoot(), 'market', 'curated', '.claude-plugin', 'marketplace.json'), {
      name: 'curated',
      plugins: [{ name: 'demo-plug', interface: { shortDescription: 'Refreshed market short copy' }, source: './plugins/demo-plug' }],
    })
    invalidateMarketplaceCache('curated')
    invalidateParserCaches()
    invalidateLocalIconCache('curated')
    assert.equal(listAtPlugins()[0].shortDescription, 'Refreshed market short copy')

    // Switching DSH_HOME never returns cached state from envA.
    process.env.DSH_HOME = envB.root
    const dirB = installedDir('other-plug')
    writeJson(join(dirB, 'plugin.json'), { name: 'other-plug', displayName: 'Other Home', description: 'Home B' })
    writeState({
      version: 1,
      sources: [],
      plugins: [{ name: 'other-plug', sourceId: 'local', enabled: true, installedAt: 2 }],
    })
    assert.deepEqual(readState().plugins.map(p => p.name), ['other-plug'])
    assert.deepEqual(listAtPlugins().map(p => p.name), ['other-plug'])

    process.env.DSH_HOME = envA.root
    assert.deepEqual(readState().plugins.map(p => p.name), ['demo-plug'])
    assert.deepEqual(listAtPlugins().map(p => p.name), ['demo-plug'])
  } finally {
    rmSync(envB.root, { recursive: true, force: true })
    envA.cleanup()
  }
})

test('client @ plugins review fixes: fetchSeq order, live icon snapshot, displayName update vs reuse, theme sync, and disposed microtask', async () => {
  const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

  const createFakeElement = (tag, opts = {}) => {
    const attrs = new Map()
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      children: [],
      parentElement: null,
      style: {},
      classList: { contains: () => false },
      textContent: opts.textContent || '',
      get isConnected() {
        if (el === fakeDoc.body || el === fakeDoc.documentElement) return true
        let p = el.parentElement
        while (p) {
          if (p === fakeDoc.body) return true
          p = p.parentElement
        }
        return false
      },
      dataset: new Proxy({}, {
        get(_t, prop) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase())
          return attrs.has(attr) ? attrs.get(attr) : undefined
        },
        set(_t, prop, value) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase())
          attrs.set(attr, String(value))
          return true
        },
        deleteProperty(_t, prop) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase())
          attrs.delete(attr)
          return true
        },
      }),
      setAttribute(name, value) { attrs.set(String(name), String(value)) },
      getAttribute(name) { return attrs.has(String(name)) ? attrs.get(String(name)) : null },
      hasAttribute(name) { return attrs.has(String(name)) },
      removeAttribute(name) { attrs.delete(String(name)) },
      append(...nodes) {
        for (const n of nodes) {
          if (n && typeof n === 'object') {
            if (n.parentElement) n.remove()
            n.parentElement = el
            el.children.push(n)
          }
        }
      },
      prepend(...nodes) {
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i]
          if (n && typeof n === 'object') {
            if (n.parentElement) n.remove()
            n.parentElement = el
            el.children.unshift(n)
          }
        }
      },
      remove() {
        if (!el.parentElement) return
        el.parentElement.children = el.parentElement.children.filter(c => c !== el)
        el.parentElement = null
      },
      contains(target) {
        let cur = target
        while (cur) {
          if (cur === el) return true
          cur = cur.parentElement
        }
        return false
      },
      closest(selector) {
        const selectors = String(selector).split(',').map(s => s.trim())
        let cur = el
        while (cur) {
          for (const sel of selectors) {
            if (sel === '[data-composer-chip="plugins"]' && cur.getAttribute('data-composer-chip') === 'plugins') return cur
            if (sel === '[data-composer-input]' && cur.hasAttribute('data-composer-input')) return cur
            if (sel === '[data-uph-chip-icon]' && cur.hasAttribute('data-uph-chip-icon')) return cur
            if (sel.startsWith('.') && String(cur.className || '').split(/\s+/).includes(sel.slice(1))) return cur
          }
          cur = cur.parentElement
        }
        return null
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null },
      querySelectorAll(sel) {
        const out = []
        const walk = (node) => {
          for (const ch of node.children || []) {
            if (
              (sel === '[data-composer-chip="plugins"]' && ch.getAttribute('data-composer-chip') === 'plugins') ||
              (sel === '[data-composer-input]' && ch.hasAttribute('data-composer-input')) ||
              (sel === '[data-uph-at-plugins-overlay]' && ch.hasAttribute('data-uph-at-plugins-overlay')) ||
              (sel === '[data-uph-chip-icon]' && ch.hasAttribute('data-uph-chip-icon')) ||
              (sel === 'style[data-uph-at-plugins]' && ch.tagName === 'STYLE' && ch.hasAttribute('data-uph-at-plugins'))
            ) out.push(ch)
            walk(ch)
          }
        }
        walk(el)
        return out
      },
      getBoundingClientRect() { return { left: 100, top: 200, width: 80, height: 24, right: 180, bottom: 224 } },
    }
    return el
  }

  const docListeners = new Map()
  const observers = []
  let fakeDoc
  fakeDoc = {
    hidden: false,
    activeElement: null,
    createElement: (tag) => createFakeElement(tag),
    querySelector: (sel) => fakeDoc.body.querySelector(sel) || fakeDoc.head.querySelector(sel),
    querySelectorAll: (sel) => [...fakeDoc.head.querySelectorAll(sel), ...fakeDoc.body.querySelectorAll(sel)],
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set())
      docListeners.get(ev).add(fn)
    },
    removeEventListener(ev, fn) { docListeners.get(ev)?.delete(fn) },
    dispatchEvent(ev) {
      for (const fn of Array.from(docListeners.get(ev.type) || [])) fn(ev)
    },
  }
  fakeDoc.documentElement = createFakeElement('html')
  fakeDoc.head = createFakeElement('head')
  fakeDoc.body = createFakeElement('body')
  fakeDoc.body.parentElement = fakeDoc.documentElement

  const composer = createFakeElement('div')
  composer.setAttribute('data-composer-input', 'true')
  const composerChip = createFakeElement('span')
  composerChip.setAttribute('data-composer-chip', 'plugins')
  const refSpan = createFakeElement('span')
  const markerSpan = createFakeElement('span', { textContent: '@' })
  const labelSpan = createFakeElement('span', { textContent: 'Alpha' })
  refSpan.append(markerSpan, labelSpan)
  composerChip.append(refSpan)
  composer.append(composerChip)
  fakeDoc.body.append(composer)

  // Queue controllable /at-plugins fetch responses (intentional out-of-order test without AbortController signal abort).
  const fetchQueue = []
  let loadedModule = null
  const sandbox = {
    window: {
      __ModuleLoader__: { load(def) { loadedModule = def } },
      innerWidth: 1280,
      innerHeight: 720,
      getComputedStyle: () => ({ backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(24, 24, 27)' }),
      localStorage: null,
      addEventListener() {},
      removeEventListener() {},
    },
    document: fakeDoc,
    globalThis: {},
    Event: class { constructor(type) { this.type = type } },
    AbortController,
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.options = null; observers.push(this) }
      observe(_target, options) { this.options = options }
      disconnect() {}
      trigger(mutations) { this.cb(mutations) }
    },
    CSS: {},
    Image: class {},
    fetch: (url) => {
      if (url === '/universal-plugin-hub/api/tool-call-icons') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ groups: [] }),
        })
      }
      assert.equal(url, '/universal-plugin-hub/api/at-plugins')
      return new Promise((resolve) => fetchQueue.push(resolve))
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    Promise,
    Map,
    Set,
    WeakMap,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    encodeURIComponent,
    decodeURIComponent,
  }
  sandbox.globalThis = sandbox

  vm.runInNewContext(clientSource, sandbox, { filename: 'client.js' })
  const exports = loadedModule.factory((id) => {
    if (id === 'react') return React
    throw new Error(`Unexpected require(${id})`)
  })
  const registeredSources = []
  const registeredSlots = []
  const cleanups = []

  exports.apply({
    theme: { isDark: false },
    slots: {
      inject(_name, factory) { const d = factory(); if (typeof d === 'function') cleanups.push(d); return () => {} },
      register(def, comp) { registeredSlots.push({ def, comp }); return () => {} },
    },
    effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d) },
    inject(deps, cb) {
      if (deps.includes('inputTriggers')) {
        cb({
          inputTriggers: { registerSource: (src) => { registeredSources.push(src); return () => {} } },
          effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d) },
        })
      } else if (deps.includes('uiConversation')) {
        cb({
          uiConversation: { userText: { register: () => () => {} } },
          effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d) },
        })
      }
    },
  })

  const src = registeredSources[0]
  const chipSlot = registeredSlots.find(s => s.def.name === 'conversation.user.text.node')

  try {
    // 1. Out-of-order fetch guard: slow stale response #1 must NOT overwrite fast newer response #2
    const candPromise = src.candidates({ sessionId: 's1' }, { query: '' })
    assert.equal(fetchQueue.length, 1)
    fakeDoc.dispatchEvent(new sandbox.Event('uph-at-plugins-changed'))
    assert.equal(fetchQueue.length, 2)

    const resolveFetch = (idx, pluginsPayload) => fetchQueue[idx]({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ plugins: pluginsPayload }),
    })

    // Resolve request #2 first with fresh v1 list
    resolveFetch(1, [
      {
        name: 'alpha',
        displayName: 'Alpha',
        shortDescription: 'Fresh v1',
        summary: 'Fresh v1',
        icons: {
          light: ['/universal-plugin-hub/api/plugin-icon?name=alpha&v=light-v1'],
          dark: ['/universal-plugin-hub/api/plugin-icon?name=alpha&v=dark-v1'],
        },
      },
      {
        name: 'beta',
        displayName: 'Beta',
        shortDescription: 'Beta desc',
        summary: 'Beta desc',
        icons: {
          light: ['/universal-plugin-hub/api/plugin-icon?name=beta&v=light'],
          dark: ['/universal-plugin-hub/api/plugin-icon?name=beta&v=dark'],
        },
      },
    ])
    await new Promise(resolve => setTimeout(resolve, 15))
    // Resolve stale request #1 later with stale list
    resolveFetch(0, [
      { name: 'stale-only', displayName: 'Stale Only', shortDescription: 'Should never stick', icons: { light: [], dark: [] } },
    ])
    await candPromise
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.deepEqual(Array.from(src.lexicon()), ['alpha', 'beta'], 'stale fetch response never overwrote newer fetch')

    // 2. Old menu icon component reads live store data & reacts without stale closure snapshot
    const initialItems = await src.candidates({ sessionId: 's1' }, { query: 'alpha' })
    const AlphaIconBefore = initialItems[0].icon
    let iconTree
    act(() => { iconTree = create(React.createElement(AlphaIconBefore)) })
    assert.match(JSON.stringify(iconTree.toJSON()), /alpha&v=light-v1/)

    // Refresh plugin with updated displayName + new icon URL
    fakeDoc.dispatchEvent(new sandbox.Event('uph-at-plugins-changed'))
    assert.equal(fetchQueue.length, 3)
    resolveFetch(2, [
      {
        name: 'alpha',
        displayName: 'Alpha Renamed',
        shortDescription: 'Fresh v2',
        summary: 'Fresh v2',
        icons: {
          light: ['/universal-plugin-hub/api/plugin-icon?name=alpha&v=light-v2'],
          dark: ['/universal-plugin-hub/api/plugin-icon?name=alpha&v=dark-v2'],
        },
      },
      {
        name: 'beta',
        displayName: 'Beta',
        shortDescription: 'Beta desc',
        summary: 'Beta desc',
        icons: {
          light: ['/universal-plugin-hub/api/plugin-icon?name=beta&v=light'],
          dark: ['/universal-plugin-hub/api/plugin-icon?name=beta&v=dark'],
        },
      },
    ])
    await new Promise(resolve => setTimeout(resolve, 20))

    act(() => { iconTree.update(React.createElement(AlphaIconBefore)) })
    assert.match(JSON.stringify(iconTree.toJSON()), /alpha&v=light-v2/, 'cached icon component reflects updated metadata instead of stale snapshot')

    // 3. Composer chip stays resolved when server updates displayName, while reusing element for a different label re-resolves
    assert.equal(composerChip.getAttribute('data-uph-plugin-resolved'), 'true')
    assert.equal(composerChip.getAttribute('data-uph-plugin-name'), 'alpha', 'composer chip remains resolved across displayName rename')
    assert.equal(composerChip.children.filter(c => c.hasAttribute('data-uph-chip-icon')).length, 1)

    const chipObserver = observers.find(o => o.options?.attributeFilter?.includes('title'))
    labelSpan.textContent = 'Beta'
    await act(async () => {
      chipObserver.trigger([{ type: 'childList', target: refSpan, addedNodes: [], removedNodes: [] }])
      await Promise.resolve()
    })
    assert.equal(composerChip.getAttribute('data-uph-plugin-name'), 'beta', 'reused chip DOM updates to newly matching plugin name')

    // 4. Sent PluginMentionChip updates icon immediately on dark-theme toggle
    let sentRenderer
    act(() => {
      sentRenderer = create(React.createElement(chipSlot.comp, { node: { data: { name: 'alpha', label: 'Alpha' } } }))
    })
    assert.match(JSON.stringify(sentRenderer.toJSON()), /alpha&v=light-v2/)
    const themeObserver = observers.find(o => o.options?.attributeFilter?.includes('data-ds-dark-theme'))
    fakeDoc.body.setAttribute('data-ds-dark-theme', '1')
    act(() => {
      themeObserver.trigger([{ type: 'attributes', attributeName: 'data-ds-dark-theme', target: fakeDoc.body }])
    })
    assert.match(JSON.stringify(sentRenderer.toJSON()), /alpha&v=dark-v2/, 'sent message chip tracks light/dark toggle')

    // 5. Microtask queued right before dispose must NOT create orphan icon slot after teardown
    composerChip.children.find(c => c.hasAttribute('data-uph-chip-icon'))?.remove()
    composerChip.append(refSpan) // ensure single span child only
    chipObserver.trigger([{ type: 'childList', target: composerChip, addedNodes: [refSpan], removedNodes: [] }])
    while (cleanups.length) cleanups.pop()()
    await Promise.resolve()
    assert.equal(composerChip.children.filter(c => c.hasAttribute('data-uph-chip-icon')).length, 0, 'disposed microtask never leaves orphan icon slot')
  } finally {
    while (cleanups.length) cleanups.pop()()
  }
})
