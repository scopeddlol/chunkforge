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
export function profileFor(slugOrId: string | undefined | null): EndpointProfile | null {
  const needle = canonical(slugOrId ?? '')
  if (!needle) return null
  return (
    ENDPOINT_PROFILES.find((profile) =>
      profile.slugs.some((slug) => {
        const target = canonical(slug)
        return needle === target || needle.includes(target)
      })
    ) ?? null
  )
}

/**
 * Reduces a slug or a display name to letters and digits.
 *
 * Sources disagree about punctuation for the same project — Modrinth's
 * `simple-voice-chat`, a CurseForge display name of "Simple Voice Chat" and a
 * jar called `voicechat_1.21` are all the same add-on. Comparing the letters
 * alone means a profile keeps matching when a source changes its formatting,
 * which is the failure that would otherwise be silent.
 */
function canonical(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}
