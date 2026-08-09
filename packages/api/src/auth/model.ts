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
  /**
   * Per-server overrides, keyed by instance id.
   *
   * This is how someone is put on one server without being given the run of
   * the panel: a viewer with a `member` grant here can start, stop and
   * configure that server and nothing else.
   */
  serverGrants?: Record<string, Role>
  createdAt: string
  disabled?: boolean
  /**
   * Nodes this user may deploy to and manage servers on.
   *
   * Undefined means every node, which is what an existing install and every
   * admin gets — restricting access is something an operator opts into per
   * user, not a default that silently locks people out on upgrade. An empty
   * array is a real answer meaning "no nodes", and is deliberately different
   * from undefined.
   */
  nodeAccess?: string[]
  /**
   * Whether this user may offer their own machine to Portal as a node.
   *
   * Separate from role because it is a different kind of question: it is not
   * about how much of the panel someone can drive, it is about whether they
   * can attach hardware the operator did not provision. A trusted member on a
   * shared Portal may still be someone you would rather not have publishing
   * routes into their laptop.
   */
  canConfigurePersonalNode?: boolean
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

/**
 * A single-use (or limited-use) code that lets someone create their own
 * account without an admin choosing a password on their behalf.
 *
 * The code's *hash* is what is stored, for the same reason API tokens store a
 * hash: a leaked auth.json should not hand out working credentials. The role
 * and node grants are baked in at creation, so the invite is the whole
 * decision — accepting one never lets the new account pick its own power.
 */
export interface Invite {
  id: string
  /** Hash of the invite code; the plaintext is shown once at creation. */
  codeHash: string
  /** Enough of the code to recognise it in a list, e.g. "cf_a1b2…". */
  hint: string
  role: Role
  nodeAccess?: string[]
  canConfigurePersonalNode?: boolean
  /** Optional note so an admin remembers who a code was cut for. */
  note?: string
  createdBy: string
  createdAt: string
  /** ISO date after which the code stops working. Absent means it never expires. */
  expiresAt?: string
  /** How many accounts this code may still create. */
  remainingUses: number
  usedBy: Array<{ userId: string; username: string; at: string }>
  revokedAt?: string
}

/** Why an invite cannot be accepted, or null when it can. */
export function inviteProblem(invite: Invite | undefined, now = Date.now()): string | null {
  if (!invite) return 'That invite code is not valid'
  if (invite.revokedAt) return 'That invite has been revoked'
  if (invite.remainingUses <= 0) return 'That invite has already been used'
  if (invite.expiresAt && Date.parse(invite.expiresAt) < now) return 'That invite has expired'
  return null
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

/**
 * Invite codes are meant to be pasted into a chat message, so they are shorter
 * than a bearer token and prefixed to be recognisable. 16 random bytes is still
 * far past guessable, and the hash comparison means a wrong guess leaks nothing.
 */
export function newInviteCode(): string {
  return `cf_${randomBytes(16).toString('base64url')}`
}

export function inviteHint(code: string): string {
  return `${code.slice(0, 8)}…`
}

/**
 * Whether a user may use a given node.
 *
 * Admins are never restricted: the people who hand out node access should not
 * be able to lock themselves out of the machines they administer, and an
 * admin who wants less access can simply not use it.
 */
export function canUseNode(user: User, nodeId: string): boolean {
  if (roleAtLeast(user.role, 'admin')) return true
  if (!user.nodeAccess) return true
  return user.nodeAccess.includes(nodeId)
}

/**
 * Whether a user may register their own machine as a node. Admins always may;
 * everyone else needs it granted, because the default should not be that any
 * account can attach hardware to a shared Portal.
 */
export function canConfigurePersonalNode(user: User): boolean {
  if (roleAtLeast(user.role, 'admin')) return true
  return user.canConfigurePersonalNode === true
}

/** Effective role for a user against a specific project, honouring grants. */
export function effectiveRole(user: User, projectId?: string | null): Role {
  if (!projectId) return user.role
  const granted = user.projectGrants[projectId]
  if (!granted) return user.role
  return ROLES.indexOf(granted) > ROLES.indexOf(user.role) ? granted : user.role
}

/** Which server a permission question is about, and where it sits. */
export interface ServerRef {
  id: string
  projectId?: string | null
  nodeId?: string | null
}

/**
 * The role a user actually holds over one server.
 *
 * Grants only ever *raise* — the answer is the highest of the base role, any
 * project grant, and any server grant. Lowering is deliberately not expressible
 * here: `nodeAccess` already restricts, and a mechanism that could push in both
 * directions produces combinations nobody can predict from looking at an
 * account.
 */
export function effectiveServerRole(user: User, server: ServerRef): Role {
  let best = user.role
  const raise = (candidate: Role | undefined): void => {
    if (candidate && ROLES.indexOf(candidate) > ROLES.indexOf(best)) best = candidate
  }
  if (server.projectId) raise(user.projectGrants?.[server.projectId])
  raise(user.serverGrants?.[server.id])
  return best
}

/** Whether a user holds at least `required` over one server. */
export function serverRoleAtLeast(user: User, server: ServerRef, required: Role): boolean {
  return roleAtLeast(effectiveServerRole(user, server), required)
}

/**
 * Whether a server should appear for this user at all.
 *
 * An explicit grant wins over a node restriction. Restricting someone to two
 * nodes says where they work; putting them on one particular server elsewhere
 * is a more specific instruction than that, and reading it the other way would
 * make "add this person to this server" silently do nothing for exactly the
 * locked-down accounts it exists for.
 */
export function canSeeServer(user: User, server: ServerRef): boolean {
  if (roleAtLeast(user.role, 'admin')) return true
  if (user.serverGrants?.[server.id]) return true
  if (server.projectId && user.projectGrants?.[server.projectId]) return true
  return canUseNode(user, server.nodeId || 'local')
}
