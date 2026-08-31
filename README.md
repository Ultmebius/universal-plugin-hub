# Universal Plugin Hub

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek_Harness-4D6BFE)](https://github.com/topics/dsh)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)

> Plugin marketplace for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). The official Claude plugin catalog comes pre-loaded, and Git repositories can be added as plugin sources — install with one click and skills, subagents, MCP connectors, LSP servers, and hooks are wired into DSH.

![Universal Plugin Hub overview](assets/hero.png)
<!-- SCREENSHOT #1 (hero): replace with a full screenshot of the browse page — search bar on top, source tabs, plugin card grid. Save as assets/hero.png -->

## What it does

Universal Plugin Hub brings a **visual plugin market** to DSH. The **official Claude plugin catalog** is built in: pick a plugin, click Install, and it is ready to use in DSH. You can add other Git repositories as plugin sources and install their plugins the same way.

When you install a plugin, the hub wires its pieces into DSH automatically:

- skills and slash commands become agent skills (`commands/` is mirrored into `skills/`, as is a root `SKILL.md`)
- subagents are compiled into one delegated Hub skill per plugin (`skills/<plugin>-agents/`)
- MCP connectors register into `cordis.patch.yml` as `@deepseek-ai/dsh-mcp-client` entries
- LSP servers register as `@deepseek-ai/dsh-lsp-stdio` entries — install `typescript-lsp`, restart DSH, and the `lsp` tool works
- hooks are loaded into DSH by registering a per-plugin `@deepseek-ai/dsh-hooks-claude-code` bridge entry; the bridge runs the plugin's native Claude Code `hooks.json` on DSH's own interception points

## Features

**Marketplace and browsing**

- **Built-in catalog** — the official Claude plugin catalog (`anthropics/claude-plugins-official`) loads by default, no configuration needed
- **Plugin sources** — add Git repositories as sources; a new source is test-cloned first and its plugin count is shown before it is saved
- **Tab drag sorting** — drag source tabs to reorder them; the bar auto-scrolls when you drag to an edge, and the order persists
- **Tab bar scrolling** — the mouse wheel scrolls the bar horizontally, and fade masks at the edges show when more tabs are hidden
- **Scroll memory** — each source keeps its own scroll position and filter; switching tabs or coming back from a detail page restores them
- **Quick scroll to top** — clicking the selected source's tab again scrolls the grid to the top and re-sorts, bringing recently installed plugins to the front
- **Fuzzy search** — ranked matching over name, author, and description, ignoring separators like `-` and `_`; filter and sort controls sit next to the search bar
- **Hover preview** — hovering a card shows its description and category in a popover

**Install and wiring**

- **Automatic wiring** — installing a plugin mirrors its skills and slash commands into the skills directory, compiles subagents into one Hub skill, and registers MCP connectors, LSP servers, and Claude/Codex hooks into `cordis.patch.yml`
- **Detail page** — lists a plugin's skills, subagents, and prompts; connectors show connection state, LSP servers show an active dot, and hooks are listed by event name (`SessionStart`, `PreToolUse: Bash`)
- **LSP pre-flight** — if a language server binary is missing, registration is skipped with an installation hint instead of writing a broken entry
- **Reinstall and replace** — installing over an existing plugin replaces it; a same-name plugin from another source takes over the old record

**Management**

- **Enable / disable** — toggle plugins and connectors without restarting DSH
- **Per-tool MCP switches** — hover a tool to see its description and parameters, then click the status badge to disable or re-enable that single tool
- **Connector auth** — test a token against the real endpoint (8-second timeout) before saving; token, URL, custom headers, env, args, and OAuth are stored per connector
- **Updates** — the update button is enabled only when a newer version exists; the tooltip shows the target version
- **Uninstall** — one confirmation removes the plugin copy, skill registration, patch entries, and cached tool state

**Interface**

- **Light and dark themes** — separate design-token palettes for each mode, following the DSH UI theme
- **Markdown rendering** — plugin descriptions render through a built-in Markdown renderer with headings, lists, quotes, code blocks, `Note:`/`Warning:` callouts, command highlighting, and links, styled for both themes
- **Local cache** — sources and marketplace listings are cached in the browser, so the panel renders immediately while fresh data loads
- **Icon caching** — avatars are served through a disk-cached proxy; plugins without an avatar get a vector badge picked by name hash
- **Rendering performance** — offscreen cards skip layout (`content-visibility: auto`), and scroll masks update at most once per frame

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

1. Open the panel. The official Claude plugin catalog is loaded by default; browse or search right away.
2. Optional: add another source, e.g. `anthropics/claude-plugins-community`.
3. Browse or search. Open a plugin to see what it ships: skills, subagents, connectors, LSP servers.
4. Click **Install**. The hub copies the plugin, registers skills and subagents, wires any LSP servers and Claude/Codex hooks into DSH, and auto-connects what needs no setup.
5. Manage installed plugins from the manage page — enable/disable, toggle connectors and individual MCP tools, verify auth tokens, update, or remove.

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