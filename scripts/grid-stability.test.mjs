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

test('every switch in the plugin draws the same control', () => {
  // One geometry for the whole plugin: every toggle is `.cpm-toggle`, and the
  // base rule owns track, knob and inset as custom properties so a variant can
  // restate the ratios without restating the look.
  assert.match(client, /\.cpm-skill-identity > \.cpm-toggle/)
  const base = client.match(/(?:^|\n)\.cpm-toggle \{([\s\S]*?)\n\}/)
  assert.ok(base)
  assert.match(base[1], /--sw-w: 40px;/)
  assert.match(base[1], /--sw-h: 22px;/)
  // The mockup's ratio, not round numbers: the knob is 70% of the track and
  // the inset is whatever is left, split evenly.
  assert.match(base[1], /--sw-knob: calc\(var\(--sw-h\) \* 0\.7\);/)
  assert.match(base[1], /--sw-inset: calc\(\(var\(--sw-h\) - var\(--sw-knob\)\) \/ 2\);/)
  assert.match(base[1], /border-radius: 9999px;/)
  // Off and on are the mockup's two states: a faint wash under a hairline,
  // and the solid blue. The hairline is an inset shadow — a border would push
  // the box, and an outline renders worse corners than a shadow.
  assert.match(base[1], /background: var\(--cpm-toggle-off\);/)
  assert.match(base[1], /box-shadow: inset 0 0 0 1px var\(--cpm-toggle-off-border\);/)
  assert.match(base[1], /border: none;/)
  assert.doesNotMatch(base[1], /outline:/)
  assert.match(client, /\.cpm-toggle\.on \{[^}]*background: var\(--cpm-toggle-on\);[^}]*box-shadow: inset 0 0 0 1px var\(--cpm-toggle-on-border\);/s)
  // The pill's real height comes from its padding; 3px + 12px line box * 1.4
  // + 3px + borders is what the row switch restates.
  const pill = client.match(/\.cpm-card-pill \{([\s\S]*?)\n\}/)
  assert.match(pill[1], /padding: 3px 12px/)
})

test('the knob moves on a spring, not a cubic-bezier', () => {
  // A cubic-bezier is structurally monotonic: it overshoots at most once and
  // cannot settle, which is what made the knob read as "jumping out". The
  // spring is a damped oscillator sampled into linear(), and linear() is
  // Baseline since Dec 2023, so no fallback wrapper is needed for the move
  // itself — only for users who ask for less motion.
  assert.match(client, /--cpm-spring: linear\(0 0%,/)
  assert.match(client, /1\.0835 35\.3%/, 'the spring curve should still overshoot')
  const knob = client.match(/(?:^|\n)\.cpm-toggle::after \{([\s\S]*?)\n\}/)
  assert.ok(knob, 'base knob rule is missing')
  // Animate translate, not left: left would re-lay-out every frame.
  assert.match(knob[1], /transition-property: translate;/)
  assert.match(knob[1], /transition-timing-function: var\(--cpm-spring\);/)
  assert.doesNotMatch(knob[1], /transition: left/)
  // The silhouette is border-radius, NOT clip-path: clip-path clips the
  // element's own box-shadow, which silently deleted the lift under the knob
  // that the mockup depends on.
  assert.match(knob[1], /border-radius: 50%;/)
  assert.doesNotMatch(knob[1], /clip-path/)
  assert.match(knob[1], /box-shadow: var\(--cpm-toggle-knob-shadow\);/)
  // Travel is pixels against --sw-w, never a percentage: a percentage in
  // translate resolves against the knob's own width, not the track, which
  // threw the knob out of the switch entirely.
  assert.match(client, /\.cpm-toggle\.on::after \{[^}]*translate: calc\(var\(--sw-w\) - var\(--sw-knob\) - var\(--sw-inset\) \* 2\) 0;/)
  assert.doesNotMatch(client, /\.cpm-toggle\.on::after \{[^}]*translate: calc\(100%/)
  assert.match(knob[1], /width: var\(--sw-knob\);/)
  assert.match(knob[1], /height: var\(--sw-knob\);/)
  // Reduced motion gets the state without the bounce.
  const reduced = client.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)
  assert.ok(reduced, 'reduced-motion block is missing')
  assert.match(reduced[1], /\.cpm-toggle, \.cpm-toggle::after/)
})

test('the search box spans exactly the grid columns', () => {
  // Both the search row and the list are pinned to the same static 1000px
  // baseline. A measured span replaced it for a while and reintroduced exactly
  // what the baseline avoids: the bar resizing itself between sources.
  const topbar = client.match(/\.cpm-topbar \{([\s\S]*?)\n\}/)
  assert.ok(topbar, 'top bar rule is missing')
  assert.match(topbar[1], /box-sizing: border-box/)
  assert.match(topbar[1], /padding: 14px 24px 10px 24px;/)
  assert.doesNotMatch(topbar[1], /padding: 14px 39px/)
  const row1 = client.match(/\.cpm-topbar-row1 \{([\s\S]*?)\n\}/)
  assert.ok(row1, 'search row rule is missing')
  assert.match(row1[1], /max-width: var\(--cpm-grid-width\);/)
  assert.doesNotMatch(client, /--cpm-column-span/)
  assert.doesNotMatch(client, /GRID_COLUMNS_MAX/)
})

test('the two list columns are equal halves of one 1000px baseline', () => {
  // The baseline is one width, one gutter, and a column that is the rest split
  // in two. Restating 476px in each grid let the gutter change shrink only the
  // cards on one side; deriving the column from the pair makes both columns
  // move together by construction.
  const width = client.match(/--cpm-grid-width: (\d+)px;/)
  const gap = client.match(/--cpm-grid-gap: (\d+)px;/)
  assert.ok(width, 'grid width baseline is missing')
  assert.ok(gap, 'grid gutter baseline is missing')
  assert.match(client, /--cpm-grid-col: calc\(\(var\(--cpm-grid-width\) - var\(--cpm-grid-gap\)\) \/ 2\);/)
  assert.equal(Number(width[1]), 1000)
  // Both columns plus the gutter still total the baseline exactly.
  const column = (Number(width[1]) - Number(gap[1])) / 2
  assert.match(client, new RegExp(`--cpm-grid-gap: ${gap[1]}px;`))
  assert.equal(column * 2 + Number(gap[1]), 1000)
  // Every list surface reads those tokens; none may keep a literal track.
  for (const selector of ['\\.cpm-grid', '\\.cpm-grid-installed']) {
    const rule = client.match(new RegExp('(?:^|\\n)' + selector + ' \\{([\\s\\S]*?)\\n\\}'))
    assert.ok(rule, `${selector} rule is missing`)
    assert.match(rule[1], /grid-template-columns: repeat\(2, minmax\(0, var\(--cpm-grid-col\)\)\);/)
    assert.match(rule[1], /gap: 10px var\(--cpm-grid-gap\);/)
  }
  // A leftover hard-coded track would silently win over the token.
  assert.doesNotMatch(client, /minmax\(0, \d+px\)/)
  // The installed groups, the two single-column pages and the rule under the
  // top bar all follow the same baseline instead of restating 1000/1010.
  assert.match(client, /\.cpm-installed-group \{[\s\S]*?max-width: var\(--cpm-grid-width\);/)
  // The rule overhangs the span by exactly the 10px it always did.
  assert.match(client, /--cpm-grid-width: 1000px;/)
  assert.match(client, /\.cpm-topbar::after \{[\s\S]*?max-width: calc\(var\(--cpm-grid-width\) \+ 10px\);/)
  for (const selector of ['\\.cpm-detail > \\*', '\\.cpm-manage > \\*']) {
    const rule = client.match(new RegExp('(?:^|\\n)' + selector + ' \\{([\\s\\S]*?)\\n\\}'))
    assert.ok(rule, `${selector} rule is missing`)
    assert.match(rule[1], /max-width: var\(--cpm-grid-width\);/)
  }
  assert.match(client, /\.cpm-topbar-row2 \{[\s\S]*?max-width: var\(--cpm-grid-width\);/)
})


test('a focused text field draws one ring, not two', () => {
  // The focus state used to stack three blue layers on the same field: the
  // accent border, a soft halo, and — because the upload dialog added its own
  // :focus-visible outline — a second wider loop a few pixels out. Read as a
  // double donut. One field, one ring.
  const input = client.match(/(?:^|\n)\.cpm-input:focus \{([\s\S]*?)\n\}/)
  assert.ok(input, 'input focus rule is missing')
  assert.match(input[1], /border-color: var\(--cpm-accent\);/)
  assert.match(input[1], /outline: none;/)
  assert.match(input[1], /box-shadow: 0 0 0 3px rgba\(/)
  // The halo is translucent, so it reads as one soft edge instead of a
  // second solid blue line.
  assert.doesNotMatch(input[1], /box-shadow: 0 0 0 3px var\(--cpm-accent\)/)
  assert.match(client, /\.cpm-dark \.cpm-input:focus \{[\s\S]*?outline: none;/)
  // The upload dialog may outline the borderless dropzone, never the field.
  const dialog = client.match(/\.cpm-upload-dialog \.cpm-dropzone:focus-visible \{([\s\S]*?)\n\t\}/)
  assert.ok(dialog, 'dropzone focus ring is missing')
  assert.doesNotMatch(client, /\.cpm-upload-dialog :is\([^)]*\.cpm-input[^)]*\):focus-visible/)
  // A box-shadow focus treatment must also clear the default outline, or the
  // system ring comes back on top of it.
  for (const rule of ['\\.cpm-source-custom-input:focus', '\\.cpm-mcp-input:focus']) {
    const found = client.match(new RegExp('(?:^|\\n)' + rule + ' \\{([\\s\\S]*?)\\n\\}'))
    assert.ok(found, `${rule} is missing`)
    assert.match(found[1], /box-shadow: 0 0 0 \dpx rgba\(/)
  }
  const custom = client.match(/(?:^|\n)\.cpm-source-custom-input:focus \{([\s\S]*?)\n\}/)
  assert.match(custom[1], /outline: none;/)
})

test('the skill header keeps one size step between title and body', () => {
  // The detail page is a reading surface: the icon and title set the scale, and
  // every step below them stays in fixed relation, so shrinking the lockup
  // cannot leave a 32px title over 12px prose. The title's ceiling stays under
  // the old 2rem hero size and above the body by at least 1.5x.
  const icon = client.match(/\.cpm-skill-identity > \.cpm-card-icon \{([\s\S]*?)\n\}/)
  assert.ok(icon, 'detail icon rule is missing')
  assert.match(icon[1], /width: 2\.75rem;/)
  assert.match(icon[1], /height: 2\.75rem;/)
  const title = client.match(/(?:^|\n)\.cpm-skill-title \{([\s\S]*?)\n\}/)
  assert.ok(title, 'skill title rule is missing')
  const clamp = title[1].match(/font-size: clamp\(([\d.]+)rem, [^,]+ \+ ([\d.]+)vw, ([\d.]+)rem\);/)
  assert.ok(clamp, 'title size should stay a clamped fluid scale')
  const [, min, , max] = clamp.map(Number)
  assert.ok(max < 2, 'the title must be smaller than the old 2rem ceiling')
  assert.ok(max / min <= 1.3, 'title min and max should sit in one optical size')
  const body = client.match(/\.cpm-root \.cpm-skill-content > div \{([\s\S]*?)\n\}/)
  assert.ok(body, 'content body rule is missing')
  const bodySize = Number(body[1].match(/font-size: ([\d.]+)rem;/)[1])
  assert.ok(max / bodySize >= 1.5, 'title should stay clearly above the body size')
  // Every heading in the body stays between the body size and the page title.
  for (const [tag, size] of [['h1', 1.375], ['h2', 1.125], ['h3', 1]]) {
    const rule = client.match(new RegExp(`\\.cpm-root \\.cpm-skill-content ${tag} \\{ font-size: ([\\d.]+)rem; \\}`))
    assert.ok(rule, `${tag} rule is missing`)
    assert.equal(Number(rule[1]), size)
    assert.ok(Number(rule[1]) <= max && Number(rule[1]) >= bodySize)
  }
  // The class the host renders, so the icon rule actually reaches the header.
  assert.match(client, /className: "cpm-skill-identity"[^\n]*PluginIcon/)
})

test('the top bar leaves no scrollbar reserve of its own', () => {
  // The bar is not a scroll container. A hand-reserved 15px per side made its
  // content narrower than the columns below it on every panel narrower than
  // the 1000px cap, so the two edges disagreed while switching sources.
  const topbar = client.match(/\.cpm-topbar \{([\s\S]*?)\n\}/)
  assert.ok(topbar, 'top bar rule is missing')
  const declared = topbar[1].match(/(?:^|\n)\s*padding:\s*([^;]+);/)
  assert.ok(declared)
  assert.equal(declared[1].trim(), '14px 24px 10px 24px')
})

test('a skills row and a plugin row end in one identical control slot', () => {
  // The switch stands in for the manage/install pill in the same column, so it
  // copies that pill's box rather than approximating it: the same 12px font in
  // a 1.4 line box, 3px padding and border for the height, and the pill's own
  // 24.33px of text plus 2em of side padding for the width. Measured, the pill
  // is 50x24.125 and the switch 48.32x24.125 — a fixed 50px track was wider
  // than the button it stood in for.
  const slot = client.match(/\.cpm-card > :last-child \{([\s\S]*?)\n\}/)
  assert.ok(slot, 'trailing-control slot rule is missing')
  assert.match(slot[1], /min-width: 50px;/)
  const rowSwitch = client.match(/\.cpm-card > \.cpm-toggle \{([\s\S]*?)\n\}/)
  assert.ok(rowSwitch, 'card-row switch rule is missing')
  // Fixed pixels, not em/calc: deriving the switch from the font made it a
  // different size on every surface the host rendered at a different size.
  assert.match(rowSwitch[1], /--sw-w: 48px;/)
  assert.match(rowSwitch[1], /--sw-h: 24px;/)
  // The knob and inset come from the base rule's ratios, so the row cannot
  // drift out of proportion on its own.
  assert.doesNotMatch(rowSwitch[1], /--sw-knob:/)
  assert.doesNotMatch(rowSwitch[1], /--sw-inset:/)
  assert.match(rowSwitch[1], /width: var\(--sw-w\);/)
  assert.match(rowSwitch[1], /height: var\(--sw-h\);/)
  assert.doesNotMatch(rowSwitch[1], /calc\(/)
  assert.doesNotMatch(rowSwitch[1], /em\)/)
  // It inherits the base rule's fill and border, so no variant may repaint it
  // with the solid muted grey it used to carry.
  assert.doesNotMatch(rowSwitch[1], /background: var\(--cpm-muted\)/)
  // One knob rule for the whole plugin. A row-specific ::after used to restate
  // the box with its own inset math; it drifted out of vertical centre the
  // moment the track's box model changed, so the base rule owns it outright.
  assert.doesNotMatch(client, /\.cpm-card > \.cpm-toggle::after/)
  const knob = client.match(/(?:^|\n)\.cpm-toggle::after \{([\s\S]*?)\n\}/)
  assert.ok(knob, 'base knob rule is missing')
  assert.match(knob[1], /width: var\(--sw-knob\);/)
  assert.match(knob[1], /height: var\(--sw-knob\);/)
  assert.doesNotMatch(knob[1], /aspect-ratio/)
  // Vertically centred by the track's axis, not by an inset guess: the old
  // top-(inset - 1px) sat 1px low as soon as the track changed box model.
  assert.match(knob[1], /top: calc\(50% - var\(--sw-knob\) \/ 2\);/)
  assert.doesNotMatch(knob[1], /margin-top/)
  // The pill's own box is what the switch is copying, so it must stay put.
  const pill = client.match(/\.cpm-card-pill \{([\s\S]*?)\n\}/)
  assert.match(pill[1], /padding: 3px 12px;/, 'the switch copies the pill\'s padding')
  assert.match(pill[1], /line-height: 1\.4;/)
  // 12px a side is what the switch's +2em term stands for.
  assert.match(pill[1], /font-size: 12px;/)
})

test('the off-state switch is as quiet as the pill beside it', () => {
  // The rows' switch used to paint the muted grey, a solid light bar that read
  // heavier — and therefore longer — than a button made of a hairline border.
  // Both themes now use a faint wash plus a border, and the knob carries the
  // only solid fill.
  for (const block of ['--cpm-toggle-off: rgba(0, 0, 0, 0.06);', '--cpm-toggle-off: rgba(255, 255, 255, 0.08);']) {
    assert.ok(client.includes(block), `missing off-state token: ${block}`)
  }
  assert.match(client, /--cpm-toggle-off-border: rgba\(0, 0, 0, 0\.14\);/)
  assert.match(client, /--cpm-toggle-off-border: rgba\(255, 255, 255, 0\.16\);/)
  // The knob is the only filled part, so it needs separation from the wash.
  const base = client.match(/(?:^|\n)\.cpm-toggle \{([\s\S]*?)\n\}/)
  assert.ok(base)
  assert.match(client, /--cpm-toggle-knob: #f4f4f5;/)
  // Two stops: a tight contact shadow plus a soft one, so the knob reads as
  // lifted off the track rather than pasted onto it.
  assert.match(client, /--cpm-toggle-knob-shadow: 0 1px 4px rgba\(0, 0, 0, 0\.45\), 0 1px 1px rgba\(0, 0, 0, 0\.35\);/)
})

test('the first card sits tight under the top bar rule', () => {
  // A full 16px inset left the list floating well clear of the rule above it.
  const grid = client.match(/\.cpm-grid, \.cpm-grid-container \{([\s\S]*?)\n\}/)
  assert.ok(grid, 'list surface rule is missing')
  assert.match(grid[1], /padding: 10px 24px 28px 24px;/)
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

test('the CSS template stays a single string literal', () => {
  // The stylesheet is a JS template literal, so one stray backtick inside a
  // comment ends it early and the rest of the CSS is parsed as JavaScript.
  // That failure mode is invisible to the CSS assertions above — which slice
  // out the block by hand — and only surfaces as a blank panel in the host.
  const start = client.indexOf('const CSS = `')
  assert.ok(start >= 0, 'CSS template is missing')
  const body = client.slice(start + 'const CSS = `'.length)
  const close = body.indexOf('\n`;')
  assert.ok(close >= 0, 'CSS template is never closed')
  const stylesheet = body.slice(0, close)
  const stray = stylesheet.split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => line.includes('`'))
  assert.deepEqual(stray, [], 'backtick(s) inside the CSS template end it early')
  // And the whole file must still parse as one script.
  assert.doesNotThrow(() => parse(client, { ecmaVersion: 'latest' }))
})
