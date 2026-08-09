import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Dropdown,
  Switch,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { ManagedUser } from '@chunkforge/api/client'
import type { Node } from '@shared/types'
import { NodeAccessPicker } from './NodeAccessPicker'
import { api } from '../../api'

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '420px' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  inline: { display: 'flex', gap: '8px', alignItems: 'flex-end' }
})

const ASSIGNABLE_ROLES = ['viewer', 'member', 'admin'] as const

const ROLE_BLURB: Record<string, string> = {
  viewer: 'Can look at servers and consoles, and change nothing.',
  member: 'Can create, start, stop and configure servers.',
  admin: 'Everything, including these settings and other accounts.',
  owner: 'The first account. Cannot be demoted or removed.'
}

interface UserEditorProps {
  /** The account being edited, or null when the dialog is closed. */
  user: ManagedUser | null
  nodes: Node[]
  /** Only an owner may hand out admin, so the button is hidden otherwise. */
  viewerIsOwner: boolean
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Stays mounted and is driven by `user` being non-null, rather than being
 * mounted only while open.
 *
 * Fluent's Dialog marks the rest of the app `aria-hidden` while it is up and
 * clears that on close. Unmounting an open Dialog skips the close entirely, so
 * the flag is never cleared and every control behind it stays hidden from
 * assistive tech — visible on screen, invisible to a screen reader.
 */
export function UserEditor({
  user,
  nodes,
  viewerIsOwner,
  isSelf,
  onClose,
  onSaved
}: UserEditorProps): JSX.Element {
  const styles = useStyles()
  const [role, setRole] = useState('member')
  const [disabled, setDisabled] = useState(false)
  const [nodeAccess, setNodeAccess] = useState<string[] | null>(null)
  const [personalNode, setPersonalNode] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Seeded per account, since the dialog outlives any one of them now.
  useEffect(() => {
    if (!user) return
    setRole(user.role)
    setDisabled(user.disabled)
    setNodeAccess(user.nodeAccess)
    setPersonalNode(user.canConfigurePersonalNode)
    setNewPassword('')
    setError(null)
  }, [user])

  const isOwnerRow = user?.role === 'owner'
  // An admin already ignores node restrictions on the server, so offering the
  // picker for one would be a control that silently does nothing.
  const roleIgnoresNodeLimits = role === 'admin' || role === 'owner'

  async function save(): Promise<void> {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await api().users.update(user.id, {
        role: isOwnerRow || isSelf ? undefined : role,
        disabled: isOwnerRow || isSelf ? undefined : disabled,
        // Promoting someone to admin clears any node restriction rather than
        // leaving it on the record. An admin ignores it either way, so keeping
        // it would be invisible — right up until they were demoted and a
        // restriction nobody set today silently came back.
        nodeAccess: roleIgnoresNodeLimits ? null : nodeAccess,
        canConfigurePersonalNode: roleIgnoresNodeLimits ? true : personalNode
      })
      if (newPassword) await api().users.resetPassword(user.id, newPassword)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save those changes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{user?.username ?? ''}</DialogTitle>
          <DialogContent className={styles.body}>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {isSelf && (
              <MessageBar intent="info">
                <MessageBarBody>
                  This is your own account, so its role and sign-in state are locked here.
                </MessageBarBody>
              </MessageBar>
            )}

            <Field label="Role" hint={ROLE_BLURB[role]}>
              <Dropdown
                value={role}
                selectedOptions={[role]}
                disabled={isOwnerRow || isSelf}
                onOptionSelect={(_, data) => setRole(data.optionValue ?? role)}
              >
                {ASSIGNABLE_ROLES.filter((r) => r !== 'admin' || viewerIsOwner).map((r) => (
                  <Option key={r} value={r} text={r}>
                    {r}
                  </Option>
                ))}
                {isOwnerRow && (
                  <Option value="owner" text="owner">
                    owner
                  </Option>
                )}
              </Dropdown>
            </Field>

            <Divider />

            <Field
              label="Nodes this account may use"
              hint={
                roleIgnoresNodeLimits
                  ? 'Admins are never limited to particular nodes.'
                  : 'Servers on nodes outside this list are hidden entirely.'
              }
            >
              <NodeAccessPicker
                nodes={nodes}
                value={roleIgnoresNodeLimits ? null : nodeAccess}
                onChange={setNodeAccess}
                disabled={roleIgnoresNodeLimits}
              />
            </Field>

            <Switch
              checked={roleIgnoresNodeLimits || personalNode}
              disabled={roleIgnoresNodeLimits}
              label="May offer their own machine to Portal as a node"
              onChange={(_, data) => setPersonalNode(Boolean(data.checked))}
            />
            <Text className={styles.muted}>
              This lets them attach hardware you did not provision, and publish routes into it.
            </Text>

            <Divider />

            <Field
              label="Set a new password"
              hint="Leave blank to keep the current one. Changing it signs their other sessions out."
            >
              <Input
                type="password"
                value={newPassword}
                placeholder="At least 8 characters"
                onChange={(_, data) => setNewPassword(data.value)}
              />
            </Field>

            {!isOwnerRow && !isSelf && (
              <Switch
                checked={disabled}
                label="Sign-in disabled"
                onChange={(_, data) => setDisabled(Boolean(data.checked))}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              disabled={busy || (newPassword.length > 0 && newPassword.length < 8)}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
