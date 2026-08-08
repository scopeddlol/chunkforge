import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { Button, Field, Input, Spinner, Text, Title2, makeStyles, tokens } from '@fluentui/react-components'
import { portalApi } from './api'
import { BrandLockup } from './BrandLockup'

const useStyles = makeStyles({
  root: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground4
  },
  // Two soft violet pools behind the card. Cheap to render, and it stops the
  // page reading as a browser default dialog on a flat background.
  glowOne: {
    position: 'absolute',
    top: '-22%',
    left: '50%',
    width: '780px',
    height: '780px',
    transform: 'translateX(-50%)',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.16), transparent 62%)',
    pointerEvents: 'none'
  },
  glowTwo: {
    position: 'absolute',
    bottom: '-32%',
    left: '38%',
    width: '620px',
    height: '620px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(125,79,209,0.13), transparent 62%)',
    pointerEvents: 'none'
  },
  shell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '26px',
    width: '100%',
    maxWidth: '400px'
  },
  card: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '28px',
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: '0 28px 70px -30px rgba(0,0,0,0.85)'
  },
  heading: { display: 'flex', flexDirection: 'column', gap: '4px' },
  muted: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground2 },
  footnote: {
    color: tokens.colorNeutralForeground4,
    fontSize: '11px',
    textAlign: 'center',
    maxWidth: '330px',
    lineHeight: '16px'
  }
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
        <span className={styles.glowOne} />
        <span className={styles.glowTwo} />
        <div className={styles.shell}>
          <BrandLockup product="Portal" />
          <Spinner label="Contacting Portal…" />
        </div>
      </div>
    )
  }

  if (state === 'ready') return <>{children}</>

  return (
    <div className={styles.root}>
      <span className={styles.glowOne} />
      <span className={styles.glowTwo} />
      <div className={styles.shell}>
        <BrandLockup product="Portal" />
        <div className={styles.card}>
          <div className={styles.heading}>
            <Title2>{state === 'setup' ? 'Set up this Portal' : 'Welcome back'}</Title2>
            <Text block className={styles.muted}>
              {state === 'setup'
                ? 'Create the operator account for this Portal.'
                : 'Sign in to manage subdomains, nodes, and routes.'}
            </Text>
          </div>

          <Field label="Username">
            <Input value={username} onChange={(_, data) => setUsername(data.value)} />
          </Field>
          <Field label="Password" hint={state === 'setup' ? 'At least 8 characters.' : undefined}>
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

          <Button
            appearance="primary"
            disabled={busy || !username || !password}
            onClick={() => void submit()}
          >
            {busy ? 'Working…' : state === 'setup' ? 'Create Account' : 'Sign In'}
          </Button>
        </div>
        <Text className={styles.footnote}>
          This account belongs to the Portal itself, not to any Chunkforge control plane.
        </Text>
      </div>
    </div>
  )
}
