# Universal Plugin Hub

English | [简体中文](README.zh.md)

Install and use plugins and skills from the Claude Code and Codex ecosystems in DeepSeek Harness (DSH).

Universal Plugin Hub combines a plugin marketplace with installation and capability management. After you add a source or import a plugin, it recognizes the plugin's Skills, Commands, Agents, MCP, Hooks, and LSP configuration, then converts or registers those capabilities for use in DSH conversations and tasks.

## Core features

### Bring plugin capabilities into DSH

| Plugin capability | How you use it in DSH |
| --- | --- |
| **Skills** | Synced to DSH's native skills directory and available from the composer's `/` menu, with scripts and resources in the skill directory preserved. |
| **Commands** | Markdown commands from Claude Code plugins are converted into DSH skills so you can use their workflows. |
| **Agents** | Subagent definitions become callable skills, with a delegation entry point that uses DSH's native `subagent` tool. |
| **MCP** | Connect plugin-declared MCP servers, configure service addresses, authentication, headers, and environment variables, then inspect tools and control which ones are enabled. |
| **Hooks** | Plugin hook configuration files are registered with DSH's hooks bridge and follow the plugin's enabled state. |
| **LSP** | Plugin-declared language servers are registered with DSH when their executables are available; missing executables are reported. |

### Discover, install, and manage plugins

- **Browse multiple marketplaces**: Start with the official Claude catalog (`anthropics/claude-plugins-official`), then add Claude or Codex marketplaces and Git repositories containing standalone plugins.
- **Import your plugins and skills**: Use local directories, Git URLs, archives, or a single `SKILL.md`. Skill collections can be parsed and imported as individual skills.
- **Manage the plugin lifecycle**: Installation, updates, enabling, disabling, and removal also manage the associated skills, MCP connectors, Hooks, and LSP registrations.
- **Manage MCP servers together**: View manually added servers and plugin connectors on one page, edit their configuration, expand tool lists, and control individual tools.

## Interface preview

Icon cards show plugin descriptions and installation states, with source tabs, search, filters, and sorting to help you find what you need. The interface follows DSH's light and dark themes. Hover previews let you scroll descriptions and select text, while expanded MCP tools appear as compact status pills. Catalog and icon caching help content appear quickly on return visits.

![Overview](assets/hero.png)

## Installation

Supports DeepSeek Harness Desktop and the CLI web profile.

### DeepSeek Harness Desktop

1. Open DeepSeek Harness.
2. Go to **Settings** -> **Plugins**.
3. Click **Add plugin** and enter the package name:

   ```text
   universal-plugin-hub
   ```

   You can also enter the repository URL:

   ```text
   https://github.com/Ultmebius/universal-plugin-hub.git
   ```

4. Click install.

### Command line

Run this in your terminal:

```bash
dsh plugin add universal-plugin-hub
```

## Usage

1. **Browse and install**: Search by name or keyword, choose a source, and click **Install** on a plugin card.
2. **Add a marketplace**: Open the **+** menu, choose **Add plugin marketplace**, and enter a Claude or Codex repository URL. Review the parsed content before adding it.
3. **Import plugins or skills**: Choose **Upload plugin** from the **+** menu. Enter a local path or Git URL, or select a supported file, then review the preview and confirm the import.
4. **Manage installed plugins**: Click **Manage** on an installed plugin to configure connectors, manage capabilities, update, or uninstall it.
5. **Use MCP tools**: Open the **MCP** tab to view servers and plugin connectors. Expand a server's tools to view their descriptions and control which tools are enabled.

After installing a plugin with Skills or Commands, find its skills in the DSH composer's `/` menu. For a plugin with MCP connectors, open the **From plugins** group in the MCP tab to configure connections and inspect tools.

## Supported content

| Content | Recognized structure |
| --- | --- |
| Claude marketplace | `.claude-plugin/marketplace.json` |
| Codex marketplace | `.agents/plugins/marketplace.json` |
| Claude plugin | `.claude-plugin/plugin.json` |
| Codex plugin | `.codex-plugin/plugin.json` |
| Agent Skills | A `SKILL.md` file, a skill directory, or a collection of skill directories |

When a plugin or marketplace includes both Claude and Codex descriptors, the Claude format takes precedence.

File uploads accept `.zip`, `.tgz`, `.tar.gz`, and `SKILL.md`, up to 22 MB per upload. Larger archives can be extracted and imported through a directory path. Import the complete directory or archive for skills with scripts or other resources so relative paths remain usable.

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
