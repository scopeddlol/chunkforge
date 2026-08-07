import { join } from 'path'
import type { ServerType, VersionCatalogEntry } from '../../shared/types'
import { downloadFile } from './downloadFile'

interface MojangManifest {
  latest: { release: string; snapshot: string }
  versions: Array<{ id: string; type: string; url: string; releaseTime: string }>
}

interface MojangVersionDetail {
  downloads: { server?: { url: string; sha1?: string } }
}

interface PaperProjectResponse {
  // Keyed by minor-version group (e.g. "1.21"), each holding build-tagged
  // version strings newest-last (e.g. ["1.21", "1.21.1", ...]).
  versions: Record<string, string[]>
}

interface PaperBuild {
  id: number
  channel: string
  downloads: Record<string, { name: string; url: string; checksums?: { sha256?: string } }>
}

const MOJANG_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
// PaperMC's v2 API was sunset in favor of the "Fill" v3 API.
const PAPER_API_BASE = 'https://fill.papermc.io/v3/projects/paper'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`)
  return response.json() as Promise<T>
}

async function listVanillaVersions(): Promise<VersionCatalogEntry[]> {
  const manifest = await fetchJson<MojangManifest>(MOJANG_MANIFEST_URL)
  return manifest.versions
    .filter((v) => v.type === 'release')
    .map((v) => ({
      id: v.id,
      label: v.id,
      isRecommended: v.id === manifest.latest.release,
      releasedAt: v.releaseTime
    }))
}

async function listPaperVersions(): Promise<VersionCatalogEntry[]> {
  const project = await fetchJson<PaperProjectResponse>(PAPER_API_BASE)
  // Groups come back newest-group-first; each group's versions come back
  // oldest-first, so the newest overall build is the last entry of the first group.
  const groups = Object.values(project.versions)
  const flattened = groups.flatMap((group) => [...group].reverse())
  // Version strings for RCs/pre-releases/alphas carry a "-" suffix (e.g.
  // "26.2-rc-2"); sort plain releases first so the list leads with what
  // most people want, with prereleases still available further down.
  const sorted = [...flattened].sort((a, b) => Number(a.includes('-')) - Number(b.includes('-')))
  const recommendedId = sorted.find((id) => !id.includes('-')) ?? sorted[0]
  return sorted.map((id) => ({
    id,
    label: id,
    isRecommended: id === recommendedId,
    releasedAt: null
  }))
}

export async function listVersions(serverType: ServerType): Promise<VersionCatalogEntry[]> {
  switch (serverType) {
    case 'vanilla':
      return listVanillaVersions()
    case 'paper':
      return listPaperVersions()
    default:
      throw new Error(`Version listing for "${serverType}" isn't implemented yet`)
  }
}

async function downloadVanillaJar(
  version: string,
  destDir: string,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  const manifest = await fetchJson<MojangManifest>(MOJANG_MANIFEST_URL)
  const entry = manifest.versions.find((v) => v.id === version)
  if (!entry) throw new Error(`Unknown Minecraft version: ${version}`)

  const detail = await fetchJson<MojangVersionDetail>(entry.url)
  const server = detail.downloads.server
  if (!server?.url) throw new Error(`Minecraft ${version} has no server jar available`)

  const jarPath = join(destDir, 'server.jar')
  await downloadFile(server.url, jarPath, { onProgress, sha1: server.sha1 })
  return jarPath
}

async function downloadPaperJar(
  version: string,
  destDir: string,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  // Builds come back newest-first, each already carrying its own download URL.
  const builds = await fetchJson<PaperBuild[]>(`${PAPER_API_BASE}/versions/${version}/builds`)
  const stableBuilds = builds.filter((b) => b.channel === 'STABLE')
  const latestBuild = (stableBuilds.length > 0 ? stableBuilds : builds)[0]
  if (!latestBuild) throw new Error(`No Paper builds found for ${version}`)

  const download = latestBuild.downloads['server:default']
  if (!download) throw new Error(`Paper build ${latestBuild.id} has no server download`)

  const jarPath = join(destDir, 'server.jar')
  await downloadFile(download.url, jarPath, { onProgress, sha256: download.checksums?.sha256 })
  return jarPath
}

export async function downloadServerJar(
  serverType: ServerType,
  version: string,
  destDir: string,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  switch (serverType) {
    case 'vanilla':
      return downloadVanillaJar(version, destDir, onProgress)
    case 'paper':
      return downloadPaperJar(version, destDir, onProgress)
    default:
      throw new Error(`Jar acquisition for "${serverType}" isn't implemented yet`)
  }
}
