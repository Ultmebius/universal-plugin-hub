# Universal Plugin Hub

[English](README.md) | 简体中文

在 DeepSeek Harness（DSH）中使用 Claude Code、Codex 等软件生态的插件，一站式管理插件、Skills 与 MCP。

Universal Plugin Hub 为 DSH 扩展插件来源。你可以浏览内置的 Claude 官方插件目录，安装 Claude Code 和 Codex 生态的插件，也可以添加自己的 Git 仓库作为插件源，或上传插件和 Skills，统一浏览、安装、更新和管理。已有的本地 Skills 目录会自动扫描，支持逐个启用或停用；MCP 服务器、连接配置和工具开关也在同一界面中管理。

安装插件后，Hub 会识别其中的 Skills、Commands、Agents、MCP、Hooks 和 LSP 配置，将相应能力转换或注册到 DSH。技能与命令从输入框的 `/` 菜单调用，子代理通过 DSH 的委派工具使用，插件附带的 MCP、Hooks 与 LSP 随插件统一管理。

## 核心功能

### 将插件能力接入 DSH

| 插件能力 | 在 DSH 中如何使用 |
| --- | --- |
| **Skills 技能** | 同步到 DSH 的原生技能目录，在输入框的 `/` 菜单中调用；技能目录中的脚本和资源随技能一同保留。 |
| **Commands 命令** | 将 Claude Code 插件中的 Markdown 命令转换为 DSH 技能，继续使用这些命令所定义的工作流程。 |
| **Agents 子代理** | 将子代理定义转换为可调用的技能，并生成通过 DSH 原生 `subagent` 工具委派任务的入口。 |
| **MCP 工具** | 接入插件声明的 MCP 连接器，配置服务地址、鉴权、请求头和环境变量，查看工具说明，逐个开启或关闭工具。 |
| **Hooks 钩子** | 读取插件的 Hooks 配置文件，注册到 DSH 的钩子桥接服务，并随插件启停。 |
| **LSP 语言服务** | 读取插件声明的语言服务器配置，在服务器程序可用时注册到 DSH；缺少程序时提供相应提示。 |

### 从发现到管理插件

- **浏览多个插件市场**：内置 Claude 官方插件源（`anthropics/claude-plugins-official`），支持添加 Claude 与 Codex 插件市场，以及包含独立插件的 Git 仓库。目录和图标会缓存，再次打开时可以复用。
- **上传插件和 Skills**：支持上传插件或技能压缩包、单个 `SKILL.md`，也可以通过本地目录和 Git 地址导入；技能集合可以按独立技能解析和导入，插件声明的 MCP 连接器随插件接入。
- **自动扫描本地 Skills**：读取 `~/.agents/skills` 中的技能，在 **Skills** 标签中集中查看，无需逐个导入。
- **逐个开关本地 Skills**：在列表或详情页启用、停用技能。关闭后，该技能不再出现在 DSH 输入框的 `/` 菜单中，模型也不能调用；重新开启后恢复技能原有的调用设置，文件保留在原处。
- **管理已安装插件**：安装、更新、启用、停用和卸载插件时，同步处理对应的技能、MCP 连接器、Hooks 与 LSP 注册。
- **集中管理 MCP 服务器**：添加自己的 MCP 服务器，在同一页面查看手动添加的服务器与插件提供的连接器，配置地址、鉴权和环境变量，展开工具列表，并管理服务器与单个工具的开关。

## 界面预览

插件卡片显示简介和安装状态，支持按来源浏览、搜索、筛选和排序。界面跟随 DSH 切换浅色和深色主题；悬停可查看插件或工具说明，预览支持滚动阅读、选择和复制文字，展开的 MCP 工具以状态标签排列。

**官方插件目录**：浏览 Claude 官方插件，搜索并查看说明，一键安装。

![官方插件目录与插件悬停预览](assets/Plugins-official.png)

**插件详情**：查看来源、版本和功能说明，管理插件及其 MCP 连接器。

![插件详情与 MCP 连接器管理](assets/Plugin-management.png)

**本地 Skills**：自动扫描本地技能，查看说明，并逐个启用或停用。

![本地 Skills 列表与启用开关](assets/Skills.png)

**MCP 管理**：集中查看手动添加的服务器和插件连接器，展开工具说明，管理服务器与工具的开关。

![MCP 服务器、连接器与工具管理](assets/MCP.png)

**添加插件源**：添加自己的 Git 仓库，导入 Claude 或 Codex 插件市场及插件。

![通过 Git 仓库添加插件源](assets/Add-plugin-source.png)

## 安装

支持 DeepSeek Harness 桌面端和命令行 Web profile。

### DeepSeek Harness 桌面端

1. 打开 DeepSeek Harness 客户端。
2. 进入**设置** -> **插件**。
3. 点击 **添加插件**，在输入框中填写包名：

   ```text
   universal-plugin-hub
   ```

   填入仓库地址也能安装：

   ```text
   https://github.com/Ultmebius/universal-plugin-hub.git
   ```

4. 点击安装。

### 命令行安装

在终端执行：

```bash
dsh plugin add universal-plugin-hub
```

## 使用方法

1. **浏览和安装**：按名称或关键词搜索，选择插件源，点击插件卡片上的 **安装**。
2. **添加插件市场**：打开 **+** 菜单，选择 **添加插件市场**，输入 Claude 或 Codex 仓库地址，查看解析结果后添加。
3. **导入插件或技能**：在 **+** 菜单选择 **上传插件**，填写本地路径或 Git 地址，或选择支持的文件，查看预览后确认导入。
4. **管理已安装插件**：点击插件卡片上的 **管理**，配置连接器、管理能力、更新或卸载插件。
5. **使用 MCP 工具**：进入 **MCP** 页查看服务器和插件连接器，展开服务器工具列表，查看工具说明并控制启用状态。
6. **管理本地 Skills**：检测到本地技能后，打开 **Skills** 标签，点击技能查看说明，通过列表或详情页的开关控制启用状态。新增、修改或删除技能后，点击刷新更新列表。

安装提供 Skills 或 Commands 的插件后，可以在 DSH 输入框的 `/` 菜单中找到相应技能。安装带有 MCP 的插件后，可以在 MCP 页的 **来自插件** 分组中配置连接器并查看工具。

本地 Skills 扫描与 DSH 原生发现范围一致：识别 `~/.agents/skills/<name>/SKILL.md` 和 `~/.agents/skills/<name>.md`，不递归扫描更深层目录。设置 `DSH_AGENTS_HOME` 后，扫描目录改为该目录下的 `skills`。

## 支持的内容

| 内容 | 识别结构 |
| --- | --- |
| Claude 插件市场 | `.claude-plugin/marketplace.json` |
| Codex 插件市场 | `.agents/plugins/marketplace.json` |
| Claude 插件 | `.claude-plugin/plugin.json` |
| Codex 插件 | `.codex-plugin/plugin.json` |
| Agent Skills | `SKILL.md` 文件、技能目录或多个技能目录组成的集合 |

同一插件或插件市场同时包含 Claude 与 Codex 描述文件时，优先按 Claude 规范解析。

文件上传支持 `.zip`、`.tgz`、`.tar.gz` 和 `SKILL.md`，单次上传上限为 22 MB。较大的压缩包可以解压后通过目录路径导入。含脚本或其他资源的技能请导入完整目录或压缩包，以保留可用的相对路径。

## 本地数据与目录结构

- **Hub 插件本体**：`~/.dsh/profiles/desktop/node_modules/universal-plugin-hub`
- **本地 Skills 扫描目录**：`~/.agents/skills`（可通过 `DSH_AGENTS_HOME` 调整）
- **市场内安装的插件**：
  - 插件安装目录：`~/.dsh/agent-skills/universal-plugin-hub/installed/<plugin-name>`
  - 插件源 Git 缓存：`~/.dsh/agent-skills/universal-plugin-hub/market/<source-id>`
  - 插件源与安装记录：`~/.dsh/agent-skills/universal-plugin-hub/state.json`
- **运行时配置补丁**：`~/.dsh/profiles/<profile>/cordis.patch.yml`

`~/.dsh` 为默认数据目录；设置 `DSH_HOME` 后，路径随该配置调整。

## 开源协议

[MIT License](./LICENSE)
