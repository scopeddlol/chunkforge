import type { DnsRecord } from './dns'
import type { LabelAvailability } from './domains'
import type {
  ClientKind,
  PortalConfig,
  PortalDomain,
  PortalNodeStats,
  PortalNodeView,
  PortalTunnel,
  TunnelProtocol
} from './types'

export class PortalApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PortalApiError'
    this.status = status
  }
}

export interface PortalClientOptions {
  baseUrl: string
  /** A node token or a control-plane token, depending on which half is used. */
  token?: string
}

export interface AllocatedDomain extends PortalDomain {
  dnsRecords: DnsRecord[]
}

export interface PortalClientStatus {
  clientId: string
  name: string
  kind: ClientKind
  zoneSuffix: string
  publicBaseUrl: string
  autoAllocatePorts: boolean
  wildcardRecord: DnsRecord | null
}

/**
 * The typed way to talk to a Portal.
 *
 * Both halves of the conversation live here on purpose: a Chunkforge Node uses
 * the `node` namespace, and Chunkforge Desktop or Web uses `client`. Keeping
 * them in one file beside the routes they call means the two sides cannot
 * quietly drift apart.
 */
export class PortalClient {
  private readonly baseUrl: string
  private token?: string

  constructor(options: PortalClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
  }

  setToken(token: string | undefined): void {
    this.token = token
  }

  get base(): string {
    return this.baseUrl
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.baseUrl + path, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...init.headers
      }
    })
    if (response.status === 204) return undefined as T

    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = {}
    }
    if (!response.ok) {
      const message =
        typeof body === 'object' && body && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${response.status}`
      throw new PortalApiError(message, response.status)
    }
    return body as T
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  }

  health(): Promise<{ ok: boolean; service: string; version: string }> {
    return this.request('/api/health')
  }

  // ---- node half ----

  node = {
    redeem: (pin: string, name?: string) =>
      this.post<{ nodeId: string; nodeToken: string; portalBaseUrl: string; zoneSuffix: string }>(
        '/api/node/redeem',
        { pin, name }
      ),
    heartbeat: (stats: PortalNodeStats, agentReady?: boolean) =>
      this.post<PortalNodeView>('/api/node/heartbeat', { stats, agentReady }),
    announceTunnels: (tunnels: PortalTunnel[]) =>
      this.post<{ tunnels: PortalTunnel[] }>('/api/node/tunnels', { tunnels }),
    /** The one outbound socket a node keeps open for traffic and control. */
    channelUrl: (token: string) =>
      `${toWebSocketUrl(this.baseUrl)}/api/node/channel?token=${encodeURIComponent(token)}`
  }

  // ---- control-plane half ----

  client = {
    redeem: (pin: string, name: string, kind: ClientKind) =>
      this.post<{ clientId: string; clientToken: string; zoneSuffix: string; publicBaseUrl: string }>(
        '/api/client/redeem',
        { pin, name, kind }
      ),
    status: () => this.request<PortalClientStatus>('/api/client/status'),
    /** Registers this control plane's own machine as a node it can host on. */
    registerSelfNode: (name?: string) =>
      this.post<{ nodeId: string; nodeToken: string; zoneSuffix: string }>(
        '/api/client/self-node',
        { name }
      ),
    /** Held open for the life of the Portal link; carries pushed events only. */
    channelUrl: (token: string) =>
      `${toWebSocketUrl(this.baseUrl)}/api/client/channel?token=${encodeURIComponent(token)}`,
    nodes: () => this.request<PortalNodeView[]>('/api/client/nodes'),
    claimNode: (nodeId: string) => this.post<PortalNodeView>(`/api/client/nodes/${nodeId}/claim`),
    releaseNode: (nodeId: string) => this.post<PortalNodeView>(`/api/client/nodes/${nodeId}/release`),
    domains: () => this.request<AllocatedDomain[]>('/api/client/domains'),
    allocateDomain: (input: {
      nodeId: string
      name?: string
      label?: string
      instanceId?: string
      protocol?: TunnelProtocol
      targetPort: number
      publicPort?: number
    }) => this.post<AllocatedDomain>('/api/client/domains', input),
    releaseDomain: (hostname: string) =>
      this.request<{ ok: true }>(`/api/client/domains/${encodeURIComponent(hostname)}`, {
        method: 'DELETE'
      }),
    renameDomain: (hostname: string, label: string) =>
      this.post<AllocatedDomain>(`/api/client/domains/${encodeURIComponent(hostname)}/rename`, { label }),

    checkDomain: (label: string, instanceId?: string) => {
      const query = new URLSearchParams({ label })
      if (instanceId) query.set('instanceId', instanceId)
      return this.request<LabelAvailability>(`/api/client/domains/check?${query.toString()}`)
    },

    /**
     * Runs a Chunkforge Core API call on a remote node. The path is exactly the
     * one the UI would use locally, so a caller can treat a node 500 miles away
     * the same as the machine it is running on.
     */
    agent: async (
      nodeId: string,
      method: string,
      path: string,
      body?: unknown
    ): Promise<Response> => {
      const url = `${this.baseUrl}/api/client/nodes/${nodeId}/agent${path.startsWith('/') ? path : `/${path}`}`
      return fetch(url, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    }
  }

  // ---- operator half (used by the admin UI) ----

  admin = {
    authStatus: () => this.request<{ needsSetup: boolean }>('/api/auth/status'),
    config: () => this.request<PortalConfig>('/api/config'),
    saveConfig: (patch: Partial<PortalConfig>) =>
      this.request<PortalConfig>('/api/config', { method: 'PATCH', body: JSON.stringify(patch) })
  }
}

function toWebSocketUrl(baseUrl: string): string {
  return baseUrl.replace(/^http/, 'ws')
}
