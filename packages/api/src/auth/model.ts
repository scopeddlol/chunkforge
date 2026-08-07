import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * Roles are ordered by power: a check for `member` is satisfied by `admin`.
 * `owner` is the account created during first-run setup and cannot be removed.
 */
export const ROLES = ['viewer', 'member', 'admin', 'owner'] as const
export type Role = (typeof ROLES)[number]

export function roleAtLeast(role: Role, required: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(required)
}

export interface User {
  id: string
  username: string
  /** scrypt hash, stored as "salt:derivedKey" in hex. */
  passwordHash: string
  role: Role
  /** Per-project overrides; a grant here can raise the user's role for one project. */
  projectGrants: Record<string, Role>
  createdAt: string
  disabled?: boolean
}

export interface Session {
  token: string
  userId: string
  expiresAt: number
  /** Free-text label so a user can tell sessions apart when revoking. */
  label?: string
}

export interface ApiToken {
  id: string
  /** Only the hash is stored; the plaintext is shown once at creation. */
  tokenHash: string
  name: string
  userId: string
  /** Node tokens are scoped to one node and can't call user routes. */
  kind: 'user' | 'node'
  nodeId?: string
  createdAt: string
  lastUsedAt?: string
}

const SCRYPT_KEYLEN = 64

/**
 * scrypt is in Node's standard library, so self-hosters don't need a native
 * build toolchain for a password hash.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(':')
  if (!saltHex || !keyHex) return false
  const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN)
  const expected = Buffer.from(keyHex, 'hex')
  // Length must match before timingSafeEqual, which throws on mismatched sizes.
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Tokens are compared by hash so a leaked store doesn't yield usable tokens. */
export function hashToken(token: string): string {
  return scryptSync(token, 'chunkforge-token', 32).toString('hex')
}

export function newId(): string {
  return randomBytes(8).toString('hex')
}

/** Effective role for a user against a specific project, honouring grants. */
export function effectiveRole(user: User, projectId?: string | null): Role {
  if (!projectId) return user.role
  const granted = user.projectGrants[projectId]
  if (!granted) return user.role
  return ROLES.indexOf(granted) > ROLES.indexOf(user.role) ? granted : user.role
}
