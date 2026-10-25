# Universal Plugin Hub

English | [简体中文](README.zh.md)

A plugin marketplace for DeepSeek Harness (DSH). Browse Claude and Codex plugin catalogs, import plugins and Agent Skills, and manage MCP tools, subagents, and LSP services in one place.

![Overview](assets/hero.png)

## Interface and experience

Browse plugins through a card layout with recognizable icons, concise descriptions, and clear installation states. Source tabs, search, filters, and sorting keep a growing catalog easy to explore.

- **Light and dark themes**: Follows the DSH theme, with matching card surfaces, text, controls, and plugin icon variants.
- **Details at a glance**: Hover over a plugin or tool to open its description. Move into the preview to scroll or select text, then move to another item to continue exploring.
- **Compact tool lists**: MCP tools appear as labeled pills with status indicators. Expand a server to inspect its tools and control each tool's enabled state.
- **Consistent management**: Plugin cards lead into a management view for connectors and capabilities; the MCP tab brings manually added servers and plugin connectors together in clearly labeled groups.

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

## Features

- **Preloaded catalog**: Loads the official Claude plugin catalog (`anthropics/claude-plugins-official`) by default.
- **Claude and Codex sources**: Add Git repositories containing plugin marketplaces or standalone plugins.
- **Plugin and Skills import**: Import a local directory, an archive, a Git repository, or a `SKILL.md` file. Skill collections are recognized as individual skills.
- **MCP management**: View manually added servers and plugin connectors in the MCP tab. Expand tool lists, toggle individual tools, and configure connections and authentication.
- **Fast catalog browsing**: Displays cached catalogs while sources refresh in the background. Icon caching helps repeated visits load quickly.
- **Agent integration**: Syncs commands and skills to DSH, compiles subagents into Hub skills for delegation, and registers MCP connectors and LSP services.
- **Environment support**: Works in both DeepSeek Harness Desktop and the CLI web profile.

## Supported content

| Content | Recognized structure |
| --- | --- |
| Claude marketplace | `.claude-plugin/marketplace.json` |
| Codex marketplace | `.agents/plugins/marketplace.json` |
| Claude plugin | `.claude-plugin/plugin.json` |
| Codex plugin | `.codex-plugin/plugin.json` |
| Agent Skills | A `SKILL.md` file, a skill directory, or a collection of skill directories |

File uploads accept `.zip`, `.tgz`, `.tar.gz`, and `SKILL.md`, up to 22 MB per upload. Larger archives can be extracted and imported through a directory path. Import the complete directory or archive for skills with scripts or other resources so relative paths remain usable.

## Usage

1. **Browse and install**: Search by name or keyword, choose a source, and click **Install** on a plugin card.
2. **Add a marketplace**: Open the **+** menu, choose **Add plugin marketplace**, and enter a Claude or Codex repository URL. Review the parsed content before adding it.
3. **Import plugins or skills**: Choose **Upload plugin** from the **+** menu. Enter a local path or Git URL, or select a supported file, then review the preview and confirm the import.
4. **Manage installed plugins**: Click **Manage** on an installed plugin to configure connectors, manage capabilities, update, or uninstall it.
5. **Use MCP tools**: Open the **MCP** tab to view servers and plugin connectors. Expand a server's tools to view their descriptions and control which tools are enabled.

## Data and directory layout

- **Hub installation**: `~/.dsh/profiles/desktop/node_modules/universal-plugin-hub`
- **Marketplace plugins**:
  - Installed plugin files: `~/.dsh/agent-skills/universal-plugin-hub/installed/<plugin-name>`
  - Cloned source cache: `~/.dsh/agent-skills/universal-plugin-hub/market/<source-id>`
  - State and source registry: `~/.dsh/agent-skills/universal-plugin-hub/state.json`
- **Runtime patch configuration**: `~/.dsh/profiles/<profile>/cordis.patch.yml`

`~/.dsh` is the default data directory. Paths follow `DSH_HOME` when it is configured.

## License

[MIT License](./LICENSE)
