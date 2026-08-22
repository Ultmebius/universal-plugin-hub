import assert from 'node:assert'
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseAgentDefinition, compileSubagentsHubSkill, cleanupLegacyPresets, PRESET_ROOT } from '../src/agents-map.js'

console.log('--- 1. Testing parseAgentDefinition with Markdown agent ---')
const mdAgentContent = `---
name: code-reviewer
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior code reviewer ensuring high standards of code quality.
## Review Process
1. Gather context
2. Apply review checklist
`

const parsedMd = parseAgentDefinition('test-plugin', 'code-reviewer.md', mdAgentContent)
console.log('Parsed MD:', parsedMd)
assert.strictEqual(parsedMd.name, 'code-reviewer')
assert.strictEqual(parsedMd.displayName, 'code-reviewer')
assert.ok(parsedMd.instructions.includes('You are a senior code reviewer'))

console.log('--- 2. Testing parseAgentDefinition with YAML agent ---')
const yamlAgentContent = `
name: architecture-advisor
interface:
  display_name: "Architecture Advisor"
  short_description: "Reviews system design, boundaries, and scalability."
tools:
  - Read
  - Grep
prompt: |
  You are an experienced software architect analyzing service boundaries.
`
const parsedYaml = parseAgentDefinition('test-plugin', 'architect.yaml', yamlAgentContent)
console.log('Parsed YAML:', parsedYaml)
assert.strictEqual(parsedYaml.name, 'architecture-advisor')
assert.strictEqual(parsedYaml.displayName, 'Architecture Advisor')
assert.ok(parsedYaml.instructions.includes('You are an experienced software architect'))

console.log('--- 3. Testing compileSubagentsHubSkill (Hub Pattern) ---')
const testSkillsDir = join(process.cwd(), 'scratch', 'test_hub_skills')
rmSync(testSkillsDir, { recursive: true, force: true })
mkdirSync(testSkillsDir, { recursive: true })

const hubRes = compileSubagentsHubSkill('test-plugin', 'Test Plugin Kit', [parsedMd, parsedYaml], testSkillsDir)
console.log('Hub result:', hubRes)
assert.strictEqual(hubRes.skillName, 'test-plugin-agents')
assert.strictEqual(hubRes.subagentCount, 2)
assert.ok(existsSync(hubRes.skillPath), 'Hub SKILL.md file must exist')

const hubContent = readFileSync(hubRes.skillPath, 'utf8')
console.log('Hub SKILL.md preview:\n', hubContent.split('\n').slice(0, 20).join('\n'))

assert.ok(hubContent.includes('name: test-plugin-agents'))
assert.ok(hubContent.includes('Specialized autonomous subagents from Test Plugin Kit'))
assert.ok(hubContent.includes('### 1. `code-reviewer`'))
assert.ok(hubContent.includes('### 2. `architecture-advisor`'))
assert.ok(hubContent.includes('You are a senior code reviewer'))
assert.ok(hubContent.includes('You are an experienced software architect'))

console.log('--- 3.5 Testing Single Agent Naming Deduplication (dbs-chatroom-austrian case) ---')
const openaiStubContent = `
interface:
  display_name: "dbs-chatroom-austrian"
  short_description: "模拟哈耶克、米塞斯与 Claude 的奥派经济学对话，讨论问题并总结分歧"
  default_prompt: "使用 $dbs-chatroom-austrian，从奥派经济学视角讨论当前问题。"
`
const parsedStub = parseAgentDefinition('dbs-chatroom-austrian', 'openai.yaml', openaiStubContent)
assert.strictEqual(parsedStub.name, 'dbs-chatroom-austrian')
assert.strictEqual(parsedStub.displayName, 'dbs-chatroom-austrian')
assert.strictEqual(parsedStub.description, '模拟哈耶克、米塞斯与 Claude 的奥派经济学对话，讨论问题并总结分歧')

const testSingleDir = join(process.cwd(), 'scratch', 'test_single_skill')
rmSync(testSingleDir, { recursive: true, force: true })
mkdirSync(testSingleDir, { recursive: true })

const singleHubRes = compileSubagentsHubSkill('dbs-chatroom-austrian', 'Dbs chatroom austrian', [parsedStub], testSingleDir)
console.log('Single agent hub result:', singleHubRes)
assert.strictEqual(singleHubRes.skillName, 'dbs-chatroom-austrian-subagent', 'Must not duplicate plugin name into dbs-chatroom-austrian-dbs-chatroom-austrian')
assert.ok(!singleHubRes.skillName.includes('dbs-chatroom-austrian-dbs-chatroom-austrian'))
rmSync(testSingleDir, { recursive: true, force: true })

console.log('--- 4. Testing that NO files are created in .agent-presets ---')
const presetRoot = PRESET_ROOT()
console.log('Preset root is:', presetRoot)
if (existsSync(presetRoot)) {
  const entries = readdirSync(presetRoot)
  assert.ok(!entries.some(e => e.startsWith('test-plugin')), 'No test-plugin presets should exist')
}

// Clean up scratch test dir
rmSync(testSkillsDir, { recursive: true, force: true })

console.log('\n>>> Subagents Hub Architecture Unit Tests PASSED! <<<')
