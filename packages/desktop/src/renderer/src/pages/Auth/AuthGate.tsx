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
import { BrandLockup } from '../../components/BrandLockup'

const useStyles = makeStyles({
  root: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground2
  },
  // Two soft violet pools behind the card. Cheap to render, and it stops the
  // page reading as a browser default dialog on a flat background.
  glowOne: {
    position: 'absolute',
    top: '-24%',
    left: '50%',
    width: '820px',
    height: '820px',
    transform: 'translateX(-50%)',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.14), transparent 62%)',
    pointerEvents: 'none'
  },
  glowTwo: {
    position: 'absolute',
    bottom: '-34%',
    left: '36%',
    width: '640px',
    height: '640px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(125,79,209,0.11), transparent 62%)',
    pointerEvents: 'none'
  },
  shell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '26px',
    width: '100%',
    maxWidth: '420px'
  },
  card: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    padding: '28px',
    boxShadow: '0 28px 70px -30px rgba(0,0,0,0.7)'
  },
  heading: { display: 'flex', flexDirection: 'column', gap: '4px' },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  footnote: {
    color: tokens.colorNeutralForeground4,
    fontSize: '11px',
    textAlign: 'center',
    maxWidth: '340px',
    lineHeight: '16px'
  }
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
        <span className={styles.glowOne} />
        <span className={styles.glowTwo} />
        <div className={styles.shell}>
          <BrandLockup product="Control Panel" />
          <Spinner label="Loading Chunkforge…" />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <span className={styles.glowOne} />
      <span className={styles.glowTwo} />
      <div className={styles.shell}>
        <BrandLockup product="Control Panel" />
        <Card className={styles.card}>
          <div className={styles.heading}>
            <Title2>{mode === 'setup' ? 'Create your account' : 'Welcome back'}</Title2>
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
            <Button
              appearance="primary"
              disabled={!username.trim() || password.length < 8 || busy}
              onClick={() => void submit()}
            >
              {busy ? (mode === 'setup' ? 'Creating…' : 'Signing in…') : mode === 'setup' ? 'Create Owner' : 'Sign In'}
            </Button>
          </div>
        </Card>
        <Text className={styles.footnote}>
          This account manages your servers. A Chunkforge Portal keeps its own separate operator login.
        </Text>
      </div>
    </div>
  )
}
