import { createInterface } from 'node:readline'

const mode = process.argv[2]
if (mode === 'exit') {
  console.error('Fixture startup failed')
  process.exit(1)
}

const input = createInterface({ input: process.stdin })
for await (const line of input) {
  const request = JSON.parse(line)
  const { id, method, params } = request
  if (id === undefined) continue
  const respond = (result) => console.log(JSON.stringify({ jsonrpc: '2.0', id, result }))
  if (method === 'initialize') {
    if (mode === 'hang-start') continue
    const capabilities = mode === 'no-tools' ? {} : { tools: {} }
    respond({ protocolVersion: params.protocolVersion, serverInfo: { name: 'fixture', version: '1.0.0' }, capabilities })
  } else if (method === 'tools/list') {
    if (mode === 'hang-list') continue
    if (mode === 'list-error' || mode === 'no-tools') {
      console.log(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Fixture tools unavailable' } }))
    } else if (mode === 'empty') {
      respond({ tools: [] })
    } else {
      const inputSchema = { type: 'object' }
      if (params?.cursor) respond({ tools: [{ name: 'second', inputSchema }] })
      else respond({
        tools: [{ name: 'first', description: `${process.argv[3]} / ${process.env.UPH_TEST_STDIO_VALUE}`, inputSchema }],
        nextCursor: 'page-two',
      })
    }
  }
}
