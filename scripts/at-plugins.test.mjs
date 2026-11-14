import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

const require = createRequire(import.meta.url)
const React = require('react')
const { create, act } = require('react-test-renderer')

import { dshSkillsDir, installedDir, marketRoot, readState, writeState } from '../src/store.js'
import { invalidateMarketplaceCache, invalidateParserCaches, parserCacheRevision } from '../src/parser.js'
import { invalidateLocalIconCache } from '../src/icons.js'
import { mountRoutes } from '../src/routes.js'
import { createSkillsManager } from '../src/skills.js'
import { installUploadedSkills } from '../src/skill-uploads.js'
import { apply as applyHub } from '../src/index.js'
import { Context as DshTitleCordisContext } from '@deepseek-ai/cordis'
import {
  AT_PLUGINS_BOOT_LIMIT,
  attachAtPluginsAgentHook,
  attachAtPluginsSessionTitleHook,
  atPluginsBootPayload,
  collectPluginCapabilities,
  extractPluginMentions,
  formatPluginMention,
  invalidateAtPluginsCache,
  listAtPlugins,
  renderExplicitPluginInstructions,
  stripPluginMentionsFromTitle,
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
            { name: 'exa-agent', description: 'Live exa-agent skill', path: join(exaDir, 'skills', 'exa-agent', 'SKILL.md') },
            { name: 'exa-disabled', description: 'Should be skipped', path: join(exaDir, 'skills', 'exa-disabled', 'SKILL.md'), invocation: { modelInvocable: false } },
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

    const workspace = join(env.root, 'workspace', '.agents')
    writeSkill(workspace, 'exa-agent', { fmName: 'exa-agent', description: 'Workspace override' })
    const scopedSkill = { name: 'exa-agent', path: join(workspace, 'skills', 'exa-agent', 'SKILL.md') }
    assert.deepEqual(collectPluginCapabilities('exa-mcp-search', { snapshotSkills: [scopedSkill] }).skills, [])

    const mirrorPath = join(dshSkillsDir(), 'exa-agent', 'SKILL.md')
    mkdirSync(join(mirrorPath, '..'), { recursive: true })
    const original = readFileSync(join(exaDir, 'skills', 'exa-agent', 'SKILL.md'), 'utf8')
    writeFileSync(mirrorPath, original)
    const mirrorSkill = { name: 'native-slug', path: mirrorPath }
    const mirrored = () => collectPluginCapabilities('exa-mcp-search', { snapshotSkills: [mirrorSkill] }).skills
    assert.deepEqual(mirrored().map(s => s.name), ['native-slug'])
    writeFileSync(mirrorPath, `${original}\nDifferent plugin's body`)
    assert.deepEqual(mirrored(), [])
    const uploaded = join(env.root, 'upload', 'exa-agent')
    mkdirSync(uploaded, { recursive: true })
    writeFileSync(join(uploaded, 'SKILL.md'), original.replace('name: Exa Agent', 'name: exa-agent'))
    writeFileSync(join(exaDir, 'skills', 'exa-agent', 'SKILL.md'), readFileSync(join(uploaded, 'SKILL.md')))
    installUploadedSkills([{ dir: uploaded, row: { name: 'exa-agent' } }], { overwrite: true })
    assert.deepEqual(mirrored(), [], 'a byte-identical direct upload still owns its own skill')

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
      assert.deepEqual(injected.source, { kind: 'plugin-routing', form: 'notice' })
      assert.equal('summary' in injected.source, false)
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
      inject(_name, factory) {
        const d = factory()
        if (typeof d === 'function') cleanups.push(d)
        return d || (() => {})
      },
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

    // Pasting a copied message builds native reference nodes in one undoable edit.
    class ReferenceChip {
      constructor(reference) { this.reference = reference }
    }
    class TextNode {
      constructor(text) { this.text = text }
    }
    class LineBreak {}
    const edits = []
    const root = { hasAttribute: () => false }
    root.__lexicalEditor = {
      getRootElement: () => root,
      isEditable: () => true,
      _nodes: new Map([['reference-chip', { klass: ReferenceChip }], ['text', { klass: TextNode }], ['linebreak', { klass: LineBreak }]]),
      _pendingEditorState: { _selection: {
        anchor: {},
        focus: {},
        insertNodes(nodes) { edits.push(Array.from(nodes)) },
      } },
      update(fn, options) {
        assert.equal(options.tag, 'paste')
        assert.equal(options.discrete, true)
        fn()
      },
    }
    const paste = (text, items = []) => {
      const event = {
        type: 'paste',
        target: { closest: () => root },
        clipboardData: { getData: () => text, items },
        preventDefault() { this.defaultPrevented = true },
        stopPropagation() { this.stopped = true },
      }
      fakeDoc.dispatchEvent(event)
      return event
    }
    const remotion = '@[Remotion](uph-plugin:remotion)'
    const computer = pick.insert.ref
    const pasted = paste(`用 ${remotion}\r\n${computer} 看 @remotion 和 @[Bad](uph-plugin:%ZZ)`)
    assert.equal(pasted.defaultPrevented, true)
    assert.equal(pasted.stopped, true)
    assert.equal(edits.length, 1)
    const [intro, firstChip, newline, secondChip, tail] = edits[0]
    assert.equal(intro.text, '用 ')
    assert.deepEqual({ ...firstChip.reference }, { source: 'plugins', label: 'Remotion', ref: remotion, clipboardText: remotion })
    assert.ok(newline instanceof LineBreak)
    assert.deepEqual({ ...secondChip.reference }, { ...pick.insert })
    assert.equal(tail.text, ' 看 @remotion 和 @[Bad](uph-plugin:%ZZ)')
    assert.equal(paste('普通文本 @remotion').defaultPrevented, undefined)
    assert.equal(paste(remotion, [{ kind: 'file' }]).defaultPrevented, undefined)
    assert.equal(edits.length, 1)

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
        inject(_name, factory) {
          const d = factory()
          if (typeof d === 'function') cleanups.push(d)
          return d || (() => {})
        },
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
          inject(_name, factory) {
            const d = factory()
            if (typeof d === 'function') cleanups.push(d)
            return d || (() => {})
          },
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

test('slot lifecycle & perf regressions: deferred conversation.user.text.node, error rollback, self-mutation skip, and parser read cache stability', async () => {
  const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const env = setupEnv()
  try {
    // 1. Cold marketplace read in listAtPlugins() must NOT self-invalidate parserCacheRevision() on repeat read
    const dir = installedDir('demo-cache')
    writeJson(join(dir, 'plugin.json'), { name: 'demo-cache', description: 'Cache desc' })
    writeJson(join(marketRoot(), 'market', 'curated', '.claude-plugin', 'marketplace.json'), {
      name: 'curated',
      plugins: [{ name: 'demo-cache', interface: { shortDescription: 'Market short' }, source: './plugins/demo-cache' }],
    })
    writeState({
      version: 1,
      sources: [{ id: 'curated', name: 'Curated', url: 'https://example.invalid/curated.git' }],
      plugins: [{ name: 'demo-cache', sourceId: 'curated', enabled: true, installedAt: 1 }],
    })
    invalidateMarketplaceCache('curated')
    invalidateParserCaches()
    invalidateAtPluginsCache()

    const revBefore = parserCacheRevision()
    const firstList = listAtPlugins()
    assert.equal(parserCacheRevision(), revBefore, 'readMarketplace cold disk read must not bump parserCacheRevision')
    const secondList = listAtPlugins()
    assert.equal(secondList, firstList, 'repeat listAtPlugins() call hits warm catalog cache after cold read')
  } finally {
    env.cleanup()
  }

  // 2. Deferred conversation.user.text.node declaration, error rollback, and domObserver self-mutation suppression
  const makeNode = (tag) => {
    const attrs = new Map()
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      children: [],
      parentElement: null,
      style: {},
      classList: { contains: () => false },
      textContent: '',
      dataset: new Proxy({}, {
        get(_t, prop) { const a = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase()); return attrs.get(a) },
        set(_t, prop, v) { const a = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase()); attrs.set(a, String(v)); return true },
        deleteProperty(_t, prop) { const a = 'data-' + String(prop).replace(/([A-Z])/g, m => '-' + m.toLowerCase()); attrs.delete(a); return true },
      }),
      get isConnected() {
        if (el === fakeDoc.body || el === fakeDoc.documentElement) return true
        let p = el.parentElement
        while (p) { if (p === fakeDoc.body) return true; p = p.parentElement }
        return false
      },
      setAttribute(k, v) { attrs.set(String(k), String(v)) },
      getAttribute(k) { return attrs.has(String(k)) ? attrs.get(String(k)) : null },
      hasAttribute(k) { return attrs.has(String(k)) },
      removeAttribute(k) { attrs.delete(String(k)) },
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
        while (cur) { if (cur === el) return true; cur = cur.parentElement }
        return false
      },
      closest(selector) {
        const list = String(selector).split(',').map(s => s.trim())
        let cur = el
        while (cur) {
          for (const sel of list) {
            if (sel === '[data-uph-chip-icon]' && cur.hasAttribute('data-uph-chip-icon')) return cur
            if (sel === '[data-composer-chip="plugins"]' && cur.getAttribute('data-composer-chip') === 'plugins') return cur
            if (sel === '[data-composer-input]' && cur.hasAttribute('data-composer-input')) return cur
          }
          cur = cur.parentElement
        }
        return null
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null },
      querySelectorAll(sel) {
        const out = []
        const visit = (node) => {
          for (const c of node.children || []) {
            if (sel === '[data-composer-chip="plugins"]' && c.getAttribute('data-composer-chip') === 'plugins') out.push(c)
            else if (sel === '[data-composer-input]' && c.hasAttribute('data-composer-input')) out.push(c)
            visit(c)
          }
        }
        visit(el)
        return out
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    }
    return el
  }

  const headEl = makeNode('head')
  const bodyEl = makeNode('body')
  const docEl = makeNode('html')
  docEl.append(headEl, bodyEl)
  const docListeners = new Map()
  const activeObservers = new Set()
  const allObservers = []
  let chipQueryCount = 0

  const fakeDoc = {
    head: headEl,
    body: bodyEl,
    documentElement: docEl,
    activeElement: null,
    createElement: tag => makeNode(tag),
    querySelector(sel) {
      if (sel === '[data-composer-input]') return bodyEl.querySelector('[data-composer-input]')
      return null
    },
    querySelectorAll(sel) {
      if (sel === '[data-composer-chip="plugins"]') chipQueryCount += 1
      const out = []
      const visit = (node) => {
        for (const c of node.children || []) {
          if (sel === 'style[data-uph-at-plugins]' && c.tagName === 'STYLE' && c.hasAttribute('data-uph-at-plugins')) out.push(c)
          else if (sel === '[data-uph-at-plugins-overlay]' && c.hasAttribute('data-uph-at-plugins-overlay')) out.push(c)
          else if (sel === '[data-composer-chip="plugins"]' && c.getAttribute('data-composer-chip') === 'plugins') out.push(c)
          visit(c)
        }
      }
      visit(docEl)
      return out
    },
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set())
      docListeners.get(ev).add(fn)
    },
    removeEventListener(ev, fn) { docListeners.get(ev)?.delete(fn) },
    dispatchEvent() {},
  }

  let loadedModule = null
  const sandbox = {
    window: {
      __ModuleLoader__: { load(def) { loadedModule = def } },
      innerWidth: 2560,
      innerHeight: 1392,
      getComputedStyle: () => ({ backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(24, 24, 27)' }),
      addEventListener() {},
      removeEventListener() {},
    },
    document: fakeDoc,
    globalThis: {},
    __UPH_AT_PLUGINS__: [{ name: 'remotion', displayName: 'Remotion', shortDescription: 'Videos', summary: 'Videos', icons: { light: [], dark: [] } }],
    Event: class { constructor(type) { this.type = type } },
    AbortController,
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.options = null; this.disconnected = false; allObservers.push(this) }
      observe(_target, options) { this.options = options; this.disconnected = false; activeObservers.add(this) }
      disconnect() { this.disconnected = true; activeObservers.delete(this) }
      trigger(mutations) { if (!this.disconnected) this.cb(mutations) }
    },
    CSS: {},
    Image: class {},
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ plugins: [{ name: 'remotion', displayName: 'Remotion', shortDescription: 'Videos', summary: 'Videos', icons: { light: [], dark: [] } }] }) }),
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    Promise, Map, Set, WeakMap, WeakSet, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
    encodeURIComponent, decodeURIComponent,
  }
  sandbox.globalThis = sandbox

  vm.runInNewContext(clientSource, sandbox, { filename: 'client.js' })
  const pluginExports = loadedModule.factory((id) => {
    if (id === 'react') return React
    throw new Error(`Unexpected require(${id})`)
  })

  // 2a. Failure during installAtPlugins rolls back ALL observers/DOM/inject handles with zero leaks
  let inputForkDisposed = false
  assert.throws(() => {
    pluginExports.apply({
      theme: { isDark: false },
      slots: {
        inject() { return () => {} },
        register() { throw new Error('must not call synchronous register') },
      },
      effect(fn) { return fn() },
      inject(deps) {
        if (deps.includes('inputTriggers')) return () => { inputForkDisposed = true }
        if (deps.includes('uiConversation')) throw new Error('simulated failure after observers mounted')
      },
    })
  }, /simulated failure/)

  assert.equal(inputForkDisposed, true, 'prior inject fork disposed on mid-install error')
  assert.equal(activeObservers.size, 0, 'failed installAtPlugins disconnects all MutationObservers')
  assert.equal(headEl.children.filter(c => c.hasAttribute('data-uph-at-plugins')).length, 0, 'failed installAtPlugins removes stylesheet')
  assert.equal(sandbox.__UPH_AT_PLUGINS_ACTIVE_DISPOSE__, undefined, 'failed installAtPlugins clears active dispose key')

  // 2b. Normal activation waits for conversation.user.text.node via slots.inject and never triggers synchronous register error
  sandbox.__UPH_AT_PLUGINS__ = [{ name: 'remotion', displayName: 'Remotion', shortDescription: 'Videos', summary: 'Videos', icons: { light: [], dark: [] } }]
  const declaredSlots = new Set()
  const injectedWaiters = []
  const registeredSlots = []
  const cleanups = []
  const disposeSpyCtx = {
    theme: { isDark: false },
    slots: {
      inject(name, factory) {
        if (declaredSlots.has(name)) {
          const d = factory()
          if (typeof d === 'function') cleanups.push(d)
          return d || (() => {})
        }
        injectedWaiters.push({ name, factory })
        return () => {
          const idx = injectedWaiters.findIndex(w => w.factory === factory)
          if (idx >= 0) injectedWaiters.splice(idx, 1)
        }
      },
      register(def, comp) {
        if (!declaredSlots.has(def.name)) {
          throw new Error(`slot "${def.name}" is not declared`)
        }
        registeredSlots.push({ def, comp })
        return () => {}
      },
    },
    effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d); return d },
    inject() {},
  }

  try {
    pluginExports.apply(disposeSpyCtx)
    assert.equal(registeredSlots.length, 0, 'conversation.user.text.node is not registered before declaration')
    const nodeWaiters = injectedWaiters.filter(w => w.name === 'conversation.user.text.node')
    assert.equal(nodeWaiters.length, 1, 'waits via slots.inject for conversation.user.text.node')

    // Declare conversation.user.text.node later as ui-conversation does during real boot
    declaredSlots.add('conversation.user.text.node')
    const offInjected = nodeWaiters[0].factory()
    if (typeof offInjected === 'function') cleanups.push(offInjected)
    assert.equal(registeredSlots.length, 1)
    assert.equal(registeredSlots[0].def.key, 'uph-plugin')

    // 2c. Unrelated body text mutation without [data-composer-input] does NOT scan chips, and self-owned icon prepend never re-triggers
    const domObs = allObservers.find(o => !o.disconnected && o.options?.attributeFilter?.includes('title'))
    assert.ok(domObs)
    const queriesBeforeText = chipQueryCount
    domObs.trigger([{ type: 'childList', target: bodyEl, addedNodes: [{ nodeType: 3 }], removedNodes: [] }])
    await Promise.resolve()
    assert.equal(chipQueryCount, queriesBeforeText, 'text mutation outside composer skips chip query when no composer exists')

    const composer = makeNode('div')
    composer.setAttribute('data-composer-input', '')
    const chip = makeNode('span')
    chip.setAttribute('data-composer-chip', 'plugins')
    chip.textContent = 'Remotion'
    composer.append(chip)
    bodyEl.append(composer)

    domObs.trigger([{ type: 'childList', target: bodyEl, addedNodes: [composer], removedNodes: [] }])
    await Promise.resolve()
    const iconSlot = chip.children.find(c => c.hasAttribute('data-uph-chip-icon'))
    assert.ok(iconSlot, 'sync creates single owned icon slot inside composer chip')

    const queriesBeforeSelf = chipQueryCount
    domObs.trigger([{ type: 'childList', target: chip, addedNodes: [iconSlot], removedNodes: [] }])
    await Promise.resolve()
    assert.equal(chipQueryCount, queriesBeforeSelf, 'self-owned icon slot prepend never schedules another sync pass')
  } finally {
    while (cleanups.length) cleanups.pop()()
  }
  assert.equal(activeObservers.size, 0, 'clean teardown disconnects all observers')
})

function setupComputerUseFixture() {
  const env = setupEnv()
  const previousAgentsHome = process.env.DSH_AGENTS_HOME
  const agentsHome = join(env.root, 'agents-home')
  mkdirSync(join(agentsHome, 'skills'), { recursive: true })
  process.env.DSH_AGENTS_HOME = agentsHome

  const cuDir = installedDir('computer-use')
  writeJson(join(cuDir, '.codex-plugin', 'plugin.json'), {
    name: 'computer-use',
    description: 'Full manifest description.',
    interface: {
      displayName: 'Computer Use',
      shortDescription: 'Control Windows desktop apps cleanly.',
    },
    mcpServers: {
      desktop: { command: 'npx', args: ['-y', 'desktop-mcp'] },
    },
  })
  writeSkill(cuDir, 'desktop-control', {
    fmName: 'desktop-control',
    description: 'Control desktop windows and inputs.',
  })
  writeSkill(cuDir, 'desktop-disabled', {
    fmName: 'desktop-disabled',
    description: 'Disabled desktop skill.',
  })

  writeFileSync(join(env.root, 'profiles', 'web', 'cordis.patch.yml'), [
    '- insert:',
    '    - id: mcp-computer-use-desktop',
    '      name: mcp',
    '      enabled: true',
    '      config:',
    '        type: stdio',
    '        command: npx',
  ].join('\n'))

  writeState({
    version: 1,
    sources: [{ id: 'curated', name: 'Curated', url: 'https://example.invalid/curated.git' }],
    plugins: [{ name: 'computer-use', sourceId: 'curated', enabled: true, installedAt: 1 }],
  })
  invalidateAtPluginsCache()

  return {
    ...env,
    cleanup() {
      if (previousAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
      else process.env.DSH_AGENTS_HOME = previousAgentsHome
      env.cleanup()
    },
  }
}

async function flushCordis(root) {
  let active
  do {
    active = false
    for (const runtime of root.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.inertia) {
          active = true
          await fiber.await()
        }
      }
    }
  } while (active)
}

function createStrictCordisHostCtx({ services = {}, injected = ['agents'] } = {}) {
  const listeners = new Map()
  const injectedSet = new Set(injected)
  const serviceProps = new Set(['agents', 'skills', 'workingDirectory', 'webServer', 'profileContext'])
  const base = {
    on(eventName, fn) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set())
      listeners.get(eventName).add(fn)
      return () => listeners.get(eventName)?.delete(fn)
    },
    get(name) {
      return Object.hasOwn(services, name) ? services[name] : undefined
    },
    listeners,
  }
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && serviceProps.has(prop)) {
        if (injectedSet.has(prop)) return services[prop]
        throw new Error(`cannot get property "${prop}" without inject`)
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

test('apply(ctx) wires real Cordis agent/pre-step with registered skills and workingDirectory without un-injected property errors', async () => {
  const env = setupComputerUseFixture()
  const root = new Context()
  const lateRoot = new Context()
  try {
    const expectedCwd = join(env.root, 'workspace')
    const controller = new AbortController()
    const agent = {
      id: 'session-cu-1',
      session: { id: 'session-cu-1', header: { cwd: env.root } },
    }
    const ensureCalls = []
    const snapshotCalls = []

    root.plugin((c) => {
      c.provide('agents', { list: () => [], get: () => undefined })
    })
    root.plugin((c) => {
      c.provide('workingDirectory', {
        ensure: async (...args) => {
          ensureCalls.push(args)
          return expectedCwd
        },
        get: () => expectedCwd,
      })
    })
    root.plugin((c) => {
      c.provide('skills', {
        registerProvider: () => () => {},
        list: async () => [],
        snapshot: async (opts) => {
          snapshotCalls.push(opts)
          return {
            complete: true,
            skills: [
              { name: 'desktop-control', description: 'Live desktop control skill', path: join(installedDir('computer-use'), 'skills', 'desktop-control', 'SKILL.md'), invocation: { modelInvocable: true } },
              { name: 'desktop-disabled', description: 'Disabled skill', path: join(installedDir('computer-use'), 'skills', 'desktop-disabled', 'SKILL.md'), invocation: { modelInvocable: false } },
            ],
          }
        },
      })
    })
    root.plugin({ name: 'universal-plugin-hub', apply: applyHub })
    await flushCordis(root)

    const baseDecision = {
      kind: 'enter',
      startsRequestSeries: true,
      messages: [{ role: 'user', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'sys' }] }],
    }
    const userMsg = {
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: `Use ${formatPluginMention('computer-use', 'Computer Use')} to automate.` }],
    }

    const result = await root.waterfall(
      'agent/pre-step',
      { agent, messages: [userMsg], turn: 1, step: 1, signal: controller.signal, modelSelection: { id: 'mock' } },
      async () => baseDecision,
    )

    assert.equal(ensureCalls.length, 1)
    assert.strictEqual(ensureCalls[0][0], agent)
    assert.strictEqual(ensureCalls[0][1], controller.signal)
    assert.equal(snapshotCalls.length, 1)
    assert.deepEqual(snapshotCalls[0], { cwd: expectedCwd, signal: controller.signal, scope: agent })

    assert.equal(result.kind, 'enter')
    assert.equal(result.startsRequestSeries, true)
    assert.equal(result.messages.length, 2)
    const injected = result.messages[1]
    assert.deepEqual(injected.source, { kind: 'plugin-routing', form: 'notice' })
    assert.equal('summary' in injected.source, false)
    assert.match(injected.content[0].text, /<explicit_plugin name="Computer Use" id="computer-use"/)
    assert.match(injected.content[0].text, /- desktop-control: Live desktop control skill/)
    assert.match(injected.content[0].text, /- desktop \(mcp-computer-use-desktop\)/)
    assert.doesNotMatch(injected.content[0].text, /desktop-disabled/)

    // Late service registration order: applyHub + agents active BEFORE skills and workingDirectory mount
    const lateEnsureCalls = []
    const lateSnapshotCalls = []
    lateRoot.plugin({ name: 'universal-plugin-hub', apply: applyHub })
    lateRoot.plugin((c) => {
      c.provide('agents', { list: () => [], get: () => undefined })
    })
    await flushCordis(lateRoot)

    lateRoot.plugin((c) => {
      c.provide('workingDirectory', {
        ensure: async (...args) => {
          lateEnsureCalls.push(args)
          return expectedCwd
        },
        get: () => expectedCwd,
      })
    })
    lateRoot.plugin((c) => {
      c.provide('skills', {
        registerProvider: () => () => {},
        list: async () => [],
        snapshot: async (opts) => {
          lateSnapshotCalls.push(opts)
          return {
            complete: true,
            skills: [{ name: 'desktop-control', description: 'Late registered live skill', path: join(installedDir('computer-use'), 'skills', 'desktop-control', 'SKILL.md'), invocation: { modelInvocable: true } }],
          }
        },
      })
    })
    await flushCordis(lateRoot)

    const lateResult = await lateRoot.waterfall(
      'agent/pre-step',
      { agent, messages: [userMsg], turn: 1, step: 2, signal: controller.signal, modelSelection: { id: 'mock' } },
      async () => baseDecision,
    )
    assert.equal(lateEnsureCalls.length, 1)
    assert.deepEqual(lateSnapshotCalls, [{ cwd: expectedCwd, signal: controller.signal, scope: agent }])
    assert.match(lateResult.messages[1].content[0].text, /- desktop-control: Late registered live skill/)
  } finally {
    await root.fiber.dispose()
    await lateRoot.fiber.dispose()
    env.cleanup()
  }
})

test('apply(ctx) activates @ plugins routing and degrades cleanly on real Cordis when skills or workingDirectory are absent', async () => {
  const env = setupComputerUseFixture()
  const noServicesRoot = new Context()
  const noWorkingDirRoot = new Context()
  try {
    const controller = new AbortController()
    const agent = {
      id: 'session-cu-optional',
      session: { id: 'session-cu-optional', header: { cwd: env.root } },
    }
    const baseDecision = {
      kind: 'enter',
      startsRequestSeries: true,
      messages: [{ role: 'user', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'sys' }] }],
    }
    const userMsg = {
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: `Use ${formatPluginMention('computer-use', 'Computer Use')} right now.` }],
    }

    // Case 1: Only agents provided; neither skills nor workingDirectory is registered
    noServicesRoot.plugin((c) => {
      c.provide('agents', { list: () => [], get: () => undefined })
    })
    noServicesRoot.plugin({ name: 'universal-plugin-hub', apply: applyHub })
    await flushCordis(noServicesRoot)

    const degradedResult = await noServicesRoot.waterfall(
      'agent/pre-step',
      { agent, messages: [userMsg], turn: 1, step: 1, signal: controller.signal, modelSelection: {} },
      async () => baseDecision,
    )
    assert.equal(degradedResult.kind, 'enter')
    assert.equal(degradedResult.startsRequestSeries, true)
    assert.equal(degradedResult.messages.length, 2)
    assert.deepEqual(degradedResult.messages[1].source, { kind: 'plugin-routing', form: 'notice' })
    assert.equal('summary' in degradedResult.messages[1].source, false)
    assert.match(degradedResult.messages[1].content[0].text, /<explicit_plugin name="Computer Use" id="computer-use"/)
    assert.match(degradedResult.messages[1].content[0].text, /- desktop-control: Control desktop windows and inputs\./)
    assert.match(degradedResult.messages[1].content[0].text, /- desktop \(mcp-computer-use-desktop\)/)

    // Case 2: agents + skills provided, workingDirectory absent -> must still invoke skills.snapshot({ cwd: undefined, ... })
    const snapshotCalls = []
    noWorkingDirRoot.plugin((c) => {
      c.provide('agents', { list: () => [], get: () => undefined })
    })
    noWorkingDirRoot.plugin((c) => {
      c.provide('skills', {
        registerProvider: () => () => {},
        list: async () => [],
        snapshot: async (opts) => {
          snapshotCalls.push(opts)
          return {
            complete: true,
            skills: [
              { name: 'desktop-control', description: 'Live snapshot without workingDirectory', path: join(installedDir('computer-use'), 'skills', 'desktop-control', 'SKILL.md'), invocation: { modelInvocable: true } },
              { name: 'desktop-disabled', description: 'Disabled', path: join(installedDir('computer-use'), 'skills', 'desktop-disabled', 'SKILL.md'), invocation: { modelInvocable: false } },
            ],
          }
        },
      })
    })
    noWorkingDirRoot.plugin({ name: 'universal-plugin-hub', apply: applyHub })
    await flushCordis(noWorkingDirRoot)

    const snapshotOnlyResult = await noWorkingDirRoot.waterfall(
      'agent/pre-step',
      { agent, messages: [userMsg], turn: 1, step: 1, signal: controller.signal, modelSelection: {} },
      async () => baseDecision,
    )
    assert.equal(snapshotCalls.length, 1)
    assert.deepEqual(snapshotCalls[0], { cwd: undefined, signal: controller.signal, scope: agent })
    assert.equal(snapshotOnlyResult.messages.length, 2)
    assert.match(snapshotOnlyResult.messages[1].content[0].text, /- desktop-control: Live snapshot without workingDirectory/)
    assert.doesNotMatch(snapshotOnlyResult.messages[1].content[0].text, /desktop-disabled/)
  } finally {
    await noServicesRoot.fiber.dispose()
    await noWorkingDirRoot.fiber.dispose()
    env.cleanup()
  }
})

test('attachAtPluginsAgentHook safely uses ctx.get on strict Cordis hostCtx without reading un-injected properties', async () => {
  const env = setupComputerUseFixture()
  try {
    const controller = new AbortController()
    const agent = {
      id: 'unit-agent-1',
      session: { id: 'unit-agent-1', header: { cwd: env.root } },
    }
    const baseDecision = {
      kind: 'enter',
      startsRequestSeries: true,
      messages: [{ role: 'user', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'sys' }] }],
    }
    const userMsg = {
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: '@[Computer Use](uph-plugin:computer-use)' }],
    }

    // 1) Both skills & workingDirectory exist in registry, but hostCtx only injected ['agents']
    const ensureCalls = []
    const snapshotCalls = []
    const strictWithBoth = createStrictCordisHostCtx({
      injected: ['agents'],
      services: {
        workingDirectory: {
          ensure: async (...args) => {
            ensureCalls.push(args)
            return env.root
          },
        },
        skills: {
          snapshot: async (opts) => {
            snapshotCalls.push(opts)
            return {
              complete: true,
              skills: [
                { name: 'desktop-control', description: 'Strict hostCtx live skill', path: join(installedDir('computer-use'), 'skills', 'desktop-control', 'SKILL.md'), invocation: { modelInvocable: true } },
                { name: 'desktop-disabled', description: 'Disabled', path: join(installedDir('computer-use'), 'skills', 'desktop-disabled', 'SKILL.md'), invocation: { modelInvocable: false } },
              ],
            }
          },
        },
      },
    })
    const detachBoth = attachAtPluginsAgentHook(strictWithBoth)
    try {
      const preStep = [...strictWithBoth.listeners.get('agent/pre-step')][0]
      const res = await preStep({ agent, messages: [userMsg], signal: controller.signal }, async () => baseDecision)
      assert.equal(ensureCalls.length, 1)
      assert.deepEqual(ensureCalls[0], [agent, controller.signal])
      assert.deepEqual(snapshotCalls, [{ cwd: env.root, signal: controller.signal, scope: agent }])
      assert.match(res.messages[1].content[0].text, /- desktop-control: Strict hostCtx live skill/)
      assert.doesNotMatch(res.messages[1].content[0].text, /desktop-disabled/)
    } finally {
      detachBoth()
    }

    // 2) Neither skills nor workingDirectory registered; direct property access still throws without inject
    const strictWithoutServices = createStrictCordisHostCtx({ injected: ['agents'], services: {} })
    const detachNone = attachAtPluginsAgentHook(strictWithoutServices)
    try {
      const preStep = [...strictWithoutServices.listeners.get('agent/pre-step')][0]
      const res = await preStep({ agent, messages: [userMsg], signal: controller.signal }, async () => baseDecision)
      assert.equal(res.messages.length, 2)
      assert.match(res.messages[1].content[0].text, /<explicit_plugin name="Computer Use" id="computer-use"/)
      assert.match(res.messages[1].content[0].text, /- desktop-control: Control desktop windows and inputs\./)
    } finally {
      detachNone()
    }

    // 3) Only skills registered; workingDirectory absent and throws on direct access
    const onlySkillsSnapshots = []
    const strictSkillsOnly = createStrictCordisHostCtx({
      injected: ['agents'],
      services: {
        skills: {
          snapshot: async (opts) => {
            onlySkillsSnapshots.push(opts)
            return {
              complete: true,
              skills: [
                { name: 'desktop-control', description: 'Snapshot without wd on strict ctx', path: join(installedDir('computer-use'), 'skills', 'desktop-control', 'SKILL.md'), invocation: { modelInvocable: true } },
                { name: 'desktop-disabled', description: 'Disabled', path: join(installedDir('computer-use'), 'skills', 'desktop-disabled', 'SKILL.md'), invocation: { modelInvocable: false } },
              ],
            }
          },
        },
      },
    })
    const detachSkillsOnly = attachAtPluginsAgentHook(strictSkillsOnly)
    try {
      const preStep = [...strictSkillsOnly.listeners.get('agent/pre-step')][0]
      const res = await preStep({ agent, messages: [userMsg], signal: controller.signal }, async () => baseDecision)
      assert.deepEqual(onlySkillsSnapshots, [{ cwd: undefined, signal: controller.signal, scope: agent }])
      assert.match(res.messages[1].content[0].text, /- desktop-control: Snapshot without wd on strict ctx/)
      assert.doesNotMatch(res.messages[1].content[0].text, /desktop-disabled/)
    } finally {
      detachSkillsOnly()
    }
  } finally {
    env.cleanup()
  }
})

test('apply(ctx) attaches fallback per-agent skills provider without un-injected agent.ctx.skills error', async () => {
  const env = setupComputerUseFixture()
  const setupAgentScopeFixture = (rootCtx) => {
    const warnings = []
    let agentProviderRegs = 0
    let agentProviderDisposed = 0
    rootCtx.logger.exporter({
      levels: { default: 3 },
      export(message) {
        if (message.type === 'warn') warnings.push(message.args.map(String).join(' '))
      },
    })
    rootCtx.plugin((c) => {
      c.provide('skills', {
        registerProvider: () => () => {},
        list: async () => [],
      })
    })
    const agentScope = rootCtx.isolate('skills')
    agentScope.plugin((c) => {
      c.provide('skills', {
        registerProvider: (factory) => {
          agentProviderRegs += 1
          factory({ invalidate() {} })
          return () => { agentProviderDisposed += 1 }
        },
        list: async () => [],
      })
    })
    let agent = null
    agentScope.plugin((agentFiberCtx) => {
      agent = {
        id: 'agent-cordis-no-inject',
        ctx: agentFiberCtx,
        session: { id: 'agent-cordis-no-inject', header: { cwd: env.root } },
      }
      agentFiberCtx.provide('agents', {
        list: () => (agent ? [agent] : []),
        get: (id) => (agent && agent.id === id ? agent : undefined),
      })
    })
    return {
      injectWarnings: () => warnings.filter(msg => /without inject|cannot get property/i.test(msg)),
      stats: () => ({ agentProviderRegs, agentProviderDisposed }),
    }
  }

  const root = new Context()
  const fallbackRoot = new Context()
  try {
    // Host machines with DSH installed load real `createScope`, bypassing the
    // fallback branch in `attachAgents`; verify zero inject errors on `applyHub`
    // unconditionally, then test `createScope = null` deterministically below.
    const hubProbe = setupAgentScopeFixture(root)
    root.plugin({ name: 'universal-plugin-hub', apply: applyHub })
    await flushCordis(root)
    assert.deepEqual(hubProbe.injectWarnings(), [])
    await root.fiber.dispose()

    const fallbackProbe = setupAgentScopeFixture(fallbackRoot)
    fallbackRoot.plugin((pluginCtx) => {
      const manager = createSkillsManager()
      pluginCtx.inject(['skills'], (hostCtx) => {
        hostCtx.effect(() => manager.attach(hostCtx.skills))
      })
      pluginCtx.inject(['skills', 'agents'], (hostCtx) => {
        hostCtx.effect(() => manager.attachAgents(hostCtx, null))
      })
    })
    await flushCordis(fallbackRoot)

    assert.deepEqual(fallbackProbe.injectWarnings(), [])
    assert.equal(fallbackProbe.stats().agentProviderRegs, 1)

    await fallbackRoot.fiber.dispose()
    assert.equal(fallbackProbe.stats().agentProviderDisposed, 1)
  } finally {
    await root.fiber.dispose()
    await fallbackRoot.fiber.dispose()
    env.cleanup()
  }
})

// ---------------------------------------------------------------------------
// DSH Session Title @Plugin Wire-Markup Cleaning (Option A)
// Faithful replication of @deepseek-ai/dsh-session & @deepseek-ai/dsh-session-title
// verified in DeepSeek Harness app.asar (dsh-session/src/index.ts,
// dsh-session-title/src/index.ts, dsh-session-title/src/normalize.ts).
// ---------------------------------------------------------------------------

const DSH_OSC_SEQUENCE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu
const DSH_CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu
const DSH_ESC_SEQUENCE = /\u001B[@-_]/gu
const DSH_CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu
const DSH_DIRECTIONAL_CONTROL = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu

function dshCleanTitleText(input) {
  return input
    .replace(DSH_OSC_SEQUENCE, '')
    .replace(DSH_CSI_SEQUENCE, '')
    .replace(DSH_ESC_SEQUENCE, '')
    .replace(DSH_CONTROL_CHARACTER, '')
    .replace(DSH_DIRECTIONAL_CONTROL, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function dshTruncateTitleUtf8(input, maxBytes) {
  let used = 0
  let out = ''
  for (const character of input) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > maxBytes) break
    used += bytes
    out += character
  }
  return out
}

function dshNormalizeSessionTitle(input, maxBytes) {
  return dshTruncateTitleUtf8(dshCleanTitleText(input), maxBytes).trimEnd()
}

function dshFallbackSessionTitle(input, maxWords, maxBytes) {
  return dshTruncateTitleUtf8(
    dshCleanTitleText(input).split(' ').filter(Boolean).slice(0, maxWords).join(' '),
    maxBytes,
  ).trimEnd()
}

function dshFoldSessionTitle(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const item = events[i]
    if (item.type === 'session/title') {
      return {
        title: item.data.title,
        messageSeqs: [...item.data.messageSeqs],
        source: structuredClone(item.data.source),
        eventSeq: item.seq,
        updatedAt: item.time,
      }
    }
  }
  return undefined
}

function dshUserMessageTextOf(event) {
  if (event?.type !== 'user/message' || event?.data?.source?.kind !== 'user') return undefined
  const content = Array.isArray(event.data.content) ? event.data.content : []
  const text = content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
  if (dshNormalizeSessionTitle(text, Number.MAX_SAFE_INTEGER).length === 0) return undefined
  return text
}

function deepFreezeValue(value) {
  if (!value || typeof value !== 'object') return value
  for (const key of Object.keys(value)) {
    deepFreezeValue(value[key])
  }
  return Object.freeze(value)
}

async function flushDshMicrotasks(root, turns = 8) {
  await flushCordis(root)
  for (let i = 0; i < turns; i++) {
    await Promise.resolve()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  for (let i = 0; i < turns; i++) {
    await Promise.resolve()
  }
}

function createDshSessionHarness(root, options = {}) {
  const {
    withSessionTitle = true,
    config = { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 },
    provider = null,
    registerTitleServiceFirst = true,
  } = options

  const liveSessions = new Map()
  const observedEvents = []
  const observedTitleEvents = []

  const sessions = {
    create(id = 'sess-1', header = {}) {
      const events = []
      let publishing = false
      const session = {
        id,
        header: deepFreezeValue({
          id,
          isSeeded: false,
          origin: 'interactive',
          ...header,
        }),
        eventAt(seq) {
          return events.find((e) => e.seq === seq)
        },
        snapshotEvents() {
          return [...events]
        },
        append(type, data) {
          if (publishing) {
            throw new Error('session append cannot reenter while another append is being published')
          }
          if (liveSessions.get(id) !== session) {
            throw new Error(`session "${id}" cannot append outside a SessionStore`)
          }
          const cloned = deepFreezeValue(structuredClone(data))
          if (type === 'session/title') {
            if (typeof cloned?.title !== 'string' || cloned.title.length < 1) {
              throw new Error('session/title validation failed: title must have length >= 1')
            }
          }
          const event = deepFreezeValue({
            seq: events.length,
            time: Date.now() + events.length,
            type,
            data: cloned,
          })
          events.push(event)
          observedEvents.push(event)
          if (type === 'session/title') {
            observedTitleEvents.push(event)
          }
          publishing = true
          try {
            root.emit('session/event', session, event)
          } finally {
            publishing = false
          }
          return event
        },
      }
      liveSessions.set(id, session)
      return session
    },
    get(id) {
      return liveSessions.get(id)
    },
    detach(session) {
      if (liveSessions.get(session.id) === session) {
        liveSessions.delete(session.id)
      }
    },
  }

  root.provide('sessions', sessions)

  const workState = new Map()
  let titleService = null

  function stateFor(session) {
    let state = workState.get(session)
    if (!state) {
      state = { pending: false, revision: 0 }
      workState.set(session, state)
    }
    return state
  }

  function registerTitleService() {
    if (!withSessionTitle) return
    const frozenConfig = deepFreezeValue({ ...config })

    const defer = (task) => {
      Promise.resolve().then(async () => {
        await task()
      })
    }

    const ensureFallback = async (session) => {
      const current = titleService.get(session)
      if (current !== undefined) return current
      const first = session
        .snapshotEvents()
        .map((event) => {
          const text = dshUserMessageTextOf(event)
          return text === undefined ? null : { seq: event.seq, text }
        })
        .find(Boolean)
      if (!first) return undefined
      return Promise.resolve().then(() => {
        if (sessions.get(session.id) !== session) return undefined
        const accepted = titleService.get(session)
        if (accepted !== undefined) return accepted
        const title = dshFallbackSessionTitle(
          first.text,
          frozenConfig.fallbackMaxWords,
          frozenConfig.fallbackMaxBytes,
        )
        if (!title) return undefined
        session.append('session/title', {
          title,
          messageSeqs: [first.seq],
          source: { kind: 'fallback' },
        })
        return titleService.get(session)
      })
    }

    titleService = {
      config: frozenConfig,
      get(session) {
        return dshFoldSessionTitle(session.snapshotEvents())
      },
      rename(session, title) {
        if (sessions.get(session.id) !== session) {
          throw new Error('session not found')
        }
        const normalized = dshNormalizeSessionTitle(title, frozenConfig.maxTitleBytes)
        if (!normalized) {
          throw new Error('title must not be empty')
        }
        session.append('session/title', {
          title: normalized,
          messageSeqs: [],
          source: { kind: 'user' },
        })
        return titleService.get(session)
      },
      async refresh(session) {
        if (sessions.get(session.id) !== session) return undefined
        const current = titleService.get(session)
        if (current?.source?.kind === 'user') return current
        const fallback = await ensureFallback(session)
        if (!provider) return fallback
        return titleService.runProvider(session)
      },
      async runProvider(session) {
        await ensureFallback(session)
        if (!provider) return titleService.get(session)
        const messages = session
          .snapshotEvents()
          .map((event) => {
            const text = dshUserMessageTextOf(event)
            return text === undefined ? null : { seq: event.seq, text }
          })
          .filter(Boolean)
        const result = await provider.generate({ session, messages })
        if (!result || sessions.get(session.id) !== session) return titleService.get(session)
        const latest = titleService.get(session)
        if (latest?.source?.kind === 'user') return latest
        const title = dshNormalizeSessionTitle(result.title, frozenConfig.maxTitleBytes)
        if (!title) return latest
        session.append('session/title', {
          title,
          messageSeqs: [...(result.messageSeqs ?? messages.map((m) => m.seq))],
          source: {
            kind: 'provider',
            provider: provider.id ?? 'mock-llm',
            ...(result.model ? { model: result.model } : {}),
          },
        })
        return titleService.get(session)
      },
      appendRawFallbackForTest(session) {
        const first = session
          .snapshotEvents()
          .map((event) => {
            const text = dshUserMessageTextOf(event)
            return text === undefined ? null : { seq: event.seq, text }
          })
          .find(Boolean)
        if (!first) return undefined
        const title = dshFallbackSessionTitle(
          first.text,
          frozenConfig.fallbackMaxWords,
          frozenConfig.fallbackMaxBytes,
        )
        return session.append('session/title', {
          title,
          messageSeqs: [first.seq],
          source: { kind: 'fallback' },
        })
      },
      debugWorkState(session) {
        return stateFor(session)
      },
    }

    root.provide('sessionTitle', titleService)
    root.on('session/event', (session, event) => {
      if (event.type !== 'user/message') return
      const parsed = dshUserMessageTextOf(event)
      if (parsed === undefined) return
      const existing = titleService.get(session)
      if (existing?.source?.kind === 'user') return
      const count = session.snapshotEvents().filter((e) => dshUserMessageTextOf(e) !== undefined).length
      const state = stateFor(session)
      const shouldSchedule =
        !session.header.isSeeded &&
        session.header.origin !== 'subagent' &&
        count === 1 &&
        existing === undefined
      if (shouldSchedule) {
        state.pending = true
      }
      defer(async () => {
        await ensureFallback(session)
      })
    })
  }

  if (registerTitleServiceFirst) {
    registerTitleService()
  }

  return {
    sessions,
    get sessionTitle() {
      return titleService
    },
    registerTitleService,
    observedEvents,
    observedTitleEvents,
  }
}

test('stripPluginMentionsFromTitle replaces complete and trailing truncated wire mentions without sticky state', () => {
  assert.equal(
    stripPluginMentionsFromTitle('@[Computer Use](uph-plugin:computer-use) 你能干什么'),
    'Computer Use 你能干什么',
  )
  assert.equal(
    stripPluginMentionsFromTitle(
      '对比 @[Alpha Tool](uph-plugin:alpha-tool) 和 @[Beta Helper](uph-plugin:beta-helper) 的能力',
    ),
    '对比 Alpha Tool 和 Beta Helper 的能力',
  )
  assert.equal(
    stripPluginMentionsFromTitle('@[Very Long Plugin Name](uph-plugin:very-long-plu'),
    'Very Long Plugin Name',
  )
})

test('Option A preempts DSH fallback title on @[Computer Use](uph-plugin:computer-use) in both listener orders without mutating user/message', async () => {
  for (const registerTitleServiceFirst of [true, false]) {
    const root = new DshTitleCordisContext()
    try {
      const harness = createDshSessionHarness(root, { registerTitleServiceFirst })
      if (!registerTitleServiceFirst) {
        root.inject(['sessions'], (hostCtx) => {
          hostCtx.effect(() => attachAtPluginsSessionTitleHook(hostCtx), 'test-hook-first')
        })
        harness.registerTitleService()
      } else {
        root.inject(['sessions'], (hostCtx) => {
          hostCtx.effect(() => attachAtPluginsSessionTitleHook(hostCtx), 'test-hook-second')
        })
      }
      await flushCordis(root)

      const session = harness.sessions.create(`sess-order-${registerTitleServiceFirst}`)
      const rawPrompt = '@[Computer Use](uph-plugin:computer-use) 你能干什么'
      session.append('user/message', {
        source: { kind: 'user' },
        content: [{ type: 'text', text: rawPrompt }],
      })

      // Synchronous phase: onUserMessage saw empty title and scheduled LLM work
      assert.equal(harness.sessionTitle.debugWorkState(session).pending, true)

      await flushDshMicrotasks(root)

      const snap = harness.sessionTitle.get(session)
      assert.ok(snap, 'expected fallback session/title snapshot')
      assert.equal(snap.title, 'Computer Use 你能干什么')
      assert.equal(snap.source.kind, 'fallback')
      assert.deepEqual(snap.messageSeqs, [0])

      // Never leaked raw wire markup even in intermediate title events
      assert.equal(harness.observedTitleEvents.length, 1)
      assert.ok(!harness.observedTitleEvents.some((e) => e.data.title.includes('uph-plugin:')))

      // Original user/message text stays completely intact for extractPluginMentions & chips
      const storedUser = session.eventAt(0)
      assert.equal(storedUser.data.content[0].text, rawPrompt)
      const knownByName = new Map([['computer-use', { name: 'computer-use', displayName: 'Computer Use' }]])
      assert.deepEqual(
        extractPluginMentions(storedUser.data.content[0].text, knownByName).map((m) => m.plugin.name),
        ['computer-use'],
      )
    } finally {
      await root.fiber.dispose()
    }
  }
})

test('Option A safely truncates long plugin IDs and Chinese messages > 40 UTF-8 bytes without splitting URIs or UTF-8 chars', async () => {
  const root = new DshTitleCordisContext()
  try {
    const harness = createDshSessionHarness(root)
    root.inject(['sessions'], (hostCtx) => {
      hostCtx.effect(() => attachAtPluginsSessionTitleHook(hostCtx), 'test-long-utf8')
    })
    await flushCordis(root)

    // Case A: Long plugin ID + Chinese tail exceeding 40 UTF-8 bytes
    const sessionA = harness.sessions.create('sess-long-id')
    sessionA.append('user/message', {
      source: { kind: 'user' },
      content: [
        {
          type: 'text',
          text: '@[Super Assistant](uph-plugin:very-long-enterprise-super-assistant-plugin-id) 请帮我分析一下今天下午发布的全部生产环境日志并总结根因',
        },
      ],
    })
    await flushDshMicrotasks(root)

    const snapA = harness.sessionTitle.get(sessionA)
    assert.ok(snapA)
    assert.ok(!snapA.title.includes('uph-plugin:'), `unexpected URI markup in ${snapA.title}`)
    assert.ok(!snapA.title.includes('@['), `unexpected @[ in ${snapA.title}`)
    assert.ok(Buffer.byteLength(snapA.title, 'utf8') <= 40, `exceeded 40B: ${Buffer.byteLength(snapA.title, 'utf8')}`)
    assert.equal(Buffer.from(snapA.title, 'utf8').toString('utf8'), snapA.title)
    // "Super Assistant " = 16 bytes, remaining 24 bytes = 8 CJK characters ("请帮我分析一下今")
    assert.equal(snapA.title, 'Super Assistant 请帮我分析一下今')

    // Case B: If raw native fallback already landed truncated mid-URI (e.g. refresh / race),
    // session/title fallback cleaner recovers full message via messageSeqs[0] instead of losing trailing text
    const sessionB = harness.sessions.create('sess-truncated-recovery')
    sessionB.append('user/message', {
      source: { kind: 'user' },
      content: [
        {
          type: 'text',
          text: '@[Super Plug](uph-plugin:extremely-long-enterprise-plugin-identifier) 总结一下',
        },
      ],
    })
    await flushDshMicrotasks(root)
    // Force an already-truncated raw fallback as if native refresh() appended it
    harness.sessionTitle.appendRawFallbackForTest(sessionB)
    await flushDshMicrotasks(root)

    const snapB = harness.sessionTitle.get(sessionB)
    assert.equal(snapB.title, 'Super Plug 总结一下')
    assert.equal(snapB.source.kind, 'fallback')
    assert.deepEqual(snapB.messageSeqs, [0])
  } finally {
    await root.fiber.dispose()
  }
})

test('Option A idempotently cleans session-title-llm provider echoes while preserving source and avoiding loops', async () => {
  const root = new DshTitleCordisContext()
  try {
    const harness = createDshSessionHarness(root, {
      provider: {
        id: 'first-prompt-llm',
        async generate({ messages }) {
          return {
            title: '@[Computer Use](uph-plugin:computer-use) 桌面自动化能力咨询',
            messageSeqs: messages.map((m) => m.seq),
            model: { provider: 'deepseek', model: 'deepseek-chat' },
          }
        },
      },
    })
    root.inject(['sessions'], (hostCtx) => {
      hostCtx.effect(() => attachAtPluginsSessionTitleHook(hostCtx), 'test-provider-clean')
    })
    await flushCordis(root)

    const session = harness.sessions.create('sess-provider')
    session.append('user/message', {
      source: { kind: 'user' },
      content: [{ type: 'text', text: '@[Computer Use](uph-plugin:computer-use) 你能干什么' }],
    })
    await flushDshMicrotasks(root)

    await harness.sessionTitle.runProvider(session)
    await flushDshMicrotasks(root)

    const snap = harness.sessionTitle.get(session)
    assert.equal(snap.title, 'Computer Use 桌面自动化能力咨询')
    assert.equal(snap.source.kind, 'provider')
    assert.equal(snap.source.provider, 'first-prompt-llm')
    assert.deepEqual(snap.source.model, { provider: 'deepseek', model: 'deepseek-chat' })
    assert.deepEqual(snap.messageSeqs, [0])

    // Total title events: 1 fallback + 1 raw provider + 1 cleaned provider = 3 (no infinite loop!)
    assert.equal(harness.observedTitleEvents.length, 3)
  } finally {
    await root.fiber.dispose()
  }
})

test('Option A never overwrites user manual rename (source.kind === user) or newer session/title events', async () => {
  const root = new DshTitleCordisContext()
  try {
    const harness = createDshSessionHarness(root)
    root.inject(['sessions'], (hostCtx) => {
      hostCtx.effect(() => attachAtPluginsSessionTitleHook(hostCtx), 'test-user-rename')
    })
    await flushCordis(root)

    // Subcase A: User renames before microtask finishes
    const sessionA = harness.sessions.create('sess-rename-race')
    sessionA.append('user/message', {
      source: { kind: 'user' },
      content: [{ type: 'text', text: '@[Computer Use](uph-plugin:computer-use) 你能干什么' }],
    })
    harness.sessionTitle.rename(sessionA, '我的置顶标题 @[Computer Use](uph-plugin:computer-use)')
    await flushDshMicrotasks(root)

    const snapA = harness.sessionTitle.get(sessionA)
    assert.equal(snapA.source.kind, 'user')
    assert.equal(snapA.title, '我的置顶标题 @[Computer Use](uph-plugin:computer-use)')

    // Subcase B: Provider event followed immediately by newer user rename before microtask drains
    const sessionB = harness.sessions.create('sess-stale-title')
    sessionB.append('user/message', {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'hello' }],
    })
    await flushDshMicrotasks(root)

    sessionB.append('session/title', {
      title: '@[Computer Use](uph-plugin:computer-use) 临时模型标题',
      messageSeqs: [0],
      source: { kind: 'provider', provider: 'mock-llm' },
    })
    harness.sessionTitle.rename(sessionB, '用户最终命名')
    await flushDshMicrotasks(root)

    const snapB = harness.sessionTitle.get(sessionB)
    assert.equal(snapB.source.kind, 'user')
    assert.equal(snapB.title, '用户最终命名')
    assert.equal(sessionB.snapshotEvents().at(-1).seq, snapB.eventSeq)
  } finally {
    await root.fiber.dispose()
  }
})

test('Option A degrades cleanly when sessionTitle service is absent (zero without-inject errors, preserves @ routing and unmount)', async () => {
  const root = new DshTitleCordisContext()
  try {
    const harness = createDshSessionHarness(root, { withSessionTitle: false })
    root.provide('agents', {})

    // Strict Cordis inject without 'sessionTitle': accessing hostCtx.sessionTitle directly would throw without inject!
    let hookDisposeCalls = 0
    root.inject(['sessions'], (hostCtx) => {
      hostCtx.effect(() => {
        const stop = attachAtPluginsSessionTitleHook(hostCtx)
        return () => {
          hookDisposeCalls += 1
          stop()
        }
      }, 'test-optional-session-title')
    })
    root.inject(['agents'], (hostCtx) => {
      hostCtx.effect(
        () =>
          attachAtPluginsAgentHook(hostCtx, {
            listPlugins: () => [{ name: 'computer-use', displayName: 'Computer Use', summary: 'Desktop automation' }],
            collectCapabilities: () => ({
              skills: [{ name: 'desktop-control', description: 'Control desktop' }],
              mcpServers: [],
              agents: [],
              prompts: [],
            }),
            createUserMessage: (msg) => msg,
          }),
        'test-routing-intact',
      )
    })
    await flushCordis(root)

    const session = harness.sessions.create('sess-no-title-svc')
    const rawPrompt = '@[Computer Use](uph-plugin:computer-use) 你能干什么'
    session.append('user/message', {
      source: { kind: 'user' },
      content: [{ type: 'text', text: rawPrompt }],
    })
    await flushDshMicrotasks(root)

    // No session/title appended when sessionTitle service is absent, no errors thrown
    assert.equal(harness.observedTitleEvents.length, 0)

    // Existing @ routing hook remains intact and still parses raw wire mention
    const decision = await root.bail(
      'agent/pre-step',
      {
        messages: [
          {
            source: { kind: 'user' },
            content: [{ type: 'text', text: rawPrompt }],
          },
        ],
      },
      async () => ({ kind: 'continue', messages: [] }),
    )
    assert.ok(Array.isArray(decision.messages) && decision.messages.length === 1)
    assert.deepEqual(decision.messages[0].source, { kind: 'plugin-routing', form: 'notice' })
    assert.equal('summary' in decision.messages[0].source, false)

    await root.fiber.dispose()
    assert.equal(hookDisposeCalls, 1)

    // After disposal, subsequent session events are ignored cleanly
    const postDisposeSession = harness.sessions.create('sess-after-dispose')
    postDisposeSession.append('user/message', {
      source: { kind: 'user' },
      content: [{ type: 'text', text: rawPrompt }],
    })
    await flushDshMicrotasks(root)
    assert.equal(harness.observedTitleEvents.length, 0)
  } finally {
    await root.fiber.dispose()
  }
})
