import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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

export function readOAuthRecord(key) {
  const file = oauthCredentialPath(key)
  if (!existsSync(file)) return {}
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8'))
    if (stored.dpapi === true) return JSON.parse(unprotectDpapi(stored.data))
    return stored
  } catch {
    return {}
  }
}

export function writeOAuthRecord(key, record) {
  const file = oauthCredentialPath(key)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const plainText = JSON.stringify(record)
  const stored = process.platform === 'win32'
    ? { version: 1, dpapi: true, data: protectDpapi(plainText) }
    : JSON.parse(plainText)
  const tmp = join(dirname(file), `.${process.pid}.${randomBytes(8).toString('hex')}.tmp`)
  writeFileSync(tmp, JSON.stringify(stored), { mode: 0o600 })
  renameSync(tmp, file)
  try { if (process.platform !== 'win32') writeFileSync(file, JSON.stringify(stored), { mode: 0o600 }) } catch {}
}

export function saveOAuthClientCredentials(key, client) {
  const record = readOAuthRecord(key)
  const sameClient = record.customClient?.client_id === String(client.clientId || '').trim()
  const changedSecret = !!client.clientSecret && client.clientSecret !== record.customClient?.client_secret
  if (!sameClient || changedSecret) {
    delete record.tokens
    delete record.clientInformation
    delete record.discovery
  }
  record.customClient = {
    client_id: String(client.clientId || '').trim(),
    token_endpoint_auth_method: (client.clientSecret || (sameClient && record.customClient?.client_secret)) ? 'client_secret_post' : 'none',
    ...((client.clientSecret || (sameClient && record.customClient?.client_secret)) ? { client_secret: String(client.clientSecret || record.customClient?.client_secret) } : {}),
  }
  writeOAuthRecord(key, record)
}
