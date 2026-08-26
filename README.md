<p align="center">
  <img src="assets/logo.svg" width="96" alt="Universal Plugin Hub logo">
</p>
<!-- Logo 占位：替换为项目 Logo 图片（建议 svg/png），保存为 assets/logo.svg -->

# Universal Plugin Hub

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0--preview-4D6BFE)](https://github.com/CaesarEmperor/universal-plugin-hub)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek_Harness-4D6BFE)](https://github.com/topics/dsh)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)
[![Cordis](https://img.shields.io/badge/Platform-Cordis-2E3A59)](https://github.com/topics/cordis)
[![Marketplace](https://img.shields.io/badge/Hub-Marketplace-18181b)](https://github.com/topics/marketplace)

> Plugin marketplace for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Browse plugins from multiple Git sources, install with one click, and let their skills, subagents, MCP connectors, LSP servers, and hooks light up in DSH.

![Universal Plugin Hub overview](assets/hero.png)
<!-- 截图占位 #1（主图）：替换为插件市场浏览页全屏截图——顶部搜索框、源标签栏、分类过滤与插件卡片网格。保存为 assets/hero.png -->

## What it does

Universal Plugin Hub is a visual plugin manager for DSH. It clones plugin sources (the Anthropic official catalog, community repos, or any Git repository), lists what each plugin actually provides, and wires those pieces into DSH:

- skills and slash commands become agent skills (`commands/` is mirrored into `skills/`, as is a root `SKILL.md`)
- subagents are compiled into one delegated Hub skill per plugin (`skills/<plugin>-agents/`)
- MCP connectors register into `cordis.patch.yml` as `@deepseek-ai/dsh-mcp-client` entries
- LSP servers register as `@deepseek-ai/dsh-lsp-stdio` entries — install `typescript-lsp`, restart DSH, and the `lsp` tool works
- hooks are loaded into DSH by registering a per-plugin `@deepseek-ai/dsh-hooks-claude-code` bridge entry; the bridge runs the plugin's native Claude Code `hooks.json` on DSH's own interception points

## Features

- **Multiple sources** — add or remove Git repositories as plugin sources; the built-in Anthropic catalog is always there
- **Drag-to-reorder source tabs** — hold and drag a source tab to reorder it (the bar auto-scrolls at the edges, so you can reach the last tab); the order persists
- **Search, filter & sort** — fuzzy search across the current source plus filter and sort controls; hover a card for a quick preview before opening it
- **Skill & subagent scanning** — detects skills, slash commands, and subagent definitions in a plugin, and compiles subagents into a Hub skill DSH can delegate to
- **MCP connectors** — connectors that need no auth register automatically on install; the rest you verify and enable from the manage page, and you can toggle individual MCP tools on or off per connector
- **LSP servers** — plugins declaring `lspServers` (clangd, pyright, typescript-lsp, and more) are registered into DSH on install; the detail page shows them with an active dot
- **Hooks** — a plugin's Claude/Codex `hooks.json` is parsed and loaded into DSH via the Claude hooks bridge; the detail page shows the real events (e.g. `SessionStart`, `PreToolUse: Bash`) rather than filenames
- **Light / dark theme** — follows the DSH UI theme

## Requirements

- Node.js 18+
- DSH with the `web` profile (0.1.0-rc.6 or newer recommended). The hub's own install (`dsh plugin add universal-plugin-hub`) runs a `postinstall` script that pre-provisions the 5 LSP/hook host packages into the DSH installation — versions are resolved to match the running DSH release, and a provisioning failure fails the hub install outright. After that, plugins declaring LSP servers or Claude/Codex hooks register as a single `cordis.patch.yml` write each (DSH HMR picks them up within ~1s).

## Where data lives

All hub state sits under `~/.dsh/agent-skills/universal-plugin-hub/`:

- `state.json` — sources, installed-plugin records, and their order
- `market/<sourceId>/` — shallow (`--depth 1`) clones of each plugin source
- `market/remote/` — clones of plugin repositories installed from remote URLs
- `installed/<name>/` — the working copy of each installed plugin (skills, agents, connectors)
- `icons/` — cached plugin icons, served through the hub's `/icon` proxy

Connectors, LSP servers, and hooks register by writing entries into the DSH cordis patch (`$DSH_HOME/profiles/web/cordis.patch.yml`); per-tool MCP switches live in `~/.dsh/.mcp-tools-state.json`.

## Install

### From the DSH marketplace

Search **Universal Plugin Hub** in the DSH plugin market and click install.

### From the CLI

```sh
dsh plugin add universal-plugin-hub
```

### Manually

```sh
cd ~/.dsh/plugins
git clone https://github.com/CaesarEmperor/universal-plugin-hub.git
cd universal-plugin-hub
npm install
```

Restart DSH, then open the Universal Plugin Hub panel from the DSH UI.

## Quick start

1. Open the panel. The built-in **Anthropic** source is loaded by default.
2. Optional: add another source, e.g. `anthropics/claude-plugins-community`.
3. Browse or search. Open a plugin to see what it ships: skills, subagents, connectors, LSP servers.
4. Click **Install**. The hub copies the plugin, registers skills and subagents, wires any LSP servers and Claude/Codex hooks into DSH, and auto-connects what needs no setup.
5. Manage installed plugins from the manage page — enable/disable, toggle connectors and individual MCP tools, verify auth tokens, update, or remove.

![Install dialog](assets/install-flow.png)
<!-- 截图占位 #2（安装）：替换为安装确认对话框，或某个已装插件管理页的截图。保存为 assets/install-flow.png -->

## Project structure

```
src/       server: REST routes, marketplace parser, git ops, agents compiler, install lifecycle
client/    UI — a single React file loaded through the DSH client runtime (no build step)
scripts/   postinstall — pre-provisions the 5 LSP/hook host packages into the DSH install
```

## Development

```sh
npm install
node --check src/index.js
node --check client/client.js
node scratch/verify-lsp-support.mjs   # end-to-end check against a throwaway DSH_HOME
```

The UI is a single React file loaded through the DSH client runtime (`dsh-client-runtime` and `dsh-client-ui-theme` are injected by the host). There is no build step — edit `client/client.js` and reload.

## Support

Report bugs or request features via [GitHub Issues](https://github.com/CaesarEmperor/universal-plugin-hub/issues).

## Contributing

PRs are welcome. Keep changes surgical and run `node --check` on touched files; for server behavior changes, extend `scratch/verify-lsp-support.mjs` with end-to-end coverage.

## License

[MIT](./LICENSE) © CaesarEmperor