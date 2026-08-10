import { createHash } from 'crypto'
import { readdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import {
  addOnFolder,
  type AddonAudit,
  type AuditedAddon,
  type PluginSource,
  type ServerType
} from '../../types/index'
import type { CompatibilityTarget } from './compatibility'
import { judgeVersion } from './selection'
import { isClientOnly } from './dependencies'
import type { PluginProvider } from './provider'

/**
 * Checking what is already on a server.
 *
 * A server that will not start rarely says which of its forty jars is at
 * fault, and the usual answer — a client-only mod, or one built for another
 * loader — is invisible from the filename. So each jar is identified by its
 * hash, which is the only thing about a file that cannot have been renamed by
 * hand, and judged the same way a new install would be.
 *
 * Anything that cannot be identified is reported as unidentified rather than
 * assumed fine or assumed broken. Guessing from filenames is how an audit
 * deletes the wrong mod.
 */

export type ProviderLookup = (source: PluginSource) => PluginProvider

/** Sources that can identify a file from its hash, cheapest first. */
const IDENTIFYING_SOURCES: PluginSource[] = ['modrinth']

export async function auditInstalledAddons(
  instancePath: string,
  serverType: ServerType,
  target: CompatibilityTarget,
  lookup: ProviderLookup
): Promise<AddonAudit> {
  const dir = join(instancePath, addOnFolder(serverType))
  let entries: string[]
  try {
    entries = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile() && /\.jar(\.disabled)?$/.test(e.name))
      .map((e) => e.name)
  } catch {
    return { addons: [], problems: [], unidentified: 0 }
  }

  const addons: AuditedAddon[] = []
  for (const filename of entries) {
    const path = join(dir, filename)
    let bytes: Buffer
    try {
      bytes = await readFile(path)
    } catch {
      continue
    }
    const sha1 = createHash('sha1').update(bytes).digest('hex')

    const audited: AuditedAddon = {
      filename,
      sizeBytes: bytes.byteLength,
      enabled: !filename.endsWith('.disabled'),
      projectId: null,
      source: null,
      name: null
    }

    for (const source of IDENTIFYING_SOURCES) {
      const provider = lookup(source)
      if (!provider?.isAvailable() || !provider.lookupByHash) continue
      const hit = await provider.lookupByHash(sha1).catch(() => null)
      if (!hit) continue

      audited.projectId = hit.projectId
      audited.source = source
      const project = provider.getProject
        ? await provider.getProject(hit.projectId).catch(() => null)
        : null
      audited.name = project?.name ?? hit.projectId

      if (project && isClientOnly(project)) {
        audited.problem = 'client-only'
        audited.detail = `${audited.name} runs on the client. On a server it does nothing, and on a modded server it can stop it starting.`
        break
      }

      const verdict = judgeVersion(hit.version, target)
      if (!verdict.compatible && verdict.certain) {
        audited.problem = /Built for/.test(verdict.reason ?? '') ? 'wrong-version' : 'wrong-platform'
        audited.detail = `${audited.name}: ${verdict.reason}`
      }
      break
    }

    addons.push(audited)
  }

  return {
    addons,
    problems: addons.filter((a) => a.problem),
    unidentified: addons.filter((a) => !a.projectId).length
  }
}

/**
 * Removes files an audit flagged.
 *
 * Takes filenames rather than re-running the audit so that what is deleted is
 * exactly what the user was shown. Re-deriving the list here would open a gap
 * between the two, and the thing in that gap is somebody's mod.
 */
export async function removeAddons(
  instancePath: string,
  serverType: ServerType,
  filenames: string[]
): Promise<string[]> {
  const dir = join(instancePath, addOnFolder(serverType))
  const removed: string[] = []
  for (const filename of filenames) {
    // A filename from a request must not be able to reach outside the folder.
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) continue
    try {
      await rm(join(dir, filename), { force: true })
      removed.push(filename)
    } catch {
      // Already gone is the outcome the caller wanted.
    }
  }
  return removed
}
