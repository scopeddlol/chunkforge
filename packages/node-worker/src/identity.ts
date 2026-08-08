import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * A node's pairing, kept across restarts.
 *
 * Pairing pins are single-use and expire after half an hour, so redeeming one
 * on every boot only ever works once: the second start gets "that pairing pin
 * has already been used" and the machine drops off Portal until somebody
 * generates a fresh pin by hand. The token Portal issues at redemption is the
 * durable credential, so it is what gets stored here and reused, and the pin
 * becomes what it reads like — a one-time introduction rather than a password
 * the node needs on hand forever.
 */

const IDENTITY_FILENAME = 'node-identity.json'

export interface NodeIdentity {
  nodeId: string
  nodeToken: string
  /**
   * Which Portal this credential is for. Pointing a node at a different Portal
   * has to re-pair rather than present a token the new Portal never issued.
   */
  portalUrl: string
  pairedAt: string
}

function identityPath(dataRoot: string): string {
  return join(dataRoot, IDENTITY_FILENAME)
}

export async function loadNodeIdentity(
  dataRoot: string,
  portalUrl: string
): Promise<NodeIdentity | null> {
  const path = identityPath(dataRoot)
  if (!existsSync(path)) return null
  try {
    const identity = JSON.parse(await readFile(path, 'utf-8')) as NodeIdentity
    if (!identity.nodeToken || !identity.nodeId) return null
    if (normalizeUrl(identity.portalUrl) !== normalizeUrl(portalUrl)) return null
    return identity
  } catch {
    // A corrupt identity file is the same as none: re-pair rather than refuse
    // to start, since a pin can always be issued but a mangled file cannot be
    // repaired from here.
    return null
  }
}

export async function saveNodeIdentity(dataRoot: string, identity: NodeIdentity): Promise<void> {
  await mkdir(dataRoot, { recursive: true })
  await writeFile(identityPath(dataRoot), JSON.stringify(identity, null, 2), 'utf-8')
}

export async function clearNodeIdentity(dataRoot: string): Promise<void> {
  const path = identityPath(dataRoot)
  if (!existsSync(path)) return
  await writeFile(path, JSON.stringify({}, null, 2), 'utf-8')
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}
