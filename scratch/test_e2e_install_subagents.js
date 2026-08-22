import assert from 'node:assert'
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { installPlugin, uninstallPlugin, togglePlugin, installedDetails } from '../src/install.js'
import { readState, writeState, dshHome, installedDir, sourceCacheDir } from '../src/store.js'
import { PRESET_ROOT } from '../src/agents-map.js'

console.log('=== End-to-End Subagent Hub Lifecycle Test ===')

// 1. Setup a test mock source in cache
const testSourceId = 'test-e2e-source'
const testPluginName = 'mock-claude-toolkit'
const cacheDir = sourceCacheDir(testSourceId)
const pluginDir = join(cacheDir, 'plugins', testPluginName)

rmSync(cacheDir, { recursive: true, force: true })
mkdirSync(pluginDir, { recursive: true })

// Add a plugin.json
mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true })
writeFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify({
  name: testPluginName,
  displayName: 'Mock Claude Toolkit',
  description: 'A mock Claude plugin containing skills, agents and MCP servers',
  version: '1.2.0',
  author: 'Anthropic Test',
}, null, 2))

// Add marketplace.json in source cache root
writeFileSync(join(cacheDir, 'marketplace.json'), JSON.stringify({
  plugins: [{
    name: testPluginName,
    displayName: 'Mock Claude Toolkit',
    description: 'A mock Claude plugin containing skills, agents and MCP servers',
    version: '1.2.0',
    source: `./plugins/${testPluginName}`,
  }]
}, null, 2))

// Add 2 user commands (explicit slash commands)
mkdirSync(join(pluginDir, 'commands'), { recursive: true })
writeFileSync(join(pluginDir, 'commands', 'fast-lint.md'), '# Fast Lint\n\nRun fast linter.')
writeFileSync(join(pluginDir, 'commands', 'git-summarize.md'), '---\nname: git-summarize\ndescription: Summarize git log\n---\n# Git Summarize\n\nSummarize git commits.')

// Add 3 subagents (task-level specialized subagents)
mkdirSync(join(pluginDir, 'agents'), { recursive: true })
writeFileSync(join(pluginDir, 'agents', 'code-reviewer.md'), `---
name: code-reviewer
description: Expert code reviewer subagent.
tools: Read, Grep, Bash
model: sonnet
---

# Code Reviewer Prompt
You are a senior code reviewer. Review code thoroughly.
`)

writeFileSync(join(pluginDir, 'agents', 'architect.yaml'), `
name: system-architect
interface:
  display_name: "System Architect"
  short_description: "Evaluates modularity and high-level design."
tools:
  - Read
  - Glob
prompt: |
  You are an expert system architect analyzing dependencies.
`)

writeFileSync(join(pluginDir, 'agents', 'agent-card.json'), JSON.stringify({
  name: 'performance-tuner',
  description: 'Analyzes latency bottlenecks and memory profiles.',
  instructions: 'You are a performance optimization expert.',
}, null, 2))

// Add an MCP connector
writeFileSync(join(pluginDir, 'mcp.json'), JSON.stringify({
  mcpServers: {
    'local-sqlite': {
      command: 'node',
      args: ['${CLAUDE_PLUGIN_ROOT}/scripts/sqlite.js'],
      env: { DB_PATH: '${CLAUDE_PLUGIN_ROOT}/data.db' },
    }
  }
}, null, 2))

// Register the test source in state.json
const state = readState()
if (!state.sources.some(s => s.id === testSourceId)) {
  state.sources.push({
    id: testSourceId,
    name: 'Test Source',
    url: 'https://github.com/test/mock-source.git',
    addedAt: Date.now(),
  })
  writeState(state)
}

console.log('\n--- Step 1: Executing installPlugin ---')
const installResult = await installPlugin({ sourceId: testSourceId, pluginName: testPluginName })
console.log('Install Result:', {
  ok: installResult.ok,
  skillsCount: installResult.skills.length,
  subagentsCount: installResult.subagents?.length,
  hubSkill: installResult.subagentsHub?.skillName,
  connectorsCount: installResult.connectors?.length,
})

assert.strictEqual(installResult.ok, true)
assert.strictEqual(installResult.subagents.length, 3, 'Should have parsed 3 subagents')
assert.ok(installResult.subagentsHub, 'Should have generated Subagents Hub Skill')
assert.strictEqual(installResult.subagentsHub.skillName, `${testPluginName}-agents`)

// User commands should be present: /fast-lint, /git-summarize, and /mock-claude-toolkit-agents
assert.ok(installResult.skills.includes('/fast-lint'), 'Should include user command /fast-lint')
assert.ok(installResult.skills.includes('/git-summarize'), 'Should include user command /git-summarize')
assert.ok(installResult.skills.includes(`/${testPluginName}-agents`), 'Should include Hub skill command')

// Individual subagents SHOULD NOT pollute top-level skills as 3 separate slash commands!
console.log('Registered top-level skills:', installResult.skills)
assert.strictEqual(installResult.skills.length, 3, 'Should have exactly 3 clean top-level skills (2 commands + 1 subagent hub), NOT 5+ cluttered commands!')

console.log('\n--- Step 2: Verifying that .agent-presets remains 100% untouched ---')
const presetRoot = PRESET_ROOT()
if (existsSync(presetRoot)) {
  const presets = readdirSync(presetRoot)
  assert.ok(!presets.some(p => p.startsWith(testPluginName)), 'Zero presets should be written to .agent-presets')
}

console.log('\n--- Step 3: Verifying Subagent Hub SKILL.md contents ---')
const targetInstalled = installedDir(testPluginName)
assert.ok(existsSync(targetInstalled), 'Installed target must exist')

const hubPath = join(targetInstalled, 'skills', `${testPluginName}-agents`, 'SKILL.md')
assert.ok(existsSync(hubPath), 'Hub SKILL.md must exist')
const hubContent = readFileSync(hubPath, 'utf8')
console.log('Hub SKILL.md sample:\n', hubContent.split('\n').slice(0, 22).join('\n'))

assert.ok(hubContent.includes('name: mock-claude-toolkit-agents'))
assert.ok(hubContent.includes('`code-reviewer`'))
assert.ok(hubContent.includes('`system-architect`'))
assert.ok(hubContent.includes('`performance-tuner`'))
assert.ok(hubContent.includes('You are a senior code reviewer'))
assert.ok(hubContent.includes('You are an expert system architect'))

console.log('\n--- Step 4: Verifying raw agents/ directory is preserved ---')
const rawAgentsDir = join(targetInstalled, 'agents')
assert.ok(existsSync(rawAgentsDir), 'agents/ directory must be preserved')
assert.ok(existsSync(join(rawAgentsDir, 'code-reviewer.md')))
assert.ok(existsSync(join(rawAgentsDir, 'architect.yaml')))

console.log('\n--- Step 5: Testing uninstallPlugin ---')
const uninstallRes = uninstallPlugin(testPluginName)
assert.strictEqual(uninstallRes.ok, true)
assert.ok(!existsSync(targetInstalled), 'Installed dir should be removed')

// Clean up mock source cache
rmSync(cacheDir, { recursive: true, force: true })
const updatedState = readState()
updatedState.sources = updatedState.sources.filter(s => s.id !== testSourceId)
writeState(updatedState)

console.log('\n========================================')
console.log('>>> ALL END-TO-END TESTS PASSED 100% <<<')
console.log('========================================\n')
