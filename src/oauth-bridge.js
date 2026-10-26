import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema, ReadResourceRequestSchema,
  ListPromptsRequestSchema, GetPromptRequestSchema,
  ToolListChangedNotificationSchema, ResourceListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { decodeOAuthConfig } from './oauth-config.js'
import { readOAuthRecord, writeOAuthRecord } from './oauth-store.js'

const interactive = process.env.UPH_MCP_INTERACTIVE === '1'
const verifying = process.env.UPH_MCP_VERIFY === '1'
const callbackTimeout = Number(process.env.UPH_OAUTH_CALLBACK_TIMEOUT_MS) || 300000
const config = decodeOAuthConfig(process.env.UPH_MCP_REMOTE_CONFIG)
const startedAt = Date.now()
let activeClient
let activeTransport
let callbackServer
let callbackUrl
let callbackState
let callbackResolve
let callbackReject
let pendingCallback

function emit(event) {
  process.stderr.write(`UPH_OAUTH_EVENT ${JSON.stringify(event)}\n`)
}

function logError(error) {
  process.stderr.write(`${String(error?.message || error).split('\n')[0]}\n`)
}

function closeCallback() {
  callbackServer?.close()
  callbackServer = undefined
}

async function openBrowser(url) {
  if (process.env.UPH_MCP_NO_BROWSER === '1') return
  const target = String(url)
  const child = process.platform === 'win32'
    ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', target], { detached: true, stdio: 'ignore', windowsHide: true })
    : process.platform === 'darwin'
      ? spawn('open', [target], { detached: true, stdio: 'ignore' })
      : spawn('xdg-open', [target], { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}

async function startCallbackListener() {
  if (!interactive) return
  callbackServer = createServer((req, res) => {
    let parsed
    try { parsed = new URL(req.url || '/', 'http://localhost') } catch {
      res.writeHead(400).end()
      return
    }
    if (parsed.pathname !== '/callback') {
      res.writeHead(404).end()
      return
    }
    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')
    const error = parsed.searchParams.get('error')
    if (!code || !callbackState || state !== callbackState || error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('OAuth callback could not be validated. Return to DeepSeek Harness and retry.')
      callbackReject?.(new Error(error ? `Authorization failed: ${error}` : 'OAuth callback state is missing or does not match'))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end('<!doctype html><html><body style="font-family:system-ui;padding:48px"><h2>授权成功</h2><p>可以关闭此页面，返回 DeepSeek Harness。</p></body></html>')
    callbackResolve?.(code)
  })
  callbackServer.on('error', (error) => callbackReject?.(error))
  callbackServer.listen(config.oauth.callbackPort || 0, '127.0.0.1')
  await once(callbackServer, 'listening')
  const address = callbackServer.address()
  callbackUrl = `http://localhost:${address.port}/callback`
}

function waitForCallback() {
  if (!pendingCallback) {
    let timer
    pendingCallback = new Promise((resolve, reject) => {
      callbackResolve = resolve
      callbackReject = reject
      timer = setTimeout(() => reject(new Error('OAuth callback timed out')), callbackTimeout)
      timer.unref?.()
    }).finally(() => { clearTimeout(timer); pendingCallback = undefined })
  }
  return pendingCallback
}

function provider() {
  let record = readOAuthRecord(config.credentialKey)
  const persist = () => writeOAuthRecord(config.credentialKey, record)
  const callback = callbackUrl || record.clientInformation?.redirect_uris?.[0] || `http://localhost:${config.oauth.callbackPort || 0}/callback`
  const custom = config.oauth.mode === 'custom' ? record.customClient : undefined
  return {
    redirectUrl: callback,
    clientMetadata: {
      client_name: 'DeepSeek Harness',
      client_uri: 'https://www.deepseek.com/harness/',
      redirect_uris: [callback],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: custom?.client_secret ? 'client_secret_post' : 'none',
      application_type: 'native',
      ...(config.oauth.scope ? { scope: config.oauth.scope } : {}),
    },
    clientInformation() {
      if (config.oauth.mode === 'custom') return custom
      if (interactive && record.clientInformation?.redirect_uris?.length && !record.clientInformation.redirect_uris.includes(callback)) {
        if (record.tokens?.refresh_token) {
          delete record.tokens
          persist()
        }
        return undefined
      }
      return record.clientInformation
    },
    saveClientInformation(info) {
      record.clientInformation = info
      persist()
    },
    tokens() { return record.tokens },
    saveTokens(tokens) {
      record.tokens = tokens
      persist()
    },
    state() {
      callbackState = randomBytes(32).toString('base64url')
      return callbackState
    },
    saveCodeVerifier(verifier) {
      record.codeVerifier = verifier
      persist()
    },
    codeVerifier() {
      if (!record.codeVerifier) throw new Error('OAuth PKCE verifier is missing; please sign in again')
      return record.codeVerifier
    },
    saveDiscoveryState(discovery) {
      record.discovery = discovery
      persist()
    },
    discoveryState() { return record.discovery },
    invalidateCredentials(scope) {
      if (scope === 'all' || scope === 'client') {
        delete record.clientInformation
        delete record.discovery
      }
      if (scope === 'all' || scope === 'tokens') delete record.tokens
      if (scope === 'all' || scope === 'verifier') delete record.codeVerifier
      if (scope === 'discovery') delete record.discovery
      persist()
    },
    async redirectToAuthorization(url) {
      if (!interactive) throw new Error('OAuth 授权已失效，请在连接器设置中重新登录。')
      emit({ status: 'waiting', authorizationUrl: String(url) })
      await openBrowser(url)
    },
  }
}

async function connectRemote() {
  if (!config) throw new Error('Missing remote OAuth configuration')
  await startCallbackListener()
  const oauthProvider = provider()
  const transportOptions = {
    authProvider: oauthProvider,
    requestInit: { headers: config.headers },
  }
  activeClient = new Client({ name: 'universal-plugin-hub', version: '1.0.8' })
  activeTransport = new StreamableHTTPClientTransport(new URL(config.url), transportOptions)
  try {
    await activeClient.connect(activeTransport)
    return activeClient
  } catch (error) {
    if (!interactive || !(error instanceof UnauthorizedError)) throw error
    const code = await waitForCallback()
    await activeClient.close().catch(() => {})
    activeTransport = new StreamableHTTPClientTransport(new URL(config.url), transportOptions)
    await activeTransport.finishAuth(code)
    activeClient = new Client({ name: 'universal-plugin-hub', version: '1.0.8' })
    await activeClient.connect(activeTransport)
    return activeClient
  } finally {
    closeCallback()
  }
}

async function proxyCapabilities(client, server) {
  const capabilities = client.getServerCapabilities() || {}
  if (capabilities.tools) {
    const tools = await client.listTools()
    server.setRequestHandler(ListToolsRequestSchema, (request) => client.listTools(request.params))
    server.setRequestHandler(CallToolRequestSchema, (request) => client.callTool(request.params))
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => server.sendToolListChanged())
  }
  if (capabilities.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, (request) => client.listResources(request.params))
    server.setRequestHandler(ListResourceTemplatesRequestSchema, (request) => client.listResourceTemplates(request.params))
    server.setRequestHandler(ReadResourceRequestSchema, (request) => client.readResource(request.params))
    client.setNotificationHandler(ResourceListChangedNotificationSchema, () => server.sendResourceListChanged())
  }
  if (capabilities.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, (request) => client.listPrompts(request.params))
    server.setRequestHandler(GetPromptRequestSchema, (request) => client.getPrompt(request.params))
    client.setNotificationHandler(PromptListChangedNotificationSchema, () => server.sendPromptListChanged())
  }
}

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  closeCallback()
  callbackReject?.(new Error('OAuth authorization was cancelled'))
  await activeClient?.close().catch(() => {})
  process.exit(0)
}

if (!verifying) {
  process.stdin.on('end', shutdown)
  process.stdin.on('close', shutdown)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

try {
  const client = await connectRemote()
  if (verifying) {
    const result = await client.listTools()
    process.stdout.write(JSON.stringify({
      ok: true, status: 200, duration: Date.now() - startedAt,
      message: 'OAuth 授权成功，MCP 连接和工具列表验证通过。',
      tools: result.tools,
    }) + '\n')
    await client.close()
    process.exit(0)
  }
  const server = new Server(
    { name: 'universal-plugin-hub-oauth-bridge', version: '1.0.8' },
    { capabilities: client.getServerCapabilities() || {} },
  )
  await proxyCapabilities(client, server)
  const transport = new StdioServerTransport()
  transport.onclose = () => { void shutdown() }
  await server.connect(transport)
} catch (error) {
  closeCallback()
  await activeClient?.close().catch(() => {})
  if (verifying) {
    process.stdout.write(JSON.stringify({ ok: false, status: error?.code, message: String(error?.message || error).split('\n')[0] }) + '\n')
    process.exit(0)
  }
  logError(error)
  process.exit(1)
}
