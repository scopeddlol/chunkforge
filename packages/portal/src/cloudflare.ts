import type { DnsRecord } from './dns'

/**
 * A thin Cloudflare DNS client, scoped to exactly what Portal needs: creating,
 * updating, and deleting the records it already knows how to compute.
 *
 * This never becomes a general Cloudflare integration. Portal picks a zone by
 * name, and only ever touches the records it created or the one wildcard it is
 * told to manage — it does not enumerate your zone, and it does not touch
 * anything Chunkforge did not put there itself.
 */

export interface CloudflareCredentials {
  apiToken: string
  /** Cloudflare's internal zone id, e.g. 023e...af9. Resolved once and cached. */
  zoneId: string
}

export class CloudflareError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CloudflareError'
  }
}

interface CfApiResponse<T> {
  success: boolean
  errors: Array<{ code: number; message: string }>
  result: T
}

interface CfZone {
  id: string
  name: string
}

interface CfDnsRecord {
  id: string
  type: string
  name: string
  content: string
  ttl: number
  proxied: boolean
  data?: Record<string, unknown>
}

const CF_API = 'https://api.cloudflare.com/client/v4'

async function cfRequest<T>(
  apiToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      ...init?.headers
    }
  })
  let body: CfApiResponse<T>
  try {
    body = (await response.json()) as CfApiResponse<T>
  } catch {
    throw new CloudflareError(`Cloudflare returned an unreadable response (HTTP ${response.status}).`)
  }
  if (!response.ok || !body.success) {
    const message = body.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`
    throw new CloudflareError(message)
  }
  return body.result
}

/**
 * Looks up a zone id by the domain name Cloudflare hosts it under. Portal
 * stores the resolved id rather than re-resolving on every call, but this is
 * what runs the one time an operator points Portal at Cloudflare, and again
 * whenever they change the zone.
 */
export async function resolveZoneId(apiToken: string, zoneName: string): Promise<string> {
  const zones = await cfRequest<CfZone[]>(
    apiToken,
    `/zones?name=${encodeURIComponent(zoneName)}`
  )
  const zone = zones[0]
  if (!zone) {
    throw new CloudflareError(
      `No Cloudflare zone named "${zoneName}" is visible to this API token.`
    )
  }
  return zone.id
}

/** Confirms the token and zone actually work, for the admin UI's "Test" button. */
export async function verifyCredentials(credentials: CloudflareCredentials): Promise<CfZone> {
  return cfRequest<CfZone>(credentials.apiToken, `/zones/${credentials.zoneId}`)
}

/** `priority weight port target` as Portal renders it, split into Cloudflare's structured SRV fields. */
function parseSrvValue(value: string): { priority: number; weight: number; port: number; target: string } {
  const [priority, weight, port, target] = value.trim().split(/\s+/)
  return {
    priority: Number(priority) || 0,
    weight: Number(weight) || 0,
    port: Number(port) || 0,
    target: target ?? ''
  }
}

/**
 * Finds an existing record Portal would have created for this name and type.
 * Cloudflare's `name` filter accepts the full name for every record type,
 * underscore-prefixed SRV labels included, so one lookup shape covers all of
 * them — matching by name alone is not enough, since an old SRV record must
 * not be mistaken for an A record on the same owner, which is why type is
 * part of the query too.
 */
async function findExistingRecord(
  credentials: CloudflareCredentials,
  record: DnsRecord
): Promise<CfDnsRecord | undefined> {
  const results = await cfRequest<CfDnsRecord[]>(
    credentials.apiToken,
    `/zones/${credentials.zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`
  )
  return results[0]
}

/**
 * Creates or updates one DNS record on Cloudflare to match what Portal has
 * computed. Idempotent — allocating the same subdomain twice, or Portal
 * restarting mid-allocation, converges on the same record rather than piling
 * up duplicates.
 */
export async function upsertRecord(credentials: CloudflareCredentials, record: DnsRecord): Promise<void> {
  const existing = await findExistingRecord(credentials, record)

  const body: Record<string, unknown> =
    record.type === 'SRV'
      ? {
          type: 'SRV',
          // Cloudflare accepts the full underscore-prefixed name here directly
          // (`_minecraft._tcp.survival.play.example.com`) — no need to split it
          // into service/proto/name fields separately.
          name: record.name,
          ttl: 300,
          data: parseSrvValue(record.value)
        }
      : {
          type: record.type,
          name: record.name,
          content: record.value,
          // CNAME/A records for game servers must resolve to the real address,
          // not Cloudflare's proxy IPs — the relay speaks raw TCP/UDP on
          // arbitrary ports, which the HTTP/HTTPS-only proxy cannot carry.
          proxied: false,
          ttl: 300
        }

  if (existing) {
    await cfRequest(credentials.apiToken, `/zones/${credentials.zoneId}/dns_records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    })
    return
  }

  await cfRequest(credentials.apiToken, `/zones/${credentials.zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

/** Removes the record Portal would have created for this name and type, if any. */
export async function deleteRecord(credentials: CloudflareCredentials, record: DnsRecord): Promise<void> {
  const existing = await findExistingRecord(credentials, record)
  if (!existing) return
  await cfRequest(credentials.apiToken, `/zones/${credentials.zoneId}/dns_records/${existing.id}`, {
    method: 'DELETE'
  })
}
