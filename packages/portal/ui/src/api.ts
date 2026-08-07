import type { PortalEvent, PortalEventPayloads, PortalEventType } from '../../src/events'
import type {
  PortalClientRecord,
  PortalConfig,
  PortalDomain,
  PortalNodeView,
  PortalOverview,
  PortalPin
} from '../../src/types'

export class PortalUiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * The admin UI is served by the Portal it administers, so every call is
 * same-origin and authenticated by the session cookie. There is no token to
 * plumb through and no base URL to configure.
 */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }
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
    throw new PortalUiError(message, response.status)
  }
  return body as T
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const portalApi = {
  auth: {
    status: () => call<{ needsSetup: boolean }>('/api/auth/status'),
    setup: (username: string, password: string) =>
      post<{ id: string; username: string }>('/api/auth/setup', { username, password }),
    login: (username: string, password: string) =>
      post<{ id: string; username: string }>('/api/auth/login', { username, password }),
    logout: () => post<{ ok: true }>('/api/auth/logout'),
    me: () => call<{ id: string; username: string }>('/api/auth/me'),
    changePassword: (password: string) => post<{ ok: true }>('/api/auth/password', { password })
  },
  overview: () => call<PortalOverview>('/api/overview'),
  config: {
    get: () => call<PortalConfig>('/api/config'),
    save: (patch: Partial<PortalConfig>) =>
      call<PortalConfig>('/api/config', { method: 'PATCH', body: JSON.stringify(patch) })
  },
  pins: {
    list: () => call<PortalPin[]>('/api/pins'),
    create: (kind: 'node' | 'client', label?: string) => post<PortalPin>('/api/pins', { kind, label }),
    remove: (code: string) => call<{ ok: true }>(`/api/pins/${encodeURIComponent(code)}`, { method: 'DELETE' })
  },
  nodes: {
    list: () => call<PortalNodeView[]>('/api/nodes'),
    remove: (id: string) => call<{ ok: true }>(`/api/nodes/${id}`, { method: 'DELETE' })
  },
  clients: {
    list: () => call<Omit<PortalClientRecord, 'tokenHash'>[]>('/api/clients'),
    remove: (id: string) => call<{ ok: true }>(`/api/clients/${id}`, { method: 'DELETE' })
  },
  domains: {
    list: () => call<PortalDomain[]>('/api/domains'),
    remove: (hostname: string) =>
      call<{ ok: true }>(`/api/domains/${encodeURIComponent(hostname)}`, { method: 'DELETE' })
  }
}

type Handler = (payload: never) => void
const handlers = new Map<PortalEventType, Set<Handler>>()
let socket: WebSocket | null = null

function connect(): void {
  if (socket) return
  const url = `${location.origin.replace(/^http/, 'ws')}/api/events`
  socket = new WebSocket(url)
  socket.onmessage = (message) => {
    let event: PortalEvent
    try {
      event = JSON.parse(String(message.data)) as PortalEvent
    } catch {
      return
    }
    for (const listener of [...(handlers.get(event.type) ?? [])]) {
      listener(event.payload as never)
    }
  }
  socket.onclose = () => {
    socket = null
    // Nodes coming and going is exactly what this page is for; a dead socket
    // would leave it silently stale, so it always comes back.
    setTimeout(connect, 1500)
  }
  socket.onerror = () => socket?.close()
}

export function onPortalEvent<K extends PortalEventType>(
  type: K,
  handler: (payload: PortalEventPayloads[K]) => void
): () => void {
  let listeners = handlers.get(type)
  if (!listeners) {
    listeners = new Set()
    handlers.set(type, listeners)
  }
  listeners.add(handler as Handler)
  connect()
  return () => {
    listeners.delete(handler as Handler)
  }
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`
}
