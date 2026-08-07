import { normalizeZone } from './domains'
import { portalStore } from './store'
import type { PortalDomain } from './types'

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'SRV' | 'CNAME'
  name: string
  value: string
  /** Why this record exists, shown next to it in the admin UI. */
  note: string
}

/**
 * The DNS a subdomain needs in order to be a *plain address* a player can type.
 *
 * Portal allocates a public port per server, because every server on every node
 * is funnelled through one host. Players should never see that port, and for
 * Minecraft Java they don't have to: an SRV record carries the port, so
 * `survival.play.example.com` connects on its own.
 *
 * Portal does not write these records — it has no credentials for your zone.
 * It reports exactly what to publish, and a single wildcard A record covers the
 * address half for every server you will ever create, leaving one SRV record
 * per server as the only recurring step.
 */
export function dnsRecordsFor(domain: PortalDomain, portalAddress: string): DnsRecord[] {
  const records: DnsRecord[] = [
    {
      ...addressRecord(domain.hostname, portalAddress),
      note: 'Covered already if you published the wildcard record for the zone.'
    }
  ]
  if (domain.protocol === 'tcp') {
    records.push({
      type: 'SRV',
      name: `_minecraft._tcp.${domain.hostname}`,
      value: `0 0 ${domain.publicPort} ${domain.hostname}`,
      note: 'Lets players connect without typing a port.'
    })
  }
  return records
}

/** The one record that makes every future allocation work without more DNS. */
export function wildcardRecord(portalAddress: string): DnsRecord | null {
  const zone = normalizeZone(portalStore.config().zoneSuffix)
  if (!zone) return null
  return {
    ...addressRecord(`*.${zone}`, portalAddress),
    note: 'Publish once. Every subdomain Portal allocates resolves through it.'
  }
}

/**
 * Picks the record type that is actually legal for the address in hand.
 *
 * Portal is normally reached at a domain now, and an A record's value must be
 * an IP — pointing one at `portal.example.com` is invalid and every resolver
 * will reject it. A CNAME is the correct shape for that case, and has the happy
 * side effect that changing the VPS's IP needs no change here at all.
 */
function addressRecord(name: string, portalAddress: string): Omit<DnsRecord, 'note'> {
  if (!portalAddress) {
    return { type: 'A', name, value: '<your Portal public IP>' }
  }
  return isIpAddress(portalAddress)
    ? { type: 'A', name, value: portalAddress }
    : { type: 'CNAME', name, value: portalAddress }
}

function isIpAddress(value: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true
  // Bracketless IPv6 as it comes out of URL.hostname parsing.
  return value.includes(':')
}

/**
 * Best guess at the address operators should point DNS at, taken from the
 * configured public base URL. Returns an empty string when Portal has not been
 * told its own public address yet.
 */
export function portalPublicHost(): string {
  const raw = portalStore.config().publicBaseUrl.trim()
  if (!raw) return ''
  try {
    return new URL(raw).hostname
  } catch {
    return ''
  }
}
