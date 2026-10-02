/**
 * Plugin entry point: mounts the HTTP routes once the profile composes
 * the webServer service. The 5 host packages that every LSP/hook-bridged
 * plugin will need (dsh-lsp, dsh-lsp-stdio, dsh-tool-lsp, dsh-hooks-claude-code,
 * dsh-hook-protocol) are pre-provisioned by `scripts/postinstall.js`, which
 * runs after `npm install` in the plugin dir as part of
 * `dsh plugin add universal-plugin-hub`. A provisioning failure there
 * makes `npm install` exit non-zero, so DSH reports the hub install as
 * failed — the user is never told "installed" while plugins they manage
 * through it are still missing dependencies.
 */
import { mountRoutes } from './routes.js'
import { syncAllInstalledSkillsToDsh } from './install.js'

export const name = 'universal-plugin-hub'

export function apply(ctx) {
  // Ensure all installed plugin skills are immediately synced to $DSH_HOME/skills
  try {
    syncAllInstalledSkillsToDsh()
  } catch (err) {
    ctx.logger?.warn?.(`[universal-plugin-hub] skill sync error: ${err.message}`)
  }

  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => mountRoutes(hostCtx.webServer), 'universal-plugin-hub: http routes')
  })
}
