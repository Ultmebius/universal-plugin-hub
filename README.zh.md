# Universal Plugin Hub

[English](README.md) | 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)

DeepSeek Harness (DSH) 的跨生态插件市场与管理器。默认预置 Claude 官方插件源，支持一键安装 Agent 技能（Skills）、子代理（Subagents）、MCP 连接器与 LSP 服务。

![主界面预览](assets/hero.png)

## 安装

### 方式 1：DeepSeek Harness Desktop (桌面端)

1. 打开 DeepSeek Harness 桌面客户端。
2. 进入 **设置 (Settings)** -> **插件 (Plugins)**。
3. 在安装输入框中填入插件包名：
   ```text
   universal-plugin-hub
   ```
4. 点击安装。安装完成后即可在左侧导航或插件列表中打开。

### 方式 2：命令行 (CLI)

如果使用 DSH 命令行或 Web 模式，可在终端直接执行：

```bash
dsh plugin add universal-plugin-hub
```

### 方式 3：源码手动安装

```bash
# 进入 DSH 插件目录
cd ~/.dsh/plugins

# 克隆仓库
git clone https://github.com/Ultmebius/universal-plugin-hub.git
cd universal-plugin-hub

# 安装依赖并初始化
npm install
```

安装完成后重启 DeepSeek Harness 即可生效。

---

## 核心特性

- **预置官方生态**：开箱即用内置 Claude 官方插件源（`anthropics/claude-plugins-official`），无需额外配置。
- **第三方源支持**：支持直接添加任意 GitHub / Git 插件仓库地址作为新源。
- **自动配线与桥接**：
  - **Skills & Commands**：插件中的命令与提示词自动转为 DSH 可用的 Agent 技能。
  - **Subagents**：自动编译多代理定义，支持由主智能体按需派发。
  - **MCP 连接器**：一键写入 DSH 连接配置，提供细粒度的单个 MCP 工具开关与参数测试。
  - **LSP 语言服务**：自动接入对应语言的 LSP 检查与补全服务。
- **环境自适应**：同时兼容 DeepSeek Harness Desktop 桌面版与命令行 Web 模式。

---

## 快速使用

1. **浏览与搜索**：打开 Universal Plugin Hub 界面，支持按名称、作者与标签模糊搜索。
2. **安装插件**：在卡片中点击 **Install**，系统会自动拉取代码、解析技能并挂载连接器。
3. **插件管理**：
   - 在已安装列表中随时开启/停用插件，无需重启客户端。
   - 支持逐个控制 MCP 工具的启用状态并配置访问 Token。
   - 随时一键检查更新或完全卸载。

---

## 数据与存储路径

插件运行时数据均保存在本地系统目录 `~/.dsh/`：

| 路径 | 说明 |
| :--- | :--- |
| `~/.dsh/agent-skills/universal-plugin-hub/state.json` | 插件源列表及已安装插件元数据 |
| `~/.dsh/agent-skills/universal-plugin-hub/installed/` | 已安装插件的实际代码与技能文件 |
| `~/.dsh/agent-skills/universal-plugin-hub/market/` | 插件源 Git 缓存目录 |
| `~/.dsh/profiles/<profile>/cordis.patch.yml` | 动态挂载的 MCP、LSP 与运行时补丁 |

---

## 开发与调试

```bash
# 语法检查
node --check src/index.js
node --check client/client.js

# 兼容性测试
node scratch/test-desktop-compat.js
```

前端界面为单文件 React（位于 `client/client.js`），由 DSH 客户端直接挂载运行，修改后刷新界面即可生效。

---

## 开源协议

[MIT License](./LICENSE)