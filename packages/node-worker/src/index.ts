import os from 'os'
import net from 'net'
import dgram from 'dgram'
import { ChunkforgeClient } from '@chunkforge/api/client'

const portalUrl = process.env.CHUNKFORGE_PORTAL_URL?.trim()
const pairingPin = process.env.CHUNKFORGE_PAIRING_PIN?.trim()
const nodeName = process.env.CHUNKFORGE_NODE_NAME?.trim() || os.hostname()
const heartbeatIntervalMs = Number(process.env.CHUNKFORGE_HEARTBEAT_MS ?? 15000)

if (!portalUrl) throw new Error('CHUNKFORGE_PORTAL_URL is required.')
if (!pairingPin) throw new Error('CHUNKFORGE_PAIRING_PIN is required.')

const client = new ChunkforgeClient({ baseUrl: portalUrl })
const tcpSockets = new Map<string, net.Socket>()
const udpSockets = new Map<string, dgram.Socket>()
const udpLastUsed = new Map<string, number>()
const udpSessionTtlMs = 30_000

interface PortalTunnelFrame {
  type: 'tcp-open' | 'tcp-data' | 'tcp-end' | 'udp-message'
  protocol: 'tcp' | 'udp'
  publicPort: number
  connectionId: string
  payload?: string
  remoteAddress?: string
  remotePort?: number
}

function diskTotals(): { totalStorageBytes: number; usedStorageBytes: number } {
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()
  // Placeholder for container-safe disk stats until real filesystem probing is added.
  return {
    totalStorageBytes: totalMemory * 8,
    usedStorageBytes: (totalMemory - freeMemory) * 4
  }
}

function sampleStats(latencyMs?: number) {
  const totalMemoryBytes = os.totalmem()
  const usedMemoryBytes = totalMemoryBytes - os.freemem()
  const { totalStorageBytes, usedStorageBytes } = diskTotals()
  const load = os.loadavg()[0] ?? 0
  const cpuCores = os.cpus().length
  return {
    cpuPercent: Math.max(0, Math.min(100, Math.round((load / Math.max(cpuCores, 1)) * 100))),
    cpuCores,
    totalMemoryBytes,
    usedMemoryBytes,
    totalStorageBytes,
    usedStorageBytes,
    latencyMs
  }
}

function portalChannelUrl(nodeToken: string): string {
  return portalUrl!.replace(/^http/, 'ws') + `/api/portal/nodes/channel?token=${encodeURIComponent(nodeToken)}`
}

function attachTunnelChannel(nodeToken: string): void {
  const socket = new WebSocket(portalChannelUrl(nodeToken))
  socket.onmessage = (event) => {
    const frame = JSON.parse(String(event.data)) as PortalTunnelFrame
    handlePortalFrame(socket, frame)
  }
  socket.onclose = () => {
    setTimeout(() => attachTunnelChannel(nodeToken), 1000)
  }
}

function handlePortalFrame(channel: WebSocket, frame: PortalTunnelFrame): void {
  if (frame.protocol === 'tcp') {
    handleTcpFrame(channel, frame)
    return
  }
  handleUdpFrame(channel, frame)
}

function handleTcpFrame(channel: WebSocket, frame: PortalTunnelFrame): void {
  if (frame.type === 'tcp-open') {
    const upstream = net.createConnection({ host: '127.0.0.1', port: frame.publicPort })
    tcpSockets.set(frame.connectionId, upstream)
    upstream.on('data', (chunk: Buffer) => {
      channel.send(
        JSON.stringify({
          type: 'tcp-data',
          protocol: 'tcp',
          publicPort: frame.publicPort,
          connectionId: frame.connectionId,
          payload: chunk.toString('base64')
        } satisfies PortalTunnelFrame)
      )
    })
    upstream.on('close', () => {
      channel.send(
        JSON.stringify({
          type: 'tcp-end',
          protocol: 'tcp',
          publicPort: frame.publicPort,
          connectionId: frame.connectionId
        } satisfies PortalTunnelFrame)
      )
      tcpSockets.delete(frame.connectionId)
    })
    return
  }
  const upstream = tcpSockets.get(frame.connectionId)
  if (!upstream) return
  if (frame.type === 'tcp-data' && frame.payload) upstream.write(Buffer.from(frame.payload, 'base64'))
  if (frame.type === 'tcp-end') {
    upstream.end()
    tcpSockets.delete(frame.connectionId)
  }
}

function handleUdpFrame(channel: WebSocket, frame: PortalTunnelFrame): void {
  let socket = udpSockets.get(frame.connectionId)
  if (!socket) {
    socket = dgram.createSocket('udp4')
    socket.on('message', (message: Buffer) => {
      channel.send(
        JSON.stringify({
          type: 'udp-message',
          protocol: 'udp',
          publicPort: frame.publicPort,
          connectionId: frame.connectionId,
          payload: message.toString('base64'),
          remoteAddress: frame.remoteAddress,
          remotePort: frame.remotePort
        } satisfies PortalTunnelFrame)
      )
    })
    udpSockets.set(frame.connectionId, socket)
  }
  udpLastUsed.set(frame.connectionId, Date.now())
  if (frame.payload) socket.send(Buffer.from(frame.payload, 'base64'), frame.publicPort, '127.0.0.1')
}

function reapUdpSessions(): void {
  const cutoff = Date.now() - udpSessionTtlMs
  for (const [connectionId, lastUsedAt] of udpLastUsed) {
    if (lastUsedAt >= cutoff) continue
    udpSockets.get(connectionId)?.close()
    udpSockets.delete(connectionId)
    udpLastUsed.delete(connectionId)
  }
}

async function main(): Promise<void> {
  const redeemed = await client.portal.redeemNodePin(pairingPin!, nodeName)
  const nodeToken = redeemed.nodeToken
  console.log(`Chunkforge node paired as ${redeemed.nodeId}`)
  await client.portal.registerTunnels(nodeToken, [
    {
      id: 'minecraft-default',
      label: 'Minecraft',
      protocol: 'tcp',
      targetPort: 25565,
      publicPort: 25565,
      host: '',
      enabled: true
    },
    {
      id: 'minecraft-query',
      label: 'Minecraft Query',
      protocol: 'udp',
      targetPort: 25565,
      publicPort: 25565,
      host: '',
      enabled: false
    }
  ])
  attachTunnelChannel(nodeToken)

  const sendHeartbeat = async (): Promise<void> => {
    const startedAt = Date.now()
    await client.portal.heartbeat(nodeToken, sampleStats())
    const latencyMs = Date.now() - startedAt
    await client.portal.heartbeat(nodeToken, sampleStats(latencyMs))
  }

  await sendHeartbeat()
  setInterval(() => {
    void sendHeartbeat().catch((err: Error) => {
      console.error(`Node heartbeat failed: ${err.message}`)
    })
  }, heartbeatIntervalMs)
  setInterval(reapUdpSessions, 10_000)
}

void main().catch((err: Error) => {
  console.error(err.message)
  process.exit(1)
})
