import { LOCAL_NODE_ID, type Node, type PortalTunnelPort, type Project } from './models'

// The platform models live in their own module but are part of the same public
// surface, so callers keep importing everything from one place.
export * from './models'

export type ServerType = 'vanilla' | 'paper' | 'purpur' | 'spigot' | 'forge' | 'fabric' | 'neoforge'

export const serverTypeLabels: Record<ServerType, string> = {
  vanilla: 'Vanilla',
  paper: 'Paper',
  purpur: 'Purpur',
  spigot: 'Spigot',
  forge: 'Forge',
  fabric: 'Fabric',
  neoforge: 'NeoForge'
}

/** What kind of add-ons a server type accepts. Drives the browser and tabs. */
export type ServerCategory = 'vanilla' | 'plugins' | 'mods'

export const serverTypeCategory: Record<ServerType, ServerCategory> = {
  vanilla: 'vanilla',
  paper: 'plugins',
  purpur: 'plugins',
  spigot: 'plugins',
  forge: 'mods',
  fabric: 'mods',
  neoforge: 'mods'
}

export const serverCategoryLabels: Record<ServerCategory, string> = {
  vanilla: 'Vanilla',
  plugins: 'Plugins',
  mods: 'Mods'
}

export const pluginServerTypes: ServerType[] = ['paper', 'purpur', 'spigot']
export const modServerTypes: ServerType[] = ['forge', 'fabric', 'neoforge']

/** Where add-ons are installed for a given server type. */
export function addOnFolder(serverType: ServerType): string {
  return serverTypeCategory[serverType] === 'mods' ? 'mods' : 'plugins'
}

/** Placeholders substituted into launchArgs at spawn time. */
export const LAUNCH_TOKENS = {
  minRam: '{MIN_RAM}',
  maxRam: '{MAX_RAM}'
} as const

export type InstanceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'

export interface InstanceSummary {
  id: string
  name: string
  serverType: ServerType
  minecraftVersion: string
  status: InstanceStatus
  playersOnline: number
  /**
   * Names of the players currently connected. Derived from the live process, so
   * it is absent when a summary is read straight off disk.
   */
  onlinePlayers?: string[]
  maxPlayers: number
  ramAllocatedMb: number
  accentColor: string
  createdAt: string
  /** Custom thumbnail as a data: URL. Falls back to generated artwork when unset. */
  iconDataUrl?: string | null
  /** @deprecated Superseded by `projectId`; still written for older builds. */
  groupId?: string | null
  /** Automatic restarts, scheduled hours, sleep and maintenance backups. */
  lifecycle?: ServerLifecycle
  /** Owning project. Stamped by migration on records that predate projects. */
  projectId?: string
  /** Node this instance runs on. `local` unless it was deployed to a Portal node. */
  nodeId?: string
  /** Address players connect to, allocated by Portal (e.g. survival.play.example.com). */
  portalHostname?: string
  /** Public port Portal accepts traffic on for this server. */
  portalPublicPort?: number
  /**
   * Address players use when there is no Portal in front of this server, e.g.
   * `192.168.1.50:25565`. Only set for servers on the machine answering the
   * request — a Portal node has no inbound address to publish.
   */
  directAddress?: string
}

export interface InstanceMetadata extends InstanceSummary {
  port: number
  /**
   * On-disk schema generation. Lets the migration recognise records it has
   * already touched instead of rewriting every file on every boot.
   */
  schemaVersion?: number
  javaPath: string | null
  /** Java major version this server requires, per the upstream project's own metadata. */
  javaMajor?: number
  /** Server-recommended JVM tuning flags (Paper publishes these). */
  jvmFlags?: string[]
  /**
   * Full java argument list, with {MIN_RAM}/{MAX_RAM} substituted at spawn.
   * Editable from the instance's Startup settings — Forge in particular needs
   * an @args-file launch rather than a plain -jar.
   */
  launchArgs?: string[]
  backupSchedule?: BackupSchedule
  /** FileHub folder created for this server's backups. */
  fileHubFolderId?: string | null
  minRamMb: number
  maxRamMb: number
  eulaAccepted: boolean
  path: string
  toggles: InstanceToggles
  exposedPorts?: PortalTunnelPort[]
}

export interface InstanceToggles {
  onlineMode: boolean
  pvp: boolean
  hardcore: boolean
  whitelist: boolean
  commandBlocksEnabled: boolean
  spawnProtection: number
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard'
  viewDistance: number
}

export const defaultToggles: InstanceToggles = {
  onlineMode: true,
  pvp: true,
  hardcore: false,
  whitelist: false,
  commandBlocksEnabled: false,
  spawnProtection: 16,
  difficulty: 'normal',
  viewDistance: 10
}

export interface CreateInstanceConfig {
  name: string
  serverType: ServerType
  minecraftVersion: string
  port: number
  minRamMb: number
  maxRamMb: number
  toggles: InstanceToggles
  accentColor: string
  /** Parent directory to create the server's folder in. Defaults to the Chunkforge Instances root when omitted. */
  installLocation: string | null
  /** Installs Geyser + Floodgate so Bedrock clients can join. */
  enableGeyser?: boolean
  groupId?: string | null
  /** Plugins queued in the wizard, installed once the server exists. */
  initialPlugins?: QueuedPlugin[]
  /** Modpack to install over the fresh server, replacing manual mod picking. */
  modpack?: SelectedModpack | null
  exposedPorts?: PortalTunnelPort[]
  /**
   * Where to build the server. `local` (the default) means this machine;
   * anything else is a Portal node id, and the whole creation is carried out on
   * that node instead.
   */
  nodeId?: string
  /**
   * Requested subdomain label for a server deployed to a node, e.g. `survival`
   * for `survival.play.example.com`. Omit to derive one from the server's
   * name, which is what happens for most servers.
   */
  subdomainLabel?: string
}

/**
 * Where a server lives, when it does not live here.
 *
 * A remote server's real record is on the node that runs it. This control plane
 * keeps only the pointer, so it knows which node to forward `/api/servers/:id`
 * calls to without asking every node in turn.
 */
export interface RemoteInstanceRef {
  instanceId: string
  nodeId: string
  name: string
  createdAt: string
}

export interface QueuedPlugin {
  source: PluginSource
  projectId: string
  name: string
}

export interface SelectedModpack {
  source: PluginSource
  projectId: string
  name: string
  downloadUrl: string
  serverType: ServerType
  minecraftVersion: string
}

/**
 * @deprecated Being replaced by `Project`, which adds ownership and permission
 * scope. Kept as the on-disk name so existing settings files keep loading.
 */
export interface ServerGroup {
  id: string
  name: string
  color: string
}

export interface ModpackInstallProgress {
  stage: 'downloading' | 'installing' | 'done'
  message: string
  percent: number
}

export interface DashboardStats {
  cpuPercent: number
  cpuCores: number
  totalMemoryBytes: number
  usedMemoryBytes: number
  /** Sum of max heap across running servers. */
  allocatedMemoryBytes: number
  serverCount: number
  runningCount: number
  playersOnline: number
  backupCount: number
  backupBytes: number
  diskBytes: number
  uptimeSeconds: number
}

export interface VersionCatalogEntry {
  id: string
  label: string
  isRecommended: boolean
  releasedAt: string | null
}

export type CreateProgressStage =
  | 'preparing'
  | 'resolving-java'
  | 'downloading-java'
  | 'downloading-server'
  | 'accepting-eula'
  | 'first-boot'
  | 'done'
  | 'error'

export interface CreateProgressEvent {
  instanceId: string
  stage: CreateProgressStage
  message: string
  percent: number | null
}

export interface LogLineEvent {
  instanceId: string
  line: string
  stream: 'stdout' | 'stderr' | 'system'
  timestamp: number
}

export interface StatusChangedEvent {
  instanceId: string
  status: InstanceStatus
}

export interface PlayersChangedEvent {
  instanceId: string
  players: string[]
}

export interface ChatMessage {
  id: string
  kind: 'chat' | 'join' | 'leave' | 'death' | 'server'
  author: string | null
  text: string
  timestamp: number
}

export interface PlayerEntry {
  name: string
  uuid: string | null
  online: boolean
  op: boolean
  whitelisted: boolean
  banned: boolean
}

export interface FileEntry {
  name: string
  /** Path relative to the instance root, using forward slashes. */
  relativePath: string
  isDirectory: boolean
  sizeBytes: number
  modifiedAt: number
  /** Whether the file is small enough and looks like text we can edit in-app. */
  editable: boolean
}

export interface BackupEntry {
  /** What this archive actually contains. Absent on archives made before this existed. */
  contents?: BackupContents
  filename: string
  sizeBytes: number
  createdAt: number
}

/**
 * What goes into a backup.
 *
 * Separated because the three answer different questions. A world is the thing
 * players would mourn; add-ons are re-downloadable but a specific working set
 * of versions is not; configs are small, fiddly, and the part someone spent an
 * evening tuning. Backing up all three every time would multiply the size of
 * the expensive one for the sake of the cheap ones.
 */
export interface BackupContents {
  /** world, world_nether, world_the_end. */
  worlds: boolean
  /** plugins/ and mods/, including their own config folders. */
  addons: boolean
  /** server.properties, the loader's yml/toml files, ops and whitelist. */
  configs: boolean
}

export const defaultBackupContents: BackupContents = {
  worlds: true,
  addons: false,
  configs: false
}

/**
 * When a server should run, and when it should look after itself.
 *
 * One record rather than four, because these rules interact and reading them
 * apart would hide that. A server that is scheduled to stop at 03:00, restarts
 * every six hours, and sleeps when empty needs a single place where the
 * precedence between those is written down — see `lifecycleScheduler`.
 *
 * Times are `HH:MM` in the host's local timezone. A server operator thinks in
 * "3am", not in UTC offsets, and the machine running the server is the one
 * whose small hours actually matter.
 */
export interface ServerLifecycle {
  /** Restart every N hours while running. 0 or absent disables it. */
  restartEveryHours?: number
  /** Local `HH:MM` to start at, every day. */
  startAt?: string
  /** Local `HH:MM` to stop at, every day. */
  stopAt?: string
  /**
   * Stop the server once it has been empty this long. 0 or absent disables it.
   *
   * Only meaningful with a Portal address: a slept server is one nobody can
   * wake by connecting, so this is for servers someone starts deliberately.
   */
  sleepAfterEmptyMinutes?: number
  /**
   * Take the server down, back it up, and bring it back, on the backup
   * schedule's own interval. Off means backups run with the server live, which
   * is faster but can capture a half-written chunk.
   */
  maintenanceBackups?: boolean
}

export const defaultServerLifecycle: ServerLifecycle = {}

export interface BackupSchedule {
  enabled: boolean
  intervalHours: number
  /** Oldest backups beyond this count are pruned. 0 keeps everything. */
  keepCount: number
  uploadToFileHub: boolean
  lastRunAt?: number
  /** Absent means worlds only, which is what every backup was before this. */
  contents?: BackupContents
}

export const defaultBackupSchedule: BackupSchedule = {
  enabled: false,
  intervalHours: 6,
  keepCount: 5,
  uploadToFileHub: false,
  contents: defaultBackupContents
}

export type PluginSource = 'modrinth' | 'hangar' | 'spiget' | 'curseforge'

export const pluginSourceLabels: Record<PluginSource, string> = {
  modrinth: 'Modrinth',
  hangar: 'Hangar',
  spiget: 'SpigotMC',
  curseforge: 'CurseForge'
}

export interface PluginAlternative {
  source: PluginSource
  id: string
  downloads: number
  sourceUrl: string
}

/**
 * What a piece of content *is*, independent of where it was found.
 *
 * Sources disagree about vocabulary — Modrinth calls them project types,
 * CurseForge uses class ids, Hangar only has plugins — so every provider
 * normalises to this before anything downstream sees it.
 */
export type ContentKind = 'plugin' | 'mod' | 'modpack'

/**
 * The platform a piece of content runs on.
 *
 * Deliberately one list rather than separate mod-loader and plugin-platform
 * enums: a search spans both worlds, and the browser needs to compare a
 * result against a server without caring which family it came from.
 */
export type ContentPlatform =
  | 'paper'
  | 'spigot'
  | 'purpur'
  | 'bukkit'
  | 'folia'
  | 'velocity'
  | 'waterfall'
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'quilt'

/**
 * Whether a result can actually run on the server the browser is attached to,
 * and why not when it cannot.
 *
 * Carried on the result rather than computed in the UI so that filtering,
 * sorting, and the explanation a user reads all agree — the previous browser
 * showed incompatible entries with no way to tell, because nothing on the
 * result said what it supported.
 */
export interface CompatibilityVerdict {
  compatible: boolean
  /** Set when the source told us enough to be sure; false means "assumed". */
  certain: boolean
  /** Short human reason, e.g. "No build for 1.21.1" or "Fabric only". */
  reason?: string
}

export interface PluginSearchResult {
  source: PluginSource
  id: string
  name: string
  summary: string
  iconUrl: string | null
  downloads: number
  author: string
  sourceUrl: string
  categories: string[]
  /** Same project found on other sources; picked from at download time. */
  alternatives?: PluginAlternative[]
  /** What this is. Lets one search feed the Mods, Plugins and Modpacks tabs. */
  kind?: ContentKind
  /**
   * Game versions the source advertises for the project as a whole. Absent
   * when a source does not publish it at search time, which is the difference
   * between "known incompatible" and "unknown".
   */
  gameVersions?: string[]
  /** Platforms the project advertises, normalised across sources. */
  platforms?: ContentPlatform[]
  /** Filled in when the browser is attached to a server. */
  compatibility?: CompatibilityVerdict
  /** Recency signal for sorting; sources that omit it sort last. */
  updatedAt?: string | null
}

export interface PluginVersion {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  /** Null when the source only links out (e.g. Hangar entries hosted on GitHub). */
  downloadUrl: string | null
  externalUrl: string | null
  filename: string | null
  sha1: string | null
}

export interface InstalledPlugin {
  filename: string
  sizeBytes: number
  enabled: boolean
}

export interface PluginSearchQuery {
  query: string
  sources: PluginSource[]
  gameVersion?: string
  loader?: string
  limit?: number
  /**
   * How many results to skip. Sources paginate differently — offsets, pages,
   * cursors — so each provider converts this to whatever its API wants and
   * the caller only ever thinks in offsets.
   */
  offset?: number
  /** Narrows the search to one kind. Omit to search everything. */
  kind?: ContentKind
  /**
   * Drop results that cannot run on the attached server rather than showing
   * them greyed out. Requires gameVersion/loader to mean anything.
   */
  hideIncompatible?: boolean
  /** Defaults to true; set false to see one card per source. */
  mergeSources?: boolean
  /**
   * Server the browser is attached to. Present means every result comes back
   * judged, and `hideIncompatible` has something to act on.
   */
  serverType?: ServerType
}

export interface PluginSearchResponse {
  results: PluginSearchResult[]
  /** Per-source failures, so one dead source doesn't hide the rest. */
  errors: { source: PluginSource; message: string }[]
  /**
   * Whether asking for the next offset could return anything. Derived from
   * whether any source filled its page, because most of these APIs will not
   * tell us a total and the ones that do disagree about what it counts.
   */
  hasMore: boolean
  /** Offset to pass back for the next page. */
  nextOffset: number
  /** Results removed by `hideIncompatible`, so the UI can say so. */
  filteredOut?: number
}

/** A Minecraft release offered in the content browser's version filter. */
export interface GameVersionOption {
  id: string
  /** Newest release, so the UI can preselect something sensible. */
  isLatest: boolean
}

export type DashboardView = 'grid' | 'table'

export type ThemeId =
  | 'oled'
  | 'midnight'
  | 'nebula'
  | 'forest'
  | 'ember'
  | 'slate'
  | 'light'
  | 'parchment'

/** 'system' follows Windows and picks OLED Violet or Light accordingly. */
export type ThemePreference = 'system' | ThemeId

export interface FileHubSettings {
  /** Base URL of a self-hosted FileHub instance, e.g. https://files.example.com */
  baseUrl: string
  username: string
  /** Session cookie captured at sign-in; the password is never stored. */
  sessionCookie: string | null
  /** Destination folder id on FileHub, or null for the root. */
  folderId: string | null
  uploadBackupsAutomatically: boolean
}

/**
 * This Chunkforge's link to a Portal.
 *
 * Everything here describes the *client* side of that relationship. The zone,
 * the port range, and who else is attached are Portal's business and are
 * configured in Portal's own web interface — Chunkforge only mirrors the few
 * fields it needs in order to show what an address will look like.
 */
export interface PortalSettings {
  enabled: boolean
  /** Base URL of the Portal, e.g. https://portal.example.com */
  portalUrl: string
  /** Identity Portal issued when the pairing pin was redeemed. */
  clientId: string
  /** Bearer token for this control plane. Never leaves the machine. */
  clientToken: string
  /** Mirrored from Portal, e.g. play.example.com */
  zoneSuffix: string
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  connectedAt?: string
  /** Last failure, so the UI can explain a red status instead of just showing one. */
  lastError?: string
  /** Request a subdomain from Portal for every server created on a node. */
  autoProvisionSubdomains: boolean
  /**
   * Offer this machine to Portal as a node, so servers running here can be
   * given a subdomain too. Off by default: an install that only deploys to
   * real nodes should not publish a route into the user's own desktop.
   */
  hostServersLocally?: boolean
  /** Node id Portal issued for this machine, kept so re-registering reuses it. */
  selfNodeId?: string
  /**
   * Whether this control plane answers Portal's requests for its server list,
   * which is what lets an admin see servers across every panel on one Portal.
   *
   * Absent means yes — it is the reason to link a Portal at all — and an
   * operator who would rather keep this panel's inventory to itself turns it
   * off. Turning it off never affects subdomains, relaying, or nodes.
   */
  shareInventoryWithPortal?: boolean
}

export interface AppSettings {
  themePreference: ThemePreference
  curseForgeApiKey: string
  defaultInstallLocation: string | null
  defaultMinRamMb: number
  defaultMaxRamMb: number
  defaultPort: number
  enabledPluginSources: PluginSource[]
  confirmBeforeStop: boolean
  consoleScrollbackLines: number
  fileHub: FileHubSettings
  portal: PortalSettings
  /** @deprecated Migrated into `projects`; retained so older builds still read. */
  serverGroups: ServerGroup[]
  projects: Project[]
  /**
   * Only the local node. Remote nodes are not stored here — they belong to the
   * Portal, which is the single place they are paired and named, and are read
   * live so two control planes never disagree about what exists.
   */
  nodes: Node[]
  /** Pointers to servers that live on Portal nodes rather than this machine. */
  remoteInstances: RemoteInstanceRef[]
  dashboardView: DashboardView
  /**
   * When the first-run wizard was finished, ISO-8601. Absent means it has not
   * run — which is also true of every install that predates it, so the wizard
   * offers itself once on upgrade rather than assuming a fresh setup.
   */
  onboardingCompletedAt?: string
}

export const defaultAppSettings: AppSettings = {
  themePreference: 'system',
  curseForgeApiKey: '',
  defaultInstallLocation: null,
  defaultMinRamMb: 2048,
  defaultMaxRamMb: 4096,
  defaultPort: 25565,
  enabledPluginSources: ['modrinth', 'hangar', 'spiget', 'curseforge'],
  confirmBeforeStop: true,
  consoleScrollbackLines: 2000,
  serverGroups: [],
  projects: [],
  nodes: [{ id: LOCAL_NODE_ID, name: 'This machine', kind: 'local', status: 'online' }],
  remoteInstances: [],
  dashboardView: 'grid',
  portal: {
    enabled: false,
    portalUrl: '',
    clientId: '',
    clientToken: '',
    zoneSuffix: '',
    connectionStatus: 'disconnected',
    autoProvisionSubdomains: true
  },
  fileHub: {
    baseUrl: '',
    username: '',
    sessionCookie: null,
    folderId: null,
    uploadBackupsAutomatically: false
  }
}

export interface FileHubStatus {
  configured: boolean
  connected: boolean
  username: string | null
  message: string | null
}

export interface BackupUploadProgress {
  instanceId: string
  filename: string
  percent: number
  done: boolean
  error: string | null
}
