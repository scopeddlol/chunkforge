import type { TunnelProtocol } from './types'

/**
 * The wire contract on the Portal ↔ node WebSocket channel.
 *
 * One socket carries two unrelated conversations, which is why every frame is
 * tagged rather than positional:
 *
 *   - **Traffic frames** relay real player connections. Portal owns the public
 *     listener; the node owns the socket to the actual server process.
 *   - **Agent frames** relay Chunkforge control requests. A control plane asks
 *     Portal for something on a node; Portal forwards it here, and the node
 *     answers from its embedded Core API.
 *
 * Keeping them on one socket means a node needs exactly one outbound connection
 * and no inbound ports at all, which is the whole point of running behind a
 * Portal.
 */

export type PortalFrame = TrafficFrame | AgentRequestFrame | AgentResponseFrame | AgentReadyFrame

export interface TrafficFrame {
  type: 'tcp-open' | 'tcp-data' | 'tcp-end' | 'udp-message'
  protocol: TunnelProtocol
  /** The port Portal accepted the traffic on. */
  publicPort: number
  /**
   * The port on the node this should land on. Portal stamps it from the tunnel
   * record so the node never has to guess that public and target agree — they
   * usually don't once ports are auto-allocated.
   */
  targetPort: number
  connectionId: string
  /** base64, because a JSON frame cannot carry raw bytes. */
  payload?: string
  remoteAddress?: string
  remotePort?: number
}

/** Portal → node: run this HTTP request against your local Core API. */
export interface AgentRequestFrame {
  type: 'agent-request'
  requestId: string
  method: string
  /** Path and query, relative to the node's Core API root. */
  path: string
  headers: Record<string, string>
  /** base64 of the request body, absent when there is none. */
  body?: string
}

/** node → Portal: the answer to an `agent-request`. */
export interface AgentResponseFrame {
  type: 'agent-response'
  requestId: string
  status: number
  headers: Record<string, string>
  body?: string
  /** Set instead of a status when the node could not run the request at all. */
  error?: string
}

/** node → Portal: the embedded Core API is listening and can take requests. */
export interface AgentReadyFrame {
  type: 'agent-ready'
  ready: boolean
}

export function isTrafficFrame(frame: PortalFrame): frame is TrafficFrame {
  return (
    frame.type === 'tcp-open' ||
    frame.type === 'tcp-data' ||
    frame.type === 'tcp-end' ||
    frame.type === 'udp-message'
  )
}
