# Universal Plugin Hub (Agent 插件市场) 架构设计与全栈实现全景规范

- **项目名称**：Universal Plugin Hub (`universal-plugin-hub`)
- **展示名称**：Agent 插件市场 / Universal Plugin Hub
- **版本号**：`v1.0.0-preview`
- **文档日期**：2026-08-22
- **规范等级**：权威实现指南与工程参考规范 (Authoritative Reference & Blueprint)
- **目标读者**：开发者、AI 智能体系统架构师、希望在其他技术栈中重实现本项目的工程师

---

## 目录 (Table of Contents)

1. [系统愿景与核心架构哲学 (Vision & Architecture Philosophy)](#1-系统愿景与核心架构哲学)
2. [总体系统架构与拓扑图 (System Architecture & Topology)](#2-总体系统架构与拓扑图)
3. [运行时数据与存储布局 (Runtime Storage & State Management)](#3-运行时数据与存储布局)
4. [核心引擎实现细节与算法 (Core Engines & Algorithms)](#4-核心引擎实现细节与算法)
   - 4.1 通用插件清单解析引擎 (`src/parser.js`)
   - 4.2 智能体 Hub 模式编译器与装配引擎 (`src/agents-map.js`)
   - 4.3 状态持久化与 mtime 感知零延迟缓存 (`src/store.js`)
5. [前端交互体系与现代视觉设计语言 (Frontend UI/UX & Visual Design)](#5-前端交互体系与现代视觉设计语言)
   - 5.1 现代玻璃拟态视觉系统 (Design Tokens)
   - 5.2 满帧渲染性能优化核心技术 (Performance)
   - 5.3 极简现代安装确认弹窗 (Modern Install Dialog)
   - 5.4 顶部源标签流体对齐与非线性动力学引擎 (Fluid Tab Geometry)
6. [五大 AI 扩展能力模型规范 (The 5 AI Extension Capabilities)](#6-五大-ai-扩展能力模型规范)
7. [跨语言重实现指南 (Step-by-Step Re-implementation Guide)](#7-跨语言重实现指南)
   - 7.1 Python 重构核心骨架
   - 7.2 TypeScript 重构核心骨架
8. [安全防线与边缘故障防御 (Security & Edge Cases)](#8-安全防线与边缘故障防御)

---

## 1. 系统愿景与核心架构哲学

Universal Plugin Hub 是面向下一代 AI 智能体操作系统（DeepSeek Harness / DSH）的高性能、跨生态扩展中心。它打破了传统单一生态的孤岛限制，将 **Claude Code 官方插件、MCP (Model Context Protocol) 协议连接器、Agent Skills 技能库、Subagents 专业子代理集合** 统一抽象为标准化的轻量级可插拔单元。

### 核心设计原则 (Architectural Tenets)

1. **非侵入与零污染 (Non-invasive & Zero-pollution)**：
   - 严禁向全局会话预设目录（`~/.dsh/.agent-presets`）注入非交互式专职文件；
   - 采用创新的 **Subagents Hub Pattern**，将插件内所有专业子代理聚合成一个轻量级调度中枢技能，主 Agent 通过底层 `subagent` 工具自律委派，按需调用。
2. **全动态实时热加载 (Zero-restart Hot Reloading)**：
   - 插件安装、卸载、状态切换（Toggle）、MCP 工具单项开关、参数热修改即时生效，无需重启宿主服务。
3. **多源泛化与智能嗅探 (Multi-source Adaptive Parsing)**：
   - 不仅支持标准 `marketplace.json` 清单，更能智能识别 Monorepo（插件仓库包含多个子插件）、单仓库根技能（Root `SKILL.md`）、标准 MCP 目录、以及 GitHub 裸仓库。
4. **按需拉取与零体积膨胀 (On-Demand Fetching)**：
   - 插件市场仅预置元数据索引，代码副本在用户点击安装时按需克隆拉取，彻底杜绝无谓的本地磁盘开销。
5. **现代 Web 流畅渲染性能 (Fluid Rendering & Multi-level Cache)**：
   - 利用 `content-visibility: auto`、`requestAnimationFrame` 防抖节流滚动遮罩、GPU Compositor 图层隔离、O(1) 矢量图标哈希缓存，在展示大量插件与高频滚动场景下保持流畅渲染。

---

## 2. 总体系统架构与拓扑图

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                DeepSeek Harness (DSH) GUI                               │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    Universal Plugin Hub (Preact Web Client / Micro-Frontend)       │  │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐ ┌──────────┐  │  │
│  │  │ Topbar & Search│ │ Category Tabs │ │  Plugin Grid  │ │ Detail Page │ │ManagePage│  │  │
│  │  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └──────┬──────┘ └────┬─────┘  │  │
│  │          └─────────────────┼─────────────────┴────────────────┼─────────────┘        │  │
│  │                            ▼                                  ▼                      │  │
│  │              [ REST API Client (/universal-plugin-hub/api)]│
│  └────────────────────────────┬──────────────────────────────────┬──────────────────────┘  │
└───────────────────────────────┼──────────────────────────────────┼─────────────────────────┘
                                │ HTTP (Same-Origin Protected)     │
┌───────────────────────────────▼──────────────────────────────────▼─────────────────────────┐
│                           Cordis Service Backend Runtime (Node.js)                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ routes.js (RESTful API Gateway + Binary Icon Sniffer Proxy)     │  │
│  └──────┬───────────────────────┬────────────────────────┬───────────────────────┬───────┘  │
│         ▼                       ▼                        ▼                       ▼          │
│  ┌───────────────┐       ┌───────────────┐        ┌───────────────┐       ┌──────────────┐  │
│  │   store.js    │       │   market.js   │        │   parser.js   │       │  install.js  │  │
│  │  mtime Cache  │       │ Git Clone/Pull│        │Universal Multi│       │Subagent Hub  │  │
│  │  State File   │       │ Lock & Cache  │        │Manifest Engine│       │MCP Injector  │  │
│  └──────┬────────┘       └───────┬───────┘        └───────┬───────┘       └──────┬───────┘  │
└─────────┼────────────────────────┼────────────────────────┼──────────────────────┼──────────┘
          ▼                        ▼                        ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               File System (~/.dsh/agent-skills/...)                         │
│  • state.json (authoritative store)   • market/<sourceId>/ (git clones)                     │
│  • installed/<pluginName>/            • icons/ (cached assets)                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 运行时数据与存储布局

所有持久化与缓存数据统一收敛在 `~/.dsh/agent-skills/claude-plugin-market/`，结构规范如下：

```
~/.dsh/agent-skills/claude-plugin-market/
├── state.json                          # 全局主状态清单（插件源配置、安装记录、开关状态）
├── market/                             # 插件源 Git 仓库缓存
│   ├── anthropic/                      # 官方源 (anthropics/claude-plugins-official)
│   │   ├── .claude-plugin/marketplace.json
│   │   └── plugins/
│   │       ├── code-review/
│   │       └── frontend-design/
│   └── remote/                         # 用户通过 URL 添加的第三方 Git 仓库
│       └── github-com-user-repo/
├── installed/                          # 已安装插件的实际副本目录
│   └── <plugin-name>/
│       ├── skills/                     # 插件原生技能 + 自动生成的 Hub 技能
│       │   ├── my-skill/SKILL.md
│       │   └── <plugin-name>-agents/   # Hub Pattern 自动生成的子代理集成中枢
│       │       └── SKILL.md
│       ├── agents/                     # 插件自带的 YAML / Markdown 原始子代理定义
│       │   ├── reviewer.yaml
│       │   └── architect.md
│       ├── .mcp.json                   # 插件的 MCP 服务器定义
│       └── plugin.json
└── icons/                              # 图标本地高速磁盘缓存池 (icon_<md5>.bin)
```

### `state.json` 数据结构规范

```json
{
  "version": 1,
  "sources": [
    {
      "id": "anthropic",
      "name": "Anthropic",
      "url": "https://github.com/anthropics/claude-plugins-official.git",
      "builtin": true,
      "addedAt": 1771234567890
    }
  ],
  "plugins": [
    {
      "name": "code-reviewer-pro",
      "sourceId": "anthropic",
      "installedAt": 1771234900000,
      "enabled": true,
      "version": "1.2.0"
    }
  ]
}
```

---

## 4. 核心引擎实现细节与算法

### 4.1 通用插件清单解析引擎 (`src/parser.js`)

解析引擎负责自适应扫描并提取各类插件元信息，核心包含**五级清单回退机制**与 **YAML 折叠标量原生提取**：

```javascript
/**
 * 从 Markdown / YAML 中精准提取描述（支持 YAML 折叠多行标量 > 与 |）
 */
function extractMdDescription(text) {
  if (!text) return ''
  // 1. 优先解析 YAML Frontmatter
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    try {
      const parsed = parseYaml(fmMatch[1])
      if (parsed && typeof parsed === 'object') {
        const desc = parsed.description || parsed.desc || parsed.summary || parsed.about
        if (typeof desc === 'string' && desc.trim()) {
          return desc.trim().replace(/\r?\n+/g, ' ').slice(0, 300)
        }
      }
    } catch {}
    const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m)
    if (descMatch) {
      const val = descMatch[1].trim().replace(/^["']|["']$/g, '')
      if (val && !['>', '|', '>-', '|-'].includes(val)) {
        return val.slice(0, 300)
      }
    }
  }
  // 2. 正文首个非标题、非引用段落回退
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('![') && !trimmed.startsWith('>') && !trimmed.startsWith('```')) {
      return trimmed.slice(0, 300)
    }
  }
  return ''
}
```

#### 清单智能识别探测链 (Detection Priority Chain)
1. `.claude-plugin/marketplace.json` / `marketplace.json`（Claude 官方规范）
2. `claude-plugins.json` / `registry.json` / `catalog.json`（社区规范）
3. `mcp-servers.json` / `servers.json`（MCP 目录规范）
4. **Monorepo 目录探测**：自动扫描 `plugins/*`、`skills/*`、`packages/*` 子目录
5. **单仓库独立形态探测**：若根目录包含 `SKILL.md`、`plugin.json`、`package.json`，自动提升包装为独立插件。

---

### 4.2 智能体 Hub 模式编译器与装配引擎 (`src/agents-map.js`)

当插件包含多个 Agent（如 `agents/reviewer.yaml`、`agents/tester.md`）时，传统方式往往会直接复制进全局预设，造成会话预设列表严重拥堵。
**Hub 编译架构**将所有子代理编译为一个统一的 Hub 技能（`/${pluginName}-agents`）：

```javascript
/**
 * 编译 Subagents Hub 技能文件
 * @param {string} pluginName - 插件名称
 * @param {string} pluginDisplayName - 显示名称
 * @param {Array<AgentDef>} agentsList - 子代理列表
 * @param {string} skillsDir - 目标 skills 目录
 */
export function compileSubagentsHubSkill(pluginName, pluginDisplayName, agentsList, skillsDir) {
  const skillName = `${pluginName}-agents`
  const hubDir = join(skillsDir, skillName)
  mkdirSync(hubDir, { recursive: true })
  const hubFile = join(hubDir, 'SKILL.md')

  // 1. 语义领域自动分类聚类 (Domain Clustering)
  const domainGroups = clusterAgentsByDomain(agentsList)

  // 2. 构建结构化 SKILL.md，包含：
  //   - YAML Frontmatter (智能触发意图)
  //   - 委派协议说明 (Autonomous Delegation Protocol)
  //   - 结构化子代理路由索引表 (Categorized Routing Index)
  //   - 每个子代理的完整 System Prompt 与工具约束
  const lines = [
    '---',
    `name: ${skillName}`,
    `description: "Specialized autonomous subagents from ${pluginDisplayName}. MANDATORY: Proactively delegate execution via DSH's subagent tool."`,
    '---',
    `# ${pluginDisplayName} — Specialized Subagents Hub`,
    // ...
  ]

  writeFileSync(hubFile, lines.join('\n'), 'utf8')
  return { skillName, skillPath: hubFile, command: `/${skillName}` }
}
```

---

### 4.3 状态持久化与 mtime 感知零延迟缓存 (`src/store.js`)

为了消除高频接口的磁盘 JSON.parse 开销，数据层设计了基于文件修改时间戳（`mtimeMs`）的内存穿透缓存：

```javascript
let STATE_CACHE = null
let STATE_CACHE_MTIME = 0

export function readState() {
  const path = statePath()
  if (!existsSync(path)) return defaultState()
  
  const stat = statSync(path)
  // 若文件未被外部篡改，直接 0ms 返回内存缓存
  if (STATE_CACHE && STATE_CACHE_MTIME === stat.mtimeMs) {
    return STATE_CACHE
  }
  
  const raw = readFileSync(path, 'utf8')
  STATE_CACHE = JSON.parse(raw)
  STATE_CACHE_MTIME = stat.mtimeMs
  return STATE_CACHE
}

export function writeState(state) {
  const path = statePath()
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmp, path) // 原子写保证并发安全
  STATE_CACHE = state
  STATE_CACHE_MTIME = statSync(path).mtimeMs
}
```

---

## 5. 前端交互体系与现代视觉设计语言

### 5.1 现代玻璃拟态视觉系统 (Design Tokens)

前端采用 CSS 变量与现代设计语言，完美适配浅色（Light）与深色（Dark）模式：

```css
:root {
  --cpm-bg: rgba(255, 255, 255, 0.72);
  --cpm-modal-bg: rgba(255, 255, 255, 0.88);
  --cpm-text: #18181b;
  --cpm-text-sub: #52525b;
  --cpm-muted: #71717a;
  --cpm-border: rgba(0, 0, 0, 0.08);
  --cpm-accent: #2563eb;
  --cpm-pill-bg: #e4e4e7;
  --cpm-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.cpm-dark {
  --cpm-bg: rgba(24, 24, 27, 0.72);
  --cpm-modal-bg: #202023;
  --cpm-text: #f4f4f5;
  --cpm-text-sub: #a1a1aa;
  --cpm-muted: #71717a;
  --cpm-border: rgba(255, 255, 255, 0.1);
  --cpm-accent: #3b82f6;
  --cpm-pill-bg: #27272a;
  --cpm-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4);
}
```

---

### 5.2 满帧渲染性能优化核心技术

1. **`requestAnimationFrame` 防抖滚动遮罩**：
   通过 `gridMaskRafRef` 将滚动容器的顶部/底部羽化遮罩计算限制在每帧 1 次，避免 Layout Thrashing。
2. **`content-visibility: auto` DOM 裁剪**：
   对于未进入视口的插件卡片，浏览器跳过布局计算，在渲染大量插件卡片时显著降低首屏布局开销。
3. **`BADGE_CACHE` O(1) 矢量图标索引**：
   全局 64 款 Lucide 图标的名称匹配与哈希计算缓存进 `Map`，Tab 切换与搜索过滤命中缓存时无需重复计算。

---

### 5.3 极简现代安装确认弹窗 (Modern Install Dialog)

确认弹窗采用极简排版，仅保留图标、名称、作者、描述与操作按钮：

```
┌────────────────────────────────────────────────────────┐
│  [ 图标 ]  安装 Adobe for creativity                   │
│           by Adobe                                     │
│                                                        │
│  Harness Adobe's creative AI-powered tools to edit     │
│  images, automate design workflows, and bring         │
│  creative visions to life...                           │
│                                                        │
│                                 [ 取消 ]  [ 确认安装 ]  │
└────────────────────────────────────────────────────────┘
```

---

### 5.4 顶部源标签流体对齐与非线性动力学引擎 (Fluid Tab Geometry)

顶部插件源 Tab 栏在有限宽度下具备完整的自适应对齐与非线性流体动力学表现：

1. **边缘羽化遮罩 (Feather Gradient Masks)**：
   * **左侧羽化**：`20px` 线性渐变（`transparent 0 -> #000 20px`）；
   * **右侧羽化**：`24px` 线性渐变（`#000 calc(100% - 24px) -> transparent 100%`）；
   * **类名切换与重绘消除**：通过 `classList`（`mask-left`, `mask-right`, `mask-both`）纯样式切换，避免 Preact 全量重渲染。
2. **非线性流体减速曲线 (Cubic Ease-Out)**：
   * 平滑滚动采用三次缓出插值：`easeOut(t) = 1 - (1 - t)^3`，行程响应迅捷、收尾平缓。
3. **单向推进目标锁定机制 (Destination Target Lock)**：
   * 跟踪 `currentTabTarget`，在连续点击或组件二次重排时保持目标锁定，避免因中途瞬态坐标干扰引起的来回抖动。
4. **行程判定与留白安全几何学**：
   * **右向溢出（向左滑动）**：触发阈值为 `tabRight > currentScroll + containerWidth - 28`，位移目标为 `tabRight - containerWidth + 26`；
   * **左向溢出（向右滑动）**：触发阈值为 `tabLeft < currentScroll + 26`；位移目标为 `Math.max(0, tabLeft - 26)`，前部标签自然归零，其余标签保持 `26px` 留白安全间距。
5. **滚轮横向滚动 (Wheel-to-Horizontal)**：
   * 滚轮事件将纵向增量直接映射为标签栏横向滚动（`scrollLeft + delta`），钳制在滚动边界内，滚动后即时更新羽化遮罩。

---

## 6. 五大 AI 扩展能力模型规范

| 能力类型 | 载体格式 | DSH 运行机制 | 用户唤起方式 |
| :--- | :--- | :--- | :--- |
| **Skills** | `skills/*/SKILL.md` / `commands/*.md` | 注册进 DSH 技能扫描目录，实时注入系统提示词 | 对话中输入 `/command` 或由模型自动选择执行 |
| **Subagents** | `agents/*.yaml` / `agents/*.md` | 由 Hub Compiler 编译为 `/${plugin}-agents` 技能 | 主模型通过 `subagent` 工具自律委派调用 |
| **Connectors** | `.mcp.json` / `server.json` | 挂载到 DSH MCP 客户端，提供工具与资源接入 | 模型根据 Tool Schema 自动按需调用 |
| **Hooks** | 插件清单 `hooks` 字段（指向 `hooks.json`），或 `hooks/hooks.{json,yaml,yml}`，或 `hooks/*-hooks.{json,yaml}` | Hub 安装时 `scripts/postinstall.js` 把桥插件 + 其 `dsh-hook-protocol` 协议包按 DSH 发版线（major.minor）预先装进 DSH 运行时；之后单插件安装只需往 `cordis.patch.yml` 写一条 `@deepseek-ai/dsh-hooks-claude-code` 条目，桥在 DSH 拦截点上运行原生 `hooks.json`（支持 `SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Stop` / `SubagentStart` / `SubagentStop`） | 自动化静默执行 |
| **Prompts** | `prompts/*.md` / `prompts/*.yaml` | 结构化提示词模板 | 知识库引用与模板代入 |

---

## 7. 跨语言重实现指南

按照以下模块化步骤，可以在 Python 或 TypeScript 技术栈中独立实现本插件：

### 7.1 Python 重构核心骨架 (FastAPI + Pydantic)

```python
# python_backend/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import json, os, yaml

app = FastAPI(title="Universal Plugin Hub")

STATE_PATH = os.path.expanduser("~/.dsh/agent-skills/claude-plugin-market/state.json")

def read_state():
    if not os.path.exists(STATE_PATH):
        return {"version": 1, "sources": [], "plugins": []}
    with open(STATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/universal-plugin-hub/api/state")
def get_state():
    return read_state()

@app.post("/universal-plugin-hub/api/plugins/install")
def install_plugin(req: dict):
    # 1. 下载或复制插件目录至 installed/<name>
    # 2. 扫描 skills/ 并注册扫描目录
    # 3. 若有 agents/ 则调用 Hub 编译器生成 SKILL.md
    # 4. 若有 .mcp.json 则注册到 MCP 客户端
    # 5. 更新 state.json 并返回结果
    return {"ok": True, "skillsCount": 3, "connectorsCount": 1}
```

### 7.2 TypeScript 重构核心骨架

```typescript
// ts_backend/src/parser.ts
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface PluginManifest {
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  author?: string;
  skills?: string[];
  mcpServers?: Record<string, any>;
}

export function parseSkillMarkdown(filePath: string): { name: string; description: string } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const parsed = yaml.load(fmMatch[1]) as any;
    return {
      name: parsed?.name || path.basename(path.dirname(filePath)),
      description: parsed?.description || '',
    };
  }
  return { name: path.basename(filePath, '.md'), description: '' };
}
```

---

## 8. 安全防线与边缘故障防御

1. **路径穿越防御 (Directory Traversal Prevention)**：
   所有来自客户端的 `sourceId` 与 `pluginName` 必须经由 `safeSegment()` 校验，严格过滤 `..`、`/`、`\` 与特殊注入字符。
2. **Same-Origin 请求隔离**：
   写操作（POST / DELETE）强制校验 `Sec-Fetch-Site` 与 `Origin`，防止 CSRF 跨站脚本伪造。
3. **并发写锁与原子操作**：
   使用 `.tmp` + `renameSync` 机制确保写 `state.json` 具备 POSIX 原子性，防止多任务并发导致数据损坏。
4. **前端渲染安全**：
   所有来自外部仓库的元数据与 Markdown 文本均由内置解析器切分为结构化节点，经 Preact 文本节点渲染（自动转义），全程不使用 innerHTML 拼接。
