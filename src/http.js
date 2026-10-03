/** Minimal HTTP helpers for webServer route handlers. */

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload ?? {})
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

export function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > maxBytes) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/** Same-origin check (all market writes mutate the host filesystem). */
export function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // non-browser clients (curl) are allowed
  const host = req.headers.host
  if (!host) return false
  try {
    const o = new URL(origin)
    return o.host === host
  } catch {
    return false
  }
}
