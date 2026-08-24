<p align="center">
  <img src="assets/logo.svg" width="96" alt="Universal Plugin Hub logo">
</p>

# Universal Plugin Hub

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的插件市场。在一个界面里浏览多个 Git 源的插件，一键安装，插件中的技能、子代理、MCP 连接器和 LSP 服务器自动接入 DSH。

![主界面总览](assets/hero.png)
<!-- 截图占位 #1（主图）：替换为市场浏览页全屏截图——顶部搜索框、分类标签、插件卡片网格。保存为 assets/hero.png -->

## 它能做什么

Universal Plugin Hub 是 DSH 的可视化插件管理器。它克隆插件源（Anthropic 官方目录、社区仓库、任意 Git 仓库），列出每个插件实际提供的东西，再把它们接入 DSH：

- skills 和斜杠命令变成 agent 技能
- 子代理编译成 Hub 技能，交给 DSH 委派
- MCP 连接器写进 `cordis.patch.yml`，注册为 `@deepseek-ai/dsh-mcp-client`
- LSP 服务器注册为 `@deepseek-ai/dsh-lsp-stdio`。装完 `typescript-lsp` 重启 DSH，`lsp` 工具即可用

## 功能

- **多源管理** — 自由添加或移除 Git 仓库作为插件源，内置 Anthropic 官方目录
- **技能与子代理扫描** — 自动识别插件中的 skills、斜杠命令和子代理定义，把子代理编译成 DSH 可委派的 Hub 技能
- **MCP 连接器** — 免认证的连接器装完即自动注册，需要认证的在管理页验证后启用
- **LSP 服务器** — 声明了 `lspServers` 的插件（clangd、pyright、typescript-lsp 等）安装时自动注册进 DSH，详情页带激活状态显示
- **标签拖拽排序** — 按住拖拽即可重排，卡片带浮起效果，顺序持久保存
- **浅色 / 深色主题** — 跟随 DSH 界面主题

## 环境要求

- Node.js 18+
- 带 `web` profile 的 DSH（建议 0.1.0-rc.6 以上）。LSP 插件安装时会自动把宿主依赖包（`dsh-lsp`、`dsh-lsp-stdio`、`dsh-tool-lsp`）安装进 DSH 运行时，重启 DSH 后生效

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
4. 点 **Install**。Hub 复制插件、注册技能和子代理、自动接上无需配置的连接器。
5. 在管理页管理已装插件：启用或禁用、开关连接器、验证授权、更新、卸载。

![安装对话框](assets/install-flow.png)
<!-- 截图占位 #2（安装）：替换为安装对话框，或某个已装插件的管理页截图。保存为 assets/install-flow.png -->

## 项目结构

```
src/      服务端：路由、安装生命周期、市场解析、git 操作
client/   前端（单文件 React，由 DSH 客户端运行时加载）
scratch/  开发脚本与测试（不随包发布）
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
