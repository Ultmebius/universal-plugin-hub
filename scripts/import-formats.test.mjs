import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const root = mkdtempSync(join(tmpdir(), 'hub-import-test-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = join(root, 'dsh')
const { parseMarketplaceFromDisk, readMarketplace, listSkills, readPluginManifest, invalidateMarketplaceCache } = await import('../src/parser.js')
const { inspectLocalPlugin, importLocalPlugin, saveUploadedZip } = await import('../src/local.js')
const { materializePlugin, pluginPath } = await import('../src/market.js')
const { sourceCacheDir, installedDir, dshSkillsDir } = await import('../src/store.js')
const { installPlugin } = await import('../src/install.js')

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content))
}
function skill(dir, name, filename = 'SKILL.md') {
  write(join(dir, filename), `---\nname: ${name}\ndescription: Skill ${name}\n---\n\nRead [reference](references/guide.md).\n`)
  write(join(dir, 'references', 'guide.md'), 'Useful reference')
}
function codex(dir, name, extra = {}) {
  write(join(dir, '.codex-plugin', 'plugin.json'), { name, version: '2.3.4', interface: { displayName: `Codex ${name}`, shortDescription: 'Codex description', developerName: 'Test author' }, ...extra })
}

test('DSH Hub import formats', async (t) => {
  try {
    await t.test('Codex marketplace local objects are enriched and materialize correctly', async () => {
      const cache = sourceCacheDir('codex-test')
      codex(join(cache, 'plugins', 'Only.Manifest'), 'only-manifest')
      write(join(cache, '.agents', 'plugins', 'marketplace.json'), { name: 'catalog', plugins: [{ name: 'only-manifest', source: { source: 'local', path: './plugins/Only.Manifest' } }] })
      const [row] = readMarketplace('codex-test')
      assert.equal(row.source, './plugins/Only.Manifest')
      assert.equal(row.displayName, 'Codex only-manifest')
      assert.equal(row.description, 'Codex description')
      assert.equal(row.version, '2.3.4')
      assert.equal(row.local, true)
      assert.equal((await materializePlugin('codex-test', row.name, row.source)).dir, resolve(cache, 'plugins/Only.Manifest'))
    })
    await t.test('standalone Codex plugin remains one plugin, not its individual skills', async () => {
      const dir = join(root, 'standalone')
      codex(dir, 'standalone', { skills: './workflows/' })
      skill(join(dir, 'workflows', 'one'), 'one')
      skill(join(dir, 'workflows', 'two'), 'two', 'skill.md')
      const rows = parseMarketplaceFromDisk('standalone-source', dir)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].name, 'standalone')
      assert.deepEqual(listSkills(dir).map((s) => s.name), ['one', 'two'])
      const preview = await inspectLocalPlugin(dir)
      assert.equal(preview.plugin.skillsCount, 2)
      await importLocalPlugin({ path: dir })
      const result = await installPlugin({ sourceId: 'local', pluginName: 'standalone' })
      assert.equal(result.ok, true)
      assert.equal(existsSync(join(dshSkillsDir(), 'two', 'SKILL.md')), true)
      assert.equal(readFileSync(join(dshSkillsDir(), 'one', 'references', 'guide.md'), 'utf8'), 'Useful reference')
    })
    await t.test('skill folders, SKILL.md paths and file URIs retain names and dependencies', async () => {
      const dir = join(root, 'skill folder')
      skill(dir, 'standalone-skill', 'skill.md')
      const preview = await inspectLocalPlugin(pathToFileURL(join(dir, 'skill.md')).href)
      assert.equal(preview.ok, true)
      assert.equal(preview.plugin.name, 'standalone-skill')
      assert.equal(preview.plugin.skillsCount, 1)
      await importLocalPlugin({ path: dir })
      await installPlugin({ sourceId: 'local', pluginName: 'standalone-skill' })
      assert.equal(readFileSync(join(dshSkillsDir(), 'standalone-skill', 'references', 'guide.md'), 'utf8'), 'Useful reference')
      assert.equal(existsSync(join(installedDir('standalone-skill'), 'skills', 'standalone-skill', 'SKILL.md')), true)
    })
    await t.test('bare SKILL.md uploads have stable frontmatter identity across requests', async () => {
      const data = Buffer.from('---\nname: uploaded-skill\ndescription: A skill upload\n---\nHello').toString('base64')
      const preview = await inspectLocalPlugin(saveUploadedZip(data, 'SKILL.md'))
      assert.equal(preview.plugin.name, 'uploaded-skill')
      await importLocalPlugin({ path: saveUploadedZip(data, 'SKILL.md') })
      assert.equal((await inspectLocalPlugin(saveUploadedZip(data, 'skill.md'))).exists, true)
      assert.throws(() => saveUploadedZip(data, 'other.md'), /SKILL.md/)
    })
    await t.test('Codex marketplace archives import all local entries and detect duplicates', async () => {
      const dir = join(root, 'market-bundle')
      codex(join(dir, 'plugins', 'a'), 'bundle-a')
      codex(join(dir, 'plugins', 'b'), 'bundle-b')
      write(join(dir, '.agents', 'plugins', 'marketplace.json'), { plugins: ['a', 'b'].map((n) => ({ name: `bundle-${n}`, source: { source: 'local', path: `./plugins/${n}` } })) })
      const preview = await inspectLocalPlugin(dir)
      assert.equal(preview.ok, true)
      assert.equal(preview.plugins.length, 2)
      const archive = join(root, 'market-bundle.tgz')
      const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
      execFileSync(tar, ['-czf', archive, '-C', root, 'market-bundle'], { windowsHide: true })
      assert.equal((await inspectLocalPlugin(archive)).plugins.length, 2)
      await importLocalPlugin({ path: archive })
      assert.equal((await inspectLocalPlugin(dir)).exists, true)
      await assert.rejects(importLocalPlugin({ path: dir }), /同名/)
      await importLocalPlugin({ path: dir, overwrite: true })
      const names = readMarketplace('local').map((r) => r.name)
      assert.ok(names.includes('bundle-a') && names.includes('bundle-b'))
    })
    await t.test('flat skill collections import individually', async () => {
      const dir = join(root, 'skill-collection')
      skill(join(dir, 'first'), 'collection-first')
      skill(join(dir, 'second'), 'collection-second')
      const result = await importLocalPlugin({ path: dir })
      assert.equal(result.plugins.length, 2)
      assert.equal(existsSync(join(sourceCacheDir('local'), 'collection-second', 'SKILL.md')), true)
    })
    await t.test('ZIP, TGZ and TAR.GZ uploads unwrap directories and import', async () => {
      const dir = join(root, 'archive-content')
      codex(join(dir, 'wrapper', 'plugin'), 'archived-plugin')
      const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
      for (const ext of (process.platform === 'win32' ? ['zip', 'tgz', 'tar.gz'] : ['tgz', 'tar.gz'])) {
        const archive = join(root, `plugin.${ext}`)
        execFileSync(tar, [ext === 'zip' ? '-acf' : '-czf', archive, '-C', dir, 'wrapper'], { windowsHide: true })
        const upload = saveUploadedZip(readFileSync(archive).toString('base64'), `plugin.${ext}`)
        const preview = await inspectLocalPlugin(upload)
        assert.equal(preview.ok, true, preview.error)
        assert.equal(preview.plugin.name, 'archived-plugin')
        await importLocalPlugin({ path: upload, overwrite: true })
      }
    })
    await t.test('Claude marketplace and single plugin still parse', () => {
      const dir = join(root, 'claude')
      write(join(dir, '.claude-plugin', 'marketplace.json'), { plugins: [{ name: 'legacy', description: 'Legacy', source: './plugins/legacy' }] })
      write(join(dir, 'plugins', 'legacy', '.claude-plugin', 'plugin.json'), { name: 'legacy', version: '1.0.1' })
      assert.equal(parseMarketplaceFromDisk('legacy-source', dir)[0].name, 'legacy')
      assert.equal(readPluginManifest(join(dir, 'plugins', 'legacy')).version, '1.0.1')
    })
    await t.test('dual-format uploads use Claude metadata and skills through installation', async () => {
      const dir = join(root, 'dual-format')
      codex(dir, 'codex-choice', { skills: './codex-workflows/' })
      write(join(dir, 'plugin.json'), { name: 'portable-choice', extensions: { 'com.openai': { interface: { displayName: 'Portable choice' } } } })
      write(join(dir, '.claude-plugin', 'plugin.json'), {
        name: 'claude-choice', displayName: 'Claude choice', description: 'Claude description',
        version: '3.4.5', author: { name: 'Claude author' }, skills: './claude-workflows/',
      })
      skill(join(dir, 'claude-workflows', 'claude-only-skill'), 'claude-only-skill')
      skill(join(dir, 'codex-workflows', 'codex-only-skill'), 'codex-only-skill')
      const manifest = readPluginManifest(dir, false)
      assert.equal(manifest.name, 'claude-choice')
      assert.equal(manifest.skills, './claude-workflows/')
      assert.deepEqual(listSkills(dir).map(s => s.name), ['claude-only-skill'])
      const archive = join(root, 'dual-format.tgz')
      const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
      execFileSync(tar, ['-czf', archive, '-C', root, 'dual-format'], { windowsHide: true })
      const upload = saveUploadedZip(readFileSync(archive).toString('base64'), 'dual-format.tgz')
      const preview = await inspectLocalPlugin(upload)
      assert.equal(preview.ok, true, preview.error)
      assert.equal(preview.plugin.name, 'claude-choice')
      assert.equal(preview.plugin.displayName, 'Claude choice')
      assert.equal(preview.plugin.description, 'Claude description')
      assert.equal(preview.plugin.version, '3.4.5')
      assert.equal(preview.plugin.author, 'Claude author')
      assert.equal(preview.plugin.skillsCount, 1)
      await importLocalPlugin({ path: upload })
      const installed = await installPlugin({ sourceId: 'local', pluginName: 'claude-choice' })
      assert.equal(installed.plugin.version, '3.4.5')
      assert.equal(installed.plugin.displayName, 'Claude choice')
      assert.equal(existsSync(join(dshSkillsDir(), 'claude-only-skill', 'SKILL.md')), true)
      assert.equal(existsSync(join(dshSkillsDir(), 'codex-only-skill', 'SKILL.md')), false)
    })
    await t.test('dual-format marketplaces select the Claude catalog and plugin manifests', async () => {
      const dir = join(root, 'dual-market')
      for (const name of ['claude-entry', 'codex-entry']) {
        const pluginDir = join(dir, 'plugins', name)
        codex(pluginDir, name)
        write(join(pluginDir, '.claude-plugin', 'plugin.json'), { name, version: '4.5.6', description: 'Claude metadata' })
      }
      write(join(dir, '.claude-plugin', 'marketplace.json'), { plugins: [{ name: 'claude-entry', source: './plugins/claude-entry' }] })
      write(join(dir, '.agents', 'plugins', 'marketplace.json'), { plugins: [{ name: 'codex-entry', source: { source: 'local', path: './plugins/codex-entry' } }] })
      const rows = parseMarketplaceFromDisk('dual-market', dir)
      assert.deepEqual(rows.map(row => row.name), ['claude-entry'])
      assert.equal(rows[0].version, '4.5.6')
      assert.equal(rows[0].description, 'Claude metadata')
      const preview = await inspectLocalPlugin(dir)
      assert.equal(preview.ok, true, preview.error)
      assert.deepEqual(preview.plugins.map(row => row.name), ['claude-entry'])
    })
    await t.test('unreadable Claude descriptors fall through to Codex', async () => {
      const dir = join(root, 'claude-fallback')
      codex(dir, 'codex-fallback')
      write(join(dir, '.claude-plugin', 'plugin.json'), '{invalid JSON')
      assert.equal(readPluginManifest(dir).name, 'codex-fallback')
      assert.equal((await inspectLocalPlugin(dir)).plugin.name, 'codex-fallback')
      const market = join(root, 'claude-market-fallback')
      write(join(market, '.claude-plugin', 'marketplace.json'), '{invalid JSON')
      write(join(market, '.agents', 'plugins', 'marketplace.json'), { plugins: [{ name: 'fallback-entry', source: './plugins/fallback-entry' }] })
      codex(join(market, 'plugins', 'fallback-entry'), 'fallback-entry')
      assert.equal(parseMarketplaceFromDisk('fallback-market', market)[0].name, 'fallback-entry')
    })
    await t.test('portable manifest uses inline OpenAI interface', () => {
      const dir = join(root, 'portable')
      write(join(dir, 'plugin.json'), { name: 'portable', extensions: { 'com.openai': { interface: { displayName: 'Portable title' } } } })
      codex(dir, 'old-overlay')
      assert.equal(readPluginManifest(dir).name, 'portable')
      assert.equal(readPluginManifest(dir).displayName, 'Portable title')
    })
    await t.test('other ecosystem manifests do not shadow Codex metadata', () => {
      const dir = join(root, 'mixed')
      write(join(dir, 'plugin.json'), { $schema: 'https://antigravity.google/schemas/v1/plugin.json', name: 'mixed' })
      codex(dir, 'mixed')
      assert.equal(readPluginManifest(dir).displayName, 'Codex mixed')
      assert.equal(readPluginManifest(dir).version, '2.3.4')
    })
    await t.test('paths outside the repository and remote-only local collections are rejected', async () => {
      assert.throws(() => pluginPath(root, './../outside'), /unsafe/)
      assert.throws(() => pluginPath(root, 'C:/outside'), /unsafe/)
      const dir = join(root, 'remote-only')
      write(join(dir, '.agents', 'plugins', 'marketplace.json'), { plugins: [{ name: 'remote', source: { source: 'url', url: 'https://example.com/repo.git' } }] })
      const preview = await inspectLocalPlugin(dir)
      assert.equal(preview.ok, false)
      assert.match(preview.error, /添加插件市场/)
    })
    await t.test('upload dialog routes local paths and dropped Git URLs, then returns to upload', async () => {
      const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
      const start = client.indexOf('function AddSourceDialog(')
      const end = client.indexOf('function AddMcpDialog(', start)
      const state = []
      const requests = []
      let cursor = 0
      const context = {
        useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value) => { state[index] = value }] },
        useRef: () => ({ current: null }),
        h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(Boolean) }),
        UploadDropIcon() {}, PluginIcon() {}, ClearBtn() {},
        api: async (path, options) => {
          requests.push({ path, body: JSON.parse(options.body) })
          return path === '/sources/ensure' ? { pluginCount: 1, suggestedName: 'Codex', normalizedUrl: 'https://github.com/example/codex.git' } : { ok: true, plugin: { name: 'preview', displayName: 'Preview', skillsCount: 1 } }
        },
      }
      const Dialog = vm.runInNewContext(`(${client.slice(start, end)}\n)`, context)
      const props = { initialPhase: 'upload', onCancel() {}, onAdded() {}, showToast(title, detail) { throw new Error(`${title}: ${detail}`) } }
      const render = () => { cursor = 0; return Dialog(props) }
      const all = (node) => typeof node === 'object' ? [node, ...node.children.flatMap(all)] : []
      const find = (tree, predicate) => all(tree).find(predicate)
      let tree = render()
      const field = find(tree, (n) => n.props.id === 'cpm-upload-path')
      field.props.onChange({ target: { value: 'C:/skills/example' } })
      tree = render()
      await find(tree, (n) => n.type === 'button' && n.children.includes('解析并添加')).props.onClick()
      assert.equal(requests[0].path, '/plugins/local/inspect')
      assert.equal(requests[0].body.path, 'C:/skills/example')
      tree = render()
      assert.ok(find(tree, (n) => n.children.includes('发现插件 / Skills')))
      find(tree, (n) => n.type === 'button' && n.children.includes('返回')).props.onClick()
      tree = render()
      assert.ok(find(tree, (n) => n.props.id === 'cpm-upload-path'))
      find(tree, (n) => typeof n.props.onDrop === 'function').props.onDrop({ preventDefault() {}, dataTransfer: { files: [], getData: () => 'https://github.com/example/codex' } })
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(requests.at(-1).path, '/sources/ensure')
      assert.equal(requests.at(-1).body.url, 'https://github.com/example/codex')
    })
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    invalidateMarketplaceCache()
    rmSync(root, { recursive: true, force: true })
  }
})
