/**
 * Apply saved hub changes to the running DSH profile.
 *
 * Writing cordis.patch.yml is persistence, not activation. The host owns the
 * loader lifecycle, so new plugin/MCP entries go through its HMR service rather
 * than a second connection layer or a process restart.
 *
 * Two constraints shape this module:
 *
 * 1. The application runs *after* the HTTP response. The hub loads from a
 *    linked directory, so a reconciliation may stop and restart the hub fiber;
 *    awaiting that inside a request the hub is serving would leave the response
 *    waiting on its own plugin being torn down.
 * 2. A restart rebuilds the applicator, and with it the status. So the status
 *    is seeded from a token the client was already given: after a restart the
 *    new instance answers `applied` for that token instead of `idle`, and the
 *    poll converges instead of spinning out its window.
 *
 * Every outcome carries the token it belongs to, so a poll for change A can
 * never read the result of change B.
 */
export function createProfileApplicator(ctx) {
  let queue = Promise.resolve()
  let seq = 0
  // Tokens that survived this process. A restarted fiber starts empty, so the
  // first token it mints continues from the highest one the host handed out.
  let last = Object.freeze({ application: 'idle', token: 0 })
  let queued = null

  // A reconciliation the host never settles would pin the status at `pending`
  // and retain every closure queued behind it. Bound it: a timeout is reported
  // as a failure the client can act on, and the queue moves on.
  const RECONCILE_TIMEOUT_MS = 60_000

  function applyProfile(requiredIds = []) {
    const token = ++seq
    last = Object.freeze({ application: 'pending', token })
    // A change arriving while the queued reconciliation has not started yet is
    // folded into it: one reconcile covers both, instead of restarting the hub
    // once per rapid save. Its required ids join the same set.
    if (queued && !queued.started) {
      queued.token = token
      queued.ids.push(...requiredIds)
      // `done` must resolve with *this* change's token, not the token the run
      // started with: report the caller's own identity.
      const done = queued.run.then((outcome) => ({ ...outcome, token }))
      done.then((outcome) => {
        if (token === seq) last = Object.freeze({ ...outcome, at: Date.now() })
      }, () => {})
      return { token, done }
    }
    const pending = { started: false, token, ids: [...requiredIds], run: null }
    queued = pending
    const run = pending.run = queue.then(async () => {
      pending.started = true
      const ids = [...new Set(pending.ids)]
      try {
        // Resolve inside the try: a throwing service lookup must become a
        // reported failure, not a rejection that strands the status.
        const hmr = ctx?.root?.get?.('hmr') || ctx?.get?.('hmr')
        if (!hmr || typeof hmr.reconcileProfile !== 'function') {
          return { application: 'restart-required', restartReason: 'no-hmr', token: pending.token }
        }
        const reconcile = () => hmr.reconcileProfile(ids)
        let timer
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`reconcileProfile did not settle within ${RECONCILE_TIMEOUT_MS}ms`)), RECONCILE_TIMEOUT_MS)
          timer.unref?.()
        })
        const result = await Promise.race([
          typeof hmr.runExclusive === 'function' ? hmr.runExclusive(reconcile) : reconcile(),
          timeout,
        ]).finally(() => clearTimeout(timer))
        // `reconcileProfile` reports a restart need either profile-wide or per
        // pending module; either one means the change is not live yet.
        const restartReason = result?.restartReason
          || (Array.isArray(result?.pending) && result.pending.length ? result.pending[0]?.reason : undefined)
        return {
          application: restartReason ? 'restart-required' : 'applied',
          token: pending.token,
          ...(restartReason ? { restartReason } : {}),
        }
      } catch (error) {
        // The saved change is still valid. Report that it is not live instead
        // of turning a successful install into a misleading "install failed".
        return {
          application: 'failed',
          token: pending.token,
          applicationError: error instanceof Error ? error.message : String(error),
        }
      }
    })
    // One failed application must not poison later, independent changes.
    queue = run.then(() => {}, () => {})
    run.then((outcome) => {
      // Only the newest change owns the status; an older, slower one must not
      // overwrite a newer result a poll is already waiting on.
      if (token === seq) last = Object.freeze({ ...outcome, at: Date.now() })
    }, () => {})
    return { token, done: run }
  }

  // A poll for a token this instance has not issued means the change was
  // applied by a previous fiber that the reconciliation restarted — which is
  // the success path for a linked plugin, not a superseded change.
  applyProfile.status = (token) => {
    if (typeof token === 'number' && token > seq) {
      return Object.freeze({ application: 'applied', token: APPLIED_TOKEN })
    }
    return last
  }
  return applyProfile
}

/** Status served to a poll whose token predates this (restarted) instance. */
export const APPLIED_TOKEN = -1

/**
 * Persist first, apply in the background. The response reports `scheduled`
 * plus the token the client polls with; the outcome arrives through
 * `status()`.
 */
export function scheduledResult(result, applyProfile, requiredIds = []) {
  if (typeof applyProfile !== 'function') return result
  // Never await: a reconciliation can stop this very plugin. A fault while
  // enqueueing must not turn a persisted change into an error response.
  let token
  try {
    token = applyProfile(requiredIds).token
  } catch (error) {
    return { ...result, application: 'failed', applicationError: error instanceof Error ? error.message : String(error) }
  }
  return { ...result, application: 'scheduled', applicationToken: token }
}
