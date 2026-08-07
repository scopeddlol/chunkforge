import { existsSync } from 'fs'
import { copyFile, mkdir, readdir, rm } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'
import type { ServerType, VersionCatalogEntry } from '../../shared/types'
import { LAUNCH_TOKENS } from '../../shared/types'
import { downloadFile } from './downloadFile'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Chunkforge/0.1.0' } })
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`)
  return response.json() as Promise<T>
}

/** Prerelease/RC version strings carry a suffix; plain releases sort first. */
function stableFirst(versions: string[]): string[] {
  return [...versions].sort((a, b) => Number(a.includes('-')) - Number(b.includes('-')))
}

function toCatalog(versions: string[]): VersionCatalogEntry[] {
  const sorted = stableFirst(versions)
  const recommended = sorted.find((v) => !v.includes('-')) ?? sorted[0]
  return sorted.map((id) => ({ id, label: id, isRecommended: id === recommended, releasedAt: null }))
}

/** Default java args for a freshly created instance of each type. */
export function defaultLaunchArgs(serverType: ServerType, jvmFlags: string[]): string[] {
  const base = [`-Xms${LAUNCH_TOKENS.minRam}M`, `-Xmx${LAUNCH_TOKENS.maxRam}M`, ...jvmFlags]
  if (serverType === 'forge') {
    // Modern Forge ships an args file listing its module path; @-file launch is
    // the supported entry point and is filled in after installServer runs.
    return [...base, '@libraries/net/minecraftforge/forge/FORGE_VERSION/win_args.txt', 'nogui']
  }
  return [...base, '-jar', 'server.jar', 'nogui']
}

// ---------------------------------------------------------------- Purpur

interface PurpurProject {
  versions: string[]
}
interface PurpurVersion {
  builds: { latest: string }
}

async function purpurVersions(): Promise<VersionCatalogEntry[]> {
  const project = await fetchJson<PurpurProject>('https://api.purpurmc.org/v2/purpur')
  return toCatalog([...project.versions].reverse())
}

async function downloadPurpur(
  version: string,
  destDir: string,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  const detail = await fetchJson<PurpurVersion>(`https://api.purpurmc.org/v2/purpur/${version}`)
  const url = `https://api.purpurmc.org/v2/purpur/${version}/${detail.builds.latest}/download`
  await downloadFile(url, join(destDir, 'server.jar'), { onProgress })
}

// ---------------------------------------------------------------- Fabric

interface FabricEntry {
  version: string
  stable: boolean
}

async function fabricVersions(): Promise<VersionCatalogEntry[]> {
  const games = await fetchJson<FabricEntry[]>('https://meta.fabricmc.net/v2/versions/game')
  return toCatalog(games.filter((g) => g.stable).map((g) => g.version))
}

async function downloadFabric(
  version: string,
  destDir: string,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  const [loaders, installers] = await Promise.all([
    fetchJson<FabricEntry[]>('https://meta.fabricmc.net/v2/versions/loader'),
    fetchJson<FabricEntry[]>('https://meta.fabricmc.net/v2/versions/installer')
  ])
  // Fabric serves a ready-to-run launcher jar; no install step needed.
  const url = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaders[0].version}/${installers[0].version}/server/jar`
  await downloadFile(url, join(destDir, 'server.jar'), { onProgress })
}

// ---------------------------------------------------------------- Forge

interface ForgePromos {
  promos: Record<string, string>
}

async function forgePromos(): Promise<ForgePromos> {
  return fetchJson<ForgePromos>(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
  )
}

async function forgeVersions(): Promise<VersionCatalogEntry[]> {
  const { promos } = await forgePromos()
  const gameVersions = [...new Set(Object.keys(promos).map((key) => key.replace(/-(latest|recommended)$/, '')))]
  return toCatalog(gameVersions.reverse())
}

/**
 * Forge ships an installer that must be run to materialise its libraries.
 * Returns the resolved forge version so the launch args can point at its
 * generated args file.
 */
async function installForge(
  version: string,
  destDir: string,
  javaPath: string,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  const { promos } = await forgePromos()
  const forgeVersion = promos[`${version}-recommended`] ?? promos[`${version}-latest`]
  if (!forgeVersion) throw new Error(`No Forge build published for Minecraft ${version}`)

  const full = `${version}-${forgeVersion}`
  const installerPath = join(destDir, 'forge-installer.jar')
  await downloadFile(
    `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`,
    installerPath,
    { onProgress }
  )

  await runInstaller(javaPath, destDir, 'forge-installer.jar', 'Forge')

  await rm(installerPath, { force: true })
  await rm(join(destDir, 'forge-installer.jar.log'), { force: true })
  return forgeVersion
}

/** Runs a loader's installer jar in server mode, surfacing its output on failure. */
function runInstaller(
  javaPath: string,
  cwd: string,
  jarName: string,
  label: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', jarName, '--installServer'], { cwd })
    let output = ''
    const capture = (c: Buffer): void => {
      output = (output + c.toString()).slice(-4000)
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} installer failed (${code}): ${output.slice(-400)}`))
    )
  })
}

// ---------------------------------------------------------------- NeoForge

const NEOFORGE_VERSIONS_URL =
  'https://maven.neoforged.net/api/maven/versions/releases/net%2Fneoforged%2Fneoforge'

/**
 * NeoForge build versions encode the Minecraft version they target, but the
 * encoding changed with Mojang's new scheme:
 *   3 parts — "21.1.9"     -> MC 1.21.1  (patch 0 means MC 1.<minor>)
 *   4 parts — "26.1.2.94"  -> MC 26.1.2
 */
function neoforgeToMinecraft(version: string): string | null {
  const core = version.split('-')[0]
  const parts = core.split('.')
  if (parts.length >= 4) return parts.slice(0, 3).join('.')
  if (parts.length === 3) {
    const [minor, patch] = parts
    return patch === '0' ? `1.${minor}` : `1.${minor}.${patch}`
  }
  return null
}

async function neoforgeBuilds(): Promise<string[]> {
  const data = await fetchJson<{ versions: string[] }>(NEOFORGE_VERSIONS_URL)
  return data.versions.filter((v) => !/beta|alpha|rc/i.test(v))
}

async function neoforgeVersions(): Promise<VersionCatalogEntry[]> {
  const builds = await neoforgeBuilds()
  const mcVersions: string[] = []
  for (const build of builds) {
    const mc = neoforgeToMinecraft(build)
    if (mc && !mcVersions.includes(mc)) mcVersions.push(mc)
  }
  return toCatalog(mcVersions.reverse())
}

/** Newest NeoForge build targeting a given Minecraft version. */
async function latestNeoforgeBuild(minecraftVersion: string): Promise<string> {
  const builds = await neoforgeBuilds()
  const matching = builds.filter((b) => neoforgeToMinecraft(b) === minecraftVersion)
  const latest = matching.at(-1)
  if (!latest) throw new Error(`No NeoForge build published for Minecraft ${minecraftVersion}`)
  return latest
}

async function installNeoForge(
  version: string,
  destDir: string,
  javaPath: string,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  const build = await latestNeoforgeBuild(version)
  const installerPath = join(destDir, 'neoforge-installer.jar')
  await downloadFile(
    `https://maven.neoforged.net/releases/net/neoforged/neoforge/${build}/neoforge-${build}-installer.jar`,
    installerPath,
    { onProgress }
  )

  await runInstaller(javaPath, destDir, 'neoforge-installer.jar', 'NeoForge')
  await rm(installerPath, { force: true })
  return build
}

// ---------------------------------------------------------------- Spigot

/**
 * Spigot can't be redistributed, so it has to be compiled locally with
 * BuildTools. This takes many minutes and needs git on PATH.
 */
async function buildSpigot(
  version: string,
  destDir: string,
  javaPath: string,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  const buildDir = join(destDir, '.buildtools')
  await rm(buildDir, { recursive: true, force: true })
  const buildToolsPath = join(buildDir, 'BuildTools.jar')

  await downloadFile(
    'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar',
    buildToolsPath,
    { onProgress }
  )

  await new Promise<void>((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', 'BuildTools.jar', '--rev', version], { cwd: buildDir })
    let tail = ''
    const capture = (c: Buffer): void => {
      tail = (tail + c.toString()).slice(-2000)
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`BuildTools failed (${code}): ${tail.slice(-400)}`))
    )
  })

  const built = (await readdir(buildDir)).find((f) => /^spigot-.*\.jar$/.test(f))
  if (!built) throw new Error('BuildTools finished but produced no spigot jar')

  await copyFile(join(buildDir, built), join(destDir, 'server.jar'))
  await rm(buildDir, { recursive: true, force: true })
}

async function spigotVersions(): Promise<VersionCatalogEntry[]> {
  // Spigot has no version index; BuildTools accepts Minecraft version strings,
  // so the Paper catalogue is a reliable stand-in for what's buildable.
  const project = await fetchJson<{ versions: Record<string, string[]> }>(
    'https://fill.papermc.io/v3/projects/paper'
  )
  return toCatalog(Object.values(project.versions).flatMap((group) => [...group].reverse()))
}

// ---------------------------------------------------------------- Geyser

/** Downloads Geyser + Floodgate into the instance's plugins folder. */
export async function installGeyser(destDir: string): Promise<void> {
  const pluginsDir = join(destDir, 'plugins')
  await mkdir(pluginsDir, { recursive: true })

  for (const project of ['geyser', 'floodgate'] as const) {
    const meta = await fetchJson<{ versions: string[] }>(
      `https://download.geysermc.org/v2/projects/${project}`
    )
    const version = meta.versions.at(-1)
    if (!version) continue
    const build = await fetchJson<{ build: number; downloads: Record<string, unknown> }>(
      `https://download.geysermc.org/v2/projects/${project}/versions/${version}/builds/latest`
    )
    const url = `https://download.geysermc.org/v2/projects/${project}/versions/${version}/builds/${build.build}/downloads/spigot`
    await downloadFile(url, join(pluginsDir, `${project === 'geyser' ? 'Geyser-Spigot' : 'floodgate-spigot'}.jar`))
  }
}

// ---------------------------------------------------------------- dispatch

export async function listLoaderVersions(serverType: ServerType): Promise<VersionCatalogEntry[]> {
  switch (serverType) {
    case 'purpur':
      return purpurVersions()
    case 'fabric':
      return fabricVersions()
    case 'forge':
      return forgeVersions()
    case 'neoforge':
      return neoforgeVersions()
    case 'spigot':
      return spigotVersions()
    default:
      throw new Error(`No version source for ${serverType}`)
  }
}

export interface LoaderInstallResult {
  /** Set when the loader needs launch args different from the default -jar form. */
  launchArgs?: string[]
}

export async function installLoader(
  serverType: ServerType,
  version: string,
  destDir: string,
  javaPath: string,
  jvmFlags: string[],
  onProgress?: (percent: number | null) => void
): Promise<LoaderInstallResult> {
  switch (serverType) {
    case 'purpur':
      await downloadPurpur(version, destDir, onProgress)
      return {}
    case 'fabric':
      await downloadFabric(version, destDir, onProgress)
      return {}
    case 'spigot':
      await buildSpigot(version, destDir, javaPath, onProgress)
      return {}
    case 'neoforge': {
      const build = await installNeoForge(version, destDir, javaPath, onProgress)
      const argsFile = join(destDir, 'libraries', 'net', 'neoforged', 'neoforge', build, 'win_args.txt')
      if (!existsSync(argsFile)) {
        throw new Error('NeoForge installed but its launch args file is missing')
      }
      return {
        launchArgs: [
          `-Xms${LAUNCH_TOKENS.minRam}M`,
          `-Xmx${LAUNCH_TOKENS.maxRam}M`,
          ...jvmFlags,
          `@libraries/net/neoforged/neoforge/${build}/win_args.txt`,
          'nogui'
        ]
      }
    }
    case 'forge': {
      const forgeVersion = await installForge(version, destDir, javaPath, onProgress)
      const argsFile = join(
        destDir,
        'libraries',
        'net',
        'minecraftforge',
        'forge',
        `${version}-${forgeVersion}`,
        'win_args.txt'
      )
      if (!existsSync(argsFile)) {
        throw new Error('Forge installed but its launch args file is missing')
      }
      return {
        launchArgs: defaultLaunchArgs('forge', jvmFlags).map((arg) =>
          arg.includes('FORGE_VERSION')
            ? `@libraries/net/minecraftforge/forge/${version}-${forgeVersion}/win_args.txt`
            : arg
        )
      }
    }
    default:
      throw new Error(`Loader install not implemented for ${serverType}`)
  }
}
