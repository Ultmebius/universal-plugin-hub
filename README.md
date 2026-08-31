# Universal Plugin Hub

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek_Harness-4D6BFE)](https://github.com/topics/dsh)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)

> Plugin marketplace for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). The official Claude plugin catalog comes pre-loaded, and Git repositories can be added as plugin sources — install with one click, and skills, subagents, MCP connectors, LSP servers, and hooks wire themselves into DSH.

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

**Marketplace & browsing**

- **Ready on first open** — the official Claude plugin catalog (`anthropics/claude-plugins-official`) is pre-loaded; nothing to configure
- **Bring your own sources** — add a Git repository as a plugin source; it is test-cloned and its plugin count previewed first, so a bad URL never reaches your source list
- **Drag-to-reorder tabs** — grab a source tab and drop it anywhere: a ghost follows the pointer, neighbors swap live, and the bar auto-scrolls at its edges so even the last tab is reachable; the order persists
- **Fluid tab bar** — the mouse wheel scrolls it horizontally, feathered masks mark hidden tabs, and rapid clicks never jitter thanks to ease-out scrolling with a locked destination
- **Click a tab, back to the top** — selecting a source glides the grid back to the top and re-sorts freshly installed plugins first; every source remembers where you left off
- **Six-tier fuzzy search** — exact, prefix, substring, multi-word, subsequence, and author/description matching, all punctuation-insensitive; filter and sort from the toolbar
- **Hover to preview** — a popover with description and category appears before you open a plugin

**Install & wiring**

- **One click, fully wired** — skills and slash commands are mirrored into the skills directory, subagents are compiled into a single delegable Hub skill, and MCP connectors, LSP servers, and Claude/Codex hooks are registered into `cordis.patch.yml` — all during install
- **See what a plugin ships** — the detail page lists skills, subagents, and prompts; connectors show live connection state, LSP servers an active dot, and hooks their real event names (`SessionStart`, `PreToolUse: Bash`)
- **LSP pre-flight check** — a missing language-server binary is caught before registration, with the exact remediation hint, so DSH never fails to boot over a plugin
- **Same-name replace** — reinstalling over an existing plugin replaces it cleanly; a same-name plugin from another source supersedes the old record

**Management**

- **Live enable/disable** — plugins and connectors switch on and off in place, no restart
- **Per-tool MCP control** — hover a tool to read its description and parameters, then click the status badge to disable or re-enable that one tool
- **Connector auth console** — verify tokens with a live 8-second probe (remote HTTP/SSE and local stdio), then save token, URL, custom headers, env, args, or OAuth per connector
- **Version-aware updates** — the update button lights up only when a newer version exists, and the tooltip names the target version
- **Clean uninstall** — one confirmation removes the plugin copy, skill registrations, patch entries, and cached tool state

**Interface**

- **Tuned light & dark themes** — a complete design-token set adjusted per mode, following the DSH UI theme automatically
- **Instant reopen** — sources and marketplace rows are cached locally, so the panel is interactive immediately while fresh data loads
- **Cached icon pipeline** — avatars stream through a local disk-cached proxy; plugins without an avatar get a deterministic badge from a 64-icon vector set
- **Smooth at full frame** — offscreen cards skip layout work (`content-visibility`), and scroll masks recalculate at most once per animation frame

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

1. Open the panel — the official **Claude plugin catalog** is already loaded and searchable. No setup needed.
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