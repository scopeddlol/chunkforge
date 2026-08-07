import { Buffer } from 'buffer'
import net, { type Server as NetServer, type Socket } from 'net'
import dgram, { type RemoteInfo, type Socket as DgramSocket } from 'dgram'
import type { PortalTunnelPort, TunnelProtocol } from '@chunkforge/core'

interface RelayTarget {
  host: string
  port: number
}

interface NodeTunnelSocket {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  on: (event: string, listener: (...args: any[]) => void) => void
}

interface PortalTunnelFrame {
  type: 'tcp-open' | 'tcp-data' | 'tcp-end' | 'udp-message'
  protocol: TunnelProtocol
  publicPort: number
  connectionId: string
  payload?: string
  remoteAddress?: string
  remotePort?: number
}

interface RegisteredTunnel {
  protocol: TunnelProtocol
  publicPort: number
  target: RelayTarget
  server: NetServer | DgramSocket
  nodeId: string
}

interface UdpSession {
  socket: DgramSocket
  lastUsedAt: number
}

class PortalRelay {
  private readonly tunnels = new Map<string, RegisteredTunnel>()
  private readonly nodeSockets = new Map<string, NodeTunnelSocket>()
  private readonly tcpConnections = new Map<string, Socket>()
  private readonly udpSessions = new Map<string, UdpSession>()
  private readonly udpSessionTtlMs = 30_000

  private key(protocol: TunnelProtocol, publicPort: number): string {
    return `${protocol}:${publicPort}`
  }

  registerNodeSocket(nodeId: string, socket: NodeTunnelSocket): void {
    this.nodeSockets.set(nodeId, socket)
    socket.on('message', (raw: Buffer | string) => {
      try {
        const frame = JSON.parse(String(raw)) as PortalTunnelFrame
        this.handleNodeFrame(nodeId, frame)
      } catch {
        // Ignore malformed node frames rather than tearing the tunnel down.
      }
    })
    const clearSocket = (): void => {
      if (this.nodeSockets.get(nodeId) === socket) this.nodeSockets.delete(nodeId)
      this.closeNodeConnections(nodeId)
    }
    socket.on('close', clearSocket)
    socket.on('error', clearSocket)
  }

  async registerNodeTunnels(nodeId: string, ports: PortalTunnelPort[]): Promise<void> {
    for (const port of ports.filter((entry) => entry.enabled)) {
      const key = this.key(port.protocol, port.publicPort)
      const existing = this.tunnels.get(key)
      if (existing) continue
      if (port.protocol === 'tcp') {
        const server = net.createServer((incoming) => {
          const connectionId = `${port.publicPort}:${Date.now()}:${Math.random().toString(16).slice(2)}`
          this.tcpConnections.set(connectionId, incoming)
          this.sendToNode(nodeId, {
            type: 'tcp-open',
            protocol: 'tcp',
            publicPort: port.publicPort,
            connectionId
          })
          incoming.on('data', (chunk: Buffer) => {
            this.sendToNode(nodeId, {
              type: 'tcp-data',
              protocol: 'tcp',
              publicPort: port.publicPort,
              connectionId,
              payload: chunk.toString('base64')
            })
          })
          incoming.on('close', () => {
            this.sendToNode(nodeId, {
              type: 'tcp-end',
              protocol: 'tcp',
              publicPort: port.publicPort,
              connectionId
            })
            this.tcpConnections.delete(connectionId)
          })
          incoming.on('error', () => {
            incoming.destroy()
            this.tcpConnections.delete(connectionId)
          })
        })
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port.publicPort, '0.0.0.0', () => {
            server.removeListener('error', reject)
            resolve()
          })
        })
        this.tunnels.set(key, {
          protocol: 'tcp',
          publicPort: port.publicPort,
          target: { host: port.host || '127.0.0.1', port: port.targetPort },
          server,
          nodeId
        })
        continue
      }

      const socket = dgram.createSocket('udp4')
      socket.on('message', (message: Buffer, remote: RemoteInfo) => {
        const connectionId = `${remote.address}:${remote.port}:${port.publicPort}`
        this.sendToNode(nodeId, {
          type: 'udp-message',
          protocol: 'udp',
          publicPort: port.publicPort,
          connectionId,
          payload: message.toString('base64'),
          remoteAddress: remote.address,
          remotePort: remote.port
        })
      })
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject)
        socket.bind(port.publicPort, '0.0.0.0', () => {
          socket.removeListener('error', reject)
          resolve()
        })
      })
      this.tunnels.set(key, {
        protocol: 'udp',
        publicPort: port.publicPort,
        target: { host: port.host || '127.0.0.1', port: port.targetPort },
        server: socket,
        nodeId
      })
    }
    console.log(`Portal relay registered ${ports.filter((entry) => entry.enabled).length} ports for node ${nodeId}`)
  }

  async close(): Promise<void> {
    const closers = [...this.tunnels.values()].map(async (tunnel) => {
      await new Promise<void>((resolve) => {
        if (tunnel.protocol === 'tcp') {
          ;(tunnel.server as NetServer).close(() => resolve())
          return
        }
        ;(tunnel.server as DgramSocket).close(() => resolve())
      })
    })
    await Promise.all(closers)
    for (const session of this.udpSessions.values()) {
      session.socket.close()
    }
    this.udpSessions.clear()
    this.tunnels.clear()
  }

  private sendToNode(nodeId: string, frame: PortalTunnelFrame): void {
    const socket = this.nodeSockets.get(nodeId)
    if (!socket) return
    socket.send(JSON.stringify(frame))
  }

  private handleNodeFrame(nodeId: string, frame: PortalTunnelFrame): void {
    const tunnel = this.tunnels.get(this.key(frame.protocol, frame.publicPort))
    if (!tunnel || tunnel.nodeId !== nodeId) return
    if (frame.protocol === 'tcp') {
      const connection = this.tcpConnections.get(frame.connectionId)
      if (!connection) return
      if (frame.type === 'tcp-data' && frame.payload) {
        connection.write(Buffer.from(frame.payload, 'base64'))
      }
      if (frame.type === 'tcp-end') {
        connection.end()
        this.tcpConnections.delete(frame.connectionId)
      }
      return
    }
    if (frame.type === 'udp-message' && frame.payload && frame.remoteAddress && frame.remotePort) {
      ;(tunnel.server as DgramSocket).send(
        Buffer.from(frame.payload, 'base64'),
        frame.remotePort,
        frame.remoteAddress
      )
    }
  }

  private closeNodeConnections(nodeId: string): void {
    for (const [key, tunnel] of this.tunnels) {
      if (tunnel.nodeId !== nodeId) continue
      if (tunnel.protocol === 'tcp') {
        ;(tunnel.server as NetServer).close()
      } else {
        ;(tunnel.server as DgramSocket).close()
      }
      this.tunnels.delete(key)
    }
    for (const [connectionId, socket] of this.tcpConnections) {
      socket.destroy()
      this.tcpConnections.delete(connectionId)
    }
    for (const [connectionId, session] of this.udpSessions) {
      session.socket.close()
      this.udpSessions.delete(connectionId)
    }
  }

  reapUdpSessions(): void {
    const cutoff = Date.now() - this.udpSessionTtlMs
    for (const [connectionId, session] of this.udpSessions) {
      if (session.lastUsedAt >= cutoff) continue
      session.socket.close()
      this.udpSessions.delete(connectionId)
    }
  }
}

export const portalRelay = new PortalRelay()
