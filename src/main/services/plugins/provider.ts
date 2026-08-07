import type { PluginSearchResult, PluginSource, PluginVersion } from '../../../shared/types'

export interface PluginProvider {
  readonly source: PluginSource
  /** Whether the provider is usable right now (e.g. CurseForge needs an API key). */
  isAvailable(): boolean
  search(query: string, gameVersion: string | undefined, limit: number): Promise<PluginSearchResult[]>
  listVersions(projectId: string): Promise<PluginVersion[]>
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      // Both Modrinth and Hangar ask API consumers to identify themselves.
      'User-Agent': 'Chunkforge/0.1.0 (Minecraft server manager)',
      Accept: 'application/json',
      ...init?.headers
    }
  })
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`)
  return response.json() as Promise<T>
}
