<p align="center">
  <img src="assets/logo.svg" width="96" alt="Universal Plugin Hub logo">
</p>
<!-- Logo 占位：替换为项目 Logo 图片（建议 svg/png），保存为 assets/logo.svg -->

# Universal Plugin Hub

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek_Harness-4D6BFE)](https://github.com/topics/dsh)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的插件市场。在一个界面里浏览多个 Git 源的插件，一键安装，插件中的技能、子代理、MCP 连接器和 LSP 服务器自动接入 DSH。

![主界面总览](assets/hero.png)
<!-- 截图占位 #1（主图）：替换为插件市场浏览页全屏截图——顶部搜索框、源标签栏、分类过滤与插件卡片网格。保存为 assets/hero.png -->

## 它能做什么

Universal Plugin Hub 是 DSH 的可视化插件管理器。它克隆插件源（Anthropic 官方目录、社区仓库、任意 Git 仓库），列出每个插件实际提供的东西，再把它们接入 DSH：

- skills 和斜杠命令变成 agent 技能（`commands/` 镜像进 `skills/`，根目录的 `SKILL.md` 同样处理）
- 子代理编译成一个 Hub 技能（`skills/<plugin>-agents/`），交给 DSH 委派
- MCP 连接器写进 `cordis.patch.yml`，注册为 `@deepseek-ai/dsh-mcp-client`
- LSP 服务器注册为 `@deepseek-ai/dsh-lsp-stdio`。装完 `typescript-lsp` 重启 DSH，`lsp` 工具即可用
- hooks 通过为插件注册一条 `@deepseek-ai/dsh-hooks-claude-code` 桥加载，桥在 DSH 自家的拦截点上跑插件自带的 Claude Code `hooks.json`

## 功能

- **多源管理** — 自由添加或移除 Git 仓库作为插件源，内置 Anthropic 官方目录
- **源标签拖拽排序** — 按住源标签拖拽即可重排（拖到边缘会横向自动滚动，能到达最后一个标签）；顺序持久保存
- **搜索、过滤与排序** — 当前源内部模糊搜索，外加过滤与排序；悬停卡片可快速预览
- **技能与子代理扫描** — 自动识别插件中的 skills、斜杠命令和子代理定义，把子代理编译成 DSH 可委派的 Hub 技能
- **MCP 连接器** — 免认证的连接器装完即自动注册，需要认证的在管理页验证后启用；每个连接器还能按工具逐项开关
- **LSP 服务器** — 声明了 `lspServers` 的插件（clangd、pyright、typescript-lsp 等）安装时自动注册进 DSH，详情页带激活状态显示
- **Hooks** — 解析插件自带的 Claude/Codex `hooks.json`，通过 Claude hooks 桥加载到 DSH；详情页显示真正的事件（如 `SessionStart`、`PreToolUse: Bash`），而不是文件名
- **浅色 / 深色主题** — 跟随 DSH 界面主题

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

1. 打开面板。内置的 **Anthropic** 源默认已加载。
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