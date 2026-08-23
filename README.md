# Universal Plugin Hub

> 跨生态 AI 智能体与 MCP 插件市场 — 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的可视化插件管理中心。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)

## ✨ 功能特性

- **可视化插件市场** — 浏览、搜索、一键安装与卸载来自多个 Git 源的插件
- **多源管理** — 支持同时接入多个插件仓库源，自由添加与移除
- **技能 & 子代理扫描** — 自动识别插件中的 Skills（命令）和 Subagents（子代理），编译为 Hub Skill 实现智能委派
- **MCP 连接器** — 自动解析插件内的 MCP Server 配置，注册为 DSH 可用工具
- **标签长按拖拽排序** — 3D 浮空提拉视觉反馈，支持连续无限次重排
- **流畅的滚轮 & 点击滚动** — 标签栏支持鼠标滚轮横向滚动，左右羽化遮罩自动显隐
- **浅色 / 深色主题** — 自动跟随 DSH 主题，全界面适配

## 📦 安装

### 方式一：通过 DSH 插件市场安装（推荐）

在 DSH 内置插件市场中搜索 **Universal Plugin Hub**，点击「安装」即可。

### 方式二：命令行安装

```bash
dsh plugin add universal-plugin-hub
```

### 方式三：手动安装

```bash
cd ~/.dsh/plugins
git clone https://github.com/CaesarEmperor/universal-plugin-hub.git
cd universal-plugin-hub
npm install
```

安装完成后重启 DSH，即可在界面中看到 Universal Plugin Hub 面板。

## 🏗️ 项目结构

```
universal-plugin-hub/
├── src/                    # 服务端源码
│   ├── index.js            # 插件入口，挂载 HTTP 路由
│   ├── routes.js           # RESTful API 路由（源管理、插件安装等）
│   ├── store.js            # 本地状态与缓存管理
│   ├── market.js           # Git 操作（clone、pull、diff）
│   ├── install.js          # 插件安装/卸载/启用生命周期
│   ├── parser.js           # 插件元数据解析（marketplace.json、plugin.json）
│   ├── agents-map.js       # 子代理定义解析与 Hub Skill 编译
│   └── http.js             # HTTP 工具函数
├── client/
│   └── client.js           # 前端 UI（Preact + HTM，单文件）
├── cordis.patch.yml        # DSH bundle 层级声明
├── package.json
├── LICENSE
└── README.md
```

## 🔧 开发

```bash
# 安装依赖
npm install

# 语法检查
node --check client/client.js
node --check src/index.js
```

## 📄 协议

[MIT License](./LICENSE) © CaesarEmperor
