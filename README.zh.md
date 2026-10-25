# Universal Plugin Hub

[English](README.md) | 简体中文

DeepSeek Harness (DSH) 的插件市场。集中浏览 Claude 与 Codex 插件源，导入插件和 Agent Skills，并管理 MCP 工具、子代理及 LSP 服务。

![主界面预览](assets/hero.png)

## 界面与体验

以卡片呈现插件图标、简洁说明和安装状态，配合插件源标签、搜索、筛选与排序，轻松浏览不断扩展的插件目录。

- **浅色与深色主题**：跟随 DSH 的主题设置，统一卡片、文字和控件的视觉风格，并按主题选择插件图标资源。
- **悬停即可了解详情**：将鼠标停在插件或工具上查看说明，移入浮窗即可滚动阅读、选择文字，移向其他条目继续浏览。
- **紧凑清晰的工具列表**：MCP 工具以带状态指示的标签呈现，展开服务器即可查看工具能力，并逐个控制启用状态。
- **统一的管理体验**：从插件卡片进入连接器与能力管理；在 MCP 页按分组查看手动添加的服务器和插件连接器。

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

## 主要功能

- **内置官方插件源**：默认载入 Claude 官方插件目录（`anthropics/claude-plugins-official`），开箱即用。
- **Claude 与 Codex 插件源**：支持添加包含插件市场或独立插件的 Git 仓库。
- **插件与 Skills 导入**：支持本地目录、压缩包、Git 仓库及 `SKILL.md` 文件，并将技能集合识别为独立技能。
- **MCP 管理**：在 MCP 页统一查看手动添加的服务器和插件连接器，展开工具列表，控制单个工具的开关，并配置连接与鉴权。
- **快速浏览目录**：先显示缓存目录，在后台刷新插件源，并通过图标缓存加快重复访问时的加载。
- **Agent 集成**：将 Commands 和 Skills 同步至 DSH，将子代理编译为可委派的 Hub 技能，并注册 MCP 连接器和 LSP 服务。
- **环境支持**：同时支持 DeepSeek Harness Desktop 桌面客户端与命令行 Web 模式。

## 使用方法

1. **浏览和安装**：按名称或关键词搜索，选择插件源，点击插件卡片上的 **安装**。
2. **添加插件市场**：打开 **+** 菜单，选择 **添加插件市场**，输入 Claude 或 Codex 仓库地址，查看解析结果后添加。
3. **导入插件或技能**：在 **+** 菜单选择 **上传插件**，填写本地路径或 Git 地址，或选择支持的文件，查看预览后确认导入。
4. **管理已安装插件**：点击插件卡片上的 **管理**，配置连接器、管理能力、更新或卸载插件。
5. **使用 MCP 工具**：进入 **MCP** 页查看服务器和插件连接器，展开服务器工具列表，查看工具说明并控制启用状态。

## 支持的内容

| 内容 | 识别结构 |
| --- | --- |
| Claude 插件市场 | `.claude-plugin/marketplace.json` |
| Codex 插件市场 | `.agents/plugins/marketplace.json` |
| Claude 插件 | `.claude-plugin/plugin.json` |
| Codex 插件 | `.codex-plugin/plugin.json` |
| Agent Skills | `SKILL.md` 文件、技能目录或多个技能目录组成的集合 |

文件上传支持 `.zip`、`.tgz`、`.tar.gz` 和 `SKILL.md`，单次上传上限为 22 MB。较大的压缩包可以解压后通过目录路径导入。含脚本或其他资源的技能请导入完整目录或压缩包，以保留可用的相对路径。

## 本地数据与目录结构

- **Hub 插件本体**：`~/.dsh/profiles/desktop/node_modules/universal-plugin-hub`
- **市场内安装的插件**：
  - 插件安装目录：`~/.dsh/agent-skills/universal-plugin-hub/installed/<plugin-name>`
  - 插件源 Git 缓存：`~/.dsh/agent-skills/universal-plugin-hub/market/<source-id>`
  - 插件源与安装记录：`~/.dsh/agent-skills/universal-plugin-hub/state.json`
- **运行时配置补丁**：`~/.dsh/profiles/<profile>/cordis.patch.yml`

`~/.dsh` 为默认数据目录；设置 `DSH_HOME` 后，路径随该配置调整。

## 开源协议

[MIT License](./LICENSE)
