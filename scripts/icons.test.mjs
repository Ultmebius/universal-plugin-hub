import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { buildPluginIcons, getOrFetchIcon, imageContentType, readLocalIcon } from '../src/icons.js'
import { readMarketplace, invalidateMarketplaceCache, pluginDetail } from '../src/parser.js'
import { sourceRepositoryDir } from '../src/market.js'
import { sourceCacheDir, marketRoot, writeState } from '../src/store.js'
import { mountRoutes } from '../src/routes.js'

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>')
const root = mkdtempSync(join(tmpdir(), 'hub-icon-test-'))
const oldHome = process.env.DSH_HOME
const oldFetch = globalThis.fetch
process.env.DSH_HOME = join(root, 'dsh')
function write(path, data) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data) }
const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

test('plugin icon parsing, delivery and caching', async (t) => {
  try {
    let localUrl
    await t.test('Codex theme assets reach marketplace rows as versioned local URLs', () => {
      const dir = join(sourceCacheDir('icon-source'), 'plugins', 'example')
      write(join(dir, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'example', interface: { logo: { light: './assets/light.svg', dark: './assets/dark.svg' } } }))
      write(join(dir, 'assets/light.svg'), svg)
      write(join(dir, 'assets/dark.svg'), svg)
      write(join(sourceCacheDir('icon-source'), '.agents/plugins/marketplace.json'), JSON.stringify({ plugins: [{ name: 'example', source: { source: 'local', path: './plugins/example' } }] }))
      const [row] = readMarketplace('icon-source')
      localUrl = row.icons.light[0]
      assert.match(localUrl, /plugin-icon\?sourceId=icon-source/)
      assert.equal(new URL(localUrl, 'http://localhost').searchParams.get('path'), './assets/light.svg')
      assert.match(row.icons.dark[0], /dark.svg/)
      assert.match(localUrl, /&v=/)
      assert.ok(!localUrl.includes(root))
    })
    await t.test('local endpoint delivers real SVG and refuses directory traversal', async () => {
      let handler
      mountRoutes({ register(route) { handler = route.handler } })
      const request = async (url) => {
        const response = { writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = body } }
        await handler({ url, method: 'GET', headers: {} }, response)
        return response
      }
      const result = await request(localUrl)
      assert.equal(result.status, 200)
      assert.equal(result.headers['Content-Type'], 'image/svg+xml')
      assert.deepEqual(result.body, svg)
      const unsafe = new URL(localUrl, 'http://localhost')
      unsafe.searchParams.set('path', '../../../../state.json')
      assert.equal((await request(unsafe.pathname + unsafe.search)).status, 404)
      assert.throws(() => readLocalIcon(root, '../outside.svg'))
    })
    await t.test('self-referencing Codex catalog reads its own manifest, icon and full details before installation', async () => {
      const dir = sourceCacheDir('self-market')
      const source = { source: 'url', url: 'https://github.com/ExampleOrg/SelfPlugin.git', ref: 'main' }
      write(join(dir, '.git/config'), '[remote "origin"]\n\turl = https://github.com/exampleorg/selfplugin\n')
      write(join(dir, '.git/HEAD'), 'ref: refs/heads/main\n')
      write(join(dir, '.agents/plugins/marketplace.json'), JSON.stringify({ plugins: [{ name: 'self-plugin', source, category: 'Productivity' }] }))
      write(join(dir, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'self-plugin', version: '5.3.2', author: { name: 'Real Developer' }, description: 'Actual plugin description', skills: './skills', hooks: './hooks/events.json', interface: { displayName: 'Self Plugin', composerIcon: './assets/codex-icon.svg' } }))
      write(join(dir, 'assets/codex-icon.svg'), svg)
      write(join(dir, 'skills/review/SKILL.md'), '---\nname: review\ndescription: Review changes\n---\nReview the diff.\n')
      write(join(dir, 'hooks/events.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }] } }))
      const [row] = readMarketplace('self-market')
      assert.equal(row.author, 'Real Developer')
      assert.equal(row.description, 'Actual plugin description')
      assert.equal(row.version, '5.3.2')
      assert.equal(row.displayName, 'Self Plugin')
      assert.match(decodeURIComponent(row.icons.light[0]), /assets\/codex-icon.svg/)
      const detail = pluginDetail('self-market', row.name, row.source, row)
      assert.equal(detail.author, row.author)
      assert.equal(detail.skills[0].name, 'review')
      assert.deepEqual(detail.hooks, ['SessionStart'])
      let handler
      mountRoutes({ register(route) { handler = route.handler } })
      const response = { writeHead(status) { this.status = status }, end(body) { this.body = body } }
      await handler({ url: row.icons.light[0], method: 'GET', headers: {} }, response)
      assert.equal(response.status, 200)
      assert.deepEqual(response.body, svg)
      assert.equal(sourceRepositoryDir(dir, { ...source, url: 'https://github.com/OtherOrg/SelfPlugin' }), null)
      assert.equal(sourceRepositoryDir(dir, { ...source, ref: 'another-branch' }), null)
      assert.equal(sourceRepositoryDir(dir, { ...source, sha: 'another-commit' }), null)
      assert.equal(sourceRepositoryDir(dir, { ...source, path: '../outside' }), null)
      assert.equal(sourceRepositoryDir(dir, { ...source, source: 'git-subdir', path: './skills' }), join(dir, 'skills'))
    })
    await t.test('remote relative assets honor Git subdirectory and pinned commit', () => {
      const icons = buildPluginIcons({ interface: { logo: './assets/logo.svg' } }, { sourceId: 's', name: 'n', source: { url: 'https://github.com/example/plugins.git', path: 'plugins/demo', sha: 'abc123' } })
      const remote = new URL(icons.dark[0], 'http://localhost').searchParams.get('u')
      assert.equal(remote, 'https://raw.githubusercontent.com/example/plugins/abc123/plugins/demo/assets/logo.svg')
      assert.deepEqual(buildPluginIcons({ icon: '../../../outside.svg' }, { source: { url: 'https://github.com/a/b.git' } }).light, [])
      const single = buildPluginIcons({ logo: { light: 'https://example.com/light.svg' } })
      assert.deepEqual(single.light, single.dark)
    })
    await t.test('small conventional icon precedes a large logo fallback', () => {
      const dir = join(root, 'small-icon')
      write(join(dir, 'assets/codex-icon.png'), svg)
      write(join(dir, 'assets/logo.png'), svg)
      const icons = buildPluginIcons({}, { sourceId: 's', name: 'n', dir })
      assert.equal(new URL(icons.light[0], 'http://localhost').searchParams.get('path'), 'assets/codex-icon.png')
      const declared = buildPluginIcons({ icon: 'assets/logo.png' }, { sourceId: 's', name: 'n', dir })
      assert.equal(new URL(declared.light[0], 'http://localhost').searchParams.get('path'), 'assets/logo.png')
    })
    await t.test('50 concurrent icon requests share one upstream fetch and warm memory', async () => {
      let count = 0
      globalThis.fetch = async () => { count++; return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }) }
      const url = 'https://icons.example.test/shared.svg'
      const results = await Promise.all(Array.from({ length: 50 }, () => getOrFetchIcon(url)))
      assert.equal(count, 1)
      assert.ok(results.every((r) => r.contentType === 'image/svg+xml'))
      await getOrFetchIcon(url)
      assert.equal(count, 1)
    })
    await t.test('existing disk cache avoids network and expired entries refresh', async () => {
      let count = 0
      globalThis.fetch = async () => { count++; return new Response(svg) }
      const url = 'https://icons.example.test/disk.svg'
      const file = join(marketRoot(), 'icons', `icon_${createHash('md5').update(url).digest('hex')}.bin`)
      write(file, svg)
      await getOrFetchIcon(url)
      assert.equal(count, 0)
      const staleUrl = 'https://icons.example.test/stale.svg'
      const stale = join(dirname(file), `icon_${createHash('md5').update(staleUrl).digest('hex')}.bin`)
      write(stale, svg)
      utimesSync(stale, new Date(0), new Date(0))
      await getOrFetchIcon(staleUrl)
      assert.equal(count, 1)
    })
    await t.test('bad responses are not cached as images; failed URLs have a cooldown', async () => {
      let count = 0
      globalThis.fetch = async () => { count++; return new Response('<html>Not an image</html>') }
      const url = 'https://icons.example.test/bad.svg'
      await assert.rejects(getOrFetchIcon(url), /Unsupported/)
      await assert.rejects(getOrFetchIcon(url), /temporarily/)
      assert.equal(count, 1)
      globalThis.fetch = async () => new Response(svg, { headers: { 'content-length': '3000000' } })
      await assert.rejects(getOrFetchIcon('https://icons.example.test/large.svg'), /too large/)
      assert.equal(imageContentType(Buffer.from('<html/>')), null)
    })
    await t.test('declared icons win, plugin brands precede publisher brands, and homepage fallback works', () => {
      const context = vm.createContext({ URL })
      const start = client.indexOf('const BRAND_ICONS')
      const end = client.indexOf('function AnthropicIcon', start)
      vm.runInContext(client.slice(start, end) + '\nglobalThis.candidates = getPluginIconCandidates; globalThis.brands = BRAND_ICONS;', context)
      const result = context.candidates({ name: 'playwright', author: 'Microsoft', icons: { light: ['/universal-plugin-hub/api/plugin-icon?test=1'] } }, false)
      assert.equal(result[0], '/universal-plugin-hub/api/plugin-icon?test=1')
      assert.equal(result[1], context.brands.playwright)
      assert.notEqual(result[1], context.brands.microsoft)
      const avatar = context.candidates({ name: 'unmapped', source: { url: 'https://github.com/ExampleOrg/repo' } }, false)[0]
      assert.match(decodeURIComponent(avatar), /github.com\/ExampleOrg.png\?size=80/)
      assert.match(avatar, /[?&]v=2/)
      const home = context.candidates({ name: 'unmapped', homepage: 'https://example.com/path' }, false)[0]
      assert.match(decodeURIComponent(home), /https:\/\/example.com\/favicon.ico/)
    })
    await t.test('legacy named CDN avatar URLs bypass incorrect cached generic images', async () => {
      const url = 'https://avatars.githubusercontent.com/FixtureOrganization?s=80&v=4'
      write(join(marketRoot(), 'icons', `icon_${createHash('md5').update(url).digest('hex')}.bin`), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><title>wrong cached image</title></svg>'))
      let requested
      globalThis.fetch = async (target) => { requested = target; return new Response(svg) }
      const result = await getOrFetchIcon(url)
      assert.equal(requested, 'https://github.com/FixtureOrganization.png?size=80')
      assert.deepEqual(result.buffer, svg)
    })
    await t.test('local source availability follows imported content independently of legacy MCP records', async () => {
      writeState({ sources: [{ id: 'local', name: '本地插件', url: 'local://' }], plugins: [{ name: 'legacy-server', sourceId: 'local' }] })
      let handler
      mountRoutes({ register(route) { handler = route.handler } })
      const read = async () => {
        const response = { writeHead() {}, end(body) { this.body = JSON.parse(body) } }
        await handler({ method: 'GET', url: '/universal-plugin-hub/api/state', headers: {} }, response)
        return response.body
      }
      let state = await read()
      assert.equal(state.sources[0].pluginCount, 0)
      assert.equal(state.plugins.length, 1)
      write(join(sourceCacheDir('local'), 'local-skill', 'SKILL.md'), '---\nname: local-skill\ndescription: Local skill\n---\nLocal skill.')
      invalidateMarketplaceCache('local')
      state = await read()
      assert.equal(state.sources[0].pluginCount, 1)
    })
    await t.test('loading and failures keep a visible fallback and advance to the next source', () => {
      const state = []
      let cursor = 0
      const context = vm.createContext({
        useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = v }] },
        h: (type, props, ...children) => ({ type, props: props || {}, children: children.filter(Boolean) }),
      })
      const start = client.indexOf('const LOADED_AVATARS')
      const end = client.indexOf('function PluginIconFallback', start)
      vm.runInContext(client.slice(start, end) + '\nglobalThis.Icon = PluginIconImage;', context)
      const props = { candidates: ['/first', '/second'], plugin: { name: 'test' }, fallback: 'fallback', eager: true }
      const render = () => { cursor = 0; return context.Icon(props) }
      let tree = render()
      assert.equal(tree.children[0].props.style.opacity, 1)
      assert.equal(tree.children[1].props.loading, 'eager')
      tree.children[1].props.onError()
      tree = render()
      assert.equal(tree.children[1].props.src, '/second')
      tree.children[1].props.onLoad()
      tree = render()
      assert.equal(tree.children[0].props.style.opacity, 0)
      assert.equal(tree.children[1].props.style.objectFit, 'contain')
      tree.children[1].props.onError()
      tree = render()
      assert.equal(tree.children.length, 1)
      assert.equal(tree.children[0].props.style.opacity, 1)
    })
    await t.test('loaded icons remain ready after many icons and decode synchronously when remounted', () => {
      const state = []
      let cursor = 0
      const context = vm.createContext({
        useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = v }] },
        h: (type, props, ...children) => ({ type, props: props || {}, children: children.filter(Boolean) }),
      })
      const start = client.indexOf('const LOADED_AVATARS')
      const end = client.indexOf('function PluginIconFallback', start)
      vm.runInContext(client.slice(start, end) + '\nglobalThis.Icon = PluginIconImage; globalThis.track = trackLoadedAvatar;', context)
      context.track('/first')
      for (let i = 0; i < 400; i++) context.track(`/icon-${i}`)
      const tree = context.Icon({ candidates: ['/first'], plugin: { name: 'test' }, fallback: 'fallback', eager: true })
      assert.equal(tree.children[0].props.style.opacity, 0)
      assert.equal(tree.children[1].props.decoding, 'sync')
      tree.children[1].props.onError()
      cursor = 0
      state.length = 0
      const retry = context.Icon({ candidates: ['/first'], plugin: { name: 'test' }, fallback: 'fallback', eager: true })
      assert.equal(retry.children.length, 1)
    })
  } finally {
    globalThis.fetch = oldFetch
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
    invalidateMarketplaceCache()
    rmSync(root, { recursive: true, force: true })
  }
})
