import { Buffer } from 'buffer'
import { randomUUID } from 'crypto'
import net, { type Server as NetServer, type Socket } from 'net'
import dgram, { type RemoteInfo, type Socket as DgramSocket } from 'dgram'
import {
  isTrafficFrame,
  type AgentRequestFrame,
  type AgentResponseFrame,
  type ClientRequestFrame,
  type ClientResponseFrame,
  type EventPushFrame,
  type PortalFrame,
  type TrafficFrame
} from './protocol'
import { nodeClaimants } from './nodeClaims'
import { portalStore } from './store'
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

interface PendingClientCall {
  resolve: (frame: ClientResponseFrame) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface PendingAgentCall {
  resolve: (response: AgentResponseFrame) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * How long Portal waits for a node to answer a forwarded API call.
 *
 * This has to cover the slowest real request that goes through it, not the
 * typical one — creating a server means the node downloading a Java runtime
 * and a server jar, sometimes compiling Spigot from source, all before it can
 * answer. 30 seconds was tuned for a status check and silently killed every
 * creation that took longer, which is nearly all of them: the node kept
 * building the server after Portal gave up, so the caller saw a failure for a
 * server that then finished successfully with nothing pointing at it.
 */
const AGENT_TIMEOUT_MS = 10 * 60_000
/**
 * Much shorter than the agent timeout. An agent call can be a modpack install;
 * a client call is a list of servers, and an admin waiting on an aggregate
 * view would rather see "unreachable" quickly than a spinner for ten minutes.
 */
const CLIENT_TIMEOUT_MS = 15_000
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
  /** One socket per control plane, kept open only to carry pushed events downstream. */
  private readonly clientEventSockets = new Map<string, NodeSocket>()
  private readonly pendingClientCalls = new Map<string, PendingClientCall>()
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

  // ---- client event channel ----

  /**
   * The socket a control plane holds open purely to receive events its
   * claimed nodes push up. It carries nothing else — requests still go
   * through the ordinary HTTP agent routes — so losing it only means events
   * go unseen until it reconnects, never a failed request.
   */
  registerClientEventSocket(clientId: string, socket: NodeSocket): void {
    this.clientEventSockets.get(clientId)?.close(1012, 'Replaced by a newer connection')
    this.clientEventSockets.set(clientId, socket)

    socket.on('message', (raw: unknown) => {
      let frame: ClientResponseFrame
      try {
        frame = JSON.parse(String(raw)) as ClientResponseFrame
      } catch {
        return
      }
      if (frame?.type !== 'client-response') return
      const pending = this.pendingClientCalls.get(frame.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pendingClientCalls.delete(frame.requestId)
      pending.resolve(frame)
    })

    const drop = (): void => {
      if (this.clientEventSockets.get(clientId) !== socket) return
      this.clientEventSockets.delete(clientId)
      // Anything still waiting on this socket will never be answered. Failing
      // now rather than at the timeout gets the truth to the caller sooner.
      for (const [requestId, pending] of this.pendingClientCalls) {
        clearTimeout(pending.timer)
        pending.reject(new Error('That control plane disconnected.'))
        this.pendingClientCalls.delete(requestId)
      }
    }
    socket.on('close', drop)
    socket.on('error', drop)
  }

  /** Whether a control plane currently holds its channel open. */
  isClientConnected(clientId: string): boolean {
    return this.clientEventSockets.has(clientId)
  }

  /**
   * Asks a control plane a question and waits for its answer.
   *
   * The control plane decides whether to answer: it accepts a fixed, read-only
   * set of paths and refuses the rest. That asymmetry with `callAgent` is the
   * point — a node is a worker, a control plane is not, and Portal being able
   * to run anything on every linked panel would make Portal's own compromise
   * everyone's.
   */
  async callClient(
    clientId: string,
    request: { method: string; path: string }
  ): Promise<ClientResponseFrame> {
    const socket = this.clientEventSockets.get(clientId)
    if (!socket) throw new Error('That control plane is not connected to Portal.')

    const requestId = randomUUID()
    return new Promise<ClientResponseFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingClientCalls.delete(requestId)
        reject(new Error('That control plane did not answer in time.'))
      }, CLIENT_TIMEOUT_MS)
      this.pendingClientCalls.set(requestId, { resolve, reject, timer })
      socket.send(
        JSON.stringify({ ...request, type: 'client-request', requestId } satisfies ClientRequestFrame)
      )
    })
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
    if (frame.type === 'event-push') {
      this.forwardEventPush(nodeId, frame)
      return
    }
    if (isTrafficFrame(frame)) this.handleTrafficFrame(nodeId, frame)
  }

  /**
   * Hands a node's pushed event to every control plane that has adopted that
   * node. An unclaimed or unwatched node's events are simply dropped —
   * there is nobody to show them to, and a node cannot know on its own whether
   * anyone is watching, so it pushes unconditionally and Portal is where that
   * gets decided.
   */
  private forwardEventPush(nodeId: string, frame: EventPushFrame): void {
    const node = portalStore.findNode(nodeId)
    if (!node) return
    const message = JSON.stringify(frame)
    // Every control plane sharing the node hears it. Each one filters to the
    // servers it knows about on the way in, so a co-owner's events are ignored
    // rather than shown.
    for (const clientId of nodeClaimants(node)) {
      this.clientEventSockets.get(clientId)?.send(message)
    }
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
    for (const socket of this.clientEventSockets.values()) socket.close(1001, 'Portal shutting down')
    this.clientEventSockets.clear()
  }
}

export const portalRelay = new PortalRelay()
