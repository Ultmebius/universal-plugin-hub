import { statSync, realpathSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, relative, isAbsolute, posix } from 'node:path'
import { createHash } from 'node:crypto'
import { marketRoot } from './store.js'
import { pluginPath } from './market.js'

const MAX_BYTES = 2 * 1024 * 1024
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const memory = new Map()
const pending = new Map()
const failures = new Map()

export function imageContentType(buffer) {
  if (!buffer?.length) return null
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg'
  if (/^GIF8[79]a/.test(buffer.subarray(0, 6).toString())) return 'image/gif'
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (buffer.subarray(4, 8).toString() === 'ftyp' && /avif|avis/.test(buffer.subarray(8, 32).toString())) return 'image/avif'
  if (buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0) return 'image/x-icon'
  const head = buffer.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '').trim()
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'image/svg+xml'
  return null
}

export function readLocalIcon(root, path) {
  const file = realpathSync(pluginPath(root, path))
  const rel = relative(realpathSync(root), file)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) throw new Error('Icon is outside plugin directory')
  const info = statSync(file)
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Invalid icon size')
  const buffer = readFileSync(file)
  const contentType = imageContentType(buffer)
  if (!contentType) throw new Error('Unsupported icon content')
  return { buffer, contentType }
}

/** Carry manifest assets through marketplace rows without exposing filesystem paths. */
export function buildPluginIcons(meta, { sourceId, name, dir, source } = {}) {
  const ui = meta?.interface || {}
  const proxy = (url) => `/universal-plugin-hub/api/icon?u=${encodeURIComponent(url)}`
  const toUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null
    if (/^https?:\/\//i.test(value)) return proxy(value)
    if (/^data:image\/(png|jpeg|gif|webp|avif|svg\+xml);/i.test(value) && value.length <= MAX_BYTES) return value
    if (dir) {
      try {
        const file = pluginPath(dir, value)
        const info = statSync(file)
        if (!info.isFile() || info.size > MAX_BYTES) return null
        return `/universal-plugin-hub/api/plugin-icon?sourceId=${encodeURIComponent(sourceId)}&name=${encodeURIComponent(name)}&path=${encodeURIComponent(value)}&v=${info.mtimeMs}-${info.size}`
      } catch { return null }
    }
    const repo = source?.url?.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i)
    if (repo && !isAbsolute(value) && !/^[a-z]:|^\\/i.test(value)) {
      const path = posix.normalize(posix.join(source.path || '', value))
      if (path === '..' || path.startsWith('../')) return null
      const ref = source.sha || source.ref || 'HEAD'
      return proxy(`https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`)
    }
    return null
  }
  const common = [ui.composerIcon, ui.icon, ui.iconSmall, ui.iconLarge, ui.logo, meta?.icon, meta?.iconUrl, meta?.logo]
  const values = (theme) => common.flatMap((v) => typeof v === 'object' && v ? [v[theme], v.default, v.url, v.src, v[theme === 'dark' ? 'light' : 'dark']] : [v])
  const defaults = dir ? ['assets/icon.svg', 'assets/logo.svg', 'assets/icon.png', 'assets/logo.png', 'icon.svg', 'logo.svg', 'icon.png', 'logo.png'] : []
  const light = [...new Set([ui.iconLight, ui.logoLight, meta?.iconLight, ...values('light'), ...defaults].map(toUrl).filter(Boolean))]
  const dark = [...new Set([ui.iconDark, ui.logoDark, meta?.iconDark, ...values('dark'), ...defaults].map(toUrl).filter(Boolean))]
  return { light, dark }
}

function remember(key, value) {
  if (memory.size >= 256) memory.delete(memory.keys().next().value)
  memory.set(key, { ...value, time: Date.now() })
  return value
}

/** Share concurrent loads, cache successful images, and briefly suppress failed URLs. */
export async function getOrFetchIcon(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Invalid icon URL')
  const cached = memory.get(url)
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached
  if (failures.get(url) > Date.now()) throw new Error('Icon temporarily unavailable')
  if (pending.has(url)) return pending.get(url)
  const task = (async () => {
    const file = join(marketRoot(), 'icons', `icon_${createHash('md5').update(url).digest('hex')}.bin`)
    try {
      const info = await stat(file)
      if (info.size <= MAX_BYTES && Date.now() - info.mtimeMs < CACHE_TTL) {
        const buffer = await readFile(file)
        const contentType = imageContentType(buffer)
        if (contentType) return remember(url, { buffer, contentType })
      }
    } catch {}
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: 'image/avif,image/webp,image/svg+xml,image/*;q=0.8' } })
    if (!response.ok) throw new Error(`Icon request failed: ${response.status}`)
    if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Icon too large') }
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > MAX_BYTES) throw new Error('Icon too large')
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)
    const contentType = imageContentType(buffer)
    if (!contentType) throw new Error('Unsupported icon content')
    try { await mkdir(join(marketRoot(), 'icons'), { recursive: true }); await writeFile(file, buffer) } catch {}
    return remember(url, { buffer, contentType })
  })()
  pending.set(url, task)
  try { return await task } catch (error) {
    if (failures.size >= 256) failures.delete(failures.keys().next().value)
    failures.set(url, Date.now() + 60_000)
    throw error
  } finally { pending.delete(url) }
}
