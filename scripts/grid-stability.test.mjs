import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'acorn'

const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = parse(client, { ecmaVersion: 'latest' })

function findFunction(node, name) {
  if (node?.type === 'FunctionDeclaration' && node.id?.name === name) return node
  for (const value of Object.values(node || {})) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object') {
        const found = findFunction(child, name)
        if (found) return found
      }
    }
  }
}

test('the browse list is one grid element that skills and plugins share', () => {
  const browse = findFunction(ast, 'BrowseView')
  assert.ok(browse)
  const grids = []
  ;(function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression' && node.callee?.name === 'h'
      && node.arguments?.[0]?.type === 'Literal' && node.arguments[0].value === 'div') {
      const props = node.arguments[1]
      if (props?.type === 'ObjectExpression') {
        const className = props.properties.find(p => p.key?.name === 'className')
        // Match the grid's class token however the expression is spelled, but
        // not its siblings: `cpm-grid-container` and `cpm-grid-installed` are
        // different surfaces, and a prefix test would conflate them.
        const source = className && client.slice(className.value.start, className.value.end)
        if (source && /(^|[^\w-])cpm-grid(?![-\w])/.test(source)) grids.push({ node, props })
      }
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) walk(child)
    }
  })(browse)
  // One element hosts both row sets. A second sibling grid meant React
  // unmounted the scroll container and every card on a switch to or from
  // Skills, which read as a flash.
  assert.equal(grids.length, 1)
  const [{ node, props }] = grids
  // It must be the scroll container the rest of the view drives.
  const ref = props.properties.find(p => p.key?.name === 'ref')
  assert.equal(ref?.value?.name, 'gridRef')
  const callbacks = props.properties.find(p => p.key?.name === 'onScroll')
  assert.equal(callbacks?.value?.name, 'onGridScroll')
  // And both row sets must be rendered inside it, chosen per source. The
  // gate sits in the `&&` chain before the h() call, so the slice has to start
  // ahead of the node to see it: an `activeSourceId !== "skills-local"` gate
  // would render zero skill rows while leaving every other assertion true.
  const body = client.slice(Math.max(0, node.start - 400), node.end)
  assert.match(body, /activeSourceId === "skills-local"/)
  assert.doesNotMatch(body, /activeSourceId !== "skills-local" && filter !== "installed"/)
  assert.match(body, /SkillSwitch/)
  assert.match(body, /onManage/)
  // Each branch is gated by that three-way test, not by a bare source check.
  assert.match(body, /activeSourceId === "skills-local"\s*\?/)
})

test('a skill row and a plugin row end in the same control slot', () => {
  // The switch stands in for the manage/install pill, so it must take the
  // pill's box rather than its own compact 40x22 one.
  const toggle = client.match(/\.cpm-card > \.cpm-toggle \{([\s\S]*?)\n\t?\}/)
  assert.ok(toggle, 'card-row switch sizing rule is missing')
  // Anchored per declaration: a bare /width: 50px/ also matches the sibling
  // `min-width` line, so shrinking the real width would slip through.
  assert.match(toggle[1], /(^|\n)\s*width: 50px;/)
  assert.match(toggle[1], /(^|\n)\s*flex: 0 0 50px;/)
  assert.match(toggle[1], /(^|\n)\s*height: 25px;/)
  // The pill's real height comes from its padding; 3px + 12px line box * 1.4
  // + 3px + borders lands on the switch's 25px.
  const pill = client.match(/\.cpm-card-pill \{([\s\S]*?)\n\}/)
  assert.match(pill[1], /padding: 3px 12px/)
  // Both are pinned to the same right edge, which is what puts every source's
  // description ellipsis on one column.
  // Both are pinned to the same right edge and the same width, which is what
  // puts every source's description ellipsis on one column. Right-aligning
  // alone still left a ~43px two-character pill narrower than the 50px switch.
  const trailing = client.match(/\.cpm-card > :last-child \{([\s\S]*?)\n\}/)
  assert.ok(trailing, 'trailing-control slot rule is missing')
  assert.match(trailing[1], /margin-left: auto/)
  assert.match(trailing[1], /min-width: 50px/)
  // The detail header keeps the compact knob; only the card row scales up.
  assert.match(client, /\.cpm-skill-identity > \.cpm-toggle/)
  // The bare rule (detail headers, MCP rows) must keep its compact width; only
  // the card-row override above widens it.
  const base = client.match(/(?:^|\n)\.cpm-toggle \{([\s\S]*?)\n\}/)
  assert.ok(base)
  assert.match(base[1], /width: 40px/)
  assert.match(base[1], /height: 22px/)
})

test('list surfaces reserve a symmetric scrollbar gutter', () => {
  // A one-sided gutter shifts the centered columns half a scrollbar left of
  // the top bar's 1000px baseline; reserving both edges keeps the axis.
  for (const selector of ['\\.cpm-grid, \\.cpm-grid-container', '\\.cpm-detail', '\\.cpm-manage']) {
    const rule = client.match(new RegExp(selector + ' \\{([\\s\\S]*?)\\n\\}'))
    assert.ok(rule, `${selector} rule is missing`)
    assert.match(rule[1], /scrollbar-gutter: stable both-edges/)
  }
})

test('a running scroll-to-top cannot outlive the source that started it', () => {
  // A source switch reuses the scroll container, so the animation's own
  // "container was detached" guard no longer fires; the restore has to cancel
  // it explicitly or it drags the new source to the old one's top.
  const restore = client.slice(client.indexOf('const appliedScrollTopRef = useRef(null);'))
  // The cancel must sit in the effect body, before the restore writes scrollTop.
  const body = restore.slice(restore.indexOf('useSafeLayoutEffect(() => {'), restore.indexOf('gridRef.current.scrollTop = target;'))
  assert.match(body, /stopScrollTopAnim\(\)/)
  assert.match(client, /function stopScrollTopAnim\(\)/)
})
