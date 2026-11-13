import { statSync, realpathSync, readFileSync, readdirSync, openSync, readSync, closeSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { mkdir, readFile, writeFile, stat, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute, posix } from 'node:path'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { marketRoot } from './store.js'
import { pluginPath } from './market.js'

const MAX_BYTES = 2 * 1024 * 1024
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const MEMORY_LIMIT = 256
const PREVIEW_MEMORY_LIMIT = 512
const FAILURES_LIMIT = 256
const LOCAL_ICON_MEMORY_LIMIT = 512
const memory = new Map()
const pending = new Map()
const failures = new Map()
const bundledCache = new Map()
const bundledPending = new Map()
const localIconMemory = new Map()
const localIconPending = new Map()
const bundledIconRoot = new URL('../assets/fluent-3d/', import.meta.url)
const bundledIconFiles = new Map(Object.values(JSON.parse(readFileSync(new URL('manifest.json', bundledIconRoot), 'utf8')).icons).map(icon => [icon.url, icon.file]))

/** Compute a strong HTTP ETag from raw bytes. */
export function computeEtag(buffer) {
  return `"${createHash('sha256').update(buffer).digest('base64url')}"`
}

/** Promote an existing Map entry to most-recently-used. */
export function touchLru(map, key, value) {
  map.delete(key)
  map.set(key, value)
  return value
}

/** Insert or update a bounded Map entry with true LRU eviction. */
export function setLru(map, limit, key, value) {
  if (map.has(key)) map.delete(key)
  else if (map.size >= limit) map.delete(map.keys().next().value)
  map.set(key, value)
  return value
}

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

/**
 * Resolve, verify containment, and read/cache a local icon asynchronously.
 * Always validates directory traversal containment and current file stat so
 * removed or out-of-bounds files fail immediately instead of hitting cache.
 */
export async function readLocalIconCached(root, path, scopeParts = []) {
  const candidate = pluginPath(root, path)
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(candidate)])
  const rel = relative(realRoot, realFile)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw new Error('Icon is outside plugin directory')
  }
  const info = await stat(realFile)
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Invalid icon size')
  const fileVersion = `${info.mtimeMs}-${info.size}`
  const scopePrefix = JSON.stringify(scopeParts)
  const key = `${scopePrefix}\0${realFile}\0${fileVersion}`
  const hit = localIconMemory.get(key)
  if (hit) return touchLru(localIconMemory, key, hit)
  const inflight = localIconPending.get(key)
  if (inflight) return inflight
  const task = (async () => {
    const buffer = await readFile(realFile)
    const contentType = imageContentType(buffer)
    if (!contentType) throw new Error('Unsupported icon content')
    const entry = { buffer, contentType, etag: computeEtag(buffer), fileVersion }
    return setLru(localIconMemory, LOCAL_ICON_MEMORY_LIMIT, key, entry)
  })()
  localIconPending.set(key, task)
  try { return await task } finally { localIconPending.delete(key) }
}

/** Drop cached local icon bytes for one sourceId (or all entries when omitted). */
export function invalidateLocalIconCache(sourceId) {
  if (!sourceId) {
    localIconMemory.clear()
    return
  }
  const prefix = JSON.stringify([sourceId])
  const head = prefix.slice(0, -1) + ','
  for (const key of localIconMemory.keys()) {
    if (key.startsWith(head)) localIconMemory.delete(key)
  }
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

// Small local artwork can travel in the row directly. Larger PNGs use a
// bounded 96px preview, cached separately from the original. Remote images
// only contribute a preview when bytes already exist in the proxy cache;
// parsing a catalog never waits on an upstream image request.

const INLINE_LIMIT = 12 * 1024
// A preview is carried once per URL rather than duplicated in both theme arrays.
// This covers ordinary raster logos while keeping large artwork out of list JSON.
const PREVIEW_LIMIT = 64 * 1024
// Decoding runs synchronously inside catalog parsing, once per row, so the
// bound has to cover the decode itself and not just the file size.
const PREVIEW_MAX_PIXELS = 262144
const LOCAL_PREVIEW_MAX_PIXELS = 1024 * 1024
const PREVIEWS_DIR = 'previews'
const PREVIEW_CACHE_KEEP = 200
const previewMemory = new Map()
let lastPreviewPrune = 0

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

function buildSamplingAxes(srcLen, dstLen) {
  const starts = new Int32Array(dstLen)
  const ends = new Int32Array(dstLen)
  const weights = new Array(dstLen)
  const spans = new Float64Array(dstLen)
  for (let i = 0; i < dstLen; i++) {
    const start = (i * srcLen) / dstLen
    const end = ((i + 1) * srcLen) / dstLen
    const s0 = Math.floor(start)
    const s1 = Math.min(srcLen, Math.ceil(end))
    const w = new Float64Array(s1 - s0)
    for (let s = s0; s < s1; s++) w[s - s0] = Math.min(end, s + 1) - Math.max(start, s)
    starts[i] = s0
    ends[i] = s1
    weights[i] = w
    spans[i] = end - start
  }
  return { starts, ends, weights, spans }
}

function inlinePreview(buffer, maxPixels = PREVIEW_MAX_PIXELS) {
  const contentType = imageContentType(buffer)
  if (!contentType) return null
  if (contentType === 'image/png' && buffer.length > INLINE_LIMIT) {
    if (buffer.length < 24) return null
    const w = buffer.readUInt32BE(16), h = buffer.readUInt32BE(20)
    // Reject before decoding: the decode is the expensive part.
    if (!w || !h || w * h > maxPixels) return null
    // Version the derived cache by content and algorithm, so replacing artwork
    // cannot leave an old thumbnail behind. Originals are never overwritten.
    const key = createHash('sha256').update(buffer).digest('hex')
    const directory = join(marketRoot(), 'icons', PREVIEWS_DIR)
    const file = join(directory, `96-v1-${key}.png`)
    try {
      const saved = readFileSync(file)
      if (saved.length <= INLINE_LIMIT && imageContentType(saved) === 'image/png') return `data:image/png;base64,${saved.toString('base64')}`
    } catch {}
    let image
    try { image = PNG.sync.read(buffer) } catch { return null }
    const ratio = Math.min(1, 96 / Math.max(w, h))
    const width = Math.max(1, Math.round(w * ratio)), height = Math.max(1, Math.round(h * ratio))
    const data = Buffer.alloc(width * height * 4)
    // Precompute source index spans and overlap weights outside inner pixel loops.
    const xAxis = buildSamplingAxes(w, width)
    const yAxis = buildSamplingAxes(h, height)
    const src = image.data
    const rowStride = w * 4
    // Area sampling with premultiplied alpha preserves fine edges on both
    // themes; simply averaging transparent RGB creates dark logo fringes.
    for (let y = 0; y < height; y++) {
      const sy0 = yAxis.starts[y], sy1 = yAxis.ends[y], yw = yAxis.weights[y], ySpan = yAxis.spans[y]
      const dstRow = y * width * 4
      for (let x = 0; x < width; x++) {
        const sx0 = xAxis.starts[x], sx1 = xAxis.ends[x], xw = xAxis.weights[x]
        const area = xAxis.spans[x] * ySpan
        let red = 0, green = 0, blue = 0, alpha = 0
        for (let sy = sy0, yi = 0; sy < sy1; sy++, yi++) {
          const wy = yw[yi]
          let rowOff = sy * rowStride + sx0 * 4
          for (let sx = sx0, xi = 0; sx < sx1; sx++, xi++, rowOff += 4) {
            const aByte = src[rowOff + 3]
            if (aByte === 0) continue
            const a = aByte * xw[xi] * wy
            alpha += a
            red += src[rowOff] * a
            green += src[rowOff + 1] * a
            blue += src[rowOff + 2] * a
          }
        }
        const dst = dstRow + x * 4
        if (alpha) {
          data[dst] = Math.round(red / alpha)
          data[dst + 1] = Math.round(green / alpha)
          data[dst + 2] = Math.round(blue / alpha)
        }
        data[dst + 3] = Math.round(alpha / area)
      }
    }
    const thumbnail = PNG.sync.write({ width, height, data }, { deflateLevel: 6, deflateStrategy: 0 })
    if (thumbnail.length > INLINE_LIMIT) return null
    try {
      mkdirSync(directory, { recursive: true })
      writeFileSync(file, thumbnail)
      prunePreviewCache(directory)
    } catch {}
    return `data:image/png;base64,${thumbnail.toString('base64')}`
  }
  return buffer.length <= PREVIEW_LIMIT ? `data:${contentType};base64,${buffer.toString('base64')}` : null
}

/** Content-addressed thumbnails are never overwritten, so they need pruning. */
function prunePreviewCache(directory) {
  const now = Date.now()
  if (now - lastPreviewPrune < 60 * 60 * 1000) return
  lastPreviewPrune = now
  try {
    const files = readdirSync(directory)
      .map((entry) => {
        try { const info = statSync(join(directory, entry)); return info.isFile() ? { entry, at: info.mtimeMs } : null } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => b.at - a.at)
    for (const stale of files.slice(PREVIEW_CACHE_KEEP)) {
      try { rmSync(join(directory, stale.entry), { force: true }) } catch {}
    }
  } catch {}
}

function previewFile(file, maxPixels = PREVIEW_MAX_PIXELS) {
  try {
    const info = statSync(file)
    if (!info.isFile() || info.size > MAX_BYTES) return null
    const key = `${file}:${info.mtimeMs}:${info.size}:${maxPixels}`
    if (previewMemory.has(key)) return touchLru(previewMemory, key, previewMemory.get(key))
    const preview = inlinePreview(readFileSync(file), maxPixels)
    return setLru(previewMemory, PREVIEW_MEMORY_LIMIT, key, preview)
  } catch { return null }
}

function cachedIconPreview(url) {
  const cached = memory.get(url)
  if (cached) {
    touchLru(memory, url, cached)
    try { return inlinePreview(cached.buffer) } catch { return null }
  }
  const bundled = bundledCache.get(url)
  if (bundled) {
    try { return inlinePreview(bundled.buffer) } catch { return null }
  }
  return previewFile(iconCacheFile(url))
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
  const previews = {}
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
    // Only local files lead with their bytes. The separately carried preview
    // never changes candidate priority or replaces the normal refresh request.
    const inline = urls.map((url) => files.get(url) && inlineFile(files.get(url))).find(Boolean)
    if (!inline && urls[0]) {
      const first = urls[0]
      const remote = first.startsWith('/universal-plugin-hub/api/icon?') ? new URL(first, 'http://localhost').searchParams.get('u') : null
      const preview = files.has(first) ? previewFile(files.get(first), LOCAL_PREVIEW_MAX_PIXELS) : remote && cachedIconPreview(remote)
      if (preview) previews[first] = preview
    }
    return inline ? [inline, ...urls.filter((url) => url !== inline)] : urls
  }
  const served = (paths) => [...new Set(paths.map(toUrl).filter(Boolean))]
  // Reported apart from the tile candidates so the client can try them after
  // the brand artwork it knows about, instead of leading every row with them.
  const light = build('light')
  const dark = build('dark')
  // Avatar-only rows already have reusable bytes in the proxy's disk cache.
  // Expose those as a preview without starting network work during parsing;
  // the normal image request still refreshes expired cache entries.
  if (!light.length || !dark.length) {
    const githubOwner = (url) => typeof url === 'string' ? url.match(/github\.com\/([^/]+)/i)?.[1] : null
    let owner = [source?.url || meta?.source?.url, meta?.homepage].map(githubOwner).find((value) => value && !value.toLowerCase().includes('anthropics'))
    const author = (typeof meta?.author === 'string' ? meta.author : meta?.author?.name || '').trim().toLowerCase()
    if (!owner && /^[a-z0-9_-]+$/i.test(author) && author !== 'anthropic') owner = author
    if (owner) {
      const url = `https://github.com/${encodeURIComponent(owner)}.png?size=80`
      const preview = cachedIconPreview(url)
      if (preview) previews[proxy(url)] = preview
    }
  }
  return {
    light,
    dark,
    portrait: { light: served(portrait), dark: served(portrait) },
    ...(Object.keys(previews).length ? { previews } : {}),
  }
}

function remember(key, value) {
  failures.delete(key)
  const entry = {
    ...value,
    etag: value.etag || computeEtag(value.buffer),
    immutable: Boolean(value.immutable),
    time: Date.now(),
  }
  return setLru(memory, MEMORY_LIMIT, key, entry)
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
  const bundledFile = bundledIconFiles.get(url)
  if (bundledFile) {
    const hit = bundledCache.get(url)
    if (hit) return hit
    if (bundledPending.has(url)) return bundledPending.get(url)
    const load = (async () => {
      const buffer = await readFile(new URL(bundledFile, bundledIconRoot))
      const entry = { buffer, contentType: 'image/png', etag: computeEtag(buffer), immutable: true }
      bundledCache.set(url, entry)
      return entry
    })()
    bundledPending.set(url, load)
    try { return await load } finally { bundledPending.delete(url) }
  }
  const now = Date.now()
  const cached = memory.get(url)
  if (cached) {
    if (now - cached.time < CACHE_TTL) return touchLru(memory, url, cached)
    memory.delete(url)
  }
  const failedUntil = failures.get(url)
  if (failedUntil !== undefined) {
    if (failedUntil > now) {
      touchLru(failures, url, failedUntil)
      throw new Error('Icon temporarily unavailable')
    }
    failures.delete(url)
  }
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
      downloadIcon(url, file)
        .then((fresh) => remember(url, fresh))
        .catch(() => {
          setLru(failures, FAILURES_LIMIT, url, Date.now() + 60_000)
        })
      return remember(url, expired)
    }
    return remember(url, await downloadIcon(url, file))
  })()
  pending.set(url, task)
  try { return await task } catch (error) {
    setLru(failures, FAILURES_LIMIT, url, Date.now() + 60_000)
    throw error
  } finally { pending.delete(url) }
}
