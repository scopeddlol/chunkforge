import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { chunkforgeRoot } from '@chunkforge/core'
import {
  hashPassword,
  hashToken,
  inviteHint,
  inviteProblem,
  newId,
  newInviteCode,
  newToken,
  type ApiToken,
  type Invite,
  type Role,
  type Session,
  type User
} from './model'

interface AuthFile {
  users: User[]
  apiTokens: ApiToken[]
  invites: Invite[]
}

/** The parts of a user an admin may set when creating an account. */
export type UserGrants = Partial<Pick<User, 'nodeAccess' | 'canConfigurePersonalNode'>>

export type UserPatch = Partial<Pick<User, 'role' | 'disabled' | 'projectGrants' | 'canConfigurePersonalNode'>> & {
  /** An array restricts, `null` clears the restriction, absent leaves it alone. */
  nodeAccess?: string[] | null
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Auth state lives in a JSON file beside the rest of Chunkforge's data.
 * Sessions are deliberately in-memory only: a panel restart signing everyone
 * out is acceptable, and it avoids persisting bearer material.
 */
class AuthStore {
  private data: AuthFile = { users: [], apiTokens: [], invites: [] }
  private sessions = new Map<string, Session>()
  private loaded = false

  private file(): string {
    return join(chunkforgeRoot(), 'auth.json')
  }

  async load(): Promise<void> {
    const path = this.file()
    if (!existsSync(path)) {
      this.data = { users: [], apiTokens: [], invites: [] }
      this.loaded = true
      return
    }
    try {
      this.data = JSON.parse(await readFile(path, 'utf-8')) as AuthFile
      this.data.users ??= []
      this.data.apiTokens ??= []
      this.data.invites ??= []
    } catch {
      this.data = { users: [], apiTokens: [], invites: [] }
    }
    this.loaded = true
  }

  private async persist(): Promise<void> {
    await mkdir(chunkforgeRoot(), { recursive: true })
    await writeFile(this.file(), JSON.stringify(this.data, null, 2), 'utf-8')
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new Error('Auth store used before load()')
  }

  /** True until the first-run owner account exists. */
  needsSetup(): boolean {
    this.assertLoaded()
    return this.data.users.length === 0
  }

  listUsers(): User[] {
    this.assertLoaded()
    return this.data.users.map((u) => ({ ...u, passwordHash: '' }))
  }

  findUser(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id)
  }

  findByUsername(username: string): User | undefined {
    return this.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase())
  }

  async createUser(
    username: string,
    password: string,
    role: Role,
    grants: UserGrants = {}
  ): Promise<User> {
    this.assertLoaded()
    if (this.findByUsername(username)) throw new Error('That username is already taken')
    const user: User = {
      id: newId(),
      username,
      passwordHash: hashPassword(password),
      role,
      projectGrants: {},
      createdAt: new Date().toISOString(),
      ...grants
    }
    this.data.users.push(user)
    await this.persist()
    return user
  }

  async updateUser(id: string, patch: UserPatch): Promise<User> {
    const user = this.findUser(id)
    if (!user) throw new Error('No such user')
    // The owner must always remain able to administer the panel.
    if (user.role === 'owner' && patch.role && patch.role !== 'owner') {
      throw new Error("The owner's role cannot be changed")
    }
    // `nodeAccess: null` is how a caller says "back to every node" — undefined
    // cannot travel through JSON, and Object.assign would treat it as absent.
    // Copied rather than edited in place: routes hand this straight from
    // `request.body`, and quietly rewriting a caller's object is the kind of
    // thing that goes wrong once something else reads it afterwards.
    const { nodeAccess, ...rest } = patch
    if (nodeAccess === null) delete user.nodeAccess
    else if (nodeAccess !== undefined) user.nodeAccess = nodeAccess
    Object.assign(user, rest)
    await this.persist()
    return user
  }

  async setPassword(id: string, password: string): Promise<void> {
    const user = this.findUser(id)
    if (!user) throw new Error('No such user')
    user.passwordHash = hashPassword(password)
    await this.persist()
    // Signing out other sessions limits the blast radius of a changed password.
    for (const [token, session] of this.sessions) {
      if (session.userId === id) this.sessions.delete(token)
    }
  }

  async deleteUser(id: string): Promise<void> {
    const user = this.findUser(id)
    if (!user) return
    if (user.role === 'owner') throw new Error('The owner account cannot be deleted')
    this.data.users = this.data.users.filter((u) => u.id !== id)
    this.data.apiTokens = this.data.apiTokens.filter((t) => t.userId !== id)
    for (const [token, session] of this.sessions) {
      if (session.userId === id) this.sessions.delete(token)
    }
    await this.persist()
  }

  // ---- sessions ----

  createSession(userId: string, label?: string): Session {
    const session: Session = {
      token: newToken(),
      userId,
      expiresAt: Date.now() + SESSION_TTL_MS,
      label
    }
    this.sessions.set(session.token, session)
    return session
  }

  resolveSession(token: string): User | null {
    const session = this.sessions.get(token)
    if (!session) return null
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token)
      return null
    }
    const user = this.findUser(session.userId)
    return user && !user.disabled ? user : null
  }

  revokeSession(token: string): void {
    this.sessions.delete(token)
  }

  // ---- invites ----

  /**
   * Cuts an invite. Returns the plaintext code once, exactly like an API token:
   * only the hash is kept, so this is the one moment it can be copied.
   */
  async createInvite(
    createdBy: string,
    options: {
      role?: Role
      nodeAccess?: string[]
      canConfigurePersonalNode?: boolean
      note?: string
      uses?: number
      expiresInDays?: number
    } = {}
  ): Promise<{ code: string; record: Invite }> {
    this.assertLoaded()
    const code = newInviteCode()
    const record: Invite = {
      id: newId(),
      codeHash: hashToken(code),
      hint: inviteHint(code),
      role: options.role ?? 'member',
      nodeAccess: options.nodeAccess,
      canConfigurePersonalNode: options.canConfigurePersonalNode,
      note: options.note?.trim() || undefined,
      createdBy,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      remainingUses: Math.max(1, Math.floor(options.uses ?? 1)),
      usedBy: []
    }
    this.data.invites.push(record)
    await this.persist()
    return { code, record }
  }

  listInvites(): Array<Omit<Invite, 'codeHash'>> {
    this.assertLoaded()
    return this.data.invites.map(({ codeHash: _hash, ...rest }) => rest)
  }

  findInvite(code: string): Invite | undefined {
    const hash = hashToken(code.trim())
    return this.data.invites.find((i) => i.codeHash === hash)
  }

  /**
   * What an invite offers, for the public join page.
   *
   * The role only. The note is the admin's own reminder of who a code was cut
   * for — the UI promises "only you see this" — so it must not travel out on an
   * unauthenticated route. Anything unusable describes as nothing at all,
   * rather than explaining which of expired, revoked, or spent it is.
   */
  describeInvite(code: string): { role: Role } | null {
    const invite = this.findInvite(code)
    if (inviteProblem(invite)) return null
    return { role: invite!.role }
  }

  /**
   * Redeems an invite into a real account. The invite's grants are copied onto
   * the new user, and the use is spent in the same write as the account is
   * created so a code cannot be redeemed twice by two racing requests.
   */
  async acceptInvite(code: string, username: string, password: string): Promise<User> {
    this.assertLoaded()
    const invite = this.findInvite(code)
    const problem = inviteProblem(invite)
    if (problem || !invite) throw new Error(problem ?? 'That invite code is not valid')
    if (this.findByUsername(username)) throw new Error('That username is already taken')

    const user: User = {
      id: newId(),
      username,
      passwordHash: hashPassword(password),
      role: invite.role,
      projectGrants: {},
      createdAt: new Date().toISOString(),
      nodeAccess: invite.nodeAccess,
      canConfigurePersonalNode: invite.canConfigurePersonalNode
    }
    invite.remainingUses -= 1
    invite.usedBy.push({ userId: user.id, username: user.username, at: user.createdAt })
    this.data.users.push(user)
    await this.persist()
    return user
  }

  async revokeInvite(id: string): Promise<void> {
    const invite = this.data.invites.find((i) => i.id === id)
    if (!invite) return
    invite.revokedAt = new Date().toISOString()
    await this.persist()
  }

  async deleteInvite(id: string): Promise<void> {
    this.data.invites = this.data.invites.filter((i) => i.id !== id)
    await this.persist()
  }

  // ---- api tokens ----

  /** Returns the plaintext token once; only its hash is retained. */
  async createApiToken(
    userId: string,
    name: string,
    kind: ApiToken['kind'] = 'user',
    nodeId?: string
  ): Promise<{ token: string; record: ApiToken }> {
    const token = newToken()
    const record: ApiToken = {
      id: newId(),
      tokenHash: hashToken(token),
      name,
      userId,
      kind,
      nodeId,
      createdAt: new Date().toISOString()
    }
    this.data.apiTokens.push(record)
    await this.persist()
    return { token, record }
  }

  async resolveApiToken(token: string): Promise<{ user: User; record: ApiToken } | null> {
    const hash = hashToken(token)
    const record = this.data.apiTokens.find((t) => t.tokenHash === hash)
    if (!record) return null
    const user = this.findUser(record.userId)
    if (!user || user.disabled) return null
    record.lastUsedAt = new Date().toISOString()
    return { user, record }
  }

  listApiTokens(userId?: string): Array<Omit<ApiToken, 'tokenHash'>> {
    return this.data.apiTokens
      .filter((t) => !userId || t.userId === userId)
      .map(({ tokenHash: _hash, ...rest }) => rest)
  }

  async revokeApiToken(id: string): Promise<void> {
    this.data.apiTokens = this.data.apiTokens.filter((t) => t.id !== id)
    await this.persist()
  }
}

export const authStore = new AuthStore()
