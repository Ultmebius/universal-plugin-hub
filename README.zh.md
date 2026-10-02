# Universal Plugin Hub

[English](README.md) | 简体中文

DeepSeek Harness (DSH) 的插件市场。内置 Claude 官方插件源，支持一键安装 Agent 技能（Skills）、子代理、MCP 工具和 LSP 服务。

![主界面预览](assets/hero.png)

## 安装

### DeepSeek Harness 桌面端

1. 打开 DeepSeek Harness 客户端。
2. 进入**设置** -> **插件**。
3. 在安装输入框中粘贴仓库地址：
   ```text
   https://github.com/Ultmebius/universal-plugin-hub.git
   ```
4. 点击安装。

### 命令行安装

在终端执行：

```bash
dsh plugin add https://github.com/Ultmebius/universal-plugin-hub.git
```

### 源码安装

```bash
cd ~/.dsh/plugins
git clone https://github.com/Ultmebius/universal-plugin-hub.git
cd universal-plugin-hub
npm install
```

## 主要功能

- **内置官方插件源**：默认载入 Claude 官方插件目录（`anthropics/claude-plugins-official`），开箱即用。
- **自定义 Git 插件源**：支持添加任意 GitHub 或 Git 仓库地址作为插件源。
- **自动接入**：
  - Commands 和 Skills 会自动转换为 DSH Agent 可调用的技能。
  - 子代理会自动编译为对应的 Hub 技能并支持委派。
  - MCP 连接器自动写入配置文件，支持单个工具粒度的开关和鉴权测试。
  - 自动注册 LSP 语言服务。
- **环境支持**：同时支持 DeepSeek Harness Desktop 桌面客户端与命令行 Web 模式。

## 使用方法

1. **浏览与搜索**：打开插件市场面板，输入关键词搜索插件。
2. **一键安装**：点击插件卡片上的 **Install**，插件会自动下载并接入系统。
3. **插件管理**：在管理面板中开启或停用插件，配置 MCP 工具鉴权 Token，或一键更新与卸载。

## 本地数据与目录结构

- **Hub 插件本体**：`~/.dsh/profiles/desktop/node_modules/universal-plugin-hub`
- **市场内安装的插件**：
  - 插件安装目录：`~/.dsh/agent-skills/universal-plugin-hub/installed/<plugin-name>`
  - 插件源 Git 缓存：`~/.dsh/agent-skills/universal-plugin-hub/market/<source-id>`
  - 插件源与安装记录：`~/.dsh/agent-skills/universal-plugin-hub/state.json`
- **运行时配置补丁**：`~/.dsh/profiles/<profile>/cordis.patch.yml`

## 开源协议

[MIT License](./LICENSE)