import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { parse } from 'acorn'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
let css
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'VariableDeclarator' && node.id.name === 'CSS') css = node.init.quasis.map(q => q.value.cooked).join('')
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) walk(child)
}
walk(parse(source, { ecmaVersion: 'latest' }))
const browser = process.env.UPH_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

test('bottom notification stays centered on an offset and resized plugin panel in a real browser', { skip: !existsSync(browser) }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-toast-position-'))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))
  const file = join(dir, 'position.html')
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}
    body { margin:0 } #host { width:1500px; padding-top:20px }
    #panel { margin-left:440px; width:900px; height:600px }
    .cpm-toast { animation:none }
  </style><div id="host"><div id="panel" class="cpm-root">
    <div class="cpm-toast"><div class="cpm-toast-content"><div class="cpm-toast-title">安装完成</div><div class="cpm-toast-body">插件已安装就绪。</div></div></div>
  </div></div><pre id="measurements"></pre><script>
    const panel = document.querySelector('#panel'), toast = document.querySelector('.cpm-toast');
    const results = [];
    function measure(label) {
      const p = panel.getBoundingClientRect(), n = toast.getBoundingClientRect();
      results.push({ label, centerError: Math.abs(n.left + n.width / 2 - p.left - p.width / 2),
        fits: n.left >= p.left && n.right <= p.right, bottom: p.bottom - n.bottom });
    }
    measure('offset panel');
    panel.style.width = '300px'; measure('narrow panel');
    document.querySelector('#host').style.transform = 'translate(17px, 12px) scale(.9)'; measure('transformed host');
    document.querySelector('#measurements').textContent = JSON.stringify(results);
  </script>`)
  const html = execFileSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${join(dir, 'profile')}`, '--window-size=1600,900', '--dump-dom', pathToFileURL(file).href],
  { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] })
  const rows = JSON.parse(html.match(/<pre id="measurements">([^<]+)<\/pre>/)[1])
  assert.equal(rows.length, 3)
  for (const row of rows) {
    assert.ok(row.centerError < 1, `${row.label}: center is displaced ${row.centerError}px`)
    assert.equal(row.fits, true, row.label)
    assert.ok(row.bottom > 20 && row.bottom < 30, row.label)
  }
})

test('installation notifications describe the installation result', () => {
  assert.doesNotMatch(source, /正在自动解析\s*MCP/)
})
