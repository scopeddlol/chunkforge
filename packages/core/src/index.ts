/**
 * @chunkforge/core — the domain layer.
 *
 * Everything Chunkforge knows how to *do* lives here: acquiring server jars,
 * managing Java runtimes, running server processes, add-ons, backups, files,
 * players, and stats. It has no UI and no Electron dependency, so the desktop
 * shell, the standalone API, and node agents all drive the same code.
 *
 * Callers must call configureDataRoot() once at startup before using anything
 * that touches disk.
 */

export * from './types/index'

// Paths and lifecycle
export {
  configureDataRoot,
  chunkforgeRoot,
  instancesRoot,
  runtimesRoot,
  cacheRoot,
  ensureChunkforgeDirs,
  localIpv4
} from './services/paths'

// Server lifecycle
export { instanceManager } from './services/instanceManager'
export { acquireServer, listVersions } from './services/jarAcquisition'
export { defaultLaunchArgs, installGeyser, listLoaderVersions, installLoader } from './services/loaders'
export { resolveServerRequirements, requiredJavaMajorFallback } from './services/minecraftVersions'
export { renderEula, renderServerProperties } from './services/serverProperties'

// Java
export { detectInstalledJava, ensureJavaRuntime } from './services/javaManager'

// Endpoints
export {
  ENDPOINT_PROFILES,
  profileFor,
  type EndpointProfile
} from './services/endpointProfiles'
export {
  endpointsFor,
  extraEndpoints,
  addEndpoint,
  endpointsForAddon,
  newEndpointId,
  GAME_ENDPOINT_ID,
  type AddEndpointRequest
} from './services/endpoints'

// Ports
export {
  isPortFree,
  findFreePort,
  portProblem,
  portsReservedByInstances
} from './services/portService'

// Add-ons
export {
  searchPlugins,
  listPluginVersions,
  listInstalledPlugins,
  installPlugin,
  setPluginEnabled,
  uninstallPlugin,
  availableSources,
  getProvider
} from './services/plugins/pluginRegistry'
export { searchModpacks, listModpackVersions } from './services/plugins/modpacks'
export { verifyCurseForgeKey, type CurseForgeKeyStatus } from './services/plugins/curseforge'
export { listGameVersions } from './services/plugins/gameVersions'
export {
  judgeCompatibility,
  platformsForServer,
  toPlatform,
  versionMatches,
  type CompatibilityTarget
} from './services/plugins/compatibility'
export { installModpack, readModpackTarget, loaderToServerType } from './services/modpackService'

// Files, players, backups, stats
export {
  listDirectory,
  readTextFile,
  writeTextFile,
  deleteEntry,
  renameEntry,
  createDirectory
} from './services/filesService'
export { listPlayers } from './services/playersService'
export { listBackups, createBackup, restoreBackup, deleteBackup } from './services/backupsService'
export { backupScheduler } from './services/backupScheduler'
export { lifecycleScheduler, inStartWindow, runLifecycleTick } from './services/lifecycleScheduler'
export { collectDashboardStats } from './services/statsService'
export { downloadFile } from './services/downloadFile'

// FileHub integration
export { FileHubClient, FileHubError } from './services/filehubClient'

// Persistence
export {
  listInstanceMetadata,
  loadInstanceMetadata,
  saveInstanceMetadata,
  removeInstanceFromIndex,
  resolveInstanceDir,
  slugifyInstanceName
} from './store/instancesStore'
export { getSettings, loadSettings, saveSettings } from './store/settingsStore'
export { runMigrations, migrateInstance, CURRENT_SCHEMA_VERSION } from './store/migrations'
export { listLocalNodes, getLocalNode, updateLocalNodeStats } from './store/nodesStore'
export {
  getPortalStatus,
  savePortalStatus,
  isPortalLinked,
  requirePortalLink,
  clearPortalLink,
  bindInstanceHostname,
  unbindInstanceHostname
} from './store/portalStore'
