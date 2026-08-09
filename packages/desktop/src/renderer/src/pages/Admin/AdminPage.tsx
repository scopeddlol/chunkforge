import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { Delete20Regular, Edit20Regular, PersonAdd20Regular } from '@fluentui/react-icons'
import type { InviteRecord, ManagedUser } from '@chunkforge/api/client'
import type { Node } from '@shared/types'
import { UserEditor } from './UserEditor'
import { InvitePanel } from './InvitePanel'
import { NodeAccessPicker } from './NodeAccessPicker'
import { useSessionStore } from '../../state/sessionStore'
import { api } from '../../api'

const useStyles = makeStyles({
  root: { flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  scroll: { flexGrow: 1, overflowY: 'auto', padding: '28px 36px 32px' },
  header: { marginBottom: '22px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  panels: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  panelTitle: { color: tokens.colorNeutralForeground2 },
  list: { display: 'flex', flexDirection: 'column', gap: '6px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2
  },
  grow: { flexGrow: 1, minWidth: 0 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  disabled: { opacity: 0.55 },
  dialogBody: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '420px' }
})

/**
 * The admin panel: who can sign in, what they may reach, and how new people
 * get here.
 *
 * Reachable only by admins, but that is enforced at the API — this page being
 * hidden from the nav is a convenience, not the control.
 */
export function AdminPage(): JSX.Element {
  const styles = useStyles()
  const me = useSessionStore((s) => s.user)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [invites, setInvites] = useState<InviteRecord[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [nextUsers, nextInvites, nextNodes] = await Promise.all([
        api().users.list(),
        api().invites.list(),
        api().nodes.list()
      ])
      setUsers(nextUsers)
      setInvites(nextInvites)
      setNodes(nextNodes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.scroll}>
          <Spinner label="Loading accounts…" />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <div className={styles.header}>
          <Title2>Admin</Title2>
          <Text block className={styles.subtitle}>
            Accounts on this control plane, what they can reach, and how new people join.
          </Text>
        </div>

        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.panels}>
          <section className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              People
            </Text>
            <div className={styles.list}>
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`${styles.row} ${user.disabled ? styles.disabled : ''}`}
                >
                  <div className={styles.grow}>
                    <Text weight="semibold">{user.username}</Text>
                    {user.id === me?.id && <Text className={styles.muted}> — you</Text>}
                    <Text block className={styles.muted}>
                      {describeAccess(user, nodes)}
                    </Text>
                  </div>
                  <Badge appearance="tint" color={user.role === 'owner' ? 'brand' : 'informative'}>
                    {user.role}
                  </Badge>
                  {user.disabled && (
                    <Badge appearance="tint" color="danger">
                      disabled
                    </Badge>
                  )}
                  <Button
                    appearance="subtle"
                    icon={<Edit20Regular />}
                    title="Edit this account"
                    onClick={() => setEditing(user)}
                  />
                  {user.role !== 'owner' && user.id !== me?.id && (
                    <Button
                      appearance="subtle"
                      icon={<Delete20Regular />}
                      title="Delete this account"
                      onClick={() => void api().users.remove(user.id).then(refresh)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div>
              <Button icon={<PersonAdd20Regular />} onClick={() => setAdding(true)}>
                Add account
              </Button>
            </div>
          </section>

          <section className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              Invites
            </Text>
            <InvitePanel
              invites={invites}
              nodes={nodes}
              viewerIsOwner={me?.role === 'owner'}
              onChanged={() => void refresh()}
            />
          </section>
        </div>
      </div>

      {editing && (
        <UserEditor
          user={editing}
          nodes={nodes}
          viewerIsOwner={me?.role === 'owner'}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      )}
      {adding && (
        <AddUserDialog
          nodes={nodes}
          viewerIsOwner={me?.role === 'owner'}
          onClose={() => setAdding(false)}
          onCreated={() => void refresh()}
        />
      )}
    </div>
  )
}

/** One line summarising what an account can reach, in the operator's terms. */
function describeAccess(user: ManagedUser, nodes: Node[]): string {
  if (user.role === 'admin' || user.role === 'owner') return 'Every node · may add their own'
  const scope =
    user.nodeAccess === null
      ? 'Every node'
      : user.nodeAccess.length === 0
        ? 'No nodes'
        : user.nodeAccess
            .map((id) => nodes.find((node) => node.id === id)?.name ?? id)
            .join(', ')
  return `${scope}${user.canConfigurePersonalNode ? ' · may add their own' : ''}`
}

interface AddUserDialogProps {
  nodes: Node[]
  viewerIsOwner: boolean
  onClose: () => void
  onCreated: () => void
}

function AddUserDialog({ nodes, viewerIsOwner, onClose, onCreated }: AddUserDialogProps): JSX.Element {
  const styles = useStyles()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nodeAccess, setNodeAccess] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await api().users.create({
        username: username.trim(),
        password,
        role: 'member',
        nodeAccess: nodeAccess ?? undefined
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Add an account</DialogTitle>
          <DialogContent className={styles.dialogBody}>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            <MessageBar intent="info">
              <MessageBarBody>
                An invite is usually kinder: the person picks their own password instead of you
                choosing one and sending it to them.
              </MessageBarBody>
            </MessageBar>
            <Field label="Username">
              <Input value={username} onChange={(_, data) => setUsername(data.value)} />
            </Field>
            <Field label="Password" hint="At least 8 characters. They can change it once signed in.">
              <Input
                type="password"
                value={password}
                onChange={(_, data) => setPassword(data.value)}
              />
            </Field>
            <Field label="Nodes this account may use">
              <NodeAccessPicker nodes={nodes} value={nodeAccess} onChange={setNodeAccess} />
            </Field>
            <Text className={styles.muted}>
              New accounts are members. Change the role after creating them
              {viewerIsOwner ? '.' : ' — only the owner can grant admin.'}
            </Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              disabled={busy || !username.trim() || password.length < 8}
              onClick={() => void create()}
            >
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
