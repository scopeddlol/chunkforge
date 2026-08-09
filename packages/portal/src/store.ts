import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { EndpointMapping } from './endpoints'
import { nodeClaimants, setClaimants } from './nodeClaims'
import {
  defaultPortalConfig,
  type PortalClientRecord,
  type PortalConfig,
  type PortalDomain,
  type PortalNode,
  type PortalPin
} from './types'

interface PortalFile {
  config: PortalConfig
  nodes: PortalNode[]
  clients: PortalClientRecord[]
  domains: PortalDomain[]
  endpointMappings: EndpointMapping[]
  pins: PortalPin[]
  users: PortalUser[]
}

export interface PortalUser {
  id: string
  username: string
  passwordHash: string
  createdAt: string
}

const PIN_TTL_MS = 30 * 60 * 1000

/**
 * Portal keeps its own state file, separate from anything Chunkforge Desktop or
 * Web writes. A Portal is shared infrastructure — several control planes may
 * attach to one — so its records cannot live inside any one of their data
 * directories.
 */
class PortalStore {
  private data: PortalFile = emptyFile()
  private root = ''
  private loaded = false

  async load(dataRoot: string): Promise<void> {
    this.root = dataRoot
    await mkdir(this.root, { recursive: true })
    const path = this.file()
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<PortalFile>
        this.data = {
          ...emptyFile(),
          ...parsed,
          config: { ...defaultPortalConfig, ...(parsed.config ?? {}) }
        }
      } catch {
        // A corrupt file must not stop Portal from booting — an operator can
        // still sign in and rebuild, which they cannot do if we throw here.
        this.data = emptyFile()
      }
    }
    this.loaded = true
    await this.reapPins()
  }

  private file(): string {
    return join(this.root, 'portal.json')
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new Error('Portal store used before load()')
  }

  async persist(): Promise<void> {
    this.assertLoaded()
    await mkdir(this.root, { recursive: true })
    await writeFile(this.file(), JSON.stringify(this.data, null, 2), 'utf-8')
  }

  // ---- config ----

  config(): PortalConfig {
    this.assertLoaded()
    return this.data.config
  }

  async saveConfig(patch: Partial<PortalConfig>): Promise<PortalConfig> {
    this.data.config = { ...this.data.config, ...patch }
    await this.persist()
    return this.data.config
  }

  // ---- users ----

  users(): PortalUser[] {
    this.assertLoaded()
    return this.data.users
  }

  findUser(username: string): PortalUser | undefined {
    return this.data.users.find((user) => user.username.toLowerCase() === username.toLowerCase())
  }

  findUserById(id: string): PortalUser | undefined {
    return this.data.users.find((user) => user.id === id)
  }

  async addUser(user: PortalUser): Promise<PortalUser> {
    this.data.users.push(user)
    await this.persist()
    return user
  }

  async setUserPassword(id: string, passwordHash: string): Promise<void> {
    const user = this.findUserById(id)
    if (!user) throw new Error('No such user')
    user.passwordHash = passwordHash
    await this.persist()
  }

  // ---- nodes ----

  nodes(): PortalNode[] {
    this.assertLoaded()
    return this.data.nodes
  }

  findNode(id: string): PortalNode | undefined {
    return this.data.nodes.find((node) => node.id === id)
  }

  findNodeByTokenHash(hash: string): PortalNode | undefined {
    return this.data.nodes.find((node) => node.tokenHash === hash)
  }

  async upsertNode(node: PortalNode): Promise<PortalNode> {
    const index = this.data.nodes.findIndex((entry) => entry.id === node.id)
    if (index >= 0) this.data.nodes[index] = node
    else this.data.nodes.push(node)
    await this.persist()
    return node
  }

  async removeNode(id: string): Promise<void> {
    this.data.nodes = this.data.nodes.filter((node) => node.id !== id)
    // A domain pointing at a node that no longer exists is a black hole; drop
    // the routes with it so the public port is released too.
    this.data.domains = this.data.domains.filter((domain) => domain.nodeId !== id)
    await this.persist()
  }

  // ---- clients ----

  clients(): PortalClientRecord[] {
    this.assertLoaded()
    return this.data.clients
  }

  findClient(id: string): PortalClientRecord | undefined {
    return this.data.clients.find((client) => client.id === id)
  }

  findClientByTokenHash(hash: string): PortalClientRecord | undefined {
    return this.data.clients.find((client) => client.tokenHash === hash)
  }

  async upsertClient(client: PortalClientRecord): Promise<PortalClientRecord> {
    const index = this.data.clients.findIndex((entry) => entry.id === client.id)
    if (index >= 0) this.data.clients[index] = client
    else this.data.clients.push(client)
    await this.persist()
    return client
  }

  async removeClient(id: string): Promise<void> {
    this.data.clients = this.data.clients.filter((client) => client.id !== id)
    this.data.domains = this.data.domains.filter((domain) => domain.clientId !== id)
    // Nodes stay paired — losing a laptop should not orphan a machine that is
    // still happily serving players — but they become unclaimed and adoptable.
    for (const node of this.data.nodes) {
      const remaining = nodeClaimants(node).filter((clientId) => clientId !== id)
      if (remaining.length !== nodeClaimants(node).length) setClaimants(node, remaining)
    }
    await this.persist()
  }

  // ---- domains ----

  domains(): PortalDomain[] {
    this.assertLoaded()
    return this.data.domains
  }

  findDomain(hostname: string): PortalDomain | undefined {
    const needle = hostname.trim().toLowerCase()
    return this.data.domains.find((domain) => domain.hostname === needle)
  }

  endpointMappings(): EndpointMapping[] {
    return this.data.endpointMappings ?? []
  }

  async upsertEndpointMapping(mapping: EndpointMapping): Promise<EndpointMapping> {
    this.data.endpointMappings = [
      ...this.endpointMappings().filter((entry) => entry.id !== mapping.id),
      mapping
    ]
    await this.persist()
    return mapping
  }

  async removeEndpointMapping(id: string): Promise<void> {
    this.data.endpointMappings = this.endpointMappings().filter((entry) => entry.id !== id)
    await this.persist()
  }

  async upsertDomain(domain: PortalDomain): Promise<PortalDomain> {
    const index = this.data.domains.findIndex((entry) => entry.hostname === domain.hostname)
    if (index >= 0) this.data.domains[index] = domain
    else this.data.domains.push(domain)
    await this.persist()
    return domain
  }

  async removeDomain(hostname: string): Promise<void> {
    const needle = hostname.trim().toLowerCase()
    this.data.domains = this.data.domains.filter((domain) => domain.hostname !== needle)
    await this.persist()
  }

  // ---- pins ----

  pins(): PortalPin[] {
    this.assertLoaded()
    return this.data.pins
  }

  async createPin(kind: PortalPin['kind'], label?: string): Promise<PortalPin> {
    const pin: PortalPin = {
      code: buildPinCode(),
      kind,
      label,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + PIN_TTL_MS).toISOString()
    }
    this.data.pins.push(pin)
    await this.persist()
    return pin
  }

  /**
   * Consumes a pin, returning it only if it is unused, unexpired, and of the
   * right kind. A node pin must never let something claim a control plane's
   * privileges, so the kind is checked here rather than at the call site.
   */
  async redeemPin(code: string, kind: PortalPin['kind']): Promise<PortalPin> {
    const normalized = code.trim().toUpperCase()
    const pin = this.data.pins.find((entry) => entry.code === normalized && entry.kind === kind)
    if (!pin) throw new Error('Unknown pairing pin.')
    if (pin.usedAt) throw new Error('That pairing pin has already been used.')
    if (Date.parse(pin.expiresAt) < Date.now()) throw new Error('That pairing pin has expired.')
    pin.usedAt = new Date().toISOString()
    await this.persist()
    return pin
  }

  async removePin(code: string): Promise<void> {
    this.data.pins = this.data.pins.filter((pin) => pin.code !== code.trim().toUpperCase())
    await this.persist()
  }

  /** Drops pins that are spent or long expired so the list stays readable. */
  async reapPins(): Promise<void> {
    const cutoff = Date.now() - PIN_TTL_MS
    const before = this.data.pins.length
    this.data.pins = this.data.pins.filter((pin) => {
      if (pin.usedAt) return Date.parse(pin.usedAt) > cutoff
      return Date.parse(pin.expiresAt) > cutoff
    })
    if (this.data.pins.length !== before) await this.persist()
  }
}

function emptyFile(): PortalFile {
  return {
    config: { ...defaultPortalConfig },
    nodes: [],
    clients: [],
    domains: [],
    endpointMappings: [],
    pins: [],
    users: []
  }
}

/** Ambiguous glyphs (0/O, 1/I) are left out — these get read aloud and retyped. */
function buildPinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const raw = randomBytes(8)
  const chars = Array.from(raw, (value) => alphabet[value % alphabet.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

export const portalStore = new PortalStore()
