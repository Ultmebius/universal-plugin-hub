/**
 * Plugin entry point: mounts the HTTP routes once the profile
 * composes the webServer service.
 */
import { mountRoutes } from './routes.js'

export const name = 'universal-plugin-hub'

export function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => mountRoutes(hostCtx.webServer), 'universal-plugin-hub: http routes')
  })
}
