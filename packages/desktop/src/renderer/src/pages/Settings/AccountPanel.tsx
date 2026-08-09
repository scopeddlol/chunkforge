import { useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { SignOut20Regular } from '@fluentui/react-icons'
import { api } from '../../api'
import { useSessionStore } from '../../state/sessionStore'

const useStyles = makeStyles({
  identity: { display: 'flex', alignItems: 'center', gap: '10px' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  row: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
  grow: { flexGrow: 1 },
  actions: { display: 'flex', justifyContent: 'flex-start' }
})

/**
 * Your own account: who you are signed in as, your password, and the way out.
 *
 * A panel with more than one account on it needs somewhere to stop being one
 * of them — on a shared browser panel especially, where the session cookie
 * otherwise outlives whoever walked away from the machine.
 */
export function AccountPanel(): JSX.Element {
  const styles = useStyles()
  const user = useSessionStore((s) => s.user)
  const clearSession = useSessionStore((s) => s.clear)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ intent: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function changePassword(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      await api().auth.changePassword(password)
      setPassword('')
      // Changing a password signs every *other* session out, which is a
      // consequence worth stating rather than leaving to be discovered.
      setMessage({ intent: 'success', text: 'Password changed. Your other sessions were signed out.' })
    } catch (err) {
      setMessage({
        intent: 'error',
        text: err instanceof Error ? err.message : 'Could not change your password.'
      })
    } finally {
      setBusy(false)
    }
  }

  async function signOut(): Promise<void> {
    setBusy(true)
    try {
      await api().auth.logout()
    } catch {
      // A failed logout call still means this session should stop being used
      // here; the cookie is cleared server-side or it is not, and either way
      // the gate is what decides what happens next.
    } finally {
      clearSession()
      // Reload rather than re-render: it drops every page's cached state along
      // with the session, so nothing from the last account is left on screen.
      window.location.reload()
    }
  }

  return (
    <>
      <div className={styles.identity}>
        <Text weight="semibold">{user?.username ?? 'Signed in'}</Text>
        {user && (
          <Badge appearance="tint" color={user.role === 'owner' ? 'brand' : 'informative'}>
            {user.role}
          </Badge>
        )}
      </div>

      {message && (
        <MessageBar intent={message.intent === 'success' ? 'success' : 'error'}>
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.row}>
        <Field label="Change your password" className={styles.grow} hint="At least 8 characters.">
          <Input
            type="password"
            value={password}
            onChange={(_, data) => setPassword(data.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && password.length >= 8) void changePassword()
            }}
          />
        </Field>
        <Button disabled={busy || password.length < 8} onClick={() => void changePassword()}>
          Change
        </Button>
      </div>

      <div className={styles.actions}>
        <Button icon={<SignOut20Regular />} disabled={busy} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
      <Text className={styles.muted}>
        A Chunkforge Portal keeps its own separate operator login; signing out here does not touch it.
      </Text>
    </>
  )
}
