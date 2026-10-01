#!/usr/bin/env node
/**
 * Hub postinstall: pre-provision host packages that DSH's LSP provider
 * and Claude hooks bridge need at runtime, into DSH's node_modules tree.
 * Non-fatal: if provisioning is skipped or fails, warn and exit 0 so hub
 * installation always succeeds.
 */
import { installProfilePackages, LSP_HOST_PACKAGES, HOOK_HOST_PACKAGES } from '../src/install.js'

const ALL_HOST_PACKAGES = [...LSP_HOST_PACKAGES, ...HOOK_HOST_PACKAGES]

try {
  const result = await installProfilePackages(ALL_HOST_PACKAGES)
  if (!result.ok) {
    console.warn(`universal-plugin-hub: host package provisioning skipped: ${result.error}`)
  } else if (result.installed?.length > 0) {
    console.log(`universal-plugin-hub: installed host packages (${result.installed.join(', ')})`)
  } else {
    console.log('universal-plugin-hub: host packages already present, nothing to do')
  }
} catch (err) {
  console.warn(`universal-plugin-hub: host package provisioning skipped (${err.message})`)
}
