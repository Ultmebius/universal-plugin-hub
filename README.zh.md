# Universal Plugin Hub

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek_Harness-4D6BFE)](https://github.com/topics/dsh)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的插件市场。内置 Claude 官方插件目录，打开即可浏览；支持添加 Git 仓库作为插件源——一键安装，技能、子代理、MCP 连接器、LSP 服务器与 hooks 自动接线。

![主界面总览](assets/hero.png)
<!-- 截图占位 #1（主图）：替换为插件市场浏览页全屏截图——顶部搜索框、源标签栏与插件卡片网格。保存为 assets/hero.png -->

## 它能做什么

Universal Plugin Hub 给 DSH 带来一个**图形化的插件市场**。内置 **Claude 官方插件目录**：打开面板、选中插件、点一下安装，装完就能在 DSH 里直接用；也可以添加 Git 仓库作为插件源，用同样的方式安装里面的插件。

安装插件时，Hub 会自动把这些能力接进 DSH：

- skills 和斜杠命令变成 agent 技能（`commands/` 镜像进 `skills/`，根目录的 `SKILL.md` 同样处理）
- 子代理编译成一个 Hub 技能（`skills/<plugin>-agents/`），交给 DSH 委派
- MCP 连接器写进 `cordis.patch.yml`，注册为 `@deepseek-ai/dsh-mcp-client`
- LSP 服务器注册为 `@deepseek-ai/dsh-lsp-stdio`。装完 `typescript-lsp` 重启 DSH，`lsp` 工具即可用
- hooks 通过为插件注册一条 `@deepseek-ai/dsh-hooks-claude-code` 桥加载，桥在 DSH 自家的拦截点上跑插件自带的 Claude Code `hooks.json`

## 功能

**市场与浏览**

- **内置目录** — 默认加载 Claude 官方插件目录（`anthropics/claude-plugins-official`），无需配置
- **插件源** — 支持添加 Git 仓库作为插件源；新源先试克隆并显示插件数量，确认后才会保存
- **标签拖拽排序** — 拖动源标签调整顺序，拖到边缘时标签栏自动滚动，顺序持久保存
- **标签栏横滚** — 鼠标滚轮直接滚动标签栏，两端羽化提示还有更多标签
- **滚动位置记忆** — 每个源各自记住浏览位置与过滤条件，切换标签或从详情页返回时恢复原样
- **回到顶部** — 再次点击已选中的源标签，网格回到顶部并重新排序，新装的插件排到前面
- **模糊搜索** — 按名称、作者、描述分级匹配，忽略 `-`、`_` 等分隔符；搜索栏旁有过滤与排序
- **悬停预览** — 悬停卡片弹出描述与分类

**安装与接线**

- **自动接线** — 安装时镜像 skills 与斜杠命令、把子代理编译成一个 Hub 技能，并把 MCP 连接器、LSP 服务器、Claude/Codex hooks 写入 `cordis.patch.yml`
- **详情页** — 列出插件的 skills、子代理与 prompts；连接器显示连接状态，LSP 服务器带激活圆点，hooks 按事件名显示（`SessionStart`、`PreToolUse: Bash`）
- **LSP 预检** — 语言服务器不在 PATH 时跳过注册并提示安装方法，不写入错误条目
- **重复安装** — 再次安装直接覆盖；不同源的同名插件会取代旧记录

**管理**

- **启用 / 停用** — 插件与连接器就地开关，无需重启 DSH
- **MCP 工具级开关** — 悬停工具查看描述与参数，点击状态徽标停用或恢复该工具
- **连接器授权** — 保存前先真实连测令牌（8 秒超时）；Token、URL、自定义头、环境变量、参数、OAuth 按连接器保存
- **更新** — 存在新版本时更新按钮才可用，悬停显示目标版本号
- **卸载** — 一次确认移除插件副本、技能注册、patch 条目与工具缓存

**界面**

- **明暗双主题** — 两套设计令牌分别调校，跟随 DSH 界面主题
- **Markdown 渲染** — 插件描述经内置渲染器展示，支持标题、列表、引用、代码块、`Note:`/`Warning:` 提示、命令高亮与链接，明暗主题各有排版
- **本地缓存** — 源与市场清单缓存在浏览器，新数据加载前面板先显示缓存内容
- **图标缓存** — 头像经磁盘缓存代理加载；无头像的插件按名称散列取一个矢量徽章
- **渲染性能** — 视口外卡片跳过布局（`content-visibility: auto`），滚动遮罩每帧至多更新一次

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

1. 打开面板。Claude 官方插件目录默认已加载，直接浏览或搜索。
2. 可选：添加其他源，例如 `anthropics/claude-plugins-community`。
3. 浏览或搜索。点开插件看它带什么：技能、子代理、连接器、LSP 服务器。
4. 点 **Install**。Hub 复制插件、注册技能和子代理、把 LSP 服务器和 Claude/Codex hooks 接入 DSH、自动接上无需配置的连接器。
5. 在管理页管理已装插件：启用或禁用、开关连接器与单个 MCP 工具、验证授权、更新、卸载。

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