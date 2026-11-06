import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installedDir, sourceCacheDir, statePath, writeState } from '../src/store.js'
import { installedDetails } from '../src/install.js'

test('installed descriptions fall back to the manifest and marketplace without rewriting state', () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-installed-description-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = root
  try {
    const cases = [
      { name: 'saved', description: 'Saved description', manifest: 'Manifest description', market: 'Market description', expected: 'Saved description' },
      { name: 'missing', manifest: 'Manifest description', market: 'Market description', expected: 'Manifest description' },
      { name: 'empty', description: '', manifest: 'Manifest description', expected: 'Manifest description' },
      { name: 'market-only', manifest: '', market: 'Market description', expected: 'Market description' },
      { name: 'missing-directory', market: 'Market description', expected: 'Market description' },
      { name: 'no-description', manifest: '', expected: '' },
    ]
    const marketDir = join(sourceCacheDir('source'), '.claude-plugin')
    mkdirSync(marketDir, { recursive: true })
    writeFileSync(join(marketDir, 'marketplace.json'), JSON.stringify({
      name: 'source',
      plugins: cases.map(({ name, market }) => ({ name, description: market, source: `./${name}` })),
    }))
    for (const item of cases) {
      if (item.manifest === undefined) continue
      const manifestDir = join(installedDir(item.name), '.claude-plugin')
      mkdirSync(manifestDir, { recursive: true })
      writeFileSync(join(manifestDir, 'plugin.json'), JSON.stringify({ name: item.name, description: item.manifest }))
    }
    writeState({
      sources: [{ id: 'source', name: 'Source' }],
      plugins: cases.map(({ name, description }) => ({ name, sourceId: 'source', description })),
    })
    const savedState = readFileSync(statePath(), 'utf8')
    const descriptions = installedDetails().map(({ name, description }) => ({ name, description }))
    assert.deepEqual(descriptions, cases.map(({ name, expected }) => ({ name, description: expected })))
    assert.equal(readFileSync(statePath(), 'utf8'), savedState)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(root, { recursive: true, force: true })
  }
})
