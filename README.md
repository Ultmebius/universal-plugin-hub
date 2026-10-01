# Universal Plugin Hub

English | [简体中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-brightgreen)](https://github.com/topics/dsh-plugin)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-Plugin-blueviolet)](https://github.com/topics/deepseek-harness)

A graphical plugin marketplace and manager for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Comes with the official Claude plugin catalog preloaded and supports adding custom Git sources to install skills, subagents, MCP connectors, and LSP servers with one click.

![Overview](assets/hero.png)

## Installation

### Method 1: DeepSeek Harness Desktop (UI)

1. Open the DeepSeek Harness Desktop application.
2. Go to **Settings** -> **Plugins**.
3. In the install input box, enter the Git repository URL:
   ```text
   https://github.com/Ultmebius/universal-plugin-hub.git
   ```
   *(or shorthand `github:Ultmebius/universal-plugin-hub`; if published on npm, `universal-plugin-hub` also works)*
4. Click install. Once installed, access the marketplace from the navigation menu.

### Method 2: Command Line (CLI)

If you are using DSH via CLI or web mode:

```bash
# Install directly from GitHub repository
dsh plugin add https://github.com/Ultmebius/universal-plugin-hub.git

# Or use npm package name (once published to npm)
dsh plugin add universal-plugin-hub
```

### Method 3: Manual Installation

```bash
# Navigate to DSH plugins directory
cd ~/.dsh/plugins

# Clone repository
git clone https://github.com/Ultmebius/universal-plugin-hub.git
cd universal-plugin-hub

# Install dependencies and initialize
npm install
```

Restart DeepSeek Harness after installation to load the plugin.

---

## Features

- **Preloaded Catalogs**: The official Claude plugin catalog (`anthropics/claude-plugins-official`) is available out of the box.
- **Custom Git Sources**: Add any Git repository as a plugin source.
- **Automated Wiring**:
  - **Skills & Commands**: Automatically mapped into DSH agent skills.
  - **Subagents**: Compiled into delegated Hub skills for multi-agent workflows.
  - **MCP Connectors**: Configured into DSH with per-tool enable/disable switches and token validation.
  - **LSP Servers**: Registered as stdio language services for IDE features.
- **Profile Adaptability**: Automatically supports both DeepSeek Harness Desktop and Web environments.

---

## Quick Start

1. **Browse & Search**: Open Universal Plugin Hub and find plugins by name, author, or keywords.
2. **One-Click Install**: Click **Install** on any plugin card. The hub clones the source, compiles skills, and binds connectors.
3. **Manage & Configure**:
   - Toggle individual plugins and MCP tools on or off without restarting.
   - Configure authentication tokens and environment variables per connector.
   - Check for updates or uninstall with a single click.

---

## File Locations

All local state is stored under `~/.dsh/`:

| Path | Description |
| :--- | :--- |
| `~/.dsh/agent-skills/universal-plugin-hub/state.json` | Registered sources and installed plugin records |
| `~/.dsh/agent-skills/universal-plugin-hub/installed/` | Working copies of installed plugins |
| `~/.dsh/agent-skills/universal-plugin-hub/market/` | Cached Git repositories of plugin sources |
| `~/.dsh/profiles/<profile>/cordis.patch.yml` | Injected MCP, LSP, and runtime configurations |

---

## Development

```bash
# Syntax check
node --check src/index.js
node --check client/client.js

# Compatibility test
node scratch/test-desktop-compat.js
```

The frontend is a single-file React component in `client/client.js` injected directly by DSH runtime. Changes take effect on browser reload without a build step.

---

## License

[MIT License](./LICENSE)