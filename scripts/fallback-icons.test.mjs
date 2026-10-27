import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as acorn from 'acorn'
import { createHash } from 'node:crypto'
import { getOrFetchIcon } from '../src/icons.js'

const source = fs.readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
const wanted = new Set(['FLUENT_3D_ICONS', 'FALLBACK_RULES', 'BADGE_CACHE', 'getPluginBadge', 'PluginIconFallback', 'PluginIcon'])
const pieces = new Map()
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration' && wanted.has(node.id.name)) pieces.set(node.id.name, source.slice(node.start, node.end))
  if (node.type === 'VariableDeclarator' && wanted.has(node.id?.name)) pieces.set(node.id.name, `const ${source.slice(node.start, node.end)};`)
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach(walk)
    else if (child && typeof child === 'object') walk(child)
  }
}
walk(ast)
const context = vm.createContext({ h: (type, props, ...children) => ({ type, props, children }),
  useMemo: fn => fn(), getPluginIconCandidates: p => p.icons?.light || [], PluginIconImage() {},
})
vm.runInContext([...wanted].map(name => pieces.get(name)).join('\n') + '\nglobalThis.badge = getPluginBadge; globalThis.render = PluginIconFallback; globalThis.icon = PluginIcon; globalThis.images = FLUENT_3D_ICONS; globalThis.cache = BADGE_CACHE;', context)

test('fallback icons follow skill names before incidental description keywords', () => {
  const cases = [
    ['first-principles', 'Pricing and products', 'compass-tool'],
    ['memo-api', 'Import and export memory records', 'stack'],
    ['resume-skill', 'Diagnose and fix a resume', 'identification-card'],
    ['salary-negotiation-skill', 'Repair gaps in your career', 'handshake'],
    ['qwen-image-prompt', 'Video and animation prompts', 'image-square'],
    ['humanizer-zh', 'Help people find their voice', 'pen-nib'],
    ['learn-eng', 'Speech and listening practice', 'translate'],
    ['brainstorming', 'Build a product', 'brain'],
    ['bq-skill', 'Find a job', 'chat-circle-dots'],
    ['frontend-slides', 'Animated motion graphics', 'presentation-chart'],
    ['to-tickets', 'Create project files', 'ticket'],
    ['to-spec', 'Write a planning document', 'blueprint'],
    ['triage', 'Issue management', 'kanban'],
  ]
  for (const [name, description, icon] of cases) assert.equal(context.badge({ name, description }).icon, icon, name)
  assert.equal(context.badge({ name: 'unclassified-item' }).icon, 'puzzle-piece')
})

test('original 3D PNGs remain decorative and fit both themes', () => {
  const light = context.render({ plugin: { name: 'research', sourceId: 'skills-local' }, isDark: false })
  const dark = context.render({ plugin: { name: 'research', sourceId: 'skills-local' }, isDark: true })
  assert.equal(light.props['aria-hidden'], true)
  assert.notEqual(light.props.style.background, dark.props.style.background)
  const image = light.children[0]
  assert.equal(image.type, 'img')
  assert.equal(image.props.width, 34)
  assert.equal(image.props.alt, '')
  assert.equal(image.props.loading, 'lazy')
  assert.match(new URL(image.props.src, 'http://localhost').searchParams.get('u'), /^https:\/\/raw\.githubusercontent\.com\/microsoft\/fluentui-emoji\/[^/]+\/assets\/.+\.png$/)
})

test('declared logos retain priority and the semantic cache includes descriptions', () => {
  const logo = '/universal-plugin-hub/api/skills/icon?id=custom'
  const icon = context.icon({ plugin: { name: 'research', icons: { light: [logo] } } })
  assert.deepEqual(Array.from(icon.props.candidates), [logo])
  assert.equal(context.badge({ name: 'unclassified', description: 'research' }).icon, 'microscope')
  assert.equal(context.badge({ name: 'unclassified', description: 'database' }).icon, 'database')
  for (let i = 0; i < 1100; i++) context.badge({ name: `unknown-${i}` })
  assert.equal(context.cache.size, 1024)
  assert.match(fs.readFileSync(new URL('../assets/licenses/fluent-emoji.txt', import.meta.url), 'utf8'), /MIT License[\s\S]*Microsoft Corporation/)
})

test('bundled originals match their source hashes and need no network', async () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../assets/fluent-3d/manifest.json', import.meta.url), 'utf8'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Bundled icons must not fetch the network') }
  try {
    for (const [name, item] of Object.entries(manifest.icons)) {
      const buffer = fs.readFileSync(new URL('../assets/fluent-3d/' + item.file, import.meta.url))
      assert.equal(createHash('sha256').update(buffer).digest('hex'), item.sha256)
      assert.equal(buffer.subarray(1, 4).toString(), 'PNG')
      assert.equal(buffer.readUInt32BE(16), 256)
      assert.equal(buffer.readUInt32BE(20), 256)
      assert.equal(new URL(context.images[name], 'http://localhost').searchParams.get('u'), item.url)
      const delivered = await getOrFetchIcon(item.url)
      assert.equal(delivered.contentType, 'image/png')
      assert.deepEqual(delivered.buffer, buffer)
    }
  } finally { globalThis.fetch = previousFetch }
})
