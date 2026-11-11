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
import { syncAllInstalledSkillsToDsh, installProfilePackages, findDshMainNodeModules, toolCallIconGroups, LSP_HOST_PACKAGES, HOOK_HOST_PACKAGES } from './install.js'
import { createSkillsManager } from './skills.js'
import { restoreUploadedSkills } from './skill-uploads.js'
import { createProfileApplicator } from './runtime.js'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export const name = 'universal-plugin-hub'

export function apply(ctx) {
  // The running host knows which profile it booted. Guessing from the
  // filesystem writes patches into the wrong profile (e.g. a custom profile
  // name would land in `web`), and the change then never loads.
  // `profileContext` is provided asynchronously, so it must be injected —
  // reading it eagerly here returns undefined on a real host.
  // Everything below that resolves a profile path has to run *after* this, so
  // it lives inside the injection rather than beside it.
  let provisioned = Promise.resolve()
  ctx.inject(['profileContext'], async (hostCtx) => {
    const name = hostCtx.profileContext?.name
    if (typeof name === 'string' && name.trim()) process.env.DSH_PROFILE = name.trim()

    // Ensure all installed plugin skills are immediately synced to $DSH_HOME/skills
    try {
      restoreUploadedSkills()

      await syncAllInstalledSkillsToDsh()
    } catch (err) {
      ctx.logger?.warn?.(`[universal-plugin-hub] skill sync error: ${err.message}`)
    }

    // Host packages disappear when a package manager re-resolves the profile
    // (pnpm moves unrecognized packages to node_modules/.ignored), so repair
    // them on every start instead of trusting a one-time install step.
    // Detached on purpose: Cordis awaits whatever apply returns, and this does
    // network probes and tarball extraction — the hub fiber must not wait on it.
    // Exposed on the callback for tests that need to await it.
    const provisioning = installProfilePackages([...LSP_HOST_PACKAGES, ...HOOK_HOST_PACKAGES]).catch((err) => {
      ctx.logger?.warn?.(`[universal-plugin-hub] host package provisioning skipped: ${err.message}`)
    })
    provisioned = provisioning
  })
  // Exposed only so a test can await the detached provisioning.
  apply.provisioned = () => provisioned
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
  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      const unmount = mountRoutes(hostCtx.webServer, skills, createProfileApplicator(ctx))
      const offBoot = hostCtx.on?.('webserver/index-inject', (table) => {
        try {
          const value = []
          let bytes = 2
          for (const group of toolCallIconGroups()) {
            const size = Buffer.byteLength(JSON.stringify(group)) + 1
            if (bytes + size > 128 * 1024) continue
            value.push(group)
            bytes += size
            if (value.length === 12) break
          }
          if (value.length) table.push({ kind: 'global', name: '__UPH_TOOL_CALL_ICONS__', value })
        } catch (error) {
          ctx.logger?.warn?.(`[universal-plugin-hub] MCP tool icon boot data unavailable: ${error.message}`)
        }
      })
      return () => { offBoot?.(); unmount(); cancelAllOAuthVerifications() }
    }, 'universal-plugin-hub: http routes')
  })
}
