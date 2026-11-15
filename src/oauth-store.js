import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { marketRoot } from './store.js'

export function oauthStoreDir() {
  return process.env.UPH_OAUTH_STORE_DIR || join(marketRoot(), 'oauth-credentials')
}

export function oauthCredentialPath(key) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid OAuth credential key')
  return join(oauthStoreDir(), `${key}.json`)
}

function protectDpapi(plainText) {
  const script = '$bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))'
  return execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: plainText, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024,
  }).trim()
}

function unprotectDpapi(encoded) {
  const script = '$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); Add-Type -AssemblyName System.Security; [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'
  return execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: encoded, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024,
  })
}

// Decrypting a DPAPI record spawns a pwsh process (hundreds of ms on Windows),
// and `installedDetails()` reads one per custom-OAuth connector on every
// `/state` and plugin-detail request. Cache the plaintext by file content, so a
// write — which changes the ciphertext — invalidates the entry automatically.
const RECORD_CACHE = new Map()

export function readOAuthRecord(key) {
  const file = oauthCredentialPath(key)
  if (!existsSync(file)) {
    RECORD_CACHE.delete(file)
    return {}
  }
  try {
    const raw = readFileSync(file, 'utf8')
    const cached = RECORD_CACHE.get(file)
    if (cached && cached.raw === raw) return cached.record
    const stored = JSON.parse(raw)
    const record = stored.dpapi === true ? JSON.parse(unprotectDpapi(stored.data)) : stored
    RECORD_CACHE.set(file, { raw, record })
    return record
  } catch {
    return {}
  }
}

function writeRecord(file, record, stagingDir) {
  const plainText = JSON.stringify(record)
  const stored = process.platform === 'win32'
    ? { version: 1, dpapi: true, data: protectDpapi(plainText) }
    : JSON.parse(plainText)
  const tmp = join(stagingDir, `.${process.pid}.${randomBytes(8).toString('hex')}.tmp`)
  try {
    writeFileSync(tmp, JSON.stringify(stored), { mode: 0o600 })
    renameSync(tmp, file)
  } finally {
    rmSync(tmp, { force: true })
  }
  // Seed the read cache with what was just written: no pwsh round trip, and a
  // concurrent reader can never see the previous version.
  RECORD_CACHE.set(file, { raw: JSON.stringify(stored), record })
}

export function allowOAuthRecordWrites(key) {
  rmSync(`${oauthCredentialPath(key)}.revoked`, { force: true })
}

export function writeOAuthRecord(key, record) {
  const file = oauthCredentialPath(key)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  allowOAuthRecordWrites(key)
  writeRecord(file, record, dirname(file))
}

/** A running bridge can publish only while its private staging directory exists. */
export function openOAuthRecordWriter(key) {
  const file = oauthCredentialPath(key)
  const revoked = `${file}.revoked`
  if (existsSync(revoked)) return null
  const root = `${file}.writers`
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const directory = mkdtempSync(join(root, 'bridge-'))
  const close = () => rmSync(directory, { recursive: true, force: true })
  if (existsSync(revoked)) {
    close()
    return null
  }
  return {
    write(record) {
      if (!existsSync(directory) || existsSync(revoked)) return false
      try {
        writeRecord(file, record, directory)
        return true
      } catch (error) {
        if (error.code === 'ENOENT' && !existsSync(directory)) return false
        throw error
      }
    },
    close,
  }
}

/**
 * Block new bridges and remove existing staging directories so a concurrent or
 * stale writer cannot republish superseded credentials.
 */
function revokeOAuthWriters(file) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(`${file}.revoked`, '', { mode: 0o600 })
  rmSync(`${file}.writers`, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
}

export function saveOAuthClientCredentials(key, client) {
  const record = { ...readOAuthRecord(key) }
  const nextClientId = String(client.clientId || '').trim()
  const sameClient = record.customClient?.client_id === nextClientId
  const changedSecret = !!client.clientSecret && client.clientSecret !== record.customClient?.client_secret
  if (!sameClient || changedSecret) {
    delete record.tokens
    delete record.clientInformation
    delete record.discovery
  }
  const nextSecret = client.clientSecret || (sameClient ? record.customClient?.client_secret : '')
  const nextCustomClient = {
    client_id: nextClientId,
    token_endpoint_auth_method: nextSecret ? 'client_secret_post' : 'none',
    ...(nextSecret ? { client_secret: String(nextSecret) } : {}),
  }
  if (sameClient && !changedSecret && JSON.stringify(record.customClient) === JSON.stringify(nextCustomClient)) {
    return
  }
  if (!sameClient || changedSecret) revokeOAuthWriters(oauthCredentialPath(key))
  record.customClient = nextCustomClient
  writeOAuthRecord(key, record)
}

/**
 * Delete a credential record outright. Used when the connector it belongs to is
 * removed: leaving the file behind would resurrect a stale sign-in if a server
 * of the same name were added again with the same URL and OAuth mode.
 */
export function deleteOAuthRecord(key, { required = false, ifPresent = false } = {}) {
  const file = oauthCredentialPath(key)
  RECORD_CACHE.delete(file)
  try {
    if (ifPresent && !existsSync(file) && !existsSync(`${file}.writers`)) return
    revokeOAuthWriters(file)
    rmSync(file, { force: true })
  } catch (error) {
    if (required) throw error
  }
}
