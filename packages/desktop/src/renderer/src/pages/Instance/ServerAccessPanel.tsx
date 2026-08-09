import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Dropdown,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { PersonAdd20Regular } from '@fluentui/react-icons'
import type { ManagedUser, ServerAccessEntry } from '@chunkforge/api/client'
import { api } from '../../api'
import { useSessionStore } from '../../state/sessionStore'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2
  },
  grow: { flexGrow: 1, minWidth: 0 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  addRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  narrow: { minWidth: '160px' }
})

/** Roles that make sense to hand out for a single server. */
const GRANTABLE = ['viewer', 'member'] as const

interface ServerAccessPanelProps {
  instanceId: string
}

/**
 * Who can use this server, beyond the people who already could.
 *
 * A grant only ever raises: someone who is a viewer everywhere can be made a
 * member *here* without gaining anything anywhere else. Admins are listed but
 * not editable, because they reach every server regardless and showing a
 * removable-looking control that does nothing would be a lie.
 */
export function ServerAccessPanel({ instanceId }: ServerAccessPanelProps): JSX.Element | null {
  const styles = useStyles()
  const isAdmin = useSessionStore((s) => s.user?.isAdmin ?? false)
  const [entries, setEntries] = useState<ServerAccessEntry[]>([])
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [access, all] = await Promise.all([api().serverAccess.list(instanceId), api().users.list()])
      setEntries(access)
      setUsers(all)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load who has access.')
    } finally {
      setLoading(false)
    }
  }, [instanceId])

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    void refresh()
  }, [isAdmin, refresh])

  // Managing access is an admin job; for everyone else the panel is absent
  // rather than present and refusing.
  if (!isAdmin) return null

  async function setRole(userId: string, role: string | null): Promise<void> {
    setError(null)
    try {
      await api().serverAccess.set(instanceId, userId, role)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change that.')
    }
  }

  const granted = new Set(entries.map((e) => e.userId))
  // Admins already reach every server, so offering to "add" one is noise.
  const addable = users.filter(
    (user) => !granted.has(user.id) && user.role !== 'admin' && user.role !== 'owner' && !user.disabled
  )

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {loading && <Spinner size="tiny" label="Loading access…" />}

      {!loading && entries.length === 0 && (
        <Text className={styles.muted}>
          Only admins can reach this server. Add someone below to give them access without changing
          what they can do anywhere else.
        </Text>
      )}

      {entries.map((entry) => (
        <div key={entry.userId} className={styles.row}>
          <div className={styles.grow}>
            <Text weight="semibold">{entry.username}</Text>
            {entry.implicit && <Text className={styles.muted}> — admin, reaches every server</Text>}
          </div>
          <Dropdown
            className={styles.narrow}
            value={entry.role}
            selectedOptions={[entry.role]}
            disabled={entry.implicit}
            onOptionSelect={(_, data) => void setRole(entry.userId, data.optionValue ?? entry.role)}
          >
            {GRANTABLE.map((role) => (
              <Option key={role} value={role} text={role}>
                {role}
              </Option>
            ))}
          </Dropdown>
          {!entry.implicit && (
            <Button size="small" onClick={() => void setRole(entry.userId, null)}>
              Remove
            </Button>
          )}
        </div>
      ))}

      {addable.length > 0 && (
        <div className={styles.addRow}>
          <Dropdown
            className={styles.narrow}
            placeholder="Choose an account…"
            value={users.find((u) => u.id === adding)?.username ?? ''}
            selectedOptions={adding ? [adding] : []}
            onOptionSelect={(_, data) => setAdding(data.optionValue ?? null)}
          >
            {addable.map((user) => (
              <Option key={user.id} value={user.id} text={user.username}>
                {user.username}
              </Option>
            ))}
          </Dropdown>
          <Button
            icon={<PersonAdd20Regular />}
            disabled={!adding}
            onClick={() => {
              if (!adding) return
              void setRole(adding, 'member').then(() => setAdding(null))
            }}
          >
            Add to this server
          </Button>
        </div>
      )}

      {!loading && (
        <Text className={styles.muted}>
          Added accounts get <b>member</b> on this server — enough to start, stop and configure it —
          whatever their role is elsewhere. Change it to <b>viewer</b> for look-but-don&apos;t-touch.
        </Text>
      )}

      <Badge appearance="tint" color="informative">
        {entries.filter((e) => !e.implicit).length} with explicit access
      </Badge>
    </div>
  )
}
