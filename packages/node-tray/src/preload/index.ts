import { contextBridge, ipcRenderer } from 'electron'

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

/**
 * The whole bridge. This window configures a node and watches it — it never
 * manages servers, so none of the Core API surface belongs here.
 */
const nodeApi = {
  getConfig: (): Promise<NodeConfigView> => ipcRenderer.invoke('node:getConfig'),
  getStatus: (): Promise<NodeStatusView> => ipcRenderer.invoke('node:getStatus'),
  hasPaired: (): Promise<boolean> => ipcRenderer.invoke('node:hasPaired'),
  save: (config: NodeConfigView): Promise<{ config: NodeConfigView; status: NodeStatusView }> =>
    ipcRenderer.invoke('node:save', config),
  start: (): Promise<void> => ipcRenderer.invoke('node:start'),
  stop: (): Promise<void> => ipcRenderer.invoke('node:stop'),
  chooseDataRoot: (): Promise<string | null> => ipcRenderer.invoke('node:chooseDataRoot'),

  onStatus: (callback: (status: NodeStatusView) => void): (() => void) => {
    const listener = (_: unknown, payload: NodeStatusView): void => callback(payload)
    ipcRenderer.on('node:status', listener)
    return () => ipcRenderer.removeListener('node:status', listener)
  },
  onConfig: (callback: (config: NodeConfigView) => void): (() => void) => {
    const listener = (_: unknown, payload: NodeConfigView): void => callback(payload)
    ipcRenderer.on('node:config', listener)
    return () => ipcRenderer.removeListener('node:config', listener)
  }
}

contextBridge.exposeInMainWorld('chunkforgeNode', nodeApi)

export type NodeApi = typeof nodeApi
