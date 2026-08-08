import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  Card,
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
import { api } from '../../api'

const useStyles = makeStyles({
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    backgroundColor: tokens.colorNeutralBackground2
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    padding: '28px'
  },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' }
})

type Mode = 'loading' | 'setup' | 'login' | 'ready'

export function AuthGate({ children }: { children: JSX.Element }): JSX.Element {
  const styles = useStyles()
  const [mode, setMode] = useState<Mode>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh(): Promise<void> {
    try {
      await api().auth.me()
      setMode('ready')
      return
    } catch {
      // Fall through to status check.
    }
    const status = await api().auth.status()
    setMode(status.needsSetup ? 'setup' : 'login')
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function submit(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'setup') await api().auth.setup(username, password)
      else await api().auth.login(username, password)
      setMode('ready')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'ready') return children

  if (mode === 'loading') {
    return (
      <div className={styles.root}>
        <Spinner label="Loading Chunkforge…" />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <Card className={styles.card}>
        <div>
          <Title2>{mode === 'setup' ? 'Set up Chunkforge' : 'Sign in to Chunkforge'}</Title2>
          <Text block className={styles.muted}>
            {mode === 'setup'
              ? 'Create the first owner account for this self-hosted panel.'
              : 'Use your Chunkforge account to access this panel.'}
          </Text>
        </div>

        {message && (
          <MessageBar intent="warning">
            <MessageBarBody>{message}</MessageBarBody>
          </MessageBar>
        )}

        <Field label="Username">
          <Input value={username} onChange={(_, data) => setUsername(data.value)} />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(_, data) => setPassword(data.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && username.trim() && password) void submit()
            }}
          />
        </Field>

        <div className={styles.actions}>
          <Button appearance="primary" disabled={!username.trim() || password.length < 8 || busy} onClick={() => void submit()}>
            {busy ? (mode === 'setup' ? 'Creating…' : 'Signing in…') : mode === 'setup' ? 'Create Owner' : 'Sign In'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
