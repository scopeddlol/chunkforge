import { resolveZoneId } from './cloudflare'
import { portalStore } from './store'

/**
 * Configuration Portal takes from its environment rather than its web UI.
 *
 * A containerised Portal is fronted by a reverse proxy that already knows the
 * domain — it needs it to get a certificate. Making an operator type that same
 * domain a second time into a settings form is a chance to type it *wrong*, and
 * a Portal whose public base URL disagrees with its certificate hands out
 * pairing URLs that nothing can reach.
 *
 * So when the domain is supplied by the environment, it wins, and the field
 * becomes read-only in the UI.
 */

function normalizeUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  // A bare domain is the common case — CHUNKFORGE_PORTAL_DOMAIN is exactly what
  // the proxy wants, so accept it and assume the TLS the proxy is providing.
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** The public base URL the environment dictates, or null when it says nothing. */
export function managedPublicBaseUrl(): string | null {
  const explicit = process.env.CHUNKFORGE_PORTAL_PUBLIC_URL?.trim()
  if (explicit) return normalizeUrl(explicit)
  const domain = process.env.CHUNKFORGE_PORTAL_DOMAIN?.trim()
  if (domain) return normalizeUrl(domain)
  return null
}

export function isPublicBaseUrlManaged(): boolean {
  return managedPublicBaseUrl() !== null
}

/** True when the Cloudflare token came from the environment rather than the UI. */
export function isCloudflareManaged(): boolean {
  return Boolean(process.env.CHUNKFORGE_CLOUDFLARE_API_TOKEN?.trim())
}

/**
 * Reconciles stored config with the environment at boot. Runs before any route
 * is served, so nothing ever reads a base URL that the container has since been
 * redeployed away from.
 */
export async function applyEnvironmentConfig(): Promise<void> {
  const patch: Parameters<typeof portalStore.saveConfig>[0] = {}
  const config = portalStore.config()

  const publicBaseUrl = managedPublicBaseUrl()
  if (publicBaseUrl && publicBaseUrl !== config.publicBaseUrl) {
    patch.publicBaseUrl = publicBaseUrl
  }

  // The zone is only *seeded*, not managed. Operators legitimately change which
  // zone they hand subdomains out of without redeploying, and silently reverting
  // that on every restart would be maddening.
  const zone = process.env.CHUNKFORGE_PORTAL_ZONE?.trim()
  if (zone && !config.zoneSuffix.trim()) patch.zoneSuffix = zone

  if (Object.keys(patch).length > 0) await portalStore.saveConfig(patch)

  await applyEnvironmentCloudflare()
}

/**
 * Resolves and stores a Cloudflare token supplied by the environment. Unlike
 * the public URL, this is safe to re-resolve on every boot rather than only
 * seeding once: a token rotated in the deployment's secrets should take effect
 * on the next restart, not be stuck on whatever was first typed in.
 */
async function applyEnvironmentCloudflare(): Promise<void> {
  const apiToken = process.env.CHUNKFORGE_CLOUDFLARE_API_TOKEN?.trim()
  if (!apiToken) return

  const zoneName = process.env.CHUNKFORGE_CLOUDFLARE_ZONE_NAME?.trim() || portalStore.config().zoneSuffix
  if (!zoneName) return

  try {
    const zoneId = await resolveZoneId(apiToken, zoneName)
    await portalStore.saveConfig({ cloudflareApiToken: apiToken, cloudflareZoneId: zoneId })
  } catch (err) {
    // A bad token must not stop Portal from booting — DNS automation is an
    // enhancement, and the manual records are still reported as a fallback.
    console.error(`Cloudflare credentials from the environment did not work: ${(err as Error).message}`)
  }
}
