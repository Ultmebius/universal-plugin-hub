# Universal Plugin Hub

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek_Harness-4D6BFE)](https://github.com/topics/dsh)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的插件市场。内置 Claude 官方插件目录，打开即可浏览；任意 Git 仓库可添加为插件源——一键安装，技能、子代理、MCP 连接器、LSP 服务器与 hooks 自动接线。

![Universal Plugin Hub overview](assets\hero.png)

## 它能做什么

Universal Plugin Hub 是 DSH 的可视化插件管理器。开箱内置 Claude 官方插件目录，社区仓库或任意 Git 源随时可加；它列出每个插件实际提供的东西，再把它们接入 DSH：

- skills 和斜杠命令变成 agent 技能（`commands/` 镜像进 `skills/`，根目录的 `SKILL.md` 同样处理）
- 子代理编译成一个 Hub 技能（`skills/<plugin>-agents/`），交给 DSH 委派
- MCP 连接器写进 `cordis.patch.yml`，注册为 `@deepseek-ai/dsh-mcp-client`
- LSP 服务器注册为 `@deepseek-ai/dsh-lsp-stdio`。装完 `typescript-lsp` 重启 DSH，`lsp` 工具即可用
- hooks 通过为插件注册一条 `@deepseek-ai/dsh-hooks-claude-code` 桥加载，桥在 DSH 自家的拦截点上跑插件自带的 Claude Code `hooks.json`

## 功能

**市场与浏览**

- **开箱即用** — 内置 Claude 官方插件目录（`anthropics/claude-plugins-official`），打开即可浏览，无需任何配置
- **自带插件源** — 可添加 Git 仓库作为插件源；添加前先试克隆并统计插件数量，无效地址不会进入源列表
- **标签拖拽排序** — 按住源标签随意拖动：浮影跟随指针、相邻标签实时让位，拖到边缘还会自动滚动，最后一个标签也能到达；顺序持久保存
- **流体标签栏** — 鼠标滚轮直接横滚标签栏，两端羽化提示还有更多标签，快速连点也不抖动（缓出滚动 + 目标锁定）
- **点标签即回顶部** — 切换源时网格平滑回到顶部，并把新装的插件重排到前面；每个源各自记忆浏览位置
- **六层模糊搜索** — 精确、前缀、子串、多词、子序列、作者/描述逐级打分，全程忽略分隔符；工具栏还可过滤与排序
- **悬停即预览** — 不用点进详情，卡片弹层先给你描述与分类

**安装与接线**

- **一键安装，全线接通** — 安装时自动镜像 skills 与斜杠命令、把子代理编译成单个可委派的 Hub 技能、把 MCP 连接器 / LSP 服务器 / Claude 与 Codex hooks 写入 `cordis.patch.yml`
- **看清插件带什么** — 详情页列出 skills、子代理与 prompts；连接器显示实时连接状态，LSP 服务器带激活圆点，hooks 显示真实事件名（`SessionStart`、`PreToolUse: Bash`）
- **LSP 预检** — 语言服务器不在 PATH 时拒绝注册并给出修复提示，不会拖垮 DSH 启动
- **同名即替换** — 重复安装干净覆盖；不同源的同名插件自动取代旧记录

**管理**

- **实时启停** — 插件与连接器就地开关，无需重启
- **MCP 工具级开关** — 悬停工具查看描述与参数，点击状态徽标即可禁用/恢复该工具
- **连接器授权台** — 8 秒真连探测验证令牌（远程 HTTP/SSE 与本地 stdio 均可），按连接器保存 Token、URL、自定义头、环境变量、参数或 OAuth
- **版本感知的更新** — 检测到新版本更新按钮才亮起，悬停显示目标版本号
- **干净的卸载** — 一次确认即移除插件副本、技能注册、patch 条目与工具缓存

**界面**

- **专门调校的双主题** — 完整设计令牌按明暗分别调校，自动跟随 DSH 界面主题
- **秒开** — 源与市场清单本地缓存，新数据加载前面板即可操作
- **图标缓存管线** — 头像经本地磁盘缓存代理加载；没有头像的插件按名称散列出 64 款矢量徽章
- **满帧流畅** — 视口外卡片跳过布局（`content-visibility`），滚动遮罩每帧至多计算一次

## 环境要求

- Node.js 18+
- 带 `web` profile 的 DSH（建议 0.1.0-rc.6 以上）。Hub 自身安装（`dsh plugin add universal-plugin-hub`）时跑一段 `postinstall` 脚本，把 5 个 LSP / hooks 宿主包预先装进 DSH 运行时——版本按当前 DSH 发版线匹配，安装失败直接让 hub 安装失败。装好之后，声明了 LSP 服务器或 Claude/Codex hooks 的插件只需单次 `cordis.patch.yml` 写入就能挂上（DSH HMR 约 1 秒内拾起）。

## 数据位置

所有 Hub 状态统一放在 `~/.dsh/agent-skills/universal-plugin-hub/`：

- `state.json` — 插件源、已装插件记录及其顺序
- `market/<sourceId>/` — 各插件源的浅克隆（`git clone --depth 1`）
- `market/remote/` — 从远程 URL 安装的插件仓库克隆
- `installed/<name>/` — 每个已装插件的工作副本（skills、agents、connectors）
- `icons/` — 插件图标本地缓存，经 Hub 的 `/icon` 代理提供

连接器、LSP、hooks 通过写 DSH 的 cordis patch（`$DSH_HOME/profiles/web/cordis.patch.yml`）注册；MCP 工具级开关存于 `~/.dsh/.mcp-tools-state.json`。

## 安装

### 从 DSH 插件市场

在 DSH 内置插件市场中搜索 **Universal Plugin Hub**，点击安装。

### 命令行

```sh
dsh plugin add universal-plugin-hub
```

### 手动安装

```sh
cd ~/.dsh/plugins
git clone https://github.com/CaesarEmperor/universal-plugin-hub.git
cd universal-plugin-hub
npm install
```

装完重启 DSH，从 DSH 界面打开 Universal Plugin Hub 面板。

## 快速上手

1. 打开面板——Claude 官方插件目录已加载完毕，直接浏览或搜索，无需配置。
2. 可选：添加其他源，例如 `anthropics/claude-plugins-community`。
3. 浏览或搜索。点开插件看它带什么：技能、子代理、连接器、LSP 服务器。
4. 点 **Install**。Hub 复制插件、注册技能和子代理、把 LSP 服务器和 Claude/Codex hooks 接入 DSH、自动接上无需配置的连接器。
5. 在管理页管理已装插件：启用或禁用、开关连接器与单个 MCP 工具、验证授权、更新、卸载。

![安装对话框](assets/install-flow.png)
<!-- 截图占位 #2（安装）：替换为安装确认对话框，或某个已装插件管理页的截图。保存为 assets/install-flow.png -->

## 项目结构

```
src/      服务端：REST 路由、市场解析、git 操作、agents 编译、安装生命周期
client/   前端——单文件 React，由 DSH 客户端运行时加载（无构建步骤）
scripts/  postinstall——把 5 个 LSP / hooks 宿主包预装进 DSH
```

## 开发

```sh
npm install
node --check src/index.js
node --check client/client.js
node scratch/verify-lsp-support.mjs   # 用临时 DSH_HOME 做端到端验证
```

前端是单文件 React，由 DSH 客户端运行时加载（`dsh-client-runtime` 和 `dsh-client-ui-theme` 由宿主注入），没有构建步骤。改完 `client/client.js` 直接刷新。

## 支持

问题或需求请到 [GitHub Issues](https://github.com/CaesarEmperor/universal-plugin-hub/issues) 提交。

## 贡献

欢迎 PR。改动保持最小，动过的文件跑一遍 `node --check`；涉及服务端行为的改动，扩展 `scratch/verify-lsp-support.mjs` 做端到端覆盖。

## 协议

[MIT](./LICENSE) © CaesarEmperor