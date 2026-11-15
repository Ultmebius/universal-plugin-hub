import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { parse } from 'acorn'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const ast = parse(source, { ecmaVersion: 'latest' })
const browser = process.env.UPH_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

let css = ''
const fnSources = new Map()
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'VariableDeclarator' && node.id?.name === 'CSS' && node.init?.quasis) {
    css = node.init.quasis.map((q) => q.value.cooked).join('')
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name) {
    fnSources.set(node.id.name, source.slice(node.start, node.end))
  }
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) walk(child)
  }
}
walk(ast)

function h(type, props, ...children) {
  return { type, props: props || {}, children }
}

function loadDialogHelpers(overrides = {}) {
  const events = []
  const win = overrides.window || {
    addEventListener(type, fn, capture) { events.push({ op: 'add', type, fn, capture: !!capture }) },
    removeEventListener(type, fn, capture) { events.push({ op: 'remove', type, fn, capture: !!capture }) },
  }
  const cleanups = []
  const ctx = {
    h,
    useRef: (init) => ({ current: init }),
    useEffect: (fn) => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
    useSafeLayoutEffect: () => {},
    window: win,
    document: overrides.document || { documentElement: { clientWidth: 1280 }, defaultView: win },
    Number,
    Math,
    ...overrides,
  }
  const code = [
    fnSources.get('normalizePanelInset'),
    fnSources.get('computePanelHorizontalInsets'),
    fnSources.get('useDialogEscape'),
    fnSources.get('ConfirmDialogBox'),
    '({ normalizePanelInset, computePanelHorizontalInsets, useDialogEscape, ConfirmDialogBox })',
  ].join('\n\n')
  return { ...vm.runInNewContext(code, ctx), events, cleanups }
}

test('computePanelHorizontalInsets computes horizontal panel insets and guards degenerate rects', () => {
  const { computePanelHorizontalInsets } = loadDialogHelpers()
  const makeDoc = (clientWidth, innerWidth = clientWidth) => ({
    documentElement: { clientWidth },
    defaultView: { innerWidth },
  })
  const makeRoot = (rect) => ({ getBoundingClientRect: () => rect })

  const insetsOf = (...args) => {
    const res = computePanelHorizontalInsets(...args)
    return { left: res.left, right: res.right }
  }

  assert.deepEqual(insetsOf(null, makeDoc(1280)), { left: 0, right: 0 })
  assert.deepEqual(insetsOf({}, makeDoc(1280)), { left: 0, right: 0 })
  assert.deepEqual(insetsOf(makeRoot({ left: 280, right: 280, width: 0 }), makeDoc(1280)), { left: 0, right: 0 })
  assert.deepEqual(insetsOf(makeRoot({ left: 0, right: 1280, width: 1280 }), makeDoc(1280)), { left: 0, right: 0 })
  assert.deepEqual(insetsOf(makeRoot({ left: 280, right: 1280, width: 1000 }), makeDoc(1280)), { left: 280, right: 0 })
  assert.deepEqual(insetsOf(makeRoot({ left: 56, right: 1280, width: 1224 }), makeDoc(1280)), { left: 56, right: 0 })
  assert.deepEqual(insetsOf(makeRoot({ left: 280, right: 940, width: 660 }), makeDoc(1280)), { left: 280, right: 340 })
  assert.deepEqual(insetsOf(makeRoot({ left: 0.004, right: 1279.996, width: 1279.992 }), makeDoc(1280)), { left: 0, right: 0 })
  assert.deepEqual(insetsOf(makeRoot({ left: 260.25, right: 1279.75, width: 1019.5 }), makeDoc(1280)), { left: 260.25, right: 0.25 })
  assert.deepEqual(insetsOf(makeRoot({ left: 630, right: 650, width: 20 }), makeDoc(1280)), { left: 0, right: 0 })
})

test('useDialogEscape and ConfirmDialogBox enforce consistent Escape dismissal and accessible dialog markup', () => {
  const { useDialogEscape, ConfirmDialogBox, events, cleanups } = loadDialogHelpers()
  let dismissed = 0
  useDialogEscape(false, () => { dismissed++ })
  assert.equal(events.length, 0)

  useDialogEscape(true, () => { dismissed++ })
  assert.equal(events.length, 1)
  assert.equal(events[0].capture, false)
  events[0].fn({ key: 'Enter' })
  assert.equal(dismissed, 0)
  events[0].fn({ key: 'Escape' })
  assert.equal(dismissed, 1)

  let stopped = false
  let prevented = false
  useDialogEscape(true, () => { dismissed++ }, true)
  assert.equal(events[1].capture, true)
  events[1].fn({
    key: 'Escape',
    stopPropagation() { stopped = true },
    preventDefault() { prevented = true },
  })
  assert.equal(stopped, true)
  assert.equal(prevented, true)
  assert.equal(dismissed, 2)

  for (const fn of cleanups) fn()
  assert.equal(events.filter((e) => e.op === 'remove').length, 2)

  const tree = ConfirmDialogBox({
    titleId: 't-id',
    title: '卸载插件',
    description: '确认卸载吗？',
    confirmLabel: '卸载',
    confirmBusyLabel: '卸载中…',
    busy: true,
    cancelDisabled: true,
    onCancel: () => {},
    onConfirm: () => {},
  })
  assert.equal(tree.props.role, 'dialog')
  assert.equal(tree.props['aria-modal'], 'true')
  assert.equal(tree.props['aria-labelledby'], 't-id')
  assert.equal(tree.children[0].props.id, 't-id')
  const [cancelBtn, confirmBtn] = tree.children[2].children
  assert.equal(cancelBtn.props.disabled, true)
  assert.equal(confirmBtn.props.disabled, true)
  assert.equal(confirmBtn.children[0], '卸载中…')
})

test('all modal dialogs define accessible role/aria-modal and an accessible name', () => {
  let explicitDialogs = 0
  let confirmBoxes = 0
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression' && node.callee?.name === 'h') {
      const [tag, props] = node.arguments
      if (tag?.type === 'Identifier' && tag.name === 'ConfirmDialogBox') {
        confirmBoxes++
      } else if (props?.type === 'ObjectExpression') {
        const map = new Map()
        for (const prop of props.properties) {
          if (prop.type === 'Property') {
            const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value
            map.set(key, prop.value)
          }
        }
        const roleVal = map.get('role')
        if (roleVal?.type === 'Literal' && roleVal.value === 'dialog') {
          explicitDialogs++
          assert.equal(map.get('aria-modal')?.value, 'true', 'dialog must set aria-modal="true"')
          assert.ok(map.has('aria-labelledby') || map.has('aria-label'), 'dialog must set aria-labelledby or aria-label')
        }
      }
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) visit(child)
    }
  }
  visit(ast)
  assert.ok(confirmBoxes >= 4, `expected at least 4 ConfirmDialogBox usages, saw ${confirmBoxes}`)
  assert.ok(explicitDialogs >= 5, `expected at least 5 explicit role="dialog" nodes, saw ${explicitDialogs}`)
})

test('all modal dialogs center horizontally inside the plugin panel without shifting vertically in a real browser', { skip: !existsSync(browser) }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-dialog-position-'))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))
  const file = join(dir, 'dialog-position.html')
  const helperFns = [fnSources.get('normalizePanelInset'), fnSources.get('computePanelHorizontalInsets')].join('\n')

  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}
    html, body { margin: 0; padding: 0; height: 100%; }
    #frame { display: flex; width: 100vw; height: 100vh; }
    #sidebar { flex: 0 0 auto; width: 0px; height: 100%; }
    #center { flex: 1 1 auto; min-width: 0; height: 100%; display: flex; }
    #panel { flex: 1 1 auto; min-width: 0; height: 100%; }
    #rightbar { flex: 0 0 auto; width: 0px; height: 100%; }
    .cpm-dialog, .cpm-dialog-box, .cpm-mcp-modal { animation: none !important; transition: none !important; }
  </style>
  <div id="frame">
    <aside id="sidebar"></aside>
    <main id="center">
      <div id="panel" class="cpm-root">
        <div class="cpm-dialog" id="dlg">
          <div id="box" class="cpm-dialog-box">
            <div class="cpm-dialog-title">添加插件市场</div>
            <div style="height: 120px">body</div>
          </div>
        </div>
      </div>
    </main>
    <aside id="rightbar"></aside>
  </div>
  <pre id="measurements"></pre>
  <script>
    ${helperFns}
    const sidebar = document.getElementById('sidebar');
    const rightbar = document.getElementById('rightbar');
    const panel = document.getElementById('panel');
    const dlg = document.getElementById('dlg');
    const box = document.getElementById('box');
    const results = [];

    function syncInsets() {
      const { left, right } = computePanelHorizontalInsets(panel, document);
      panel.style.setProperty('--cpm-dialog-inset-left', left + 'px');
      panel.style.setProperty('--cpm-dialog-inset-right', right + 'px');
      void box.offsetWidth;
      return { left, right };
    }

    function measure(label, cls, sidebarWidth, rightbarWidth, bodyHeight = 120) {
      sidebar.style.width = sidebarWidth + 'px';
      rightbar.style.width = rightbarWidth + 'px';
      box.className = cls;
      box.querySelector('div:last-child').style.height = bodyHeight + 'px';
      const insets = syncInsets();
      const p = panel.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const s = dlg.getBoundingClientRect();
      results.push({
        label,
        cls,
        insets,
        panelCenterX: p.left + p.width / 2,
        panelWidth: p.width,
        boxCenterX: b.left + b.width / 2,
        boxCenterY: b.top + b.height / 2,
        boxWidth: b.width,
        boxTop: b.top,
        fitsPanelX: b.left >= p.left + 15.5 && b.right <= p.right - 15.5,
        scrimFullViewport: s.left === 0 && s.top === 0 && Math.abs(s.width - window.innerWidth) < 1 && Math.abs(s.height - window.innerHeight) < 1,
        scrollable: dlg.scrollHeight > dlg.clientHeight,
      });
    }

    for (const cls of ['cpm-dialog-box', 'cpm-dialog-box cpm-source-dialog-box', 'cpm-mcp-modal']) {
      measure('baseline', cls, 0, 0);
      measure('sidebar-280', cls, 280, 0);
      measure('sidebar-280-rightbar-340', cls, 280, 340);
    }
    measure('narrow-mcp', 'cpm-mcp-modal', 320, 680);
    measure('tall-overflow', 'cpm-mcp-modal', 280, 0, 1400);

    document.getElementById('measurements').textContent = JSON.stringify(results);
  </script>`)

  const html = execFileSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${join(dir, 'profile')}`, '--window-size=1400,900', '--dump-dom', pathToFileURL(file).href,
  ], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] })

  const rows = JSON.parse(html.match(/<pre id="measurements">([^<]+)<\/pre>/)[1])
  const byKey = new Map(rows.map((r) => [`${r.cls}::${r.label}`, r]))

  for (const cls of ['cpm-dialog-box', 'cpm-dialog-box cpm-source-dialog-box', 'cpm-mcp-modal']) {
    const base = byKey.get(`${cls}::baseline`)
    for (const mode of ['sidebar-280', 'sidebar-280-rightbar-340']) {
      const cur = byKey.get(`${cls}::${mode}`)
      assert.ok(cur, `missing measurement for ${cls}::${mode}`)
      assert.ok(Math.abs(cur.boxCenterX - cur.panelCenterX) < 1, `${cls} (${mode}) off panel X center by ${Math.abs(cur.boxCenterX - cur.panelCenterX)}px`)
      assert.ok(Math.abs(cur.boxCenterY - base.boxCenterY) < 1, `${cls} (${mode}) shifted vertically by ${Math.abs(cur.boxCenterY - base.boxCenterY)}px`)
      assert.equal(cur.fitsPanelX, true, `${cls} (${mode}) overflows plugin panel`)
      assert.equal(cur.scrimFullViewport, true, `${cls} (${mode}) scrim does not cover full viewport`)
    }
  }

  const narrowMcp = rows.find((r) => r.label === 'narrow-mcp')
  assert.ok(narrowMcp.panelWidth <= 401 && narrowMcp.boxWidth <= 369, `narrow panel MCP should clamp inside 400px panel, got boxWidth=${narrowMcp.boxWidth}`)
  assert.ok(Math.abs(narrowMcp.boxCenterX - narrowMcp.panelCenterX) < 1)
  assert.equal(narrowMcp.fitsPanelX, true)

  const tall = rows.find((r) => r.label === 'tall-overflow')
  assert.equal(tall.scrollable, true, 'tall modal must make .cpm-dialog scrollable')
  assert.ok(tall.boxTop >= 15.5, `safe center must keep top >= 16px so close button is never clipped, got ${tall.boxTop}`)
})
