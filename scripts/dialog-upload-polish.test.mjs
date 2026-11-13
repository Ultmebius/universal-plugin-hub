import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'

const client = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

function extractCss() {
  const start = client.indexOf('const ICON_SHAPE_CSS = `')
  const end = client.indexOf('function ensureCss()', start)
  assert.ok(start >= 0 && end > start, 'CSS definition must exist')
  return vm.runInNewContext(client.slice(start, end) + '\nCSS')
}

function mountUploadDialog({
  busyInspect = false,
  onCancel = () => {},
  onAdded = () => {},
  onBusyChange = null,
  toasts = [],
  mockXhr = false,
  apiImpl = null,
} = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const start = client.indexOf('\tfunction AddSourceDialog(')
  const end = client.indexOf('function AddMcpDialog(', start)
  let resolveInspect = null
  const apiCalls = []
  const xhrRequests = []
  const keyListeners = { capture: [], bubble: [] }
  const windowListeners = new Map()
  const mockWindow = {
    addEventListener(type, fn, capture) {
      if (type !== 'keydown') {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set())
        windowListeners.get(type).add(fn)
        return
      }
      const bucket = capture ? keyListeners.capture : keyListeners.bubble
      bucket.push(fn)
    },
    removeEventListener(type, fn, capture) {
      if (type !== 'keydown') {
        windowListeners.get(type)?.delete(fn)
        return
      }
      const bucket = capture ? keyListeners.capture : keyListeners.bubble
      const idx = bucket.indexOf(fn)
      if (idx >= 0) bucket.splice(idx, 1)
    },
    dispatchWindowEvent(type) {
      for (const fn of [...(windowListeners.get(type) || [])]) fn({ type })
    },
    dispatchEscape() {
      let stopped = false
      let defaultPrevented = false
      const ev = {
        key: 'Escape',
        preventDefault() { defaultPrevented = true },
        stopPropagation() { stopped = true },
      }
      for (const fn of [...keyListeners.capture]) {
        fn(ev)
      }
      if (!stopped) {
        for (const fn of [...keyListeners.bubble]) fn(ev)
      }
      return { stopped, defaultPrevented }
    },
  }
  class FakeXMLHttpRequest {
    constructor() {
      this.headers = {}
      this.upload = {}
      this.timeout = -1
      this.status = 200
      this.responseText = ''
      xhrRequests.push(this)
    }
    open(method, url, async) {
      this.method = method
      this.url = url
      this.async = async
    }
    setRequestHeader(k, v) {
      this.headers[k] = v
    }
    send(body) {
      this.sentBody = body
      if (!busyInspect) {
        this.status = 200
        this.responseText = JSON.stringify({
          ok: true,
          uploadId: 'staged-default',
          kind: 'skills',
          plugin: { name: 'demo', displayName: 'Demo' },
          plugins: [{ name: 'demo', displayName: 'Demo' }],
        })
        queueMicrotask(() => this.onload && this.onload())
      }
    }
    abort() {
      this.aborted = true
      this.onabort && this.onabort()
    }
  }
  const context = {
    ...React,
    h: React.createElement,
    window: mockWindow,
    backdropDismissProps: () => ({}),
    ClearBtn: () => null,
    UploadDropIcon: () => React.createElement('svg', { className: 'test-upload-icon' }),
    PluginIcon: () => null,
    Promise,
    cleanError: (e) => String(e?.message || e || ''),
    XMLHttpRequest: mockXhr ? FakeXMLHttpRequest : undefined,
    FileReader: class {
      readAsDataURL() { queueMicrotask(() => { this.result = 'data:;base64,AA=='; this.onload() }) }
    },
    api: (path, options) => {
      const body = options?.body ? JSON.parse(options.body) : null
      apiCalls.push({ path, options, body })
      if (typeof apiImpl === 'function') return apiImpl(path, options, body)
      if (path === '/state') return Promise.resolve({ localTabName: '' })
      if (path === '/plugins/local/inspect' && busyInspect) {
        return new Promise((r) => { resolveInspect = r })
      }
      if (path === '/plugins/local/upload-cancel') return Promise.resolve({ ok: true })
      if (path === '/plugins/local/import') {
        return Promise.resolve({ kind: 'plugin', plugin: { name: 'demo', displayName: 'Demo' } })
      }
      if (path === '/skills/import') {
        return Promise.resolve({ kind: 'skills', skills: [{ name: 'demo' }] })
      }
      return Promise.resolve({ ok: true, kind: 'skills', plugins: [{ name: 'demo', displayName: 'Demo' }] })
    },
  }
  vm.runInNewContext(client.slice(start, end) + '\nglobalThis.Dialog = AddSourceDialog;', context)
  let view
  act(() => {
    view = create(React.createElement(context.Dialog, {
      onCancel,
      onAdded,
      onBusyChange,
      showToast: (t, b) => toasts.push({ t, b }),
      initialPhase: 'upload',
    }))
  })
  return {
    view,
    apiCalls,
    xhrRequests,
    mockWindow,
    resolveInspect: (val) => resolveInspect && resolveInspect(val),
    unmount: () => act(() => view.unmount()),
  }
}

function textContent(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  return (node.children || []).map(textContent).join('')
}

test('upload dialog CSS eliminates inherited bottom footer padding void and unifies surface depth', () => {
  const css = extractCss()

  // Root cause: .cpm-source-dialog-box > .cpm-dialog-actions adds padding-bottom: 20px and negative margin-bottom
  // for sticky scrolling in multi-step forms; upload dialog must completely reset padding/position/margin so
  // footer spacing does not double-stack onto the modal container bottom padding.
  const uploadActions = css.match(/\.cpm-source-dialog-box\.cpm-upload-dialog\s*>\s*\.cpm-dialog-actions\s*\{([^}]+)\}/)
  assert.ok(uploadActions, 'explicit reset rule for upload dialog footer actions must exist')
  assert.match(uploadActions[1], /position:\s*static/)
  assert.match(uploadActions[1], /padding:\s*0/)
  assert.match(uploadActions[1], /margin:\s*0/)
  assert.match(uploadActions[1], /background:\s*transparent/)

  // Backdrop scroll containment & dark-mode parity
  const overlay = css.match(/(?:^|\n)\.cpm-dialog\s*\{([^}]+)\}/)
  assert.ok(overlay)
  assert.match(overlay[1], /overscroll-behavior:\s*contain/)
  assert.match(css, /\.cpm-dark\s+\.cpm-dialog\s*\{[^}]*background:/)

  // Dark dialog box & sticky actions share one unified surface color (#222226) with specular top border
  const darkSource = css.match(/\.cpm-dark\s+\.cpm-source-dialog-box\s*\{([^}]+)\}/)
  const darkActions = css.match(/\.cpm-dark\s+\.cpm-source-dialog-box\s*>\s*\.cpm-dialog-actions\s*\{([^}]+)\}/)
  assert.ok(darkSource && darkActions)
  assert.match(darkSource[1], /background:\s*#222226/)
  assert.match(darkActions[1], /background:\s*#222226/)
  assert.match(darkSource[1], /inset 0 1px 0/)

  // Bare upload tray-arrow icon without a card container around it + format chips + nested radius + tactile press response
  assert.match(css, /\.cpm-upload-dialog\s+\.cpm-dropzone\s*\{[^}]*corner-shape:\s*var\(--cpm-icon-corner-shape\)/)
  assert.doesNotMatch(css, /\.cpm-upload-dialog\s+\.cpm-dropzone-icon\s*\{[^}]*(width:\s*44px|border-radius:|background:)/)
  assert.match(css, /\.cpm-upload-dialog\s+\.cpm-dropzone:not\(:disabled\):active\s*\{[^}]*transform:\s*scale\(/)
  assert.match(css, /\.cpm-dropzone-formats\s*\{/)
  assert.match(css, /\.cpm-dropzone-format\s*\{/)
})

test('buttons avoid fixed clipping heights and expose focus-visible indicators', () => {
  const css = extractCss()
  const btn = css.match(/(?:^|\n)\.cpm-btn\s*\{([^}]+)\}/)
  assert.ok(btn, '.cpm-btn rule must exist')
  assert.match(btn[1], /min-block-size:\s*32px/)
  assert.doesNotMatch(btn[1], /(?:^|\s)height:\s*32px/)
  assert.match(css, /\.cpm-btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--cpm-accent\)/)
  assert.match(css, /\.cpm-btn:not\(:disabled\):active\s*\{[^}]*transform:\s*scale\(/)
})

test('accessibility media queries guard motion, transparency, contrast, and forced colors for dialogs', () => {
  const css = extractCss()
  assert.match(css, /@keyframes cpm-dialog-fade\s*\{/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*cpm-dialog-fade/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cpm-upload-progress:indeterminate::-webkit-progress-bar\s*\{\s*animation-duration:\s*10s;?\s*\}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cpm-upload-progress:indeterminate::-moz-progress-bar\s*\{\s*animation-duration:\s*10s;?\s*\}/)
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)[\s\S]*\.cpm-dialog\s*\{[^}]*backdrop-filter:\s*none/)
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.cpm-upload-dialog\s+\.cpm-dropzone\s*\{/)
  // Modern Web Guidance: never group -webkit- and -moz- pseudo-elements in one rule
  assert.doesNotMatch(css, /::-webkit-progress-[^}]*::-moz-progress-/)
  assert.doesNotMatch(css, /\.cpm-dropzone-limit\s*\{/)
  assert.doesNotMatch(css, /\.cpm-oversize-dialog/)
})

test('AddSourceDialog hides limit text by default, locks dismissal during upload, and shows determinate then indeterminate progress', async () => {
  let cancelled = 0
  const ctx = mountUploadDialog({ busyInspect: true, mockXhr: true, onCancel: () => { cancelled += 1 } })
  try {
    const heading = ctx.view.root.findByProps({ id: 'cpm-dialog-title' })
    assert.equal(heading.type, 'h2', 'dialog title must be a semantic heading element')
    assert.equal(heading.children.join(''), '上传插件 / Skills')

    const subtitle = ctx.view.root.findByProps({ className: 'cpm-upload-subtitle' })
    assert.equal(subtitle.type, 'p')
    assert.equal(subtitle.children.join(''), '自动识别本地插件与独立 Skills')

    const dropzone = ctx.view.root.findByProps({ className: 'cpm-dropzone' })
    assert.equal(dropzone.type, 'button')
    assert.equal(dropzone.props.autoFocus, true, 'primary dropzone control receives initial modal focus')
    assert.equal(dropzone.props.style?.cursor, undefined, 'cursor is controlled by CSS so disabled busy state works')
    assert.doesNotMatch(textContent(ctx.view.toJSON()), /上限|22\s*MB|500\s*MB/i, 'default UI must not display file size limit copy')

    // Valid HTML: <button> must not contain block elements like <div> or <p>.
    const invalidBlocks = dropzone.findAll((n) => n.type === 'div' || n.type === 'p')
    assert.equal(invalidBlocks.length, 0, 'dropzone button children must use phrasing elements only')

    const formats = dropzone.findAll((n) => n.props?.className === 'cpm-dropzone-format').map((n) => n.children.join(''))
    assert.deepEqual(formats, ['.zip', '.tgz', '.tar.gz', 'SKILL.md'])

    // Cancel button triggers onCancel when idle
    const cancelBtn = ctx.view.root.findAllByType('button').find((b) => b.children.includes('取消'))
    assert.ok(cancelBtn)
    await act(async () => { cancelBtn.props.onClick() })
    assert.equal(cancelled, 1)

    // Streaming upload: raw File over application/octet-stream, disabled Cancel & blocked Escape
    const rawFile = { name: 'sample.zip', size: 1024 }
    const fileInput = ctx.view.root.findByProps({ type: 'file' })
    await act(async () => {
      fileInput.props.onChange({ target: { files: [rawFile], value: '' } })
      await new Promise((r) => setTimeout(r, 0))
    })

    assert.equal(ctx.xhrRequests.length, 1)
    const req = ctx.xhrRequests[0]
    assert.equal(req.method, 'POST')
    assert.equal(req.url, '/universal-plugin-hub/api/plugins/local/inspect?filename=sample.zip')
    assert.equal(req.headers['Content-Type'], 'application/octet-stream')
    assert.equal(req.timeout, 0)
    assert.equal(req.sentBody, rawFile, 'streams raw File rather than converting to base64')

    const busyDropzone = ctx.view.root.find((n) => n.type === 'button' && String(n.props?.className || '').includes('cpm-dropzone'))
    assert.equal(busyDropzone.props.disabled, true)
    assert.equal(busyDropzone.props['aria-busy'], 'true')
    assert.equal(busyDropzone.findAll((n) => n.props?.className === 'cpm-spin-ring').length, 1)

    const busyCancelBtn = ctx.view.root.findAllByType('button').find((b) => b.children.includes('取消'))
    assert.equal(busyCancelBtn.props.disabled, true, 'Cancel must be disabled during active upload/parse')
    const escDuringBusy = ctx.mockWindow.dispatchEscape()
    assert.equal(escDuringBusy.stopped, true, 'Escape must be swallowed while busy')
    assert.equal(cancelled, 1, 'Escape during busy must not call onCancel')

    // Determinate progress event -> updates <progress value="50">
    await act(async () => {
      req.upload.onprogress({ lengthComputable: true, loaded: 512, total: 1024 })
    })
    let progressEl = ctx.view.root.findByType('progress')
    assert.equal(progressEl.props.max, 100)
    assert.equal(progressEl.props.value, 50)
    assert.equal(progressEl.children.length, 0, 'MWG: no text children inside <progress>')
    assert.match(textContent(ctx.view.toJSON()), /50%/)
    const statusRegion = ctx.view.root.findByProps({ role: 'status' })
    assert.equal(statusRegion.props['aria-live'], 'polite')

    // Upload completes -> switches to indeterminate <progress> while server extracts
    await act(async () => {
      req.upload.onload()
    })
    progressEl = ctx.view.root.findByType('progress')
    assert.equal(progressEl.props.value, undefined, 'indeterminate <progress> omits value attribute')
    assert.match(textContent(ctx.view.toJSON()), /正在解压并解析文件/)

    // Server resolves with staged uploadId -> preview confirms with uploadId only, no second upload
    await act(async () => {
      req.status = 200
      req.responseText = JSON.stringify({
        ok: true,
        uploadId: 'upload-token-1',
        kind: 'plugin',
        plugins: [{ name: 'demo-plugin', displayName: 'Demo Plugin', description: 'desc' }],
        plugin: { name: 'demo-plugin', displayName: 'Demo Plugin', description: 'desc' },
        localTabName: 'Local Plugins',
      })
      req.onload()
      await new Promise((r) => setTimeout(r, 0))
    })

    const importBtn = ctx.view.root.findAllByType('button').find((b) => b.children.includes('确认添加'))
    assert.ok(importBtn)
    await act(async () => {
      importBtn.props.onClick()
      await new Promise((r) => setTimeout(r, 0))
    })
    const importCall = ctx.apiCalls.find((c) => c.path === '/plugins/local/import')
    assert.ok(importCall)
    assert.equal(importCall.body.uploadId, 'upload-token-1')
    assert.equal(importCall.body.data, undefined, 'must reuse uploadId instead of re-uploading archive bytes')
  } finally {
    await ctx.unmount()
  }
})

test('AddSourceDialog shows 500MB bottom toast on oversize file and server 413 without closing dialog, and upload-cancel cleans staged preview', async () => {
  let cancelled = 0
  const toasts = []
  const ctx = mountUploadDialog({ busyInspect: true, mockXhr: true, toasts, onCancel: () => { cancelled += 1 } })
  try {
    const fileInput = ctx.view.root.findByProps({ type: 'file' })

    // Client-side pre-check > 500MB -> bottom toast, zero center alertdialog, upload dialog stays open
    await act(async () => {
      fileInput.props.onChange({ target: { files: [{ name: 'huge-pack.zip', size: 500 * 1024 * 1024 + 1 }], value: '' } })
    })
    assert.equal(ctx.xhrRequests.length, 0, 'must not start network transfer for client-detected >500MB archive')
    assert.equal(ctx.view.root.findAllByProps({ role: 'alertdialog' }).length, 0)
    assert.equal(toasts.length, 1)
    assert.match(toasts[0].t, /超出\s*500MB\s*上限/)
    assert.match(toasts[0].b, /huge-pack\.zip/)
    assert.equal(cancelled, 0)

    // Server HTTP 413 also emits the bottom 500MB toast without popping another modal
    await act(async () => {
      fileInput.props.onChange({ target: { files: [{ name: 'streamed-big.zip', size: 1024 }], value: '' } })
      await new Promise((r) => setTimeout(r, 0))
    })
    const req = ctx.xhrRequests[0]
    await act(async () => {
      req.status = 413
      req.responseText = JSON.stringify({ error: '上传文件超出 500MB 上限' })
      req.onload()
      await new Promise((r) => setTimeout(r, 0))
    })
    assert.equal(ctx.view.root.findAllByProps({ role: 'alertdialog' }).length, 0)
    assert.equal(toasts.length, 2)
    assert.match(toasts[1].t, /超出\s*500MB\s*上限/)
    assert.match(toasts[1].b, /streamed-big\.zip/)

    // Backing out of staged preview calls /plugins/local/upload-cancel
    await act(async () => {
      fileInput.props.onChange({ target: { files: [{ name: 'cancel-me.zip', size: 1024 }], value: '' } })
      await new Promise((r) => setTimeout(r, 0))
    })
    const req2 = ctx.xhrRequests[1]
    await act(async () => {
      req2.status = 200
      req2.responseText = JSON.stringify({
        ok: true,
        uploadId: 'upload-token-cancel',
        kind: 'plugin',
        plugins: [{ name: 'cancel-plugin', displayName: 'Cancel Plugin', description: 'desc' }],
        plugin: { name: 'cancel-plugin', displayName: 'Cancel Plugin', description: 'desc' },
        localTabName: 'Local Plugins',
      })
      req2.onload()
      await new Promise((r) => setTimeout(r, 0))
    })
    const backBtn = ctx.view.root.findAllByType('button').find((b) => b.children.includes('返回'))
    await act(async () => { backBtn.props.onClick() })
    const cancelCall = ctx.apiCalls.find((c) => c.path === '/plugins/local/upload-cancel')
    assert.equal(cancelCall?.body?.uploadId, 'upload-token-cancel')
  } finally {
    await ctx.unmount()
  }
})

test('local path drop shows parsing copy (not upload), unmount aborts XHR cleanly, and 410 expiry resets to upload', async () => {
  // 1. Local path drop during inspect must never claim it is streaming-uploading
  const ctxPath = mountUploadDialog({ busyInspect: true })
  try {
    const dialogBox = ctxPath.view.root.find((n) => n.props?.role === 'dialog')
    act(() => {
      dialogBox.props.onDrop({
        preventDefault() {},
        dataTransfer: { files: [{ name: 'local-folder', path: 'C:/plugins/demo' }], getData: () => '' },
      })
    })
    const uiText = textContent(ctxPath.view.toJSON())
    assert.match(uiText, /正在解压并解析文件…/)
    assert.match(uiText, /正在读取并解析本地内容/)
    assert.doesNotMatch(uiText, /正在流式上传文件/)
    await act(async () => {
      ctxPath.resolveInspect({ ok: false, error: 'done' })
      await Promise.resolve()
    })
  } finally {
    await ctxPath.unmount()
  }

  // 2. Unmounting mid-upload aborts active XHR, clears busy state, and emits zero error toasts
  const busyChanges = []
  const unmountToasts = []
  const ctxXhr = mountUploadDialog({
    busyInspect: true,
    mockXhr: true,
    onBusyChange: (v) => busyChanges.push(v),
    toasts: unmountToasts,
  })
  const input = ctxXhr.view.root.find((n) => n.type === 'input' && n.props?.type === 'file')
  act(() => {
    input.props.onChange({
      target: {
        files: [{ name: 'large.zip', size: 1024 }],
        value: 'large.zip',
      },
    })
  })
  assert.equal(ctxXhr.xhrRequests.length, 1)
  assert.equal(busyChanges.at(-1), true)
  await ctxXhr.unmount()
  assert.equal(ctxXhr.xhrRequests[0].aborted, true, 'unmount must abort in-flight XHR')
  assert.equal(busyChanges.at(-1), false, 'unmount must clear parent busy flag')
  assert.equal(unmountToasts.length, 0, 'unmounted abort must not show error toast')

  // 3. HTTP 410 expired uploadId returns dialog to upload phase so user is not trapped on stale preview
  const expiryToasts = []
  const ctxExpired = mountUploadDialog({
    mockXhr: true,
    toasts: expiryToasts,
    apiImpl: (path) => {
      if (path === '/state') return Promise.resolve({ localTabName: '' })
      if (path === '/skills/import') {
        return Promise.reject(Object.assign(new Error('上传缓存已过期，请重新选择文件上传'), { status: 410 }))
      }
      return Promise.resolve({ ok: true })
    },
  })
  try {
    const fileInput = ctxExpired.view.root.find((n) => n.type === 'input' && n.props?.type === 'file')
    await act(async () => {
      fileInput.props.onChange({
        target: { files: [{ name: 'demo.zip', size: 512 }], value: 'demo.zip' },
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    const addBtn = ctxExpired.view.root.find((n) => n.type === 'button' && textContent(n) === '确认添加')
    await act(async () => {
      addBtn.props.onClick()
      await Promise.resolve()
    })
    const dropzone = ctxExpired.view.root.find((n) => n.type === 'button' && String(n.props?.className || '').includes('cpm-dropzone'))
    assert.ok(dropzone, 'dialog must return to upload dropzone after 410 cache expiry')
    assert.equal(expiryToasts.at(-1)?.t, '上传缓存已过期')
  } finally {
    await ctxExpired.unmount()
  }
})

const browser = process.env.UPH_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

test('upload dialog, progress bar, and 500MB bottom toast render cleanly in a real browser', { skip: !existsSync(browser) }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-upload-dialog-'))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))
  const css = extractCss()
  const file = join(dir, 'dialog.html')
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}
    body { margin: 0; font-family: sans-serif; }
    .cpm-dialog, .cpm-dialog-box, .cpm-toast { animation: none; }
  </style>
  <div class="cpm-root" id="root" style="width:1280px;height:800px">
    <div class="cpm-dialog" id="main-overlay">
      <div role="dialog" aria-modal="true" aria-labelledby="cpm-dialog-title" class="cpm-dialog-box cpm-source-dialog-box cpm-upload-dialog">
        <div class="cpm-upload-header">
          <h2 class="cpm-dialog-title" id="cpm-dialog-title">上传插件 / Skills</h2>
          <p class="cpm-upload-subtitle">自动识别本地插件与独立 Skills</p>
        </div>
        <button class="cpm-dropzone is-busy" type="button" disabled aria-busy="true">
          <span class="cpm-dropzone-icon" aria-hidden="true"></span>
          <span class="cpm-dropzone-title">正在流式上传文件…</span>
          <span class="cpm-upload-progress-wrap">
            <span class="cpm-upload-progress-meta"><span>120 MB / 240 MB</span><span>50%</span></span>
            <progress class="cpm-upload-progress" max="100" value="50"></progress>
            <progress class="cpm-upload-progress" id="indet-prog"></progress>
          </span>
        </button>
        <div class="cpm-upload-status" role="status" aria-live="polite">正在上传，上传与解析完成前无法关闭…</div>
        <div class="cpm-dialog-actions">
          <button class="cpm-btn cpm-btn-secondary" type="button" disabled>取消</button>
        </div>
      </div>
    </div>
    <div class="cpm-toast" role="status" aria-live="polite" aria-atomic="true">
      <div class="cpm-toast-content">
        <div class="cpm-toast-title">超出 500MB 上限</div>
        <div class="cpm-toast-body">文件「demo.zip」（520 MB）超出 500MB 上限，无法上传</div>
      </div>
    </div>
  </div>
  <pre id="metrics"></pre>
  <script>
    const root = document.querySelector('#root');
    const dialogOverlay = document.querySelector('#main-overlay');
    const box = document.querySelector('.cpm-upload-dialog');
    const title = document.querySelector('#cpm-dialog-title');
    const actions = box.querySelector('.cpm-dialog-actions');
    const cancel = actions.querySelector('button');
    const prog = document.querySelector('progress.cpm-upload-progress');
    const indet = document.querySelector('#indet-prog');
    const toast = document.querySelector('.cpm-toast');
    const rr = root.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    const cr = cancel.getBoundingClientRect();
    const pr = prog.getBoundingClientRect();
    const ir = indet.getBoundingClientRect();
    const nr = toast.getBoundingClientRect();
    const as = getComputedStyle(actions);
    const ds = getComputedStyle(dialogOverlay);
    const ts = getComputedStyle(toast);
    document.querySelector('#metrics').textContent = JSON.stringify({
      topGap: tr.top - br.top,
      bottomGap: br.bottom - cr.bottom,
      actionsPaddingBottom: as.paddingBottom,
      actionsPosition: as.position,
      progWidth: pr.width,
      progHeight: pr.height,
      indetWidth: ir.width,
      indetHeight: ir.height,
      toastAboveDialog: Number(ts.zIndex) > Number(ds.zIndex),
      toastBottomGap: rr.bottom - nr.bottom,
      toastCenterError: Math.abs(nr.left + nr.width / 2 - (rr.left + rr.width / 2)),
    });
  </script>`)
  const html = execFileSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${join(dir, 'profile')}`, '--window-size=1280,800', '--dump-dom', pathToFileURL(file).href,
  ], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] })
  const m = JSON.parse(html.match(/<pre id="metrics">([^<]+)<\/pre>/)[1])
  assert.equal(m.actionsPaddingBottom, '0px', 'actions row must not inherit 20px sticky bottom padding')
  assert.equal(m.actionsPosition, 'static', 'upload actions row should not use sticky -20px positioning')
  assert.ok(m.topGap >= 18 && m.topGap <= 26, `unexpected topGap: ${m.topGap}`)
  assert.ok(m.bottomGap >= 14 && m.bottomGap <= 22, `bottom void regression: ${m.bottomGap}px below cancel`)
  assert.ok(m.progWidth >= 200 && m.progHeight === 6, `progress bar geometry invalid: ${m.progWidth}x${m.progHeight}`)
  assert.ok(m.indetWidth >= 200 && m.indetHeight === 6, `indeterminate progress geometry invalid: ${m.indetWidth}x${m.indetHeight}`)
  assert.equal(m.toastAboveDialog, true, 'bottom toast must layer above modal dialog overlay')
  assert.ok(m.toastBottomGap >= 20 && m.toastBottomGap <= 34, `unexpected toast bottom gap: ${m.toastBottomGap}`)
  assert.ok(m.toastCenterError < 1, `toast off-center by ${m.toastCenterError}px`)
})

test('drag overlay CSS fills edge-to-edge without white outer rim or restarting keyframe animations', () => {
  const css = extractCss()
  const overlay = css.match(/(?:^|\n)\.cpm-source-drag-overlay\s*\{([^}]+)\}/)
  assert.ok(overlay, '.cpm-source-drag-overlay rule must exist')
  assert.match(overlay[1], /inset:\s*0/)
  assert.match(overlay[1], /box-sizing:\s*border-box/)
  assert.match(overlay[1], /border-radius:\s*calc\(var\(--dsw-radius-lg,\s*20px\)\s*-\s*1px\)/)
  assert.match(overlay[1], /transition:/)
  assert.doesNotMatch(overlay[1], /animation:|cpm-dialog-in|backdrop-filter:/, 'overlay backdrop must not restart keyframe transform or stack nested backdrop-filter')
  assert.doesNotMatch(css, /\.cpm-source-drag-overlay::before\s*\{[^}]*inset:\s*10px/, 'must not inset dashed frame by 10px leaving a white border')

  // Children during active drag must not steal dragenter/dragleave hit tests
  assert.match(css, /\.cpm-upload-dialog\s+\.cpm-dropzone\s*>\s*\*\s*\{[^}]*pointer-events:\s*none/)
  assert.match(css, /\.cpm-upload-dialog\.is-dragging\s*>\s*:not\(\.cpm-source-drag-overlay\)\s*\{[^}]*pointer-events:\s*none/)
  assert.match(css, /\.cpm-source-drag-overlay\s*>\s*\*\s*\{[^}]*pointer-events:\s*none/)

  // Content transitions compositor-only opacity/transform cleanly and respects reduced motion + forced colors
  const content = css.match(/\.cpm-source-drag-content\s*\{([^}]+)\}/)
  assert.ok(content, '.cpm-source-drag-content rule must exist')
  assert.match(content[1], /transform:\s*scale\(/)
  assert.match(content[1], /padding-bottom:\s*calc\(8px \+ 1\.0875rem\)/)
  assert.doesNotMatch(css, /\.cpm-source-drag-sub\b/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cpm-source-drag-content[\s\S]*transform:\s*none/)
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.cpm-source-drag-overlay\s*\{/)
})

test('AddSourceDialog drag overlay resists spurious dragleave flicker and stays mounted for reversible transitions', async () => {
  const ctx = mountUploadDialog()
  try {
    const dialogBox = () => ctx.view.root.find((n) => n.props?.role === 'dialog')
    const dragOverlay = () => ctx.view.root.find((n) => String(n.props?.className || '').includes('cpm-source-drag-overlay'))

    // Only one .cpm-dropzone-title exists (overlay uses dedicated .cpm-source-drag-title)
    assert.equal(ctx.view.root.findAll((n) => n.props?.className === 'cpm-dropzone-title').length, 1)

    // Overlay is pre-mounted (hidden) in upload phase so CSS enter/exit is continuously interruptible
    let ov = dragOverlay()
    assert.doesNotMatch(ov.props.className, /\bis-visible\b/)
    assert.equal(ov.props['aria-hidden'], 'true')

    const boxNode = { contains: (target) => target === childNode, getBoundingClientRect: () => ({ left: 100, top: 100, right: 560, bottom: 460, width: 460, height: 360 }) }
    const childNode = {}
    const outsideNode = {}
    const dt = { dropEffect: '' }

    // 1. dragEnter + dragOver activate overlay cleanly
    act(() => {
      dialogBox().props.onDragEnter?.({ preventDefault() {}, currentTarget: boxNode, dataTransfer: dt })
      dialogBox().props.onDragOver({ preventDefault() {}, currentTarget: boxNode, dataTransfer: dt })
    })
    assert.equal(dt.dropEffect, 'copy')
    assert.match(dialogBox().props.className, /\bis-dragging\b/)
    ov = dragOverlay()
    assert.match(ov.props.className, /\bis-visible\b/)
    assert.equal(ov.props['aria-hidden'], undefined)

    // 2. Child boundary dragleave stays active
    act(() => {
      dialogBox().props.onDragLeave({ currentTarget: boxNode, relatedTarget: childNode, clientX: 250, clientY: 220 })
    })
    assert.match(dragOverlay().props.className, /\bis-visible\b/)

    // 3. Spurious Windows/Chromium dragleave(relatedTarget=null) while cursor is strictly inside rect must NOT flicker off
    act(() => {
      dialogBox().props.onDragLeave({ currentTarget: boxNode, relatedTarget: null, clientX: 300, clientY: 260 })
    })
    assert.match(dragOverlay().props.className, /\bis-visible\b/, 'spurious null-relatedTarget dragleave inside box must not flicker')

    // 4. Synthetic dragleave without geometry or outside rect clears cleanly without unmounting overlay node
    act(() => {
      dialogBox().props.onDragLeave({ currentTarget: boxNode, relatedTarget: null, clientX: 50, clientY: 50 })
    })
    assert.doesNotMatch(dragOverlay().props.className, /\bis-visible\b/)
    assert.doesNotMatch(dialogBox().props.className, /\bis-dragging\b/)
    assert.equal(dragOverlay().props['aria-hidden'], 'true')

    // 5. Exiting onto external element or window dragend clears cleanly too
    act(() => {
      dialogBox().props.onDragOver({ preventDefault() {}, currentTarget: boxNode, dataTransfer: dt })
    })
    assert.match(dragOverlay().props.className, /\bis-visible\b/)
    act(() => {
      dialogBox().props.onDragLeave({ currentTarget: boxNode, relatedTarget: outsideNode, clientX: 250, clientY: 220 })
    })
    assert.doesNotMatch(dragOverlay().props.className, /\bis-visible\b/)

    act(() => {
      dialogBox().props.onDragOver({ preventDefault() {}, currentTarget: boxNode, dataTransfer: dt })
    })
    assert.match(dragOverlay().props.className, /\bis-visible\b/)
    act(() => {
      ctx.mockWindow.dispatchWindowEvent('dragend')
    })
    assert.doesNotMatch(dragOverlay().props.className, /\bis-visible\b/, 'window dragend fallback must clear sticky drag state')
  } finally {
    await ctx.unmount()
  }
})

test('drag overlay covers 100% of upload dialog client area with zero white border in light and dark mode', { skip: !existsSync(browser) }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-drag-overlay-'))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))
  const css = extractCss()
  const file = join(dir, 'drag-overlay.html')
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}
    body { margin: 0; font-family: sans-serif; }
    .cpm-dialog, .cpm-dialog-box { animation: none; }
  </style>
  <div class="cpm-root" id="light-root" style="width:1280px;height:800px">
    <div class="cpm-dialog">
      <div role="dialog" class="cpm-dialog-box cpm-source-dialog-box cpm-upload-dialog is-dragging" style="position:relative">
        <div class="cpm-upload-header">
          <h2 class="cpm-dialog-title">上传插件 / Skills</h2>
          <p class="cpm-upload-subtitle">自动识别本地插件与独立 Skills</p>
        </div>
        <button class="cpm-dropzone" type="button">
          <span class="cpm-dropzone-title">拖入插件 / Skills，或点击上传</span>
        </button>
        <div class="cpm-dialog-actions"><button class="cpm-btn cpm-btn-secondary" type="button">取消</button></div>
        <div class="cpm-source-drag-overlay is-visible">
          <div class="cpm-source-drag-content">
            <span class="cpm-dropzone-icon" aria-hidden="true"></span>
            <div class="cpm-source-drag-title">释放以解析插件 / Skills</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="cpm-root cpm-dark" id="dark-root" style="width:1280px;height:800px">
    <div class="cpm-dialog">
      <div role="dialog" class="cpm-dialog-box cpm-source-dialog-box cpm-upload-dialog is-dragging" style="position:relative">
        <div class="cpm-upload-header">
          <h2 class="cpm-dialog-title">上传插件 / Skills</h2>
          <p class="cpm-upload-subtitle">自动识别本地插件与独立 Skills</p>
        </div>
        <button class="cpm-dropzone" type="button">
          <span class="cpm-dropzone-title">拖入插件 / Skills，或点击上传</span>
        </button>
        <div class="cpm-dialog-actions"><button class="cpm-btn cpm-btn-secondary" type="button">取消</button></div>
        <div class="cpm-source-drag-overlay is-visible">
          <div class="cpm-source-drag-content">
            <span class="cpm-dropzone-icon" aria-hidden="true"></span>
            <div class="cpm-source-drag-title">释放以解析插件 / Skills</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <pre id="metrics"></pre>
  <script>
    const measure = (id) => {
      const box = document.querySelector('#' + id + ' .cpm-upload-dialog');
      const ov = box.querySelector('.cpm-source-drag-overlay');
      const content = ov.querySelector('.cpm-source-drag-content');
      const br = box.getBoundingClientRect();
      const or = ov.getBoundingClientRect();
      const cr = content.getBoundingClientRect();
      const bs = getComputedStyle(box);
      const os = getComputedStyle(ov);
      const bl = parseFloat(bs.borderLeftWidth) || 0;
      const bt = parseFloat(bs.borderTopWidth) || 0;
      const brw = parseFloat(bs.borderRightWidth) || 0;
      const bb = parseFloat(bs.borderBottomWidth) || 0;
      return {
        edgeDiffLeft: Math.abs(or.left - (br.left + bl)),
        edgeDiffTop: Math.abs(or.top - (br.top + bt)),
        edgeDiffRight: Math.abs((br.right - brw) - or.right),
        edgeDiffBottom: Math.abs((br.bottom - bb) - or.bottom),
        overflowX: box.scrollWidth > box.clientWidth,
        overflowY: box.scrollHeight > box.clientHeight,
        boxBorderColor: bs.borderTopColor,
        overlayBg: os.backgroundImage !== 'none' ? os.backgroundImage : os.backgroundColor,
        overlayPointerEvents: os.pointerEvents,
        contentCenterDelta: Math.abs((cr.top + cr.height / 2) - (or.top + or.height / 2)),
      };
    };
    document.querySelector('#metrics').textContent = JSON.stringify({
      light: measure('light-root'),
      dark: measure('dark-root'),
    });
  </script>`)
  const html = execFileSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${join(dir, 'profile')}`, '--window-size=1280,800', '--dump-dom', pathToFileURL(file).href,
  ], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] })
  const m = JSON.parse(html.match(/<pre id="metrics">([^<]+)<\/pre>/)[1])
  for (const theme of ['light', 'dark']) {
    const tMetrics = m[theme]
    assert.ok(tMetrics.edgeDiffLeft <= 0.5, `${theme} left edge gap: ${tMetrics.edgeDiffLeft}`)
    assert.ok(tMetrics.edgeDiffTop <= 0.5, `${theme} top edge gap: ${tMetrics.edgeDiffTop}`)
    assert.ok(tMetrics.edgeDiffRight <= 0.5, `${theme} right edge gap: ${tMetrics.edgeDiffRight}`)
    assert.ok(tMetrics.edgeDiffBottom <= 0.5, `${theme} bottom edge gap: ${tMetrics.edgeDiffBottom}`)
    assert.equal(tMetrics.overflowX, false, `${theme} horizontal overflow must not trigger scrollbar`)
    assert.equal(tMetrics.overflowY, false, `${theme} vertical overflow must not trigger scrollbar`)
    assert.equal(tMetrics.overlayPointerEvents, 'none')
    assert.ok(tMetrics.contentCenterDelta <= 2, `${theme} overlay content should stay vertically centered`)
    assert.notEqual(tMetrics.boxBorderColor, 'rgb(255, 255, 255)')
  }
})
