import type {
  AppSettings,
  BackupEntry,
  BackupSchedule,
  CreateInstanceConfig,
  FileEntry,
  InstalledPlugin,
  InstanceMetadata,
  InstanceSummary,
  LogLineEvent,
  Node,
  NodeStats,
  PortalDomainBinding,
  PortalSettings,
  PlayerEntry,
  Project,
  PluginSearchQuery,
  PluginSearchResponse,
  PluginSearchResult,
  PluginSource,
  PluginVersion,
  ServerGroup,
  ServerType,
  DashboardStats,
  VersionCatalogEntry
} from '@chunkforge/core'
import type { ServerEvent } from './eventTypes'

export type { ServerEvent, ServerEventType, ServerEventPayloads } from './eventTypes'

/** Whether a requested subdomain label can be used. Mirrors Portal's own shape. */
export interface DomainAvailability {
  label: string
  hostname: string
  available: boolean
  reason?: string
  suggestion?: string
}

export interface ClientOptions {
  /** Base URL of the Core API, e.g. http://127.0.0.1:8080 */
  baseUrl: string
  /** Bearer token for non-browser callers; browsers use the session cookie. */
  token?: string
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * The single typed entrypoint every Chunkforge front-end uses — desktop, web,
 * and mobile. Keeping it here rather than in the UI package means the client
 * and the routes it calls change together.
 */
export class ChunkforgeClient {
  private readonly baseUrl: string
  private token?: string

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
  }

  setToken(token: string | undefined): void {
    this.token = token
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.baseUrl + path, {
      ...init,
      // Cookies carry the session in browser and Electron contexts.
      credentials: 'include',
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
      throw new ApiError(message, response.status)
    }
    return body as T
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  }
  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
  }
  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  }
  private put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
  }
  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  // ---- auth ----
  auth = {
    status: () => this.get<{ needsSetup: boolean }>('/api/auth/status'),
    setup: (username: string, password: string) =>
      this.post<{ id: string; username: string; role: string }>('/api/auth/setup', { username, password }),
    login: (username: string, password: string) =>
      this.post<{ id: string; username: string; role: string }>('/api/auth/login', { username, password }),
    logout: () => this.post<{ ok: true }>('/api/auth/logout'),
    me: () => this.get<{ id: string; username: string; role: string }>('/api/auth/me'),
    changePassword: (password: string) => this.post<{ ok: true }>('/api/auth/password', { password })
  }

  // ---- servers ----
  servers = {
    list: () => this.get<InstanceSummary[]>('/api/servers'),
    get: (id: string) => this.get<InstanceMetadata>(`/api/servers/${id}`),
    create: (config: CreateInstanceConfig) => this.post<InstanceMetadata>('/api/servers', config),
    start: (id: string) => this.post<{ ok: true }>(`/api/servers/${id}/start`),
    stop: (id: string) => this.post<{ ok: true }>(`/api/servers/${id}/stop`),
    logs: (id: string, limit?: number) =>
      this.get<LogLineEvent[]>(
        `/api/servers/${id}/logs${limit ? `?limit=${limit}` : ''}`
      ),
    command: (id: string, command: string) => this.post<{ ok: true }>(`/api/servers/${id}/command`, { command }),
    update: (id: string, patch: Partial<InstanceMetadata>) =>
      this.patch<InstanceMetadata>(`/api/servers/${id}`, patch),
    remove: (id: string, deleteFiles: boolean) =>
      this.del<{ ok: true }>(`/api/servers/${id}?deleteFiles=${deleteFiles}`),
    versions: (serverType: ServerType) =>
      this.get<VersionCatalogEntry[]>(`/api/versions?serverType=${serverType}`)
  }

  // ---- add-ons ----
  addons = {
    search: (query: PluginSearchQuery) => this.post<PluginSearchResponse>('/api/addons/search', query),
    sources: () => this.get<PluginSource[]>('/api/addons/sources'),
    versions: (source: PluginSource, projectId: string) =>
      this.get<PluginVersion[]>(
        `/api/addons/versions?source=${source}&projectId=${encodeURIComponent(projectId)}`
      ),
    installed: (id: string) => this.get<InstalledPlugin[]>(`/api/servers/${id}/addons`),
    install: (id: string, version: PluginVersion, name: string) =>
      this.post<{ path: string }>(`/api/servers/${id}/addons`, { version, name }),
    setEnabled: (id: string, filename: string, enabled: boolean) =>
      this.patch<{ ok: true }>(`/api/servers/${id}/addons/${encodeURIComponent(filename)}`, { enabled }),
    uninstall: (id: string, filename: string) =>
      this.del<{ ok: true }>(`/api/servers/${id}/addons/${encodeURIComponent(filename)}`)
  }

  // ---- modpacks ----
  modpacks = {
    search: (query: string, limit = 20) =>
      this.get<PluginSearchResult[]>(
        `/api/modpacks/search?query=${encodeURIComponent(query)}&limit=${limit}`
      ),
    versions: (source: PluginSource, projectId: string) =>
      this.get<PluginVersion[]>(
        `/api/modpacks/versions?source=${source}&projectId=${encodeURIComponent(projectId)}`
      ),
    inspect: (source: PluginSource, downloadUrl: string) =>
      this.post<{ serverType: ServerType; minecraftVersion: string }>('/api/modpacks/inspect', {
        source,
        downloadUrl
      }),
    install: (id: string, source: PluginSource, downloadUrl: string) =>
      this.post<{ ok: true }>(`/api/servers/${id}/modpack`, { source, downloadUrl })
  }

  // ---- players, files, backups ----
  players = {
    list: (id: string) => this.get<PlayerEntry[]>(`/api/servers/${id}/players`),
    action: (id: string, action: string, name: string, reason?: string) =>
      this.post<{ ok: true }>(`/api/servers/${id}/players/action`, { action, name, reason }),
    say: (id: string, message: string) => this.post<{ ok: true }>(`/api/servers/${id}/say`, { message })
  }

  files = {
    list: (id: string, path: string) =>
      this.get<FileEntry[]>(`/api/servers/${id}/files?path=${encodeURIComponent(path)}`),
    read: (id: string, path: string) =>
      this.get<{ content: string }>(`/api/servers/${id}/files/content?path=${encodeURIComponent(path)}`),
    write: (id: string, path: string, content: string) =>
      this.put<{ ok: true }>(`/api/servers/${id}/files/content`, { path, content }),
    remove: (id: string, path: string) =>
      this.del<{ ok: true }>(`/api/servers/${id}/files?path=${encodeURIComponent(path)}`),
    rename: (id: string, path: string, newName: string) =>
      this.post<{ ok: true }>(`/api/servers/${id}/files`, { path, newName }),
    createFolder: (id: string, path: string) =>
      this.post<{ ok: true }>(`/api/servers/${id}/files`, { path, createFolder: true })
  }

  backups = {
    list: (id: string) => this.get<BackupEntry[]>(`/api/servers/${id}/backups`),
    create: (id: string) => this.post<BackupEntry>(`/api/servers/${id}/backups`),
    restore: (id: string, filename: string) =>
      this.post<{ ok: true }>(`/api/servers/${id}/backups/${encodeURIComponent(filename)}/restore`),
    remove: (id: string, filename: string) =>
      this.del<{ ok: true }>(`/api/servers/${id}/backups/${encodeURIComponent(filename)}`),
    getSchedule: (id: string) => this.get<BackupSchedule>(`/api/servers/${id}/backups/schedule`),
    setSchedule: (id: string, schedule: BackupSchedule) =>
      this.put<BackupSchedule>(`/api/servers/${id}/backups/schedule`, schedule)
  }

  // ---- platform ----
  stats = () => this.get<DashboardStats>('/api/stats')
  java = () => this.get<Array<{ path: string; majorVersion: number }>>('/api/java')

  settings = {
    get: () => this.get<AppSettings>('/api/settings'),
    update: (patch: Partial<AppSettings>) => this.patch<AppSettings>('/api/settings', patch)
  }

  groups = {
    list: () => this.get<ServerGroup[]>('/api/groups'),
    create: (name: string, color: string) => this.post<ServerGroup>('/api/groups', { name, color }),
    rename: (id: string, name: string, color: string) =>
      this.patch<ServerGroup[]>(`/api/groups/${id}`, { name, color }),
    remove: (id: string) => this.del<{ ok: true }>(`/api/groups/${id}`),
    assign: (instanceId: string, groupId: string | null) =>
      this.post<{ ok: true }>(`/api/groups/${groupId ?? 'none'}/assign`, { instanceId }),
    bulk: (id: string, action: 'start' | 'stop') =>
      this.post<{ total: number; failed: number }>(`/api/groups/${id}/bulk`, { action })
  }

  // Projects and nodes are read-only for now: projects are still written
  // through the groups surface, and nodes arrive by pairing rather than by API.
  projects = {
    list: () => this.get<Project[]>('/api/projects')
  }

  // Nodes are paired at the Portal, not here — this Chunkforge only discovers
  // them and claims the ones it wants to manage.
  nodes = {
    list: () => this.get<Node[]>('/api/nodes'),
    claim: (id: string) => this.post<Node>(`/api/nodes/${id}/claim`),
    release: (id: string) => this.post<{ ok: true }>(`/api/nodes/${id}/release`),
    reportLocalStats: (stats: NodeStats) => this.post<Node>('/api/nodes/local/stats', stats)
  }

  portal = {
    status: () => this.get<PortalSettings>('/api/portal'),
    refresh: () => this.post<PortalSettings>('/api/portal/refresh'),
    connect: (portalUrl: string, pin: string, name?: string, kind: 'desktop' | 'web' = 'desktop') =>
      this.post<PortalSettings>('/api/portal/connect', { portalUrl, pin, name, kind }),
    disconnect: () => this.post<PortalSettings>('/api/portal/disconnect'),
    hostLocally: (enabled: boolean) =>
      this.post<PortalSettings>('/api/portal/host-locally', { enabled }),
    domains: () => this.get<PortalDomainBinding[]>('/api/portal/domains'),
    checkDomain: (label: string, instanceId?: string) => {
      const query = new URLSearchParams({ label })
      if (instanceId) query.set('instanceId', instanceId)
      return this.get<DomainAvailability | null>(`/api/portal/domains/check?${query.toString()}`)
    },
    provisionDomain: (instanceId: string, force = false, label?: string) =>
      this.post<PortalDomainBinding>(`/api/portal/domains/${instanceId}`, { force, label }),
    releaseDomain: (instanceId: string) => this.del<{ ok: true }>(`/api/portal/domains/${instanceId}`),
    renameDomain: (instanceId: string, label: string) =>
      this.post<PortalDomainBinding>(`/api/portal/domains/${instanceId}/rename`, { label })
  }

  filehub = {
    status: () =>
      this.get<{ configured: boolean; connected: boolean; username: string | null; message: string | null }>(
        '/api/filehub/status'
      ),
    login: (baseUrl: string, username: string, password: string, totp?: string) =>
      this.post<{ ok: boolean; totpRequired: boolean; message: string | null }>('/api/filehub/login', {
        baseUrl,
        username,
        password,
        totp
      }),
    logout: () => this.post<{ ok: true }>('/api/filehub/logout'),
    folders: () => this.get<Array<{ id: string; name: string }>>('/api/filehub/folders'),
    upload: (instanceId: string, filename: string) =>
      this.post<{ ok: true }>(`/api/servers/${instanceId}/filehub/upload`, { filename })
  }

  /**
   * Subscribes to the live event stream. Reconnects automatically, because a
   * dropped socket would otherwise silently freeze the console and status dots.
   */
  events(onEvent: (event: ServerEvent) => void): () => void {
    let socket: WebSocket | null = null
    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = (): void => {
      if (closed) return
      // The handshake can't carry an Authorization header, so a bearer caller
      // passes its token in the query; cookie callers need neither.
      const query = this.token ? `?token=${encodeURIComponent(this.token)}` : ''
      const url = this.baseUrl.replace(/^http/, 'ws') + '/api/events' + query
      socket = new WebSocket(url)
      socket.onmessage = (message) => {
        try {
          onEvent(JSON.parse(String(message.data)) as ServerEvent)
        } catch {
          // A malformed frame shouldn't tear down the stream.
        }
      }
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1000)
      }
      socket.onerror = () => socket?.close()
    }

    connect()

    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }
}
