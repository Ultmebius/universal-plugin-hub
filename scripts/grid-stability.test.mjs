import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'acorn'

const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = parse(client, { ecmaVersion: 'latest' })

function findBrowseView(node) {
  if (node?.type === 'FunctionDeclaration' && node.id.name === 'BrowseView') return node
  for (const value of Object.values(node || {})) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object') {
        const found = findBrowseView(child)
        if (found) return found
      }
    }
  }
}

// Every JSX/`h()` call that renders the shared browse grid, keyed by the
// className expression it carries.
function gridElements(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'CallExpression' && node.callee?.name === 'h'
    && node.arguments?.[0]?.type === 'Literal' && node.arguments[0].value === 'div') {
    const props = node.arguments[1]
    if (props?.type === 'ObjectExpression') {
      const className = props.properties.find(p => p.key?.name === 'className')
      if (className && client.slice(className.value.start, className.value.end).startsWith('"cpm-grid"')) out.push(node)
    }
  }
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) gridElements(child, out)
  }
  return out
}

test('the browse list renders through a single grid element', () => {
  const grids = gridElements(findBrowseView(ast))
  // One element hosts both the plugin rows and the skill rows: swapping them
  // inside it keeps React from unmounting the scroll container and every card
  // on a source switch to or from Skills, which showed up as a flash.
  assert.equal(grids.length, 1)
})

test('skill and plugin rows get source-prefixed keys so they never collide', () => {
  assert.match(client, /key:\s*"skill:" \+ skill\.id/)
  assert.match(client, /key:\s*"plugin:" \+ p\.id/)
})

test('a list switch keeps the scroll container mounted', () => {
  // The skills branch must be an expression inside the shared grid, not a
  // sibling grid gated on `activeSourceId === "skills-local"`.
  assert.doesNotMatch(client, /isBrowse && activeSourceId === "skills-local" && !mcpsOpen/)
})

test('list rows reserve one control slot for either a pill or a switch', () => {
  const toggle = client.match(/\.cpm-card > \.cpm-toggle \{([\s\S]*?)\}/)
  const pill = client.match(/\.cpm-card-pill \{([\s\S]*?)\}/)
  assert.ok(toggle && pill)
  const width = rule => rule[1].match(/(?:^|\s)(?:min-)?width:\s*(\d+(?:\.\d+)?)px/)
  const height = rule => rule[1].match(/height:\s*(\d+(?:\.\d+)?)px/)
  // The switch in a row stands in for the manage/install pill, so both occupy
  // the same control slot; the pill's own height comes from padding + line box.
  assert.equal(height(toggle)[1], '25')
  assert.match(client, /\.cpm-card > \.cpm-toggle \{\s*width: 50px/)
  assert.match(pill[1], /padding: 3px 12px/)
})
