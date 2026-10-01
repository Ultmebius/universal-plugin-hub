# Universal Plugin Hub

English | [简体中文](README.zh.md)

A plugin marketplace for DeepSeek Harness (DSH). It comes with the official Claude plugin catalog preloaded and supports installing agent skills, subagents, MCP tools, and LSP servers with one click.

![Overview](assets/hero.png)

## Installation

### DeepSeek Harness Desktop

1. Open DeepSeek Harness.
2. Go to **Settings** -> **Plugins**.
3. Paste the repository URL into the input field:
   ```text
   https://github.com/Ultmebius/universal-plugin-hub.git
   ```
4. Click install.

### Command line

Run this in your terminal:

```bash
dsh plugin add https://github.com/Ultmebius/universal-plugin-hub.git
```

### From source

```bash
cd ~/.dsh/plugins
git clone https://github.com/Ultmebius/universal-plugin-hub.git
cd universal-plugin-hub
npm install
```

---

## Features

- **Preloaded catalog**: Loads the official Claude plugin catalog (`anthropics/claude-plugins-official`) by default.
- **Custom Git sources**: Add any GitHub or Git repository as a plugin source.
- **Automated setup**:
  - Commands and skills map into DSH agent skills automatically.
  - Subagents compile into Hub skills for agent delegation.
  - MCP connectors register into configuration files, with per-tool toggles and token testing.
  - LSP servers register automatically.
- **Environment support**: Works in both DeepSeek Harness Desktop and the CLI web profile.

---

## Usage

1. **Browse and search**: Open the marketplace panel and search plugins by name or keywords.
2. **Install**: Click **Install** on a plugin card. The hub downloads the plugin and configures it.
3. **Manage**: Toggle plugins, configure MCP tokens, or uninstall plugins from the management tab.

---

## Data and directory layout

- **Hub installation**:
  - DSH Desktop install: `~/.dsh/profiles/desktop/node_modules/universal-plugin-hub`
  - Local plugin directory: `~/.dsh/plugins/universal-plugin-hub`
- **Marketplace plugins**:
  - Installed plugin files: `~/.dsh/agent-skills/universal-plugin-hub/installed/<plugin-name>`
  - Cloned source cache: `~/.dsh/agent-skills/universal-plugin-hub/market/<source-id>`
  - State and source registry: `~/.dsh/agent-skills/universal-plugin-hub/state.json`
- **Runtime patch configuration**:
  - `~/.dsh/profiles/<profile>/cordis.patch.yml`

---

## License

[MIT License](./LICENSE)