import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { PNG } from 'pngjs'
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
      // The first candidate is the file itself, so the row paints with no request.
      assert.match(row.icons.light[0], /^data:image\/svg\+xml;base64,/)
      // The served URL is still carried for the full-size and installed routes.
      localUrl = row.icons.light.find((url) => url.includes('/plugin-icon'))
      assert.match(localUrl, /plugin-icon\?sourceId=icon-source/)
      assert.equal(new URL(localUrl, 'http://localhost').searchParams.get('path'), './assets/light.svg')
      assert.ok(row.icons.dark.some((url) => /^data:.+/.test(url)), 'dark row is inlined too')
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
      assert.match(row.icons.light[0], /^data:image\/svg\+xml;base64,/, 'the row paints from the inlined copy')
      const servedIcon = row.icons.light.find((url) => url.includes('/plugin-icon'))
      assert.match(decodeURIComponent(servedIcon), /assets\/codex-icon.svg/)
      const detail = pluginDetail('self-market', row.name, row.source, row)
      assert.equal(detail.author, row.author)
      assert.equal(detail.skills[0].name, 'review')
      assert.deepEqual(detail.hooks, ['SessionStart'])
      let handler
      mountRoutes({ register(route) { handler = route.handler } })
      const response = { writeHead(status) { this.status = status }, end(body) { this.body = body } }
      await handler({ url: servedIcon, method: 'GET', headers: {} }, response)
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
    await t.test('a portrait-only plugin reports its artwork without leading with it', () => {
      // Rejecting Exa's 151x182 monogram was right, but on its own it emptied the
      // row and the plugin fell all the way back to a GitHub avatar — trading one
      // wrong picture for another. The shape rule must relegate, never erase.
      const svgOf = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}"/></svg>`
      const dir = join(root, 'portrait-fallback')
      write(join(dir, 'assets/Exa.svg'), svgOf(151, 182))
      const icons = buildPluginIcons({}, { sourceId: 's', name: 'exa', dir })
      assert.deepEqual(icons.light, [], 'a logotype is not a tile candidate')
      assert.equal(icons.portrait.light.length, 1, 'but the artwork is still reported')
      assert.match(decodeURIComponent(icons.portrait.light[0]), /Exa\.svg/)
    })
    await t.test('an icon too large to inline is still fetched eagerly, not on scroll', () => {
      // Only the first twelve cards asked for their icon eagerly; everything
      // else was loading="lazy", so scrolling revealed a placeholder first and
      // the picture a frame or two later — the flash. A same-origin local icon
      // costs one disk read, so it is never worth deferring.
      const state = []
      let cursor = 0
      const context = vm.createContext({
        useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = v }] },
        h: (type, props, ...children) => ({ type, props: props || {}, children: children.filter(Boolean) }),
      })
      const start = client.indexOf('const LOADED_AVATARS')
      const end = client.indexOf('function PluginIconFallback', start)
      vm.runInContext(client.slice(start, end) + '\nglobalThis.Icon = PluginIconImage;', context)
      const render = (candidates, eager) => { cursor = 0; return context.Icon({ candidates, plugin: { name: 't' }, fallback: 'f', eager }) }
      const local = render(['/universal-plugin-hub/api/plugin-icon?sourceId=s&name=n&path=a.svg'], false)
      assert.equal(local.children[1].props.loading, 'eager', 'a local icon must not wait for the viewport')
      const remote = render(['/universal-plugin-hub/api/icon?v=2&u=https%3A%2F%2Fgithub.com%2Fx.png'], false)
      assert.equal(remote.children[1].props.loading, 'lazy', 'a remote avatar may still wait')
      const shown = render(['/universal-plugin-hub/api/icon?v=2&u=https%3A%2F%2Fgithub.com%2Fx.png'], true)
      assert.equal(shown.children[1].props.loading, 'eager', 'above-the-fold cards stay eager')
    })
    await t.test('shipped artwork is found by name and shape, not a fixed file list', () => {
      // The four shapes that used to fall through to a network avatar: a custom
      // icon name, a brand-prefixed logo, a nested variant directory, and a
      // wide banner that must lose to real square artwork.
      const png = (width, height) => {
        const header = Buffer.alloc(24)
        header.writeUInt32BE(0x89504e47, 0)
        header.write('IHDR', 1, 'ascii')
        header.writeUInt32BE(width, 16)
        header.writeUInt32BE(height, 20)
        return header
      }
      const dir = join(root, 'artwork')
      write(join(dir, 'assets/app-icon.png'), png(512, 512))
      write(join(dir, 'assets/brand-banner.png'), png(1200, 300))
      write(join(dir, 'codex-plugin/assets/atlan-logo.png'), png(256, 256))
      write(join(dir, 'cursor-plugin/assets/atlan-logo.png'), png(256, 256))
      write(join(dir, 'assets/screenshot.png'), png(800, 800))
      const picked = (icons) => new URL(icons.light[0], 'http://localhost').searchParams.get('path')
      // A name-based hit wins outright, even over a squarer neighbour.
      assert.equal(picked(buildPluginIcons({}, { sourceId: 's', name: 'app', dir })), 'assets/app-icon.png')
      // The banner is named like artwork but is 4:1, so it must not win.
      const branded = buildPluginIcons({}, { sourceId: 's', name: 'brand', dir })
      assert.ok(!branded.light.some((url) => decodeURIComponent(url).includes('brand-banner')), 'a wide banner is not an icon')
      // A plugin name alone is enough to pick its logo out of a nested folder.
      assert.equal(picked(buildPluginIcons({}, { sourceId: 's', name: 'atlan', dir })), 'codex-plugin/assets/atlan-logo.png')
      // A documentation screenshot is never considered.
      assert.ok(!buildPluginIcons({}, { sourceId: 's', name: 'x', dir }).light.some((url) => decodeURIComponent(url).includes('screenshot')))
    })
    await t.test('a portrait logotype is reported separately so the client can rank it last', () => {
      // Exa's assets/Exa.svg is blue line art on transparent: inside our rounded
      // container it reads as a blank blue tile, while the exa-labs avatar is
      // the solid mark that belongs there. Ordering among local files is not
      // enough, because the client puts every declared icon ahead of the avatar.
      // Marking the shape lets the client place it after the avatar instead.
      const svgOf = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}"/></svg>`
      const dir = join(root, 'portrait-marked')
      write(join(dir, 'assets/Exa.svg'), svgOf(151, 182))
      write(join(dir, 'assets/logo.svg'), svgOf(200, 200))
      const icons = buildPluginIcons({}, { sourceId: 's', name: 'exa', dir })
      const asPath = (url) => decodeURIComponent(url).match(/path=([^&]+)/)?.[1]
      assert.equal(asPath(icons.light.find((u) => u.includes('/plugin-icon'))), 'assets/logo.svg')
      assert.deepEqual(icons.portrait.light.map(asPath), ['assets/Exa.svg'], 'the portrait file is listed apart from the tile candidates')
    })
    await t.test('a portrait logotype never wins the tile, but is kept as a last resort', () => {
      // Exa ships assets/Exa.svg (151x182). It matches the plugin name exactly,
      // so the name bonus always beat the shape penalty and the row rendered a
      // bare blue glyph on a blue well instead of the brand tile. It must rank
      // below square artwork — but dropping it outright emptied the row, which
      // was worse: the plugin fell through to a GitHub avatar.
      const svgOf = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}"/></svg>`)
      const dir = join(root, 'portrait')
      write(join(dir, 'assets/Exa.svg'), svgOf(151, 182))
      const squarePng = Buffer.alloc(24)
      squarePng.writeUInt32BE(0x89504e47, 0)
      squarePng.write('IHDR', 1, 'ascii')
      squarePng.writeUInt32BE(512, 16)
      squarePng.writeUInt32BE(512, 20)
      write(join(dir, 'assets/app-icon.png'), squarePng)
      const icons = buildPluginIcons({}, { sourceId: 's', name: 'exa', dir })
      // Square artwork is the tile; the name-matching portrait file is not in
      // the tile ranking at all, however well its name scores.
      const order = icons.light.filter((url) => url.includes('/plugin-icon'))
        .map((url) => new URL(url, 'http://x').searchParams.get('path'))
      assert.deepEqual(order, ['assets/app-icon.png'])
      assert.deepEqual(icons.portrait.light.map((url) => new URL(url, 'http://x').searchParams.get('path')), ['assets/Exa.svg'])
      // A picture at 0.15 or squarer is still an icon.
      const square = join(root, 'portrait-ok')
      write(join(square, 'assets/logo.svg'), svgOf(120, 132))
      assert.ok(buildPluginIcons({}, { sourceId: 's', name: 'p', dir: square }).light.length > 0,
        'a slightly tall logo is still usable')
    })
    await t.test('an expired icon is served from disk while the refresh happens behind it', async () => {
      let count = 0
      globalThis.fetch = async () => { count++; return new Response(svg) }
      const url = 'https://icons.example.test/stale-but-good.svg'
      const file = join(marketRoot(), 'icons', `icon_${createHash('md5').update(url).digest('hex')}.bin`)
      write(file, svg)
      utimesSync(file, new Date(0), new Date(0))
      const icon = await getOrFetchIcon(url)
      assert.deepEqual(icon.buffer, svg, 'the expired copy still renders')
      // The refresh runs detached, so a broken upstream cannot turn a usable
      // icon into an error; the caller never waits on it.
      globalThis.fetch = async () => { throw new Error('upstream down') }
      const again = await getOrFetchIcon(url)
      assert.deepEqual(again.buffer, svg)
      assert.ok(count >= 1)
    })
    await t.test('small conventional icon precedes a large logo fallback', () => {
      const dir = join(root, 'small-icon')
      write(join(dir, 'assets/codex-icon.png'), svg)
      write(join(dir, 'assets/logo.png'), svg)
      const servedPath = (icons) => new URL(icons.light.find((url) => url.includes('/plugin-icon')), 'http://localhost').searchParams.get('path')
      const icons = buildPluginIcons({}, { sourceId: 's', name: 'n', dir })
      assert.equal(servedPath(icons), 'assets/codex-icon.png')
      const declared = buildPluginIcons({ icon: 'assets/logo.png' }, { sourceId: 's', name: 'n', dir })
      assert.equal(servedPath(declared), 'assets/logo.png')
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
    await t.test('an icon remembered from a previous session never shows an empty box while it refetches', () => {
      // Regression: persisting "loaded" across restarts let a cold page hide the
      // placeholder and set opacity:1 before the bytes had arrived, which showed
      // the bare dark container. A remembered icon may start optimistic, but it
      // still has to hold the placeholder until this session's onLoad fires —
      // and it must fall back if the fetch now fails.
      const state = []
      let cursor = 0
      const saved = JSON.stringify(['/remembered'])
      const context = vm.createContext({
        useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = v }] },
        h: (type, props, ...children) => ({ type, props: props || {}, children: children.filter(Boolean) }),
        localStorage: { getItem: () => saved, setItem() {} },
      })
      const start = client.indexOf('const LOADED_AVATARS')
      const end = client.indexOf('function PluginIconFallback', start)
      vm.runInContext(client.slice(start, end) + '\nglobalThis.Icon = PluginIconImage;', context)
      const props = { candidates: ['/remembered'], plugin: { name: 'test' }, fallback: 'fallback', eager: true }
      const render = () => { cursor = 0; return context.Icon(props) }
      let tree = render()
      // Restored history only earns an eager fetch; it does not prove this
      // session has painted anything. Once onLoad fires, later mounts paint
      // immediately, including navigation from the list into a detail page.
      assert.equal(tree.children[0].props.style.opacity, 1, 'restored history must not expose an empty container')
      assert.equal(tree.children[1].props.style.opacity, 0)
      tree.children[1].props.onLoad()
      tree = render()
      assert.equal(tree.children[0].props.style.opacity, 0)
      assert.equal(tree.children[1].props.style.opacity, 1)
      cursor = 0
      state.length = 0
      const remounted = context.Icon({ candidates: ['/remembered'], plugin: { name: 'test' }, fallback: 'fallback', eager: true })
      assert.equal(remounted.children[0].props.style.opacity, 1, 'a previous mount is not proof this image is ready')
      assert.equal(remounted.children[1].props.style.opacity, 0)
      remounted.children[1].props.ref({ complete: true, naturalWidth: 80 })
      const ready = render()
      assert.equal(ready.children[0].props.style.opacity, 0, 'confirm a memory-cached image before paint')
      assert.equal(ready.children[1].props.style.opacity, 1)
      cursor = 0
      state.length = 0
      const waiting = context.Icon({ candidates: ['/remembered'], plugin: { name: 'test' }, fallback: 'fallback', eager: true })
      waiting.children[1].props.ref({ complete: false, naturalWidth: 0 })
      assert.equal(render().children[0].props.style.opacity, 1, 'evicted or decoding images retain the preview on reopen')
      // And a remembered icon whose fetch fails must not stay blank either.
      cursor = 0
      state.length = 0
      const failed = context.Icon({ candidates: ['/remembered-broken'], plugin: { name: 'test' }, fallback: 'fallback', eager: true })
      assert.equal(failed.children[0].props.style.opacity, 1)
    })
    await t.test('a cold start paints a plugin-local icon without waiting on anything', () => {
      // The icons that visibly lagged were the plugin-local ones: their only
      // source was /api/plugin-icon, so the first paint waited on a request and
      // showed the bare container until it landed. The bytes are already on this
      // disk, so the row carries them and needs no request to paint.
      const dir = join(root, 'cold-start')
      write(join(dir, 'assets/icon.svg'), svg)
      const icons = buildPluginIcons({}, { sourceId: 's', name: 'cold', dir })
      assert.match(icons.light[0], /^data:image\/svg\+xml;base64,/, 'first candidate must be drawable as-is')
      assert.ok(icons.light.some((url) => url.includes('/api/plugin-icon')), 'the served URL is still available')
      // The case that actually matters: one row holding both a local file and a
      // remote source. Only the file may be inlined — a regression that inlined
      // the raw.githubusercontent URL would expose it here.
      const both = buildPluginIcons(
        { icon: 'assets/icon.svg', logo: 'https://cdn.example.test/remote.svg' },
        { sourceId: 's', name: 'cold', dir, source: { url: 'https://github.com/o/r.git', sha: 'abc' } },
      )
      const inlined = both.light.filter((url) => url.startsWith('data:'))
      assert.equal(inlined.length, 1, 'exactly one inline copy')
      assert.match(inlined[0], /^data:image\/svg\+xml;base64,/, 'the inlined copy is the local file')
      assert.ok(!both.light.some((url) => url.includes('raw.githubusercontent') && url.startsWith('data:')), 'a remote URL is never inlined')
      // A row with only a remote source keeps the proxy path.
      const remote = buildPluginIcons({ icon: 'assets/icon.svg' }, { sourceId: 's', name: 'cold', source: { url: 'https://github.com/o/r.git', sha: 'abc' } })
      assert.ok(!remote.light[0].startsWith('data:'), 'remote rows keep the proxy path')
      // Oversized local artwork stays on the URL path rather than bloating rows.
      const big = join(root, 'cold-start-big')
      write(join(big, 'assets/icon.svg'), Buffer.alloc(600 * 1024, 32))
      assert.ok(!buildPluginIcons({}, { sourceId: 's', name: 'big', dir: big }).light.some((url) => url.startsWith('data:')))
    })
    await t.test('ordinary raster-sized local artwork carries one exact preview shared by both themes', () => {
      const dir = join(root, 'medium-logo')
      const bytes = Buffer.concat([svg, Buffer.alloc(48 * 1024, 32)])
      write(join(dir, 'assets/icon.svg'), bytes)
      const icons = buildPluginIcons({}, { sourceId: 's', name: 'medium', dir })
      assert.match(icons.light[0], /\/api\/plugin-icon\?/)
      assert.equal(icons.light[0], icons.dark[0])
      assert.deepEqual(Object.keys(icons.previews), [icons.light[0]], 'do not duplicate medium artwork in theme arrays')
      assert.deepEqual(Buffer.from(icons.previews[icons.light[0]].split(',')[1], 'base64'), bytes)
      write(join(dir, 'assets/icon.svg'), Buffer.concat([svg, Buffer.alloc(65 * 1024, 32)]))
      assert.equal(buildPluginIcons({}, { sourceId: 's', name: 'medium', dir }).previews, undefined, 'large artwork stays out of list payloads')
    })
    await t.test('large PNG previews preserve aspect ratio and alpha, stay small, and invalidate with the original', () => {
      const dir = join(root, 'png-preview'), file = join(dir, 'assets/icon.png')
      const width = 512, height = 256, data = Buffer.alloc(width * height * 4)
      let seed = 123456
      for (let i = 0; i < data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        data[i] = data[i + 1] = data[i + 2] = seed >>> 24
        data[i + 3] = 128
      }
      const original = PNG.sync.write({ width, height, data })
      assert.ok(original.length > 64 * 1024)
      write(file, original)
      const icons = buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'png', dir })
      const bytes = Buffer.from(icons.previews[icons.light[0]].split(',')[1], 'base64')
      assert.ok(bytes.length <= 12 * 1024)
      const preview = PNG.sync.read(bytes)
      assert.equal(preview.width, 96)
      assert.equal(preview.height, 48)
      assert.equal(preview.data[3], 128, 'retain translucent pixels rather than flattening onto white')
      assert.deepEqual(readFileSync(file), original, 'preserve the full-resolution original')
      data.fill(255)
      write(file, PNG.sync.write({ width, height, data }))
      const updated = buildPluginIcons({ icon: 'assets/icon.png' }, { sourceId: 's', name: 'png', dir })
      assert.notEqual(updated.light[0], icons.light[0], 'changed artwork must replace the displayed bytes')
    })
    await t.test('cached avatar-only rows carry exact disk bytes without fetching and retain the refresh URL', () => {
      const url = 'https://github.com/PreviewFixture.png?size=80'
      const file = join(marketRoot(), 'icons', `icon_${createHash('md5').update(url).digest('hex')}.bin`)
      write(file, svg)
      utimesSync(file, new Date(0), new Date(0))
      const previousFetch = globalThis.fetch
      let fetches = 0
      globalThis.fetch = () => { fetches++; throw Error('parsing must not fetch icons') }
      try {
        const icons = buildPluginIcons({}, { source: { url: 'https://github.com/PreviewFixture/plugin.git' } })
        const [proxy] = Object.keys(icons.previews)
        assert.equal(new URL(proxy, 'http://localhost').searchParams.get('u'), url)
        assert.deepEqual(Buffer.from(icons.previews[proxy].split(',')[1], 'base64'), svg)
        assert.deepEqual(icons.light, [], 'keep avatar resolution and refresh on the normal client path')
        assert.equal(buildPluginIcons({}, { source: { url: 'https://github.com/UncachedPreviewFixture/plugin.git' } }).previews, undefined)
        const remote = buildPluginIcons({ icon: url })
        assert.equal(new URL(remote.light[0], 'http://localhost').searchParams.get('u'), url)
        assert.equal(remote.previews[remote.light[0]], icons.previews[proxy])
        assert.equal(fetches, 0)
      } finally { globalThis.fetch = previousFetch }
    })
    await t.test('loaded icons remain ready after many icons and decode synchronously when remounted', () => {
      const state = []
      let cursor = 0
      const saved = JSON.stringify(['/first', ...Array.from({ length: 400 }, (_, i) => `/icon-${i}`)])
      const context = vm.createContext({
        useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = v }] },
        h: (type, props, ...children) => ({ type, props: props || {}, children: children.filter(Boolean) }),
        localStorage: { getItem: () => saved, setItem() {} },
      })
      const start = client.indexOf('const LOADED_AVATARS')
      const end = client.indexOf('function PluginIconFallback', start)
      vm.runInContext(client.slice(start, end) + '\nglobalThis.Icon = PluginIconImage;', context)
      const tree = context.Icon({ candidates: ['/first'], plugin: { name: 'test' }, fallback: 'fallback', eager: true })
      // Restored history earns a synchronous decode and eager fetch, but it is
      // not proof that this session has painted the icon yet.
      assert.equal(tree.children[0].props.style.opacity, 1)
      assert.equal(tree.children[1].props.decoding, 'sync')
      assert.equal(tree.children[1].props.loading, 'eager')
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
