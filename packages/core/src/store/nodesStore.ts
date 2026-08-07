import { randomBytes } from 'crypto'
import type { Node, NodeStats } from '../types/index'
import { getSettings, saveSettings } from './settingsStore'

function buildPairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const raw = randomBytes(6)
  const chars = Array.from(raw, (value) => alphabet[value % alphabet.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

export function listNodes(): Node[] {
  return getSettings().nodes
}

export async function createNodePairingCode(name?: string): Promise<{ node: Node; pairingCode: string }> {
  const settings = getSettings()
  const pairingCode = buildPairingCode()
  const now = new Date().toISOString()
  const node: Node = {
    id: randomBytes(8).toString('hex'),
    name: name?.trim() || 'Chunkforge Node',
    kind: 'remote',
    pairingCode,
    pairedAt: now,
    lastSeenAt: now,
    status: 'pairing'
  }
  await saveSettings({ nodes: [...settings.nodes, node] })
  return { node, pairingCode }
}

export async function pairNodeByCode(code: string): Promise<Node> {
  const normalized = code.trim().toUpperCase()
  const settings = getSettings()
  const node = settings.nodes.find((entry) => entry.pairingCode === normalized)
  if (!node) throw new Error('Unknown pairing code.')
  const paired: Node = {
    ...node,
    pairingCode: undefined,
    pairedAt: node.pairedAt ?? new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    status: node.stats ? 'online' : 'offline'
  }
  await saveSettings({
    nodes: settings.nodes.map((entry) => (entry.id === paired.id ? paired : entry))
  })
  return paired
}

export async function updateNodeHeartbeat(nodeId: string, stats: NodeStats): Promise<Node> {
  const settings = getSettings()
  const existing = settings.nodes.find((node) => node.id === nodeId)
  if (!existing) throw new Error(`Unknown node: ${nodeId}`)
  const next: Node = {
    ...existing,
    stats,
    lastSeenAt: new Date().toISOString(),
    status: 'online'
  }
  await saveSettings({
    nodes: settings.nodes.map((node) => (node.id === nodeId ? next : node))
  })
  return next
}
