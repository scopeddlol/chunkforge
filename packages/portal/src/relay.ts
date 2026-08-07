import { Buffer } from 'buffer'
import { randomUUID } from 'crypto'
import net, { type Server as NetServer, type Socket } from 'net'
import dgram, { type RemoteInfo, type Socket as DgramSocket } from 'dgram'
import {
  isTrafficFrame,
  type AgentRequestFrame,
  type AgentResponseFrame,
  type PortalFrame,
  type TrafficFrame
} from './protocol'
import type { PortalTunnel, TunnelProtocol } from './types'

/** The subset of a ws socket the relay needs; keeps this file free of ws types. */
export interface NodeSocket {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  on: (event: string, listener: (...args: any[]) => void) => void
}

interface OpenTunnel {
  nodeId: string
  tunnel: PortalTunnel
  listener: NetServer | DgramSocket
}

interface PendingAgentCall {
  resolve: (response: AgentResponseFrame) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const AGENT_TIMEOUT_MS = 30_000
const UDP_SESSION_TTL_MS = 60_000

/**
 * Portal's proxy runtime.
 *
 * A node never accepts an inbound connection. Portal owns every public
 * listener, and each byte a player sends is framed and pushed down the node's
 * one outbound WebSocket. The same socket carries Chunkforge control requests,
 * so adopting a node gives the UI a full Core API without opening a port on the
 * machine that runs it.
 */
class PortalRelay {
  private readonly sockets = new Map<string, NodeSocket>()
  private readonly tunnels = new Map<string, OpenTunnel>()
  private readonly tcpConnections = new Map<string, Socket>()
  private readonly udpPeers = new Map<string, { address: string; port: number; lastUsedAt: number }>()
  private readonly pendingAgentCalls = new Map<string, PendingAgentCall>()
  private readonly agentReady = new Set<string>()
  private reaper: ReturnType<typeof setInterval> | null = null

  private key(protocol: TunnelProtocol, publicPort: number): string {
    return `${protocol}:${publicPort}`
  }

  // ---- node channel ----

  registerNodeSocket(nodeId: string, socket: NodeSocket): void {
    // A reconnecting node replaces its old socket; the stale one is dropped
    // rather than left to fight over the same frames.
    this.sockets.get(nodeId)?.close(1012, 'Replaced by a newer connection')
    this.sockets.set(nodeId, socket)

    socket.on('message', (raw: Buffer | string) => {
      let frame: PortalFrame
      try {
        frame = JSON.parse(String(raw)) as PortalFrame
      } catch {
        // One malformed frame is not a reason to tear a live tunnel down.
        return
      }
      this.handleNodeFrame(nodeId, frame)
    })

    const drop = (): void => {
      if (this.sockets.get(nodeId) === socket) this.sockets.delete(nodeId)
      this.agentReady.delete(nodeId)
      this.failPendingCalls(nodeId)
      void this.closeNodeTunnels(nodeId)
    }
    socket.on('close', drop)
    socket.on('error', drop)

    this.ensureReaper()
  }

  isNodeConnected(nodeId: string): boolean {
    return this.sockets.has(nodeId)
  }

  isAgentReady(nodeId: string): boolean {
    return this.agentReady.has(nodeId)
  }

  activeTunnelCount(): number {
    return this.tunnels.size
  }

  /** Public ports currently bound, so allocation never double-books one. */
  boundPublicPorts(): Set<number> {
    return new Set([...this.tunnels.values()].map((entry) => entry.tunnel.publicPort))
  }

  // ---- tunnels ----

  /**
   * Brings the node's declared tunnels in line with what is actually bound:
   * opens the new ones, closes the ones it no longer claims. Reconciling rather
   * than rebuilding matters because a node re-announces on every reconnect, and
   * rebinding a live port would drop every player on it.
   */
  async syncNodeTunnels(nodeId: string, tunnels: PortalTunnel[]): Promise<PortalTunnel[]> {
    const wanted = tunnels.filter((tunnel) => tunnel.enabled)
    const wantedKeys = new Set(wanted.map((tunnel) => this.key(tunnel.protocol, tunnel.publicPort)))

    for (const [key, open] of this.tunnels) {
      if (open.nodeId !== nodeId || wantedKeys.has(key)) continue
      await this.closeTunnel(key)
    }

    const opened: PortalTunnel[] = []
    for (const tunnel of wanted) {
      const key = this.key(tunnel.protocol, tunnel.publicPort)
      const existing = this.tunnels.get(key)
      if (existing) {
        if (existing.nodeId !== nodeId) {
          throw new Error(
            `Public ${tunnel.protocol} port ${tunnel.publicPort} is already served by another node.`
          )
        }
        // Same port, possibly a new target — update in place, no rebind.
        existing.tunnel = tunnel
        opened.push(tunnel)
        continue
      }
      await this.openTunnel(nodeId, tunnel)
      opened.push(tunnel)
    }
    return opened
  }

  private async openTunnel(nodeId: string, tunnel: PortalTunnel): Promise<void> {
    const key = this.key(tunnel.protocol, tunnel.publicPort)
    const listener =
      tunnel.protocol === 'tcp'
        ? await this.listenTcp(nodeId, tunnel)
        : await this.listenUdp(nodeId, tunnel)
    this.tunnels.set(key, { nodeId, tunnel, listener })
  }

  private async listenTcp(nodeId: string, tunnel: PortalTunnel): Promise<NetServer> {
    const server = net.createServer((incoming) => {
      const connectionId = randomUUID()
      this.tcpConnections.set(connectionId, incoming)
      this.sendToNode(nodeId, {
        type: 'tcp-open',
        protocol: 'tcp',
        publicPort: tunnel.publicPort,
        targetPort: tunnel.targetPort,
        connectionId,
        remoteAddress: incoming.remoteAddress,
        remotePort: incoming.remotePort
      })
      incoming.on('data', (chunk: Buffer) => {
        this.sendToNode(nodeId, {
          type: 'tcp-data',
          protocol: 'tcp',
          publicPort: tunnel.publicPort,
          targetPort: tunnel.targetPort,
          connectionId,
          payload: chunk.toString('base64')
        })
      })
      const end = (): void => {
        if (!this.tcpConnections.delete(connectionId)) return
        this.sendToNode(nodeId, {
          type: 'tcp-end',
          protocol: 'tcp',
          publicPort: tunnel.publicPort,
          targetPort: tunnel.targetPort,
          connectionId
        })
      }
      incoming.on('close', end)
      incoming.on('error', () => {
        incoming.destroy()
        end()
      })
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(tunnel.publicPort, '0.0.0.0', () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    return server
  }

  private async listenUdp(nodeId: string, tunnel: PortalTunnel): Promise<DgramSocket> {
    const socket = dgram.createSocket('udp4')
    socket.on('message', (message: Buffer, remote: RemoteInfo) => {
      // UDP has no connections, so the peer's address *is* the session key —
      // that is what the node's reply has to be routed back to.
      const connectionId = `${tunnel.protocol}:${tunnel.publicPort}:${remote.address}:${remote.port}`
      this.udpPeers.set(connectionId, {
        address: remote.address,
        port: remote.port,
        lastUsedAt: Date.now()
      })
      this.sendToNode(nodeId, {
        type: 'udp-message',
        protocol: 'udp',
        publicPort: tunnel.publicPort,
        targetPort: tunnel.targetPort,
        connectionId,
        payload: message.toString('base64'),
        remoteAddress: remote.address,
        remotePort: remote.port
      })
    })

    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.bind(tunnel.publicPort, '0.0.0.0', () => {
        socket.removeListener('error', reject)
        resolve()
      })
    })
    return socket
  }

  private async closeTunnel(key: string): Promise<void> {
    const open = this.tunnels.get(key)
    if (!open) return
    this.tunnels.delete(key)
    await new Promise<void>((resolve) => {
      if (open.tunnel.protocol === 'tcp') {
        ;(open.listener as NetServer).close(() => resolve())
        return
      }
      try {
        ;(open.listener as DgramSocket).close(() => resolve())
      } catch {
        resolve()
      }
    })
  }

  async closeNodeTunnels(nodeId: string): Promise<void> {
    const keys = [...this.tunnels.entries()]
      .filter(([, open]) => open.nodeId === nodeId)
      .map(([key]) => key)
    for (const key of keys) await this.closeTunnel(key)

    for (const [connectionId, socket] of this.tcpConnections) {
      socket.destroy()
      this.tcpConnections.delete(connectionId)
    }
  }

  // ---- agent control proxy ----

  /**
   * Runs one Chunkforge API call on a node and waits for its answer. This is
   * how a control plane manages a remote node: the request is the same one it
   * would make against its own Core API, forwarded whole.
   */
  async callAgent(
    nodeId: string,
    request: Omit<AgentRequestFrame, 'type' | 'requestId'>
  ): Promise<AgentResponseFrame> {
    const socket = this.sockets.get(nodeId)
    if (!socket) throw new Error('That node is not connected to Portal.')
    if (!this.agentReady.has(nodeId)) throw new Error('That node has not reported a ready agent.')

    const requestId = randomUUID()
    return new Promise<AgentResponseFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAgentCalls.delete(requestId)
        reject(new Error('The node did not answer in time.'))
      }, AGENT_TIMEOUT_MS)
      this.pendingAgentCalls.set(requestId, { resolve, reject, timer })
      socket.send(JSON.stringify({ ...request, type: 'agent-request', requestId } satisfies AgentRequestFrame))
    })
  }

  private failPendingCalls(nodeId: string): void {
    // Without a per-call node id we cannot tell which pending calls belonged to
    // the socket that just died, so every in-flight call is failed. They would
    // time out anyway; failing fast just gets the error to the UI sooner.
    if (this.sockets.has(nodeId)) return
    for (const [requestId, pending] of this.pendingAgentCalls) {
      clearTimeout(pending.timer)
      pending.reject(new Error('The node disconnected before answering.'))
      this.pendingAgentCalls.delete(requestId)
    }
  }

  // ---- inbound frames ----

  private handleNodeFrame(nodeId: string, frame: PortalFrame): void {
    if (frame.type === 'agent-ready') {
      if (frame.ready) this.agentReady.add(nodeId)
      else this.agentReady.delete(nodeId)
      return
    }
    if (frame.type === 'agent-response') {
      const pending = this.pendingAgentCalls.get(frame.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pendingAgentCalls.delete(frame.requestId)
      pending.resolve(frame)
      return
    }
    if (isTrafficFrame(frame)) this.handleTrafficFrame(nodeId, frame)
  }

  private handleTrafficFrame(nodeId: string, frame: TrafficFrame): void {
    const open = this.tunnels.get(this.key(frame.protocol, frame.publicPort))
    // A node may only write to the ports Portal actually opened for it.
    if (!open || open.nodeId !== nodeId) return

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

    if (frame.type !== 'udp-message' || !frame.payload) return
    const peer = this.udpPeers.get(frame.connectionId)
    if (!peer) return
    peer.lastUsedAt = Date.now()
    ;(open.listener as DgramSocket).send(Buffer.from(frame.payload, 'base64'), peer.port, peer.address)
  }

  private sendToNode(nodeId: string, frame: TrafficFrame): void {
    this.sockets.get(nodeId)?.send(JSON.stringify(frame))
  }

  private ensureReaper(): void {
    if (this.reaper) return
    this.reaper = setInterval(() => this.reapUdpPeers(), 15_000)
    this.reaper.unref?.()
  }

  private reapUdpPeers(): void {
    const cutoff = Date.now() - UDP_SESSION_TTL_MS
    for (const [connectionId, peer] of this.udpPeers) {
      if (peer.lastUsedAt >= cutoff) continue
      this.udpPeers.delete(connectionId)
    }
  }

  async close(): Promise<void> {
    if (this.reaper) {
      clearInterval(this.reaper)
      this.reaper = null
    }
    for (const key of [...this.tunnels.keys()]) await this.closeTunnel(key)
    for (const socket of this.tcpConnections.values()) socket.destroy()
    this.tcpConnections.clear()
    this.udpPeers.clear()
    for (const pending of this.pendingAgentCalls.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Portal is shutting down.'))
    }
    this.pendingAgentCalls.clear()
    for (const socket of this.sockets.values()) socket.close(1001, 'Portal shutting down')
    this.sockets.clear()
    this.agentReady.clear()
  }
}

export const portalRelay = new PortalRelay()
