#!/usr/bin/env node
/**
 * Hub postinstall: pre-provision the 5 host packages that DSH's LSP provider
 * and Claude hooks bridge need at runtime, into DSH's main node_modules tree.
 *
 * Runs automatically after `npm install` in the plugin dir — which DSH
 * performs during `dsh plugin add universal-plugin-hub`. A non-zero exit
 * fails the `npm install`, so DSH reports the hub install as failed when
 * (and only when) a required host package can't be installed.
 *
 * Version resolution matches the running DSH release: same major.minor
 * line via `matchingPublishedVersion` in `installProfilePackages`, so a
 * future DSH 0.2.x pulls a 0.2.x host package without any code change here.
 */
import { installProfilePackages, LSP_HOST_PACKAGES, HOOK_HOST_PACKAGES } from '../src/install.js'

const ALL_HOST_PACKAGES = [...LSP_HOST_PACKAGES, ...HOOK_HOST_PACKAGES]

const result = await installProfilePackages(ALL_HOST_PACKAGES)
if (!result.ok) {
  console.error(`universal-plugin-hub: host package provisioning failed: ${result.error}`)
  process.exit(1)
}
const fresh = result.installed
if (fresh.length > 0) {
  console.log(`universal-plugin-hub: installed host packages (${fresh.join(', ')})`)
} else {
  console.log('universal-plugin-hub: host packages already present, nothing to do')
}
