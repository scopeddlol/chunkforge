import { deleteRecord, resolveZoneId, upsertRecord, verifyCredentials, type CloudflareCredentials } from './cloudflare'
import { dnsRecordsFor, dnsRecordsForEndpoint, portalPublicHost, wildcardRecord, type DnsRecord } from './dns'
import type { EndpointMapping } from './endpoints'
import { portalStore } from './store'
import type { PortalDomain } from './types'

/**
 * Bridges Portal's computed DNS records to an actual provider.
 *
 * Nothing outside this file needs to know Cloudflare exists — `domains.ts`
 * calls `syncDomainRecords`/`removeDomainRecords` unconditionally, and this
 * module is the only place that decides whether there is anywhere to send
 * them. That keeps the door open for another provider later without touching
 * the allocation logic at all.
 */

export function cloudflareCredentials(): CloudflareCredentials | null {
  const config = portalStore.config()
  if (!config.cloudflareApiToken || !config.cloudflareZoneId) return null
  return { apiToken: config.cloudflareApiToken, zoneId: config.cloudflareZoneId }
}

export function isCloudflareConfigured(): boolean {
  return cloudflareCredentials() !== null
}

/**
 * Resolves a zone name to Cloudflare's internal id and stores both. Run once
 * when an operator pastes in a token, so every later record write is a plain
 * id lookup rather than a name search.
 */
export async function connectCloudflare(apiToken: string): Promise<{ zoneId: string; zoneName: string }> {
  const zoneName = normalizeZoneSuffix(portalStore.config().zoneSuffix)
  if (!zoneName) throw new Error('Set the domain zone before connecting Cloudflare.')
  const zoneId = await resolveZoneId(apiToken, zoneName)
  await portalStore.saveConfig({ cloudflareApiToken: apiToken, cloudflareZoneId: zoneId })
  return { zoneId, zoneName }
}

export async function disconnectCloudflare(): Promise<void> {
  await portalStore.saveConfig({ cloudflareApiToken: '', cloudflareZoneId: '' })
}

/** For the admin UI's "Test connection" action — confirms the stored credentials still work. */
export async function testCloudflareConnection(): Promise<{ ok: true; zoneName: string }> {
  const credentials = cloudflareCredentials()
  if (!credentials) throw new Error('Cloudflare is not configured.')
  const zone = await verifyCredentials(credentials)
  return { ok: true, zoneName: zone.name }
}

/**
 * Publishes the wildcard record, if Cloudflare is configured and Portal knows
 * its own address. Called after every config save so turning Cloudflare on,
 * or changing the public URL, takes effect without a separate step.
 */
export async function syncWildcardRecord(): Promise<void> {
  const credentials = cloudflareCredentials()
  if (!credentials) return
  const record = wildcardRecord(portalPublicHost())
  if (!record) return
  await upsertRecord(credentials, record)
}

/**
 * Publishes every record a newly allocated (or reallocated) subdomain needs.
 * A no-op when Cloudflare is not configured — the caller (`domains.ts`) does
 * not need to check first, which is what keeps automatic and manual DNS on
 * the same code path.
 */
export async function syncDomainRecords(domain: PortalDomain): Promise<void> {
  const credentials = cloudflareCredentials()
  if (!credentials) return
  const records = dnsRecordsFor(domain, portalPublicHost())
  for (const record of records) {
    await upsertRecord(credentials, record)
  }
}

/** Removes the records a released subdomain owned. Also a no-op without Cloudflare. */
export async function removeDomainRecords(domain: PortalDomain): Promise<void> {
  const credentials = cloudflareCredentials()
  if (!credentials) return
  const records = dnsRecordsFor(domain, portalPublicHost())
  for (const record of records) {
    await deleteRecord(credentials, record)
  }
}

/**
 * Publishes the records an HTTP endpoint's hostname needs. A no-op for tcp and
 * udp endpoints, and a no-op when Cloudflare is not configured — the caller
 * does not have to distinguish.
 */
export async function syncEndpointRecords(mapping: EndpointMapping): Promise<void> {
  const credentials = cloudflareCredentials()
  if (!credentials) return
  for (const record of dnsRecordsForEndpoint(mapping, portalPublicHost())) {
    await upsertRecord(credentials, record)
  }
}

/** Removes what `syncEndpointRecords` published, when a mapping is released. */
export async function removeEndpointRecords(mapping: EndpointMapping): Promise<void> {
  const credentials = cloudflareCredentials()
  if (!credentials) return
  for (const record of dnsRecordsForEndpoint(mapping, portalPublicHost())) {
    await deleteRecord(credentials, record)
  }
}

/**
 * Same normalisation `domains.ts` applies, duplicated in miniature rather than
 * imported: `domains.ts` already imports from this module to publish records,
 * and importing back would make the two files a cycle.
 */
function normalizeZoneSuffix(suffix: string): string {
  return suffix.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
}

export type { DnsRecord }
