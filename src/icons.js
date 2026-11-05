import { statSync, realpathSync, readFileSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
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
const bundledIconRoot = new URL('../assets/fluent-3d/', import.meta.url)
const bundledIconFiles = new Map(Object.values(JSON.parse(readFileSync(new URL('manifest.json', bundledIconRoot), 'utf8')).icons).map(icon => [icon.url, icon.file]))

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

// Claude's plugin manifest has no icon field and marketplace entries do not
// carry one either, so a plugin's artwork can only be found on disk. Matching a
// fixed list of nine filenames missed most of it, which sent those rows to the
// network for the author's GitHub avatar: the wrong picture, and a round trip
// on every cold start.
const ICON_FILE = /\.(?:svg|png|webp|jpe?g|ico)$/i
// Names that promise artwork, names that promise a different kind of picture.
const ICON_STRONG = /(?:^|[-_. ])(?:app[-_]?icon|icon|glyph|favicon|emblem)(?:[-_. ]|$)/i
const ICON_WEAK = /(?:^|[-_. ])(?:logo|brand|avatar|mark)(?:[-_. ]|$)/i
// Anchored like the two patterns above: an unanchored substring test rejected
// `heroku-icon.png` on "hero" and `photon-logo.png` on "photo", which is the
// very failure this discovery is meant to remove.
const ICON_NOISE = /(?:^|[-_. ])(?:screenshots?|screen[-_]?shots?|examples?|previews?|banners?|covers?|thumbs?|thumbnails?|hero|demo|readme|illustrations?|diagrams?|charts?|backgrounds?|wallpapers?|social|samples?|fixtures?|mocks?|placeholders?|spinners?|loaders?|sprites?|swatches?|captures?|photos?)(?:[-_. ]|$)/i
const ICON_SKIP_DIRS = new Set([
  'node_modules', '.git', '.github', 'skills', 'skill', 'commands', 'command', 'agents', 'hooks',
  'docs', 'doc', 'tests', 'test', '__tests__', 'scripts', 'src', 'lib', 'dist', 'build',
  'examples', 'templates', 'locales', 'i18n',
])

/**
 * Pixel size read from a file header.
 *
 * Cheap enough to run on every candidate, and it is the only signal that
 * separates an icon from a banner or a screenshot regardless of its name.
 *
 * The format is decided by `imageContentType` so there is one answer to "what
 * is this file" — the PNG branch below only reads fields, it does not re-sniff
 * magic numbers. Note the PNG branch needs a full 24-byte IHDR, which is
 * checked before reading.
 */
function imageSize(file) {
  let handle
  try {
    handle = openSync(file, 'r')
    const head = Buffer.alloc(4096)
    const read = readSync(handle, head, 0, head.length, 0)
    const bytes = head.subarray(0, read)
    const kind = imageContentType(bytes)
    if (kind === 'image/png') {
      if (bytes.length < 24) return null
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    }
    if (kind !== 'image/svg+xml') return null
    const svg = bytes.toString('utf8').match(/<svg\b[^>]*>/i)
    if (!svg) return null
    const attribute = (name) => {
      const found = svg[0].match(new RegExp(`\\b${name}\\s*=\\s*["']\\s*([0-9.]+)`, 'i'))
      return found ? Number(found[1]) : null
    }
    const width = attribute('width')
    const height = attribute('height')
    if (width > 0 && height > 0) return { width, height }
    const box = svg[0].match(/\bviewBox\s*=\s*["']\s*([-\d.]+)[ ,]+([-\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i)
    if (box && Number(box[3]) > 0 && Number(box[4]) > 0) return { width: Number(box[3]), height: Number(box[4]) }
  } catch {
  } finally {
    if (handle !== undefined) try { closeSync(handle) } catch {}
  }
  return null
}

/**
 * Icon files a plugin ships without declaring, best candidate first.
 *
 * Ranked the way a desktop picks an application icon: artwork by name first,
 * then squareness and size, then how close the file sits to the plugin root.
 * A file needs at least one naming signal, so a passing diagram cannot win.
 */
function discoverIconFiles(dir, pluginName) {
  if (!dir) return []
  const key = String(pluginName || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const found = []
  let visited = 0

  const walk = (relative, depth) => {
    if (depth > 2 || visited > 400) return
    let entries
    try { entries = readdirSync(relative ? join(dir, relative) : dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!ICON_SKIP_DIRS.has(entry.name.toLowerCase())) walk(path, depth + 1)
        continue
      }
      visited++
      if (!ICON_FILE.test(entry.name) || ICON_NOISE.test(entry.name)) continue

      const base = entry.name.replace(/\.[^.]+$/, '').toLowerCase()
      const flat = base.replace(/[^a-z0-9]/g, '')
      let score = 0
      if (ICON_STRONG.test(base)) score += 12
      else if (ICON_WEAK.test(base)) score += 8
      if (key && (flat === key || (flat.length >= 3 && key.startsWith(flat)) || (key.length >= 3 && flat.startsWith(key)))) score += 9
      if (score === 0) continue

      const size = imageSize(join(dir, path))
      // A portrait mark is a logotype, not an app tile: it is authored to sit on
      // the publisher's own background, so drawing it into our rounded container
      // shows a bare glyph over whatever our well is. Exa's 151x182 blue line
      // art looked like a blank blue tile this way. It is kept — dropping it
      // only moved the problem to a GitHub avatar — but flagged so it is tried
      // after the brand artwork the client already knows.
      const portrait = !!size && Math.abs(size.width - size.height) / Math.max(size.width, size.height) > 0.15
      if (size && !portrait) {
        // An icon is square, and a 4:1 file is a banner however it is named.
        score += 6
        const edge = Math.min(size.width, size.height)
        if (edge >= 96) score += 3
        else if (edge < 32) score -= 14
        // A file too small to read is not artwork at any shape.
        if (edge < 24) score -= 20
      }
      score += Math.max(0, 3 - depth)
      if (/\.svg$/i.test(entry.name)) score += 1
      found.push({ path, score, dark: /dark/i.test(base), portrait })
    }
  }

  walk('', 0)
  return found.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
}

// A plugin-local icon is at most a few hundred KB and sits on a local disk, so
// carrying its bytes in the row costs one decode and removes the request the
// first paint would otherwise wait on. Remote avatars (GitHub, favicons) stay
// behind the proxy: they are not ours to inline and would be far too big.
//
// The inline set is a budget, not a rule: every icon carried in the list is
// paid again on each /state fetch, and the card renders at 38px. At 12KB the
// whole marketplace payload stays under 1MB and 67 rows still paint with no
// request; the rest keep the served URL, which is a local disk read.

const INLINE_LIMIT = 12 * 1024

/** A local file's bytes as a data URL, or null when it is too big or unreadable. */
function inlineFile(file) {
  try {
    const info = statSync(file)
    if (!info.isFile() || info.size > INLINE_LIMIT) return null
    const buffer = readFileSync(file)
    const contentType = imageContentType(buffer)
    return contentType ? `data:${contentType};base64,${buffer.toString('base64')}` : null
  } catch { return null }
}

/**
 * Carry manifest assets through marketplace rows without exposing filesystem paths.
 *
 * Local artwork is inlined as a data URL so a cold start paints it in the same
 * frame as the row itself. Rows still carry a `/api/plugin-icon` URL for the
 * full-size copy and for the installed-plugin route, but the first candidate is
 * always something the client can draw without a round trip.
 */
export function buildPluginIcons(meta, { sourceId, name, dir, source } = {}) {
  const ui = meta?.interface || {}
  const proxy = (url) => `/universal-plugin-hub/api/icon?v=2&u=${encodeURIComponent(url)}`
  // Local files are stat'd once here and the same File is reused for the inline
  // copy, so discovering artwork and inlining it is one pass over the disk.
  const files = new Map()
  const toUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null
    if (/^https?:\/\//i.test(value)) return proxy(value)
    if (/^data:image\/(png|jpeg|gif|webp|avif|svg\+xml);/i.test(value) && value.length <= MAX_BYTES) return value
    if (dir) {
      try {
        const file = pluginPath(dir, value)
        const info = statSync(file)
        if (!info.isFile() || info.size > MAX_BYTES) return null
        const url = `/universal-plugin-hub/api/plugin-icon?sourceId=${encodeURIComponent(sourceId)}&name=${encodeURIComponent(name)}&path=${encodeURIComponent(value)}&v=${info.mtimeMs}-${info.size}`
        files.set(url, file)
        return url
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
  const found = discoverIconFiles(dir, name)
  // Portrait artwork is not a tile candidate: it leaves the normal ranking
  // entirely and is reported separately, so nothing can arrange it back into
  // the lead position.
  const tiles = found.filter((f) => !f.portrait)
  const plain = tiles.filter((f) => !f.dark).map((f) => f.path)
  // A dark-mode variant is a bonus, not a requirement: a plugin that ships only
  // one dark-named logo still needs a light-mode picture.
  const shade = tiles.filter((f) => f.dark).map((f) => f.path)
  const portrait = found.filter((f) => f.portrait).map((f) => f.path)
  const build = (theme) => {
    const declared = theme === 'dark'
      ? [ui.iconDark, ui.logoDark, meta?.iconDark, ...values('dark'), ...shade, ...plain]
      : [ui.iconLight, ui.logoLight, meta?.iconLight, ...values('light'), ...plain, ...shade]
    const urls = [...new Set(declared.map(toUrl).filter(Boolean))]
    // The inline copy leads, so the first candidate needs no request at all.
    // Only the local files this call already stat'd are considered; a remote
    // candidate never reaches the disk and so can never be inlined.
    const inline = urls.map((url) => files.get(url) && inlineFile(files.get(url))).find(Boolean)
    return inline ? [inline, ...urls.filter((url) => url !== inline)] : urls
  }
  const served = (paths) => [...new Set(paths.map(toUrl).filter(Boolean))]
  // Reported apart from the tile candidates so the client can try them after
  // the brand artwork it knows about, instead of leading every row with them.
  return {
    light: build('light'),
    dark: build('dark'),
    portrait: { light: served(portrait), dark: served(portrait) },
  }
}

function remember(key, value) {
  if (memory.size >= 256) memory.delete(memory.keys().next().value)
  memory.set(key, { ...value, time: Date.now() })
  return value
}

function iconCacheFile(url) {
  return join(marketRoot(), 'icons', `icon_${createHash('md5').update(url).digest('hex')}.bin`)
}

/** Fetch one icon from upstream and store it. Throws so callers can decide. */
async function downloadIcon(url, file) {
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
  return { buffer, contentType }
}

/** Share concurrent loads, cache successful images, and briefly suppress failed URLs. */
export async function getOrFetchIcon(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Invalid icon URL')
  // Named paths on the avatar CDN return a generic image; GitHub resolves the
  // account name to the actual numeric avatar URL before redirecting.
  const parsed = new URL(url)
  if (parsed.hostname === 'avatars.githubusercontent.com' && /^\/[a-z0-9_-]+\/?$/i.test(parsed.pathname)) {
    url = `https://github.com/${parsed.pathname.split('/')[1]}.png?size=${parsed.searchParams.get('s') || '80'}`
  }
  const cached = memory.get(url)
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached
  const bundledFile = bundledIconFiles.get(url)
  if (bundledFile) return remember(url, { buffer: readFileSync(new URL(bundledFile, bundledIconRoot)), contentType: 'image/png' })
  if (failures.get(url) > Date.now()) throw new Error('Icon temporarily unavailable')
  if (pending.has(url)) return pending.get(url)
  const task = (async () => {
    const file = iconCacheFile(url)
    let expired = null
    try {
      const info = await stat(file)
      if (info.size <= MAX_BYTES) {
        const buffer = await readFile(file)
        const contentType = imageContentType(buffer)
        if (contentType) {
          if (Date.now() - info.mtimeMs < CACHE_TTL) return remember(url, { buffer, contentType })
          expired = { buffer, contentType }
        }
      }
    } catch {}
    // Stale-while-revalidate: an expired copy is still the right picture, so
    // hand it back immediately and refresh behind the scenes. Waiting on the
    // network here is what made those icons appear to reload on every restart —
    // and a failed refresh must never turn a usable icon into a 502.
    if (expired) {
      // Record the failure in the same cooldown the foreground path uses, or a
      // permanently dead URL launches a fresh 4s fetch on every request while
      // continuing to serve the stale bytes.
      downloadIcon(url, file).catch(() => {
        if (failures.size >= 256) failures.delete(failures.keys().next().value)
        failures.set(url, Date.now() + 60_000)
      })
      return remember(url, expired)
    }
    return remember(url, await downloadIcon(url, file))
  })()
  pending.set(url, task)
  try { return await task } catch (error) {
    if (failures.size >= 256) failures.delete(failures.keys().next().value)
    failures.set(url, Date.now() + 60_000)
    throw error
  } finally { pending.delete(url) }
}
