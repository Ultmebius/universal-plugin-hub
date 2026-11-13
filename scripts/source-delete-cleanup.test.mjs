import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { mountRoutes } from '../src/routes.js'
import { readState, writeState, sourceCacheDir } from '../src/store.js'
import { createSkillsManager } from '../src/skills.js'

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
}

test('DELETE /sources/:sourceId cleans up state.tabOrder and preserves remaining order', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-source-delete-'))
  const oldHome = process.env.DSH_HOME
  const oldAgents = process.env.DSH_AGENTS_HOME
  process.env.DSH_HOME = join(root, 'dsh')
  process.env.DSH_AGENTS_HOME = join(root, 'agents')

  let handler
  mountRoutes(
    { register(route) { handler = route.handler } },
    (() => {
      write(join(process.env.DSH_AGENTS_HOME, 'skills', 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\ndescription: demo\n---\nbody\n')
      return createSkillsManager()
    })(),
  )

  const request = async (method, path, headers = {}) => {
    const res = {
      status: 0,
      headers: {},
      body: null,
      writeHead(status, hdrs) {
        this.status = status
        this.headers = hdrs || {}
      },
      end(chunk) {
        this.body = chunk ? JSON.parse(String(chunk)) : null
      },
    }
    await handler({ method, url: `/universal-plugin-hub/api${path}`, headers }, res)
    return res
  }

  try {
    await t.test('removes deleted sourceId from state.tabOrder and reflects immediately in GET /state', async () => {
      write(join(sourceCacheDir('custom-alpha'), '.claude-plugin', 'marketplace.json'), {
        plugins: [{ name: 'alpha-plugin', source: './' }],
      })
      write(join(sourceCacheDir('custom-beta'), '.claude-plugin', 'marketplace.json'), {
        plugins: [{ name: 'beta-plugin', source: './' }],
      })
      writeState({
        sources: [
          { id: 'anthropic', name: 'Anthropic', url: 'https://github.com/anthropics/claude-plugins-official.git', builtin: true },
          { id: 'custom-alpha', name: 'Alpha', url: 'https://github.com/example/alpha.git' },
          { id: 'custom-beta', name: 'Beta', url: 'https://github.com/example/beta.git' },
        ],
        plugins: [],
        tabOrder: ['anthropic', 'custom-alpha', 'skills-local', 'custom-beta'],
      })

      const del = await request('DELETE', '/sources/custom-alpha')
      assert.equal(del.status, 200)
      assert.deepEqual(del.body, { ok: true })

      const saved = readState()
      assert.equal(saved.sources.some((s) => s.id === 'custom-alpha'), false)
      assert.deepEqual(saved.tabOrder, ['anthropic', 'skills-local', 'custom-beta'])
      assert.equal(existsSync(sourceCacheDir('custom-alpha')), false)

      const stateRes = await request('GET', '/state')
      assert.equal(stateRes.status, 200)
      assert.deepEqual(stateRes.body.sources.map((s) => s.id), ['anthropic', 'skills-local', 'custom-beta'])
    })

    await t.test('does not synthesize tabOrder when absent on state', async () => {
      write(join(sourceCacheDir('custom-gamma'), '.claude-plugin', 'marketplace.json'), { plugins: [] })
      writeState({
        sources: [
          { id: 'anthropic', name: 'Anthropic', url: 'https://github.com/anthropics/claude-plugins-official.git', builtin: true },
          { id: 'custom-gamma', name: 'Gamma', url: 'https://github.com/example/gamma.git' },
        ],
        plugins: [],
      })

      const del = await request('DELETE', '/sources/custom-gamma')
      assert.equal(del.status, 200)
      const saved = readState()
      assert.equal(saved.tabOrder, undefined)
    })

    await t.test('failed deletes (installed plugin, builtin, cross-origin) leave state.tabOrder untouched', async () => {
      writeState({
        sources: [
          { id: 'anthropic', name: 'Anthropic', url: 'https://github.com/anthropics/claude-plugins-official.git', builtin: true },
          { id: 'custom-busy', name: 'Busy', url: 'https://github.com/example/busy.git' },
        ],
        plugins: [{ name: 'busy-plugin', sourceId: 'custom-busy', enabled: true }],
        tabOrder: ['anthropic', 'custom-busy', 'skills-local'],
      })

      const busyRes = await request('DELETE', '/sources/custom-busy')
      assert.equal(busyRes.status, 500)
      assert.deepEqual(readState().tabOrder, ['anthropic', 'custom-busy', 'skills-local'])

      const builtinRes = await request('DELETE', '/sources/anthropic')
      assert.equal(builtinRes.status, 500)
      assert.deepEqual(readState().tabOrder, ['anthropic', 'custom-busy', 'skills-local'])

      const xOriginRes = await request('DELETE', '/sources/custom-busy', {
        origin: 'https://evil.example',
        host: '127.0.0.1:3000',
      })
      assert.equal(xOriginRes.status, 403)
      assert.deepEqual(readState().tabOrder, ['anthropic', 'custom-busy', 'skills-local'])
    })
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
    if (oldAgents === undefined) delete process.env.DSH_AGENTS_HOME
    else process.env.DSH_AGENTS_HOME = oldAgents
    rmSync(root, { recursive: true, force: true })
  }
})
