import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Point path helpers at a throwaway DSH home before importing the module that
// resolves the active profile from the environment.
const home = mkdtempSync(join(tmpdir(), 'uph-patch-'))
process.env.DSH_HOME = home
process.env.DSH_PROFILE = 'desktop'
mkdirSync(join(home, 'profiles', 'desktop'), { recursive: true })

const { cordisPatchPath, readCordisPatch, writeCordisPatch } = await import('../src/install.js')

const userPatch = `# 用户手写的 patch 层
- id: sandbox-policy
  name: "@deepseek-ai/dsh-sandbox-policy"
  config:
    mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
    workspaceRoot: !!js process.cwd()
`

test('包含 !!js 的 patch 被改写时中止，原文件保持逐字节不变', () => {
  writeFileSync(cordisPatchPath(), userPatch, 'utf8')
  assert.throws(
    () => writeCordisPatch([{ insert: [{ id: 'mcp-demo', name: 'demo' }] }]),
    /已中止写入/,
  )
  assert.equal(readFileSync(cordisPatchPath(), 'utf8'), userPatch)
})

test('可解析的 patch 仍能正常写入与读回', () => {
  writeFileSync(cordisPatchPath(), '- id: ui-theme\n  config:\n    fontSize: 16\n', 'utf8')
  writeCordisPatch([{ insert: [{ id: 'mcp-demo', name: 'demo' }] }])
  assert.deepEqual(readCordisPatch(), [{ insert: [{ id: 'mcp-demo', name: 'demo' }] }])
})

test('顶层不是数组时中止写入', () => {
  writeFileSync(cordisPatchPath(), 'id: ui-theme\n', 'utf8')
  assert.throws(() => writeCordisPatch([]), /顶层必须是数组/)
  assert.equal(readFileSync(cordisPatchPath(), 'utf8'), 'id: ui-theme\n')
})
