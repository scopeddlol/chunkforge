import type { EndpointProtocol } from '../types/index'

/**
 * The networking well-known add-ons need.
 *
 * Installing Simple Voice Chat and then discovering nobody can hear anything
 * is a bad afternoon: the mod wants a UDP port, and nothing in a normal
 * install tells you that until you read a wiki. So the handful of add-ons that
 * need their own port are described here, and Chunkforge provisions them at
 * install time.
 *
 * Matching is on the project slug each source uses rather than a display name,
 * because names are localised and change, and a profile that stops matching
 * fails silently — the add-on installs and the networking quietly does not.
 */

export interface EndpointProfile {
  /** Slugs this profile matches, lower-case, across sources. */
  slugs: string[]
  label: string
  protocol: EndpointProtocol
  /**
   * The port the add-on uses by default.
   *
   * Requested rather than guaranteed: if it is taken the node allocates
   * another, and for most of these the add-on's own config has to be pointed
   * at whatever it got. `configHint` is what the UI shows to say so.
   */
  defaultPort: number
  configHint: string
}

export const ENDPOINT_PROFILES: EndpointProfile[] = [
  {
    slugs: ['simple-voice-chat', 'simplevoicechat', 'voicechat'],
    label: 'Voice Chat',
    protocol: 'udp',
    defaultPort: 24454,
    configHint: 'Set `port` in config/voicechat/voicechat-server.properties to this port.'
  },
  {
    slugs: ['bluemap'],
    label: 'BlueMap',
    protocol: 'http',
    defaultPort: 8100,
    configHint: 'Set `port` under `webserver` in bluemap/webserver.conf to this port.'
  },
  {
    slugs: ['dynmap'],
    label: 'Dynmap',
    protocol: 'http',
    defaultPort: 8123,
    configHint: 'Set `webserver-port` in plugins/dynmap/configuration.txt to this port.'
  },
  {
    slugs: ['squaremap', 'pl3xmap'],
    label: 'Map',
    protocol: 'http',
    defaultPort: 8080,
    configHint: 'Set the web server port in the map plugin’s config to this port.'
  },
  {
    slugs: ['geyser', 'geysermc'],
    label: 'Bedrock (Geyser)',
    protocol: 'udp',
    defaultPort: 19132,
    configHint: 'Set `bedrock.port` in Geyser’s config.yml to this port.'
  }
]

/**
 * The profile for an add-on, or null when it needs no networking of its own.
 *
 * Most add-ons are in that second category, so returning null is the ordinary
 * answer rather than a failure.
 */
export function profileFor(slugOrId: string): EndpointProfile | null {
  const needle = slugOrId.trim().toLowerCase()
  if (!needle) return null
  return (
    ENDPOINT_PROFILES.find((profile) =>
      profile.slugs.some((slug) => slug === needle || needle.includes(slug))
    ) ?? null
  )
}
