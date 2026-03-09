import WebSocket from 'ws'

const ws = new WebSocket('ws://localhost:3100')

ws.on('open', () => {
  console.log('✅ Connected to WebSocket')

  ws.send(JSON.stringify({
    event: 'client:connect',
    data: { guid: 'test_client_001' }
  }))
})

ws.on('message', (data) => {
  const message = JSON.parse(data.toString())
  console.log('📨 Received:', message)

  if (message.event === 'connected') {
    console.log('✅ Client registered successfully')
    ws.close()
  }
})

ws.on('close', () => {
  console.log('👋 Connection closed')
  process.exit(0)
})

ws.on('error', (error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
