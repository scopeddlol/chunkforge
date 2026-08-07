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
      type: 'A',
      name: domain.hostname,
      value: portalAddress || '<your Portal public IP>',
      note: 'Covered already if you published a wildcard A record for the zone.'
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
    type: 'A',
    name: `*.${zone}`,
    value: portalAddress || '<your Portal public IP>',
    note: 'Publish once. Every subdomain Portal allocates resolves through it.'
  }
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
