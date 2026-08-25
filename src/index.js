/**
 * Plugin entry point: synchronously pre-provisions the host packages every
 * LSP/hook-bridged plugin will need, then mounts the HTTP routes. The host
 * package install is awaited — if it fails, this throw propagates to DSH's
 * plugin loader and the hub install is reported as failed, so a user who
 * ran `dsh plugin add universal-plugin-hub` is never told "installed"
 * while the plugins they manage through it are still missing dependencies.
 *
 * `installProfilePackages` is idempotent: it skips any package whose
 * `package.json` is already present in the DSH installation, so warm DSH
 * restarts cost nothing.
 */
import { mountRoutes } from './routes.js'
import { installProfilePackages, LSP_HOST_PACKAGES, HOOK_HOST_PACKAGES } from './install.js'

const ALL_HOST_PACKAGES = [...LSP_HOST_PACKAGES, ...HOOK_HOST_PACKAGES]

export const name = 'universal-plugin-hub'

export async function apply(ctx) {
  const result = await installProfilePackages(ALL_HOST_PACKAGES)
  if (!result.ok) {
    throw new Error(`universal-plugin-hub: host package provisioning failed: ${result.error}`)
  }

  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => mountRoutes(hostCtx.webServer), 'universal-plugin-hub: http routes')
  })
}
