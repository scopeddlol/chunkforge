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
  ensureChunkforgeDirs
} from './services/paths'

// Server lifecycle
export { instanceManager } from './services/instanceManager'
export { acquireServer, listVersions } from './services/jarAcquisition'
export { defaultLaunchArgs, installGeyser, listLoaderVersions, installLoader } from './services/loaders'
export { resolveServerRequirements, requiredJavaMajorFallback } from './services/minecraftVersions'
export { renderEula, renderServerProperties } from './services/serverProperties'

// Java
export { detectInstalledJava, ensureJavaRuntime } from './services/javaManager'

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
