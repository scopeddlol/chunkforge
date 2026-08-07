import os from 'os'
import { startNodeAgent, type RunningNodeAgent } from './agent'

export { startNodeAgent, type NodeAgentOptions, type RunningNodeAgent } from './agent'

/**
 * Starts a node from environment variables.
 *
 * Two callers use this: the container entrypoint (`main.ts`), and Chunkforge
 * Web, which can run a node inside its own container so a single-box homelab
 * needs one service rather than two.
 */
export async function startNodeFromEnvironment(): Promise<RunningNodeAgent> {
  const portalUrl = process.env.CHUNKFORGE_PORTAL_URL?.trim()
  const pairingPin = process.env.CHUNKFORGE_PAIRING_PIN?.trim()

  if (!portalUrl) throw new Error('CHUNKFORGE_PORTAL_URL is required.')
  if (!pairingPin) throw new Error('CHUNKFORGE_PAIRING_PIN is required.')

  return startNodeAgent({
    portalUrl,
    pairingPin,
    nodeName: process.env.CHUNKFORGE_NODE_NAME?.trim() || os.hostname(),
    dataRoot: process.env.CHUNKFORGE_DATA ?? '/data',
    heartbeatIntervalMs: Number(process.env.CHUNKFORGE_HEARTBEAT_MS ?? 15000)
  })
}
