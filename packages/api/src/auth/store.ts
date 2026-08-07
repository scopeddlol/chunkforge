import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { chunkforgeRoot } from '@chunkforge/core'
import {
  hashPassword,
  hashToken,
  newId,
  newToken,
  type ApiToken,
  type Role,
  type Session,
  type User
} from './model'

interface AuthFile {
  users: User[]
  apiTokens: ApiToken[]
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Auth state lives in a JSON file beside the rest of Chunkforge's data.
 * Sessions are deliberately in-memory only: a panel restart signing everyone
 * out is acceptable, and it avoids persisting bearer material.
 */
class AuthStore {
  private data: AuthFile = { users: [], apiTokens: [] }
  private sessions = new Map<string, Session>()
  private loaded = false

  private file(): string {
    return join(chunkforgeRoot(), 'auth.json')
  }

  async load(): Promise<void> {
    const path = this.file()
    if (!existsSync(path)) {
      this.data = { users: [], apiTokens: [] }
      this.loaded = true
      return
    }
    try {
      this.data = JSON.parse(await readFile(path, 'utf-8')) as AuthFile
      this.data.users ??= []
      this.data.apiTokens ??= []
    } catch {
      this.data = { users: [], apiTokens: [] }
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

  async createUser(username: string, password: string, role: Role): Promise<User> {
    this.assertLoaded()
    if (this.findByUsername(username)) throw new Error('That username is already taken')
    const user: User = {
      id: newId(),
      username,
      passwordHash: hashPassword(password),
      role,
      projectGrants: {},
      createdAt: new Date().toISOString()
    }
    this.data.users.push(user)
    await this.persist()
    return user
  }

  async updateUser(id: string, patch: Partial<Pick<User, 'role' | 'disabled' | 'projectGrants'>>): Promise<User> {
    const user = this.findUser(id)
    if (!user) throw new Error('No such user')
    // The owner must always remain able to administer the panel.
    if (user.role === 'owner' && patch.role && patch.role !== 'owner') {
      throw new Error("The owner's role cannot be changed")
    }
    Object.assign(user, patch)
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
