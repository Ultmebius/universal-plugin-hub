import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import { parsePluginRowFromDir, parseMarketplaceFromDisk, readPluginManifest, listSkills } from '../src/parser.js'

function write(root, path, value) {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
}

test('Codex short descriptions supplement card metadata without changing Claude parsing', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hub-short-description-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const claude = { name: 'dual', description: 'Full Claude instructions and features.', version: '2.0.0', skills: './claude-skills' }
  write(root, '.claude-plugin/plugin.json', claude)
  write(root, '.codex-plugin/plugin.json', { name: 'codex-name', version: '9.0.0', skills: './codex-skills', interface: { shortDescription: '  Short card copy  ' } })
  write(root, 'claude-skills/one/SKILL.md', '---\nname: one\ndescription: Claude skill\n---\nInstructions')
  write(root, 'codex-skills/two/SKILL.md', '---\nname: two\ndescription: Codex skill\n---\nInstructions')
  const before = readPluginManifest(root, false)
  const row = parsePluginRowFromDir(root, 'dual', 'source')
  assert.equal(row.shortDescription, 'Short card copy')
  assert.equal(row.description, claude.description)
  assert.equal(row.name, 'dual')
  assert.equal(row.version, '2.0.0')
  assert.deepEqual(readPluginManifest(root, false), before)
  assert.deepEqual(listSkills(root).map(skill => skill.name), ['one'])

  // The marketplace's own full copy stays intact as well.
  const market = join(root, 'market')
  write(market, '.claude-plugin/marketplace.json', { plugins: [{ name: 'dual', source: './plugins/dual', description: 'Full marketplace copy.' }] })
  write(market, 'plugins/dual/.claude-plugin/plugin.json', claude)
  write(market, 'plugins/dual/.codex-plugin/plugin.json', { interface: { shortDescription: 'Catalog card copy' } })
  const [catalogRow] = parseMarketplaceFromDisk('catalog', market)
  assert.equal(catalogRow.shortDescription, 'Catalog card copy')
  assert.equal(catalogRow.description, 'Full marketplace copy.')
})

test('Codex and portable metadata select their short description with the official overlay precedence', t => {
  const root = mkdtempSync(join(tmpdir(), 'hub-short-overlay-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  write(root, '.codex-plugin/plugin.json', { name: 'example', description: 'Original full copy', interface: { shortDescription: 'Overlay copy' } })
  assert.equal(parsePluginRowFromDir(root, 'example', 'source').shortDescription, 'Overlay copy')
  write(root, 'plugin.json', { name: 'example', description: 'Portable full copy', extensions: { 'com.openai': { interface: { shortDescription: 'Inline copy' } } } })
  let row = parsePluginRowFromDir(root, 'example', 'source')
  assert.equal(row.shortDescription, 'Inline copy')
  assert.equal(row.description, 'Portable full copy')
  write(root, 'plugin.json', { name: 'example', description: 'Portable full copy', extensions: { 'com.openai': {} } })
  row = parsePluginRowFromDir(root, 'example', 'source')
  assert.equal(row.shortDescription, undefined, 'an inline extension without short copy must not inherit the overlay')
})

test('absent, invalid, empty, and malformed optional Codex metadata leave the original copy available', t => {
  const root = mkdtempSync(join(tmpdir(), 'hub-short-fallback-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  write(root, '.claude-plugin/plugin.json', { name: 'example', description: 'Full copy' })
  const check = () => {
    const row = parsePluginRowFromDir(root, 'example', 'source')
    assert.equal(row.shortDescription, undefined)
    assert.equal(row.description, 'Full copy')
  }
  check()
  for (const shortDescription of ['', '   ', null, 42, {}, []]) {
    write(root, '.codex-plugin/plugin.json', { interface: { shortDescription } })
    check()
  }
  write(root, '.codex-plugin/plugin.json', '{bad json')
  check()
})

test('only the browse card uses short copy; the hover preview still renders the full description', () => {
  const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const context = {
    h: (type, props, ...children) => ({ type, props: props || {}, children }),
    PluginIcon: 'icon', SmartHoverPopover: 'popover', SmartMarkdown: 'markdown',
  }
  const start = client.indexOf('function PluginCard(')
  const end = client.indexOf('function SkillSwitch(', start)
  const previewStart = client.indexOf('function PluginPreviewPopover(')
  const previewEnd = client.indexOf('// ────────────────────────────── Clearable Input Helper', previewStart)
  vm.runInNewContext(client.slice(start, end) + client.slice(previewStart, previewEnd) + '\nglobalThis.card = PluginCard; globalThis.preview = PluginPreviewPopover;', context)
  const plugin = { name: 'example', description: 'Full copy', shortDescription: 'Short copy', author: 'Author' }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return
    if (predicate(node)) return node
    for (const child of node.children || []) { const found = find(child, predicate); if (found) return found }
  }
  const description = value => find(context.card({ plugin: value }), n => n.props.className === 'cpm-card-desc').children[0]
  assert.equal(description(plugin), 'Short copy')
  assert.equal(description({ ...plugin, shortDescription: undefined }), 'Full copy')
  assert.equal(description({ ...plugin, shortDescription: undefined, description: '' }), 'by Author')
  const preview = context.preview({ preview: { plugin, rect: {} } })
  assert.equal(find(preview, n => n.type === 'markdown').props.text, 'Full copy')
  assert.equal(plugin.description, 'Full copy')
})
