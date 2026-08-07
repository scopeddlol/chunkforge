import { randomBytes } from 'crypto'
import type { Node, NodeStats, PortalSettings, PortalTunnelPort } from '../types/index'
import { getSettings, saveSettings } from './settingsStore'

const PENDING_NODE_TTL_MS = 15 * 60 * 1000

function buildPin(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const raw = randomBytes(6)
  const chars = Array.from(raw, (value) => alphabet[value % alphabet.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

function requirePortalConfigured(): PortalSettings {
  const portal = getSettings().portal
  if (!portal.publicBaseUrl.trim()) throw new Error('Portal public URL is not configured.')
  return portal
}

function nowIso(): string {
  return new Date().toISOString()
}

function isPairingNode(node: Node): boolean {
  return node.kind === 'remote' && node.status === 'pairing' && !!node.pairingCode
}

export async function createDesktopConnectorPin(): Promise<{ pin: string; portal: PortalSettings }> {
  const portal = requirePortalConfigured()
  const pin = buildPin()
  const nextPortal: PortalSettings = {
    ...portal,
    desktopConnectorPin: pin,
    connectionStatus: 'connecting'
  }
  await saveSettings({ portal: nextPortal })
  return { pin, portal: nextPortal }
}

export function getPortalStatus(): PortalSettings {
  return getSettings().portal
}

export async function connectDesktopToPortal(pin: string): Promise<PortalSettings> {
  const settings = getSettings()
  const portal = settings.portal
  if (!portal.desktopConnectorPin || portal.desktopConnectorPin !== pin.trim().toUpperCase()) {
    throw new Error('Unknown desktop connector pin.')
  }
  const nextPortal: PortalSettings = {
    ...portal,
    connectionStatus: 'connected',
    connectedAt: nowIso()
  }
  await saveSettings({ portal: nextPortal })
  return nextPortal
}

export async function redeemNodePortalPin(pin: string, nodeName: string): Promise<{ nodeId: string; nodeToken: string }> {
  const settings = getSettings()
  const normalizedPin = pin.trim().toUpperCase()
  const existingNode = settings.nodes.find((node) => node.pairingCode === normalizedPin && isPairingNode(node))
  const now = nowIso()
  const token = randomBytes(24).toString('hex')

  let node: Node
  if (existingNode) {
    node = {
      ...existingNode,
      name: nodeName.trim() || existingNode.name,
      pairingCode: undefined,
      pairedAt: existingNode.pairedAt ?? now,
      lastSeenAt: now,
      status: 'offline',
      portal: {
        portalUrl: settings.portal.publicBaseUrl,
        portalNodeToken: token,
        connectionStatus: 'connected',
        lastHandshakeAt: now
      }
    }
  } else {
    const pendingNode = settings.nodes.find(
      (entry) =>
        entry.kind === 'remote' &&
        entry.status === 'pairing' &&
        entry.lastSeenAt &&
        Date.now() - Date.parse(entry.lastSeenAt) < PENDING_NODE_TTL_MS
    )
    if (!pendingNode) throw new Error('Unknown node pairing pin.')
    node = {
      ...pendingNode,
      name: nodeName.trim() || pendingNode.name,
      pairingCode: undefined,
      pairedAt: pendingNode.pairedAt ?? now,
      lastSeenAt: now,
      status: 'offline',
      portal: {
        portalUrl: settings.portal.publicBaseUrl,
        portalNodeToken: token,
        connectionStatus: 'connected',
        lastHandshakeAt: now
      }
    }
  }

  await saveSettings({
    nodes: settings.nodes.map((entry) => (entry.id === node.id ? node : entry))
  })
  return { nodeId: node.id, nodeToken: token }
}

export async function updatePortalNodeHeartbeat(nodeToken: string, stats: NodeStats): Promise<Node> {
  const settings = getSettings()
  const existing = settings.nodes.find((node) => node.portal?.portalNodeToken === nodeToken)
  if (!existing) throw new Error('Unknown portal node token.')
  const now = nowIso()
  const next: Node = {
    ...existing,
    stats,
    lastSeenAt: now,
    status: 'online',
    portal: existing.portal
      ? {
          ...existing.portal,
          connectionStatus: 'connected',
          lastHandshakeAt: now
        }
      : undefined
  }
  await saveSettings({
    nodes: settings.nodes.map((node) => (node.id === next.id ? next : node))
  })
  return next
}

export async function registerPortalNodeTunnels(nodeToken: string, ports: PortalTunnelPort[]): Promise<Node> {
  const settings = getSettings()
  const existing = settings.nodes.find((node) => node.portal?.portalNodeToken === nodeToken)
  if (!existing) throw new Error('Unknown portal node token.')
  if (ports.length === 0) throw new Error('At least one tunnel port is required.')
  const next: Node = {
    ...existing,
    portal: existing.portal
      ? {
          ...existing.portal,
          connectionStatus: 'connected',
          lastHandshakeAt: nowIso()
        }
      : undefined
  }
  await saveSettings({
    nodes: settings.nodes.map((node) => (node.id === next.id ? next : node))
  })
  return next
}
