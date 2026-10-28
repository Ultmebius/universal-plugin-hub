/**
 * Plugin entry point: mounts the HTTP routes once the profile composes
 * the webServer service. The 5 host packages that every LSP/hook-bridged
 * plugin will need (dsh-lsp, dsh-lsp-stdio, dsh-tool-lsp, dsh-hooks-claude-code,
 * dsh-hook-protocol) are provisioned on startup; `scripts/postinstall.js`
 * does the same during `dsh plugin add`, but package managers gate install
 * scripts behind an approval prompt, so startup is the reliable path.
 */
import { mountRoutes } from './routes.js'
import { cancelAllOAuthVerifications } from './oauth.js'
import { syncAllInstalledSkillsToDsh, installProfilePackages, findDshMainNodeModules, LSP_HOST_PACKAGES, HOOK_HOST_PACKAGES } from './install.js'
import { createSkillsManager } from './skills.js'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export const name = 'universal-plugin-hub'

export function apply(ctx) {
  const skills = createSkillsManager()
  ctx.inject(['skills'], (hostCtx) => {
    hostCtx.effect(() => skills.attach(hostCtx.skills, () => {
      hostCtx.emit('plugin-manager/changed')
    }), 'universal-plugin-hub: skills provider')
  })
  ctx.inject(['skills', 'agents'], (hostCtx) => {
    // Borrow DSH's own scope module so its opaque scope identity is shared.
    // A profile that cannot resolve it only loses the *scoped* half of the
    // skill switches; throwing here would take the whole plugin down with it,
    // so degrade to the global provider and say so once.
    let createScope = null
    try {
      const main = findDshMainNodeModules()
      if (!main) throw new Error('无法定位 DSH 原生 node_modules')
      createScope = createRequire(join(main, '.universal-plugin-hub-resolve.cjs'))('@deepseek-ai/dsh-scope').createScope
    } catch (err) {
      ctx.logger?.warn?.(`[universal-plugin-hub] scoped skill switches unavailable: ${err.message}`)
    }
    hostCtx.effect(() => skills.attachAgents(hostCtx, createScope), 'universal-plugin-hub: scoped skill switches')
  })
  // Ensure all installed plugin skills are immediately synced to $DSH_HOME/skills
  try {
    syncAllInstalledSkillsToDsh()
  } catch (err) {
    ctx.logger?.warn?.(`[universal-plugin-hub] skill sync error: ${err.message}`)
  }

  // Host packages disappear when a package manager re-resolves the profile
  // (pnpm moves unrecognized packages to node_modules/.ignored), so repair
  // them on every start instead of trusting a one-time install step.
  installProfilePackages([...LSP_HOST_PACKAGES, ...HOOK_HOST_PACKAGES]).catch((err) => {
    ctx.logger?.warn?.(`[universal-plugin-hub] host package provisioning skipped: ${err.message}`)
  })

  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      const unmount = mountRoutes(hostCtx.webServer, skills)
      return () => { unmount(); cancelAllOAuthVerifications() }
    }, 'universal-plugin-hub: http routes')
  })
}
