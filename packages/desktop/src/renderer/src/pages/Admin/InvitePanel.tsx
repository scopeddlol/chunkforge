import { useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Switch,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { Add20Regular, Copy20Regular, Delete20Regular } from '@fluentui/react-icons'
import type { InviteRecord } from '@chunkforge/api/client'
import type { Node } from '@shared/types'
import { NodeAccessPicker } from './NodeAccessPicker'
import { api } from '../../api'

const useStyles = makeStyles({
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
  code: { fontFamily: tokens.fontFamilyMonospace },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  spent: { opacity: 0.55 },
  dialogBody: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '420px' },
  codeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3
  },
  codeText: { fontFamily: tokens.fontFamilyMonospace, wordBreak: 'break-all', flexGrow: 1 }
})

interface InvitePanelProps {
  invites: InviteRecord[]
  nodes: Node[]
  viewerIsOwner: boolean
  onChanged: () => void
}

export function InvitePanel({ invites, nodes, viewerIsOwner, onChanged }: InvitePanelProps): JSX.Element {
  const styles = useStyles()
  const [creating, setCreating] = useState(false)

  return (
    <>
      <div className={styles.list}>
        {invites.length === 0 && (
          <Text className={styles.muted}>
            No invites yet. An invite lets someone create their own account without you choosing a
            password for them.
          </Text>
        )}
        {invites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} onChanged={onChanged} />
        ))}
      </div>
      <div>
        <Button icon={<Add20Regular />} onClick={() => setCreating(true)}>
          New invite
        </Button>
      </div>
      {creating && (
        <CreateInviteDialog
          nodes={nodes}
          viewerIsOwner={viewerIsOwner}
          onClose={() => setCreating(false)}
          onCreated={onChanged}
        />
      )}
    </>
  )
}

function InviteRow({ invite, onChanged }: { invite: InviteRecord; onChanged: () => void }): JSX.Element {
  const styles = useStyles()
  const expired = Boolean(invite.expiresAt && Date.parse(invite.expiresAt) < Date.now())
  const dead = Boolean(invite.revokedAt) || invite.remainingUses <= 0 || expired

  const state = invite.revokedAt
    ? 'revoked'
    : expired
      ? 'expired'
      : invite.remainingUses <= 0
        ? 'used up'
        : `${invite.remainingUses} use${invite.remainingUses === 1 ? '' : 's'} left`

  return (
    <div className={`${styles.row} ${dead ? styles.spent : ''}`}>
      <Text className={styles.code}>{invite.hint}</Text>
      <Badge appearance="tint" color={dead ? 'informative' : 'brand'}>
        {invite.role}
      </Badge>
      <div className={styles.grow}>
        <Text className={styles.muted}>
          {invite.note ? `${invite.note} — ` : ''}
          {state}
          {invite.usedBy.length > 0 && ` · joined: ${invite.usedBy.map((u) => u.username).join(', ')}`}
        </Text>
      </div>
      {!dead && (
        <Button
          appearance="subtle"
          icon={<Delete20Regular />}
          title="Revoke this invite"
          onClick={() => void api().invites.revoke(invite.id).then(onChanged)}
        />
      )}
    </div>
  )
}

interface CreateInviteDialogProps {
  nodes: Node[]
  viewerIsOwner: boolean
  onClose: () => void
  onCreated: () => void
}

function CreateInviteDialog({ nodes, viewerIsOwner, onClose, onCreated }: CreateInviteDialogProps): JSX.Element {
  const styles = useStyles()
  const [role, setRole] = useState('member')
  const [note, setNote] = useState('')
  const [uses, setUses] = useState('1')
  const [expiresInDays, setExpiresInDays] = useState('7')
  const [nodeAccess, setNodeAccess] = useState<string[] | null>(null)
  const [personalNode, setPersonalNode] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const roleIgnoresNodeLimits = role === 'admin'

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const created = await api().invites.create({
        role,
        note: note.trim() || undefined,
        uses: Number(uses) || 1,
        // Blank or 0 means it never expires, which is a deliberate choice an
        // operator can make for a long-lived team code.
        expiresInDays: Number(expiresInDays) || undefined,
        nodeAccess: roleIgnoresNodeLimits ? undefined : (nodeAccess ?? undefined),
        canConfigurePersonalNode: personalNode
      })
      setCode(created.code)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that invite.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{code ? 'Invite created' : 'New invite'}</DialogTitle>
          <DialogContent className={styles.dialogBody}>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {code ? (
              <>
                <Text>
                  Send this code to whoever is joining. It is shown once — Chunkforge stores only a
                  hash of it, so it cannot be read back later.
                </Text>
                <div className={styles.codeBox}>
                  <Text className={styles.codeText}>{code}</Text>
                  <Button
                    icon={<Copy20Regular />}
                    onClick={() => {
                      void navigator.clipboard.writeText(code)
                      setCopied(true)
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Field label="Role">
                  <Dropdown
                    value={role}
                    selectedOptions={[role]}
                    onOptionSelect={(_, data) => setRole(data.optionValue ?? role)}
                  >
                    <Option value="viewer" text="viewer">
                      viewer
                    </Option>
                    <Option value="member" text="member">
                      member
                    </Option>
                    {viewerIsOwner && (
                      <Option value="admin" text="admin">
                        admin
                      </Option>
                    )}
                  </Dropdown>
                </Field>

                <Field label="Note" hint="Only you see this — it is there so you remember who a code was for.">
                  <Input value={note} placeholder="e.g. Sam" onChange={(_, data) => setNote(data.value)} />
                </Field>

                <Field label="How many people may use it">
                  <Input type="number" min={1} value={uses} onChange={(_, data) => setUses(data.value)} />
                </Field>

                <Field label="Expires after (days)" hint="0 for a code that never expires.">
                  <Input
                    type="number"
                    min={0}
                    value={expiresInDays}
                    onChange={(_, data) => setExpiresInDays(data.value)}
                  />
                </Field>

                <Field
                  label="Nodes the new account may use"
                  hint={roleIgnoresNodeLimits ? 'Admins are never limited to particular nodes.' : undefined}
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
                  label="May offer their own machine as a node"
                  onChange={(_, data) => setPersonalNode(Boolean(data.checked))}
                />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance={code ? 'primary' : 'secondary'} onClick={onClose}>
              {code ? 'Done' : 'Cancel'}
            </Button>
            {!code && (
              <Button appearance="primary" disabled={busy} onClick={() => void create()}>
                {busy ? 'Creating…' : 'Create invite'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
