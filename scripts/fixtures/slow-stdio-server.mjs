import { appendFileSync } from 'node:fs'
let buffer = ''
let initialized = false
let requests = 0
process.stdin.on('data', (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''
  for (const line of lines) {
    const message = JSON.parse(line)
    if (message.method === 'initialize') {
      setTimeout(() => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'slow-test', version: '1' } } }) + '\n'), 600)
    } else if (message.method === 'notifications/initialized') initialized = true
    else if (message.method === 'tools/list') {
      requests += 1
      appendFileSync(process.env.TEST_STDIO_LOG, `${requests} ${initialized}\n`)
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'slow', inputSchema: { type: 'object' } }] } }) + '\n')
    }
  }
})
