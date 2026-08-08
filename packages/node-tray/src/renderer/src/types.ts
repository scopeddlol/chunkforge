/**
 * The shapes the preload bridge exchanges with this window.
 *
 * Declared here rather than imported from the preload source: the renderer is
 * a browser bundle and must not pull a file that imports electron, even for
 * types — the two tsconfigs deliberately do not overlap.
 */
export interface NodeConfigView {
  portalUrl: string
  pairingPin: string
  nodeName: string
  dataRoot: string
  autoStart: boolean
}

export type NodeStatusView =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; nodeId: string; since: string }
  | { state: 'error'; message: string }

export interface NodeBridge {
  getConfig: () => Promise<NodeConfigView>
  getStatus: () => Promise<NodeStatusView>
  hasPaired: () => Promise<boolean>
  save: (config: NodeConfigView) => Promise<{ config: NodeConfigView; status: NodeStatusView }>
  start: () => Promise<void>
  stop: () => Promise<void>
  chooseDataRoot: () => Promise<string | null>
  onStatus: (callback: (status: NodeStatusView) => void) => () => void
  onConfig: (callback: (config: NodeConfigView) => void) => () => void
}

declare global {
  interface Window {
    chunkforgeNode: NodeBridge
  }
}
