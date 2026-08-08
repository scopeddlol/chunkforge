import os from 'os'
import net from 'net'
import dgram from 'dgram'
import { statfs } from 'fs/promises'
import { startCoreApi, type RunningCoreApi } from '@chunkforge/api'
import { PortalClient } from '@chunkforge/portal/client'
import type { AgentRequestFrame, PortalFrame, TrafficFrame } from '@chunkforge/portal/protocol'
import type { PortalNodeStats, PortalTunnel } from '@chunkforge/portal/types'
import { loadNodeIdentity, saveNodeIdentity, type NodeIdentity } from './identity'

export interface NodeAgentOptions {
  portalUrl: string
  /**
   * Only needed the first time. Once a node has paired, its stored token is
   * used and the pin is ignored, so leaving it set in a compose file or a
   * service config does no harm.
   */
  pairingPin?: string
  nodeName: string
  /** Where instances, runtimes, and settings live on this node. */
  dataRoot: string
  heartbeatIntervalMs?: number
}

export interface RunningNodeAgent {
  nodeId: string
  close: () => Promise<void>
}

/**
 * A Chunkforge Node.
 *
 * The node is where servers actually run — it holds the jars, the worlds, and
 * the java processes. What it deliberately does not hold is a single open
 * inbound port. It dials out to a Portal once and keeps that socket, and
 * everything afterwards arrives down it: player traffic to relay, and
 * Chunkforge API calls to run against its own embedded Core API.
 *
 * That embedded Core API is the whole trick behind "a node links into
 * Chunkforge's regular UI". The node runs the same server-management code the
 * desktop app runs, on loopback, reachable only through the Portal socket. So
 * the UI managing a node 500 miles away is calling the identical endpoints it
 * calls locally.
 */
export async function startNodeAgent(options: NodeAgentOptions): Promise<RunningNodeAgent> {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000
  const portal = new PortalClient({ baseUrl: options.portalUrl })

  // The node's own Chunkforge, on loopback. `localOwner` gives it an owner
  // session without a login screen, exactly as the desktop shell does — the
  // Portal socket is the only way in, and Portal has already authenticated it.
  const coreApi: RunningCoreApi = await startCoreApi({
    dataRoot: options.dataRoot,
    host: '127.0.0.1',
    localOwner: true
  })
  console.log(`Node Core API listening on ${coreApi.url}`)

  const identity = await establishIdentity(portal, options)
  const running = attachNodeLink({
    portalUrl: options.portalUrl,
    nodeId: identity.nodeId,
    nodeToken: identity.nodeToken,
    dataRoot: options.dataRoot,
    coreApi,
    heartbeatIntervalMs
  })

  return {
    nodeId: identity.nodeId,
    close: async () => {
      await running.close()
      await coreApi.close()
    }
  }
}

export interface NodeLinkOptions {
  portalUrl: string
  nodeId: string
  nodeToken: string
  /** Used for the disk figures in heartbeats. */
  dataRoot: string
  /** The Core API this link exposes to Portal. Its lifetime is the caller's. */
  coreApi: RunningCoreApi
  heartbeatIntervalMs?: number
}

/**
 * Opens the Portal socket for an *already running* Core API.
 *
 * Split out from `startNodeAgent` so a host that already has a Core API can
 * become a node without starting a second one. Chunkforge Desktop uses this:
 * it registers its own machine with Portal and attaches this link, which is
 * what lets a server running on the machine you are sitting at be given a
 * subdomain like any other. Only the socket belongs to this function — the
 * Core API is closed by whoever created it.
 */
export function attachNodeLink(options: NodeLinkOptions): { nodeId: string; close: () => Promise<void> } {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000
  const portal = new PortalClient({ baseUrl: options.portalUrl, token: options.nodeToken })

  const link = new PortalLink(portal, options.nodeToken, options.coreApi)
  link.connect()

  // Announce nothing up front. Routes are created by Portal when Chunkforge
  // allocates a subdomain for a server, and pushed down on connect — a node
  // guessing at port 25565 was how the old build ended up with tunnels nobody
  // asked for.
  void portal.node.announceTunnels([]).catch((err: Error) => {
    console.error(`Could not announce tunnels: ${err.message}`)
  })

  const beat = async (): Promise<void> => {
    const startedAt = Date.now()
    const stats = await sampleStats(options.dataRoot)
    await portal.node.heartbeat({ ...stats, latencyMs: Date.now() - startedAt }, true)
  }
  void beat().catch((err: Error) => console.error(`First heartbeat failed: ${err.message}`))
  const timer = setInterval(() => {
    void beat().catch((err: Error) => console.error(`Heartbeat failed: ${err.message}`))
  }, heartbeatIntervalMs)
  timer.unref?.()

  return {
    nodeId: options.nodeId,
    close: async () => {
      clearInterval(timer)
      link.close()
    }
  }
}


/**
 * Gets this node a usable Portal credential.
 *
 * Reuses the stored one when there is one, and only falls back to redeeming a
 * pin when there is not — or when the stored token has stopped working, which
 * is what happens if an operator detaches the node from Portal's own UI. The
 * stored token is verified with a real authenticated call rather than trusted
 * on sight, so a revoked credential is discovered here, at startup, instead of
 * showing up later as a node that appears paired but silently does nothing.
 */
async function establishIdentity(
  portal: PortalClient,
  options: NodeAgentOptions
): Promise<NodeIdentity> {
  const stored = await loadNodeIdentity(options.dataRoot, options.portalUrl)
  if (stored) {
    portal.setToken(stored.nodeToken)
    const usable = await portal.node
      .heartbeat({ ...(await sampleStats(options.dataRoot)), latencyMs: 0 }, false)
      .then(() => true)
      .catch(() => false)
    if (usable) {
      console.log(`Reusing stored pairing as node ${stored.nodeId}`)
      return stored
    }
    console.warn('Stored Portal pairing was rejected; re-pairing with the configured pin.')
    portal.setToken(undefined)
  }

  const pin = options.pairingPin?.trim()
  if (!pin) {
    throw new Error(
      stored
        ? 'This node’s pairing was rejected by Portal and no pairing pin is configured to re-pair with.'
        : 'This node has never paired with a Portal, and no pairing pin is configured.'
    )
  }

  const redeemed = await portal.node.redeem(pin, options.nodeName)
  const identity: NodeIdentity = {
    nodeId: redeemed.nodeId,
    nodeToken: redeemed.nodeToken,
    portalUrl: options.portalUrl,
    pairedAt: new Date().toISOString()
  }
  await saveNodeIdentity(options.dataRoot, identity)
  console.log(`Paired with Portal as node ${identity.nodeId}`)
  return identity
}

/**
 * The one outbound socket, and everything that arrives on it.
 *
 * Reconnection is not optional here: this socket is the node's only contact
 * with the world, so losing it silently would strand every server on the
 * machine behind an address that no longer resolves anywhere.
 */
class PortalLink {
  private socket: WebSocket | null = null
  private closed = false
  private retryDelayMs = 1000
  private readonly tcpUpstreams = new Map<string, net.Socket>()
  private readonly udpUpstreams = new Map<string, dgram.Socket>()
  /**
   * The node's own connection to its own Core API's live event stream — the
   * same one a browser tab on this machine would open. Piping it up the
   * Portal channel is what lets a remote server's console, status, and
   * players stay live instead of frozen at whatever they were when the UI
   * last happened to ask.
   */
  private localEvents: WebSocket | null = null
  private localEventsRetryMs = 1000

  constructor(
    private readonly portal: PortalClient,
    private readonly token: string,
    private readonly coreApi: RunningCoreApi
  ) {}

  connect(): void {
    if (this.closed) return
    const socket = new WebSocket(this.portal.node.channelUrl(this.token))
    this.socket = socket

    socket.onopen = () => {
      this.retryDelayMs = 1000
      console.log('Portal channel open')
      // Portal only forwards management calls to a node that says it is ready;
      // saying so on every reconnect avoids a window where the UI sees the node
      // as up but unmanageable.
      this.send({ type: 'agent-ready', ready: true })
      this.connectLocalEvents()
    }

    socket.onmessage = (event) => {
      let frame: PortalFrame
      try {
        frame = JSON.parse(String(event.data)) as PortalFrame
      } catch {
        return
      }
      this.handleFrame(frame)
    }

    socket.onclose = () => {
      this.socket = null
      this.dropUpstreams()
      if (this.closed) return
      setTimeout(() => this.connect(), this.retryDelayMs)
      // Backing off keeps a Portal that is down or restarting from being hit
      // once a second by every node attached to it.
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, 30_000)
    }

    socket.onerror = () => socket.close()
  }

  close(): void {
    this.closed = true
    this.socket?.close()
    this.localEvents?.close()
    this.dropUpstreams()
  }

  private send(frame: PortalFrame): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(frame))
  }

  /**
   * Opens the node's own event stream and re-sends every frame from it up the
   * Portal channel, wrapped as `event-push`. Reconnects on its own — this
   * socket outliving the Core API's occasional hiccups matters more than a
   * simple implementation, since a silently-dead events link is a remote
   * server that looks frozen with no error to explain why.
   */
  private connectLocalEvents(): void {
    if (this.closed || this.localEvents) return
    const url = `${this.coreApi.url.replace(/^http/, 'ws')}/api/events?token=${encodeURIComponent(this.coreApi.sessionToken ?? '')}`
    const socket = new WebSocket(url)
    this.localEvents = socket

    socket.onopen = () => {
      this.localEventsRetryMs = 1000
    }
    socket.onmessage = (event) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(event.data))
      } catch {
        return
      }
      this.send({ type: 'event-push', event: parsed })
    }
    socket.onclose = () => {
      this.localEvents = null
      if (this.closed) return
      setTimeout(() => this.connectLocalEvents(), this.localEventsRetryMs)
      this.localEventsRetryMs = Math.min(this.localEventsRetryMs * 2, 30_000)
    }
    socket.onerror = () => socket.close()
  }

  private handleFrame(frame: PortalFrame): void {
    if (frame.type === 'agent-request') {
      void this.runAgentRequest(frame)
      return
    }
    // 'event-push' only ever flows node → Portal; a node has nothing to do
    // with one arriving, but it must not fall through to traffic handling.
    if (frame.type === 'agent-response' || frame.type === 'agent-ready' || frame.type === 'event-push') return
    this.handleTraffic(frame)
  }

  /** Runs a forwarded Chunkforge API call against this node's own Core API. */
  private async runAgentRequest(frame: AgentRequestFrame): Promise<void> {
    try {
      const response = await fetch(this.coreApi.url + frame.path, {
        method: frame.method,
        headers: {
          ...frame.headers,
          // The node's Core API demands auth like any other; the shell session
          // it minted at startup is what authorises calls arriving over Portal.
          ...(this.coreApi.sessionToken
            ? { authorization: `Bearer ${this.coreApi.sessionToken}` }
            : {})
        },
        body: frame.body ? Buffer.from(frame.body, 'base64') : undefined
      })
      const payload = Buffer.from(await response.arrayBuffer())
      this.send({
        type: 'agent-response',
        requestId: frame.requestId,
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
        body: payload.toString('base64')
      })
    } catch (err) {
      this.send({
        type: 'agent-response',
        requestId: frame.requestId,
        status: 500,
        headers: {},
        error: (err as Error).message
      })
    }
  }

  private handleTraffic(frame: TrafficFrame): void {
    if (frame.protocol === 'tcp') {
      this.handleTcp(frame)
      return
    }
    this.handleUdp(frame)
  }

  private handleTcp(frame: TrafficFrame): void {
    if (frame.type === 'tcp-open') {
      // `targetPort`, not `publicPort`: Portal allocates public ports from its
      // own range, and they rarely match what the server listens on here.
      const upstream = net.createConnection({ host: '127.0.0.1', port: frame.targetPort })
      this.tcpUpstreams.set(frame.connectionId, upstream)

      upstream.on('data', (chunk: Buffer) => {
        this.send({ ...frame, type: 'tcp-data', payload: chunk.toString('base64') })
      })
      const end = (): void => {
        if (!this.tcpUpstreams.delete(frame.connectionId)) return
        this.send({ ...frame, type: 'tcp-end', payload: undefined })
      }
      upstream.on('close', end)
      upstream.on('error', () => {
        upstream.destroy()
        end()
      })
      return
    }

    const upstream = this.tcpUpstreams.get(frame.connectionId)
    if (!upstream) return
    if (frame.type === 'tcp-data' && frame.payload) {
      upstream.write(Buffer.from(frame.payload, 'base64'))
    }
    if (frame.type === 'tcp-end') {
      upstream.end()
      this.tcpUpstreams.delete(frame.connectionId)
    }
  }

  private handleUdp(frame: TrafficFrame): void {
    let upstream = this.udpUpstreams.get(frame.connectionId)
    if (!upstream) {
      upstream = dgram.createSocket('udp4')
      upstream.on('message', (message: Buffer) => {
        this.send({ ...frame, type: 'udp-message', payload: message.toString('base64') })
      })
      this.udpUpstreams.set(frame.connectionId, upstream)
    }
    if (frame.payload) {
      upstream.send(Buffer.from(frame.payload, 'base64'), frame.targetPort, '127.0.0.1')
    }
  }

  private dropUpstreams(): void {
    for (const socket of this.tcpUpstreams.values()) socket.destroy()
    this.tcpUpstreams.clear()
    for (const socket of this.udpUpstreams.values()) socket.close()
    this.udpUpstreams.clear()
  }
}

/**
 * Real numbers, not guesses. The scheduler and the node cards both read these,
 * and a node that misreports its free disk is a node that fills up mid-install.
 */
async function sampleStats(dataRoot: string): Promise<PortalNodeStats> {
  const totalMemoryBytes = os.totalmem()
  const usedMemoryBytes = totalMemoryBytes - os.freemem()
  const cpuCores = os.cpus().length || 1
  const load = os.loadavg()[0] ?? 0

  let totalStorageBytes = 0
  let usedStorageBytes = 0
  try {
    // statfs reports the container's view of the volume the servers actually
    // live on, which is the one that matters — the host's spare terabyte is no
    // use inside a bind mount.
    const fs = await statfs(dataRoot)
    totalStorageBytes = fs.blocks * fs.bsize
    usedStorageBytes = (fs.blocks - fs.bfree) * fs.bsize
  } catch {
    // Left at zero; the UI renders that as unknown rather than as an empty disk.
  }

  return {
    cpuPercent: Math.max(0, Math.min(100, Math.round((load / cpuCores) * 100))),
    cpuCores,
    totalMemoryBytes,
    usedMemoryBytes,
    totalStorageBytes,
    usedStorageBytes
  }
}

export type { PortalTunnel }
