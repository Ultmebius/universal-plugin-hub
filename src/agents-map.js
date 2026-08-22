/**
 * Claude Code Agent Definitions → DSH Subagent Hub & Delegation Architecture.
 *
 * In Claude Code:
 * 1. commands/ (and explicit skills/) are user-facing slash commands (/commit, /review-pr).
 * 2. agents/ (agents/*.md, agents/*.yaml, agent.json) are autonomous subagent personas
 *    invoked internally by the orchestrator via tool delegation (subagent/Task), NOT spammed
 *    as dozens of top-level user slash commands.
 *
 * This adapter parses Claude subagent definitions and compiles a consolidated, high-fidelity
 * Subagent Hub Skill (`skills/<pluginName>-agents/SKILL.md`) for DSH.
 * DSH's primary model in Standard Mode reads the Hub Skill and autonomously delegates
 * complex tasks to the specialized subagents via DSH's native `@deepseek-ai/dsh-tool-subagent` tool,
 * completely avoiding slash command palette clutter, preset pollution, and naming collisions.
 */
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { dshHome } from './store.js'
import { safeSegment } from './market.js'

export const PRESET_ROOT = () => join(dshHome(), '.agent-presets')

/**
 * Legacy Preset Cleanup:
 * Removes any leftover top-level presets in ~/.dsh/.agent-presets created by earlier versions.
 */
export function cleanupLegacyPresets(pluginName) {
  try {
    const root = PRESET_ROOT()
    if (!existsSync(root)) return
    const prefix = pluginName ? `${pluginName}-` : ''
    for (const entry of readdirSync(root)) {
      if (!prefix || entry.startsWith(prefix) || entry === pluginName) {
        const dir = join(root, entry)
        rmSync(dir, { recursive: true, force: true })
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

/** Legacy alias for backward compatibility. */
export function removeConvertedPreset(id) {
  try {
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) return
    const dir = join(PRESET_ROOT(), id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  } catch {}
}

/**
 * Parse one Claude agent definition file (.yaml|.yml|.md|.json).
 *
 * @param {string} pluginName - Plugin name
 * @param {string} agentFile - Filename (e.g. 'code-reviewer.md')
 * @param {string} rawText - File contents
 * @returns {object|null} - Parsed agent descriptor or { error }
 */
export function parseAgentDefinition(pluginName, agentFile, rawText) {
  safeSegment(pluginName, 'plugin name')
  const cleanText = (rawText ?? '').trim()
  if (!cleanText) return null

  let doc = null
  let bodyContent = ''

  if (/\.json$/i.test(agentFile)) {
    try {
      doc = JSON.parse(cleanText)
      bodyContent = doc.prompt || doc.system_prompt || doc.instructions || doc.description || ''
    } catch {
      return { error: `${agentFile}: invalid JSON` }
    }
  } else if (/\.md$/i.test(agentFile)) {
    const match = cleanText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/)
    if (match) {
      try {
        doc = parseYaml(match[1]) || {}
        bodyContent = match[2] ? match[2].trim() : (doc.prompt || doc.system_prompt || doc.instructions || '')
      } catch {
        return { error: `${agentFile}: invalid Markdown frontmatter` }
      }
    } else {
      doc = { description: cleanText.slice(0, 160) }
      bodyContent = cleanText
    }
  } else {
    try {
      doc = parseYaml(cleanText)
      bodyContent = doc?.prompt || doc?.system_prompt || doc?.instructions || ''
    } catch {
      return { error: `${agentFile}: invalid YAML` }
    }
  }

  if (!doc || typeof doc !== 'object') return { error: `${agentFile}: empty agent definition` }

  const baseName = agentFile.replace(/\.(ya?ml|md|json)$/i, '')
  const iface = doc.interface && typeof doc.interface === 'object' ? doc.interface : {}
  const rawName = typeof doc.name === 'string' ? doc.name : (typeof iface.display_name === 'string' ? iface.display_name : baseName)
  const name = rawName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || baseName
  const displayName = typeof iface.display_name === 'string' ? iface.display_name : (typeof doc.name === 'string' ? doc.name : baseName)

  let description = typeof iface.short_description === 'string'
    ? iface.short_description
    : (typeof doc.description === 'string' ? doc.description : '')

  if (!description && bodyContent) {
    const firstLine = bodyContent.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
    if (firstLine) description = firstLine.trim().slice(0, 200)
  }
  if (!description) {
    description = `Specialized subagent for ${displayName} from ${pluginName}.`
  }

  const tools = doc.tools || doc.allowedTools || iface.tools || null
  const model = doc.model || null

  return {
    file: agentFile,
    name,
    displayName,
    description,
    tools: Array.isArray(tools) ? tools.join(', ') : (tools ? String(tools) : null),
    model: model ? String(model) : null,
    instructions: bodyContent || `You are ${displayName}, a specialized subagent for ${pluginName}.`,
  }
}

/**
 * Universal Semantic Domain Taxonomy for AI & Claude Subagents across ALL disciplines.
 * Covers Software, Cloud, Data, AI, Security, Testing, Design, Media, Writing, Marketing,
 * Finance, Legal, Healthcare, Ops, Open Source, and beyond.
 */
export const AGENT_DOMAINS = [
  // 1. Software & Languages
  {
    id: 'code-review',
    title: 'Code Review & Language Analysis',
    icon: '💻',
    description: 'Code review, syntax patterns, linting, code refactoring and language-specific best practices',
    patterns: [
      /\b(review|reviewer|reviewing|audit|lint|linter|style|pattern|idiom|syntax|refactor|refactoring|clean-code|simplifier|comment-analyzer|convention)\b/i,
      /\b(python|golang|go|java|javascript|typescript|ts|js|csharp|c#|cpp|c\+\+|swift|kotlin|rust|php|dart|ruby|scala|fsharp|f#|html|css|sql|vue|react|angular|svelte)[-_]?(reviewer|lint|style|pattern|refactor)/i,
    ],
  },
  // 2. Build & Runtime
  {
    id: 'build-troubleshoot',
    title: 'Build, Runtime & Troubleshooting',
    icon: '🔧',
    description: 'Build error diagnosis, runtime crash fixes, dependency troubleshooting and compiler issue resolution',
    patterns: [
      /\b(build|resolver|compiler|compile|error|bug|crash|fault|troubleshoot|troubleshooter|fix|repair|diagnos|diagnosis|exception|stacktrace|log-analyzer|patcher|healthcheck)\b/i,
      /\b(python|golang|go|java|javascript|typescript|ts|js|csharp|cpp|swift|kotlin|rust|php|dart|fsharp|django|fastapi|harmonyos)[-_]?(build|resolver|fixer)/i,
    ],
  },
  // 3. Architecture & Modularity
  {
    id: 'architecture-design',
    title: 'System Architecture & Modularity',
    icon: '🏛️',
    description: 'System modularity, service boundaries, architecture review, RFC specs and technical planning',
    patterns: [
      /\b(architect|architecture|design|modularity|boundary|boundaries|system-design|infrastructure|diagram|rfc|spec|homelab|network-architect|chief-of-staff|a11y-architect)\b/i,
    ],
  },
  // 4. Performance & Profiling
  {
    id: 'performance-optimization',
    title: 'Performance, Speed & Profiling',
    icon: '⚡',
    description: 'Latency profiling, memory leak detection, resource tuning, query optimization and throughput boosting',
    patterns: [
      /\b(perform|performance|optimizer|optimize|optimization|profiler|profile|profiling|speed|fast|latency|throughput|memory-leak|leak|tuning|tuner|cache|caching|benchmark|harness-optimizer)\b/i,
    ],
  },
  // 5. Security & Privacy
  {
    id: 'security-compliance',
    title: 'Security, Privacy & Compliance',
    icon: '🛡️',
    description: 'Security audits, vulnerability scanning, authentication, secrets sanitization and compliance checks',
    patterns: [
      /\b(security|secure|vuln|vulnerability|cve|owasp|auth|authentication|oauth|sanitizer|sanitize|firewall|guard|compliance|privacy|secret|token|encrypt|safety|penetration|risk)\b/i,
    ],
  },
  // 6. Database & Storage
  {
    id: 'database-data',
    title: 'Database, Storage & Data Analytics',
    icon: '🗄️',
    description: 'Database schema design, SQL queries, migrations, storage optimization, data pipelines and analytics',
    patterns: [
      /\b(database|db|sql|postgres|mysql|sqlite|mongo|redis|prisma|orm|migration|schema|storage|data|dataset|etl|mle|analytics|bi|warehouse|snowflake|databricks)\b/i,
    ],
  },
  // 7. Testing & QA
  {
    id: 'testing-qa',
    title: 'Testing, QA & Verification',
    icon: '🧪',
    description: 'Unit testing, integration testing, E2E test suites, QA evaluation, grading and assertion verifications',
    patterns: [
      /\b(test|tester|testing|e2e|e2e-runner|qa|quality|assert|assertion|eval|evaluator|evaluation|grading|mock|stub|suite|regression|ui-tester|unit-test|coverage)\b/i,
    ],
  },
  // 8. Cloud & DevOps
  {
    id: 'network-cloud-ops',
    title: 'Network, Cloud & DevOps Infrastructure',
    icon: '🌐',
    description: 'Network configuration, cloud orchestration, container management, networking diagnostics and CI/CD ops',
    patterns: [
      /\b(network|networking|cloud|aws|azure|gcp|k8s|kubernetes|docker|container|devops|deploy|deployment|cluster|router|dns|server|loop-operator|sysadmin|zero-downtime|terraform|ansible|sre)\b/i,
    ],
  },
  // 9. AI & Autonomous Workflows
  {
    id: 'ai-workflows',
    title: 'AI, Model Planning & Autonomous Workflows',
    icon: '🤖',
    description: 'Autonomous generation, multi-stage planning, GAN pipelines, workflow synthesis and agent orchestration',
    patterns: [
      /\b(gan|generator|gan-generator|gan-planner|gan-evaluator|planner|planning|agent-evaluator|prompt|workflow|workflow-automator|orchestrat|autonomous|coordinator|llm|deeplearning|neural|cognitive)\b/i,
    ],
  },
  // 10. Design & Creative Media
  {
    id: 'design-uiux',
    title: 'Design, UI/UX & Visual Media',
    icon: '🎨',
    description: 'UI/UX interface design, layout wireframes, design tokens, color palettes, visual assets and typography',
    patterns: [
      /\b(design|designer|ui|ux|frontend|layout|wireframe|figma|palette|color|theme|visual|graphic|artwork|canvas|icon|typography|font|tailwind|css-in-js)\b/i,
    ],
  },
  // 11. Video & Audio Media
  {
    id: 'video-audio-media',
    title: 'Video, Audio & Multimedia Processing',
    icon: '🎬',
    description: 'Video editing, speech/audio synthesis, subtitle generation, transcription and multimedia stream processing',
    patterns: [
      /\b(video|film|movie|clip|record|obs|ffmpeg|render|capcut|premiere|vfx|motion|animation|reels|subtitle|caption|audio|voice|speech|tts|whisper|sound|music|podcast|vocal|elevenlabs)\b/i,
    ],
  },
  // 12. Writing, Docs & Knowledge
  {
    id: 'docs-writing-research',
    title: 'Writing, Documentation & Knowledge Synthesis',
    icon: '📝',
    description: 'Technical writing, documentation generation, markdown formatting, wiki maintenance and research summarization',
    patterns: [
      /\b(doc|docs|documentation|updater|doc-updater|lookup|docs-lookup|readme|wiki|manual|handbook|knowledge|writer|writing|copywriting|article|essay|blog|summary|summarizer|translate|translation|research|researcher)\b/i,
    ],
  },
  // 13. Marketing, Growth & Social Media
  {
    id: 'marketing-growth',
    title: 'Marketing, Growth & Social Outreach',
    icon: '📢',
    description: 'SEO strategy, social media campaigns, copywriting, advertising, outreach and audience growth',
    patterns: [
      /\b(market|marketing|growth|seo|social|outreach|campaign|ads|copywriter|ad-copy|newsletter|twitter|weibo|wechat|discord|xhs|viral|audience|brand|branding)\b/i,
    ],
  },
  // 14. Finance, Business, Legal & E-Commerce
  {
    id: 'finance-business-legal',
    title: 'Finance, Business, Legal & E-Commerce',
    icon: '📈',
    description: 'Financial analysis, accounting, tax estimation, legal contract review, e-commerce catalog and business analytics',
    patterns: [
      /\b(finance|financial|money|cash|invoice|billing|accounting|tax|taxation|ledger|coin|crypto|tokenomics|contract|legal|lawyer|clause|compliance-legal|shop|store|cart|commerce|ecommerce|product-catalog|pricing|revenue)\b/i,
    ],
  },
  // 15. Healthcare, Medical & Life Sciences
  {
    id: 'healthcare-medical',
    title: 'Healthcare, Medical & Life Sciences',
    icon: '🏥',
    description: 'Clinical summaries, medical diagnostics assistance, healthcare workflow analysis and bioinformatics',
    patterns: [
      /\b(health|healthcare|medical|medicine|clinical|clinic|doctor|patient|diagnosis|radiology|pathology|biotech|bioinformatics|pharma|pharmacy|drug|genomic|hipaa)\b/i,
    ],
  },
  // 16. Open Source & Release Delivery
  {
    id: 'opensource-packaging',
    title: 'Open Source, Packaging & Delivery',
    icon: '📦',
    description: 'Open source repository management, forking, packaging, distribution and artifact publishing',
    patterns: [
      /\b(opensource|open-source|forker|fork|packager|package|packaging|release|release-manager|publisher|publish|bundle|distribution|tarball|npm|pip|cargo|nuget)\b/i,
    ],
  },
]

/**
 * Dynamic Topic Extractor for unknown/exotic domains.
 * Generates an adaptive domain cluster name from agent title/words.
 */
function extractDynamicDomain(agent) {
  const raw = String(agent?.displayName || agent?.name || 'Specialist').trim()
  const clean = raw
    .replace(/[-_]+/g, ' ')
    .replace(/\b(agent|subagent|assistant|specialist|bot|tool|expert|helper|resolver|reviewer|advisor|manager)\b/gi, '')
    .trim()

  const topicName = clean.length > 2
    ? clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : raw

  return {
    id: `custom-${topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: `${topicName} Specialists`,
    icon: '🎯',
    description: `Domain-specific autonomous task specialists for ${topicName} and specialized workflows`,
  }
}

/**
 * Classify a subagent into its best-matching semantic domain (with universal multi-signal scoring + dynamic adaptive fallback).
 */
export function classifyAgent(agent) {
  const name = String(agent?.name || '').toLowerCase()
  const displayName = String(agent?.displayName || '').toLowerCase()
  const description = String(agent?.description || '').toLowerCase()
  const file = String(agent?.file || '').toLowerCase()
  const instructionsHead = String(agent?.instructions || '').slice(0, 300).toLowerCase()

  let bestDomain = null
  let highestScore = 0

  for (const domain of AGENT_DOMAINS) {
    let score = 0
    for (const pattern of domain.patterns) {
      if (pattern.test(name) || pattern.test(file)) score += 6
      if (pattern.test(displayName)) score += 4
      if (pattern.test(description)) score += 3
      if (pattern.test(instructionsHead)) score += 1
    }
    if (score > highestScore) {
      highestScore = score
      bestDomain = domain
    }
  }

  // Dynamic fallback: extract semantic topic if score is 0
  if (!bestDomain || highestScore === 0) {
    return extractDynamicDomain(agent)
  }

  return bestDomain
}

/**
 * Group a list of agents into active semantic domains.
 */
export function groupAgentsByDomain(agentsList) {
  if (!Array.isArray(agentsList) || agentsList.length === 0) return []

  const domainMap = new Map()

  for (const agent of agentsList) {
    const domain = classifyAgent(agent)
    if (!domainMap.has(domain.id)) {
      domainMap.set(domain.id, { domain, agents: [] })
    }
    domainMap.get(domain.id).agents.push(agent)
  }

  // Sort domains: defined order first, then count descending
  return Array.from(domainMap.values()).sort((a, b) => b.agents.length - a.agents.length)
}

/**
 * Generate Level 1 Frontmatter description with high-density domain clustering.
 */
export function generateLevel1Description(pluginName, pluginDisplayName, agentsList, domainGroups) {
  const title = pluginDisplayName || pluginName
  const count = agentsList.length

  if (count === 1) {
    const a = agentsList[0]
    const cleanDesc = a.description ? `: ${a.description.slice(0, 100)}` : ''
    return `Specialized autonomous agent for ${a.displayName}${cleanDesc}. Use when task matches ${a.name}. MANDATORY: Proactively delegate to this subagent using DSH's subagent tool.`
  }

  if (count <= 3) {
    const listStr = agentsList.map((a) => a.displayName).join(', ')
    return `Specialized autonomous subagents from ${title} (${listStr}). Use when encountering matching domain tasks. MANDATORY: Proactively delegate execution via DSH's subagent tool.`
  }

  // Multi-agent (4+ to 100+ agents): high-density semantic domain clustering
  const topDomainNames = domainGroups
    .slice(0, 4)
    .map((g) => g.domain.title.split('&')[0].trim())
    .join(', ')

  return `Autonomous subagent suite from ${title} (${count} specialist roles) covering: ${topDomainNames}, and more. Use when user requests matching domain tasks. MANDATORY: Proactively delegate matching execution to the respective subagent via DSH's subagent tool.`
}

/**
 * Compile a set of Claude subagents into a clean, consolidated DSH Subagent Hub Skill.
 *
 * @param {string} pluginName - Plugin name
 * @param {string} pluginDisplayName - Display title
 * @param {Array<object>} agentsList - List of parsed agent descriptors
 * @param {string} skillsDir - Target skills/ directory for the plugin
 * @returns {object} - { skillName, skillPath, command, subagentCount }
 */
export function compileSubagentsHubSkill(pluginName, pluginDisplayName, agentsList, skillsDir) {
  safeSegment(pluginName, 'plugin name')
  if (!agentsList || agentsList.length === 0) return null

  const isSingle = agentsList.length === 1
  const subName = (agentsList[0]?.name || '').toLowerCase()
  let skillName
  if (isSingle) {
    if (!subName || subName === pluginName.toLowerCase()) {
      skillName = `${pluginName}-subagent`
    } else if (subName.startsWith(`${pluginName.toLowerCase()}-`)) {
      skillName = subName
    } else {
      skillName = `${pluginName}-${subName}`
    }
  } else {
    skillName = `${pluginName}-agents`
  }
  const hubDir = join(skillsDir, skillName)
  mkdirSync(hubDir, { recursive: true })
  const hubFile = join(hubDir, 'SKILL.md')

  const domainGroups = groupAgentsByDomain(agentsList)
  const descText = generateLevel1Description(pluginName, pluginDisplayName, agentsList, domainGroups)

  const lines = [
    '---',
    `name: ${skillName}`,
    `description: ${yamlScalar(descText)}`,
    '---',
    '',
    `# ${pluginDisplayName || pluginName} — Specialized Subagents Hub`,
    '',
    `> **Plugin**: \`${pluginName}\` | **Specialist Subagents**: ${agentsList.length} roles across ${domainGroups.length} semantic domains`,
    '> **Execution Model**: Autonomous task-level subagent delegation via DSH `@deepseek-ai/dsh-tool-subagent` (`subagent`).',
    '',
    '## ⚡ Autonomous Subagent Delegation Protocol (MANDATORY)',
    '',
    'When the user requests complex or domain-specific work matching any of the specialized subagents listed below:',
    '1. **DO NOT** attempt to perform the specialized task yourself with general tools if a specialized subagent exists.',
    '2. **PROACTIVELY DELEGATE**: Immediately invoke DSH\'s native `subagent` tool.',
    '3. **Parameter Construction**:',
    '   - `description`: `"[Subagent Name] - [Brief task summary]"` (e.g. `"go-reviewer - Review Go concurrency code"`).',
    '   - `prompt`: Combine the **Subagent System Prompt** provided below with the specific user task context, file paths, requirements, and diffs.',
    '   - `run_in_background`: `false` (default for synchronous analysis) or `true` (for parallel background exploration).',
    '4. **Synthesize & Report**: When the subagent execution finishes, review its findings and present a clean, structured report to the user.',
    '',
    '## 🗺️ Categorized Subagent Routing Index',
    '',
  ]

  // Level 2: Categorized Routing Index Table
  for (const group of domainGroups) {
    lines.push(`### ${group.domain.icon} ${group.domain.title} (${group.agents.length} roles)`)
    lines.push(`> ${group.domain.description}`)
    lines.push('')
    lines.push('| Subagent | Role / Display Name | Primary Focus & Capabilities | Recommended Tools | Model |')
    lines.push('| :--- | :--- | :--- | :--- | :--- |')
    for (const a of group.agents) {
      const toolStr = a.tools ? `\`${a.tools}\`` : '`default`'
      const modelStr = a.model ? `\`${a.model}\`` : '`default`'
      const cleanDesc = (a.description || 'Specialist subagent').replace(/\|/g, '\\|')
      lines.push(`| \`${a.name}\` | **${a.displayName}** | ${cleanDesc} | ${toolStr} | ${modelStr} |`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## 📋 Detailed Subagent Roles & System Prompts')
  lines.push('')

  let globalIndex = 1
  for (const group of domainGroups) {
    lines.push(`### ${group.domain.icon} ${group.domain.title}`)
    lines.push('')
    for (const a of group.agents) {
      lines.push(`#### ${globalIndex}. \`${a.name}\` — ${a.displayName}`)
      lines.push(`- **Role Summary**: ${a.description}`)
      if (a.tools) lines.push(`- **Recommended Tools**: ${a.tools}`)
      if (a.model) lines.push(`- **Preferred Model Tier**: ${a.model}`)
      lines.push(`- **Source Definition**: \`agents/${a.file}\``)
      lines.push('')
      lines.push('##### Subagent System Prompt for Delegation:')
      lines.push('```markdown')
      lines.push(a.instructions)
      lines.push('```')
      lines.push('')
      globalIndex++
    }
  }

  writeFileSync(hubFile, lines.join('\n'), 'utf8')

  return {
    skillName,
    skillPath: hubFile,
    command: `/${skillName}`,
    subagentCount: agentsList.length,
    domainCount: domainGroups.length,
  }
}

/**
 * Backward compatibility helper: compile single agent or hub.
 */
export function compileAgentToSkill(pluginName, agentFile, rawText, skillsDir) {
  const parsed = parseAgentDefinition(pluginName, agentFile, rawText)
  if (!parsed || parsed.error) return parsed
  return compileSubagentsHubSkill(pluginName, pluginName, [parsed], skillsDir)
}

export function convertAgent(pluginName, agentFile, text, skillsDir) {
  return compileAgentToSkill(pluginName, agentFile, text, skillsDir)
}

function yamlScalar(value) {
  const text = String(value || '')
  if (/^[A-Za-z0-9 _./:-]+$/.test(text) && !text.includes('\n')) return text
  return JSON.stringify(text)
}

