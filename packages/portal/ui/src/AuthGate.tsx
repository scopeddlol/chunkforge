import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { Button, Field, Input, Spinner, Text, Title2, makeStyles, tokens } from '@fluentui/react-components'
import { portalApi } from './api'

const useStyles = makeStyles({
  root: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  },
  card: {
    width: '380px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '28px',
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  muted: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground2 }
})

interface AuthGateProps {
  children: ReactNode
}

/**
 * Portal has its own operator account, unrelated to any Chunkforge account.
 * A Portal is shared infrastructure: the person who runs the VPS is not
 * necessarily anyone who has a Chunkforge login.
 */
export function AuthGate({ children }: AuthGateProps): JSX.Element {
  const styles = useStyles()
  const [state, setState] = useState<'loading' | 'setup' | 'login' | 'ready'>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        await portalApi.auth.me()
        setState('ready')
        return
      } catch {
        // Not signed in — fall through and find out whether this is first run.
      }
      try {
        const status = await portalApi.auth.status()
        setState(status.needsSetup ? 'setup' : 'login')
      } catch {
        setState('login')
      }
    })()
  }, [])

  async function submit(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      if (state === 'setup') await portalApi.auth.setup(username, password)
      else await portalApi.auth.login(username, password)
      setState('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') {
    return (
      <div className={styles.root}>
        <Spinner label="Contacting Portal…" />
      </div>
    )
  }

  if (state === 'ready') return <>{children}</>

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div>
          <Title2>Chunkforge Portal</Title2>
          <Text block className={styles.muted}>
            {state === 'setup'
              ? 'Create the operator account for this Portal.'
              : 'Sign in to manage subdomains, nodes, and routes.'}
          </Text>
        </div>

        <Field label="Username">
          <Input value={username} onChange={(_, data) => setUsername(data.value)} />
        </Field>
        <Field
          label="Password"
          hint={state === 'setup' ? 'At least 8 characters.' : undefined}
        >
          <Input
            type="password"
            value={password}
            onChange={(_, data) => setPassword(data.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && username && password) void submit()
            }}
          />
        </Field>

        {error && <Text className={styles.error}>{error}</Text>}

        <Button appearance="primary" disabled={busy || !username || !password} onClick={() => void submit()}>
          {busy ? 'Working…' : state === 'setup' ? 'Create Account' : 'Sign In'}
        </Button>
      </div>
    </div>
  )
}
