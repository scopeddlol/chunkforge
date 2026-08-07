import type { InstanceMetadata, PortalSettings } from '../types/index'
import { getSettings, saveSettings } from './settingsStore'
import { loadInstanceMetadata, saveInstanceMetadata } from './instancesStore'

/**
 * This control plane's side of its Portal link.
 *
 * Deliberately state-only: no HTTP lives here. Core is the domain layer and
 * runs in three very different hosts, so the network call that actually talks
 * to a Portal belongs one layer up, in `@chunkforge/api`. What core owns is the
 * record of *whether* we are linked and under what identity.
 */

export function getPortalStatus(): PortalSettings {
  return getSettings().portal
}

export async function savePortalStatus(patch: Partial<PortalSettings>): Promise<PortalSettings> {
  const next: PortalSettings = { ...getSettings().portal, ...patch }
  await saveSettings({ portal: next })
  return next
}

/** True once a pin has been redeemed and a token stored. */
export function isPortalLinked(): boolean {
  const portal = getSettings().portal
  return portal.enabled && Boolean(portal.portalUrl.trim()) && Boolean(portal.clientToken)
}

/** Throws with a message worth showing, rather than a bare falsy check. */
export function requirePortalLink(): PortalSettings {
  const portal = getSettings().portal
  if (!portal.portalUrl.trim()) throw new Error('No Chunkforge Portal is configured.')
  if (!portal.clientToken) throw new Error('This Chunkforge is not paired with its Portal yet.')
  return portal
}

export async function clearPortalLink(): Promise<PortalSettings> {
  return savePortalStatus({
    clientId: '',
    clientToken: '',
    zoneSuffix: '',
    connectionStatus: 'disconnected',
    connectedAt: undefined,
    lastError: undefined
  })
}

/**
 * Records the address Portal allocated for a server, so the UI can show it and
 * a later rename can ask for the same one back.
 */
export async function bindInstanceHostname(
  instanceId: string,
  hostname: string,
  publicPort: number
): Promise<InstanceMetadata> {
  const instance = await loadInstanceMetadata(instanceId)
  if (instance.portalHostname === hostname && instance.portalPublicPort === publicPort) {
    return instance
  }
  const next: InstanceMetadata = { ...instance, portalHostname: hostname, portalPublicPort: publicPort }
  await saveInstanceMetadata(next)
  return next
}

export async function unbindInstanceHostname(instanceId: string): Promise<InstanceMetadata> {
  const instance = await loadInstanceMetadata(instanceId)
  const next: InstanceMetadata = { ...instance, portalHostname: undefined, portalPublicPort: undefined }
  await saveInstanceMetadata(next)
  return next
}
