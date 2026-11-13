import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { create, act } from 'react-test-renderer'

const clientSource = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function loadIconRuntime() {
  const start = clientSource.indexOf('const BRAND_ICONS = {')
  const end = clientSource.indexOf('\tfunction PluginCard(', start)
  assert.ok(start > 0 && end > start, 'icon components block must exist in client.js')

  let fallbackRenderCount = 0
  const context = {
    ...React,
    React,
    h: React.createElement,
    URL,
    localStorage: { getItem: () => '[]', setItem() {} },
  }
  vm.runInNewContext(
    clientSource.slice(start, end) +
      '\nconst __origFallback = PluginIconFallback;\n' +
      'PluginIconFallback = function WrappedFallback(props) { globalThis.__fallbackRenders++; return __origFallback(props); };\n' +
      'globalThis.__fallbackRenders = 0;\n' +
      'globalThis.PluginIcon = PluginIcon;\n' +
      'globalThis.PluginIconImage = PluginIconImage;\n' +
      'globalThis.PluginIconFallback = PluginIconFallback;\n' +
      'globalThis.OriginalFallback = __origFallback;\n',
    context,
  )
  return {
    context,
    resetFallbackCount() {
      context.__fallbackRenders = 0
    },
    get fallbackRenders() {
      return context.__fallbackRenders
    },
  }
}

test('inline data: icons keep .cpm-icon-underlay opacity contract without mounting hidden fallback <img>', () => {
  const { context, resetFallbackCount } = loadIconRuntime()
  const inlineData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const localUrl = '/universal-plugin-hub/api/plugin-icon?sourceId=s&name=demo&path=icon.png&v=1'

  // 1. PluginIcon with preferPreview: true and inline local preview
  resetFallbackCount()
  let tree
  act(() => {
    tree = create(React.createElement(context.PluginIcon, {
      plugin: {
        name: 'demo',
        icons: {
          light: [localUrl],
          previews: { [localUrl]: inlineData },
        },
      },
      isDark: false,
      eager: true,
      preferPreview: true,
    }))
  })

  const json = tree.toJSON()
  assert.equal(json.children[0].props.className, 'cpm-icon-underlay')
  assert.equal(json.children[0].props.style.opacity, 0, 'underlay must be transparent when inline image is active')
  assert.equal(json.children[0].children, null, 'inline icon must NOT mount fallback inside underlay on frame 0')
  assert.equal(context.__fallbackRenders, 0, 'PluginIconFallback must NOT render when inline preview is active')

  const imgs = tree.root.findAllByType('img')
  assert.equal(imgs.length, 1, 'only one <img> should be mounted for an inline icon')
  assert.equal(imgs[0].props.src, inlineData)

  // 2. If the inline icon errors and index advances to the non-data URL, fallback mounts immediately
  act(() => {
    imgs[0].props.onError()
  })
  const afterError = tree.toJSON()
  assert.equal(afterError.children[0].props.style.opacity, 1, 'underlay becomes visible while next candidate loads')
  assert.ok(context.__fallbackRenders >= 1, 'fallback must render immediately once inline icon errors to non-data URL')
  const imgsAfterError = tree.root.findAllByType('img')
  assert.equal(imgsAfterError.length, 2, 'fallback <img> and next candidate <img> both mount after inline failure')
  const underlayImg = afterError.children[0].children[0].children[0]
  assert.equal(underlayImg.type, 'img')
  assert.equal(underlayImg.props.fetchPriority, 'low', 'fallback mounted behind pending non-inline candidate must be deprioritized')

  act(() => tree.unmount())
})

test('direct inline PluginIconImage candidate does not mount hidden fallback <img> until error', () => {
  const { context, resetFallbackCount } = loadIconRuntime()
  const inlineSvg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='

  resetFallbackCount()
  let tree
  act(() => {
    tree = create(React.createElement(context.PluginIcon, {
      plugin: {
        name: 'direct-inline',
        icons: { light: [inlineSvg] },
      },
      isDark: false,
      eager: true,
    }))
  })

  const json = tree.toJSON()
  assert.equal(json.children[0].props.className, 'cpm-icon-underlay')
  assert.equal(json.children[0].props.style.opacity, 0)
  assert.equal(json.children[0].children, null)
  assert.equal(tree.root.findAllByType('img').length, 1)
  act(() => tree.unmount())
})

test('non-inline primary candidates deprioritize the mounted fallback <img> while leaving standalone PluginIconFallback unchanged', () => {
  const { context } = loadIconRuntime()
  const remoteUrl = '/universal-plugin-hub/api/icon?v=2&u=https%3A%2F%2Fgithub.com%2FExampleOrg.png%3Fsize%3D80'

  // 1. Inside PluginIcon with pending network candidate (eager: true)
  let pendingTree
  act(() => {
    pendingTree = create(React.createElement(context.PluginIcon, {
      plugin: {
        name: 'remote-plugin',
        icons: { light: [remoteUrl] },
      },
      isDark: false,
      eager: true,
    }))
  })

  const pendingJson = pendingTree.toJSON()
  const underlayDiv = pendingJson.children[0]
  assert.equal(underlayDiv.props.className, 'cpm-icon-underlay')
  assert.equal(underlayDiv.props.style.opacity, 1)
  const fallbackImg = underlayDiv.children[0].children[0]
  assert.equal(fallbackImg.type, 'img')
  assert.equal(fallbackImg.props.fetchPriority, 'low', 'underlay fallback behind pending network candidate must have fetchPriority="low"')
  assert.equal(fallbackImg.props.loading, 'lazy')

  const primaryImg = pendingJson.children[1]
  assert.equal(primaryImg.type, 'img')
  assert.equal(primaryImg.props.src, remoteUrl)
  assert.equal(primaryImg.props.loading, 'eager')
  assert.notEqual(primaryImg.props.fetchPriority, 'low')

  // When primary errors and no candidates remain, fallback is no longer behind a pending candidate
  act(() => {
    pendingTree.root.findAllByType('img')[1].props.onError()
  })
  const exhaustedJson = pendingTree.toJSON()
  assert.equal(exhaustedJson.children.length, 1)
  const promotedFallbackImg = exhaustedJson.children[0].children[0].children[0]
  assert.equal(promotedFallbackImg.props.fetchPriority, undefined)
  assert.equal(promotedFallbackImg.props.loading, 'eager')

  // 2. Standalone PluginIconFallback behavior (eager: false and eager: true) stays intact
  let standaloneLazy
  act(() => {
    standaloneLazy = create(React.createElement(context.OriginalFallback, {
      plugin: { name: 'research', sourceId: 'skills-local' },
      isDark: false,
    }))
  })
  const lazyImg = standaloneLazy.toJSON().children[0]
  assert.equal(lazyImg.props.fetchPriority, undefined)
  assert.equal(lazyImg.props.loading, 'lazy')
  assert.equal(lazyImg.props.decoding, 'async')

  let standaloneEager
  act(() => {
    standaloneEager = create(React.createElement(context.OriginalFallback, {
      plugin: { name: 'research', sourceId: 'skills-local' },
      isDark: false,
      eager: true,
    }))
  })
  const eagerImg = standaloneEager.toJSON().children[0]
  assert.equal(eagerImg.props.fetchPriority, undefined)
  assert.equal(eagerImg.props.loading, 'eager')
  assert.equal(eagerImg.props.decoding, 'sync')

  act(() => {
    pendingTree.unmount()
    standaloneLazy.unmount()
    standaloneEager.unmount()
  })
})
