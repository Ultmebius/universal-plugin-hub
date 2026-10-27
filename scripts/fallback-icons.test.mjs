import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as acorn from 'acorn'

const source = fs.readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
const wanted = new Set(['PHOSPHOR_ICONS', 'FALLBACK_PALETTES', 'FALLBACK_RULES', 'BADGE_CACHE', 'getPluginBadge', 'PluginIconFallback', 'PluginIcon'])
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
vm.runInContext([...wanted].map(name => pieces.get(name)).join('\n') + '\nglobalThis.badge = getPluginBadge; globalThis.render = PluginIconFallback; globalThis.icon = PluginIcon; globalThis.paths = PHOSPHOR_ICONS; globalThis.cache = BADGE_CACHE;', context)

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

test('local duotone artwork supports both themes and stays decorative', () => {
  for (const [name, paths] of Object.entries(context.paths)) {
    assert.ok(paths.length >= 2, name)
    assert.ok(paths.some(([, opacity]) => opacity > 0 && opacity < 1), name)
  }
  const light = context.render({ plugin: { name: 'research', sourceId: 'skills-local' }, isDark: false })
  const dark = context.render({ plugin: { name: 'research', sourceId: 'skills-local' }, isDark: true })
  assert.equal(light.props['aria-hidden'], true)
  assert.notEqual(light.props.style.color, dark.props.style.color)
  const svg = light.children[0]
  assert.equal(svg.props.viewBox, '0 0 256 256')
  assert.equal(svg.props.width, 26)
  assert.equal(svg.props.focusable, false)
  assert.ok(svg.children[0].every(path => path.type === 'path'))
})

test('declared logos retain priority and the semantic cache includes descriptions', () => {
  const logo = '/universal-plugin-hub/api/skills/icon?id=custom'
  const icon = context.icon({ plugin: { name: 'research', icons: { light: [logo] } } })
  assert.deepEqual(Array.from(icon.props.candidates), [logo])
  assert.equal(context.badge({ name: 'unclassified', description: 'research' }).icon, 'microscope')
  assert.equal(context.badge({ name: 'unclassified', description: 'database' }).icon, 'database')
  for (let i = 0; i < 1100; i++) context.badge({ name: `unknown-${i}` })
  assert.equal(context.cache.size, 1024)
  assert.match(fs.readFileSync(new URL('../assets/licenses/phosphor-icons.txt', import.meta.url), 'utf8'), /MIT License[\s\S]*Phosphor Icons/)
})
