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
import { useSessionStore } from '../../state/sessionStore'

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
  actions: { display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' },
  switcher: { display: 'flex', justifyContent: 'center' },
  footnote: {
    color: tokens.colorNeutralForeground4,
    fontSize: '11px',
    textAlign: 'center',
    maxWidth: '340px',
    lineHeight: '16px'
  }
})

type Mode = 'loading' | 'setup' | 'login' | 'join' | 'ready'

const COPY: Record<Exclude<Mode, 'loading' | 'ready'>, { title: string; blurb: string; submit: string; busy: string }> = {
  setup: {
    title: 'Create your account',
    blurb: 'Create the first owner account for this self-hosted panel.',
    submit: 'Create Owner',
    busy: 'Creating…'
  },
  login: {
    title: 'Welcome back',
    blurb: 'Use your Chunkforge account to access this panel.',
    submit: 'Sign In',
    busy: 'Signing in…'
  },
  join: {
    title: 'Join with an invite',
    blurb: 'Paste the code you were sent, then pick a username and password.',
    submit: 'Join',
    busy: 'Joining…'
  }
}

export function AuthGate({ children }: { children: JSX.Element }): JSX.Element {
  const styles = useStyles()
  const [mode, setMode] = useState<Mode>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [invitedRole, setInvitedRole] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loadSession = useSessionStore((s) => s.refresh)

  async function refresh(): Promise<void> {
    // The session store is the single source for "who am I": loading it here
    // means the app never renders a frame in which the user is signed in but
    // their permissions are still unknown, which is what would briefly show
    // then hide admin-only navigation.
    if (await loadSession()) {
      setMode('ready')
      return
    }
    const status = await api().auth.status()
    setMode(status.needsSetup ? 'setup' : 'login')
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Checks a pasted invite as soon as it looks complete, so someone with a
   * revoked or expired code learns that before they have chosen a password.
   */
  useEffect(() => {
    if (mode !== 'join') return
    const code = inviteCode.trim()
    if (code.length < 8) {
      setInvitedRole(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      api()
        .invites.preview(code)
        .then((preview) => !cancelled && setInvitedRole(preview.role))
        .catch(() => !cancelled && setInvitedRole(null))
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [inviteCode, mode])

  async function submit(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'setup') await api().auth.setup(username, password)
      else if (mode === 'join') await api().invites.accept(inviteCode.trim(), username, password)
      else await api().auth.login(username, password)
      await loadSession()
      setMode('ready')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    username.trim().length > 0 &&
    password.length >= 8 &&
    (mode !== 'join' || inviteCode.trim().length > 0)

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
            <Title2>{COPY[mode].title}</Title2>
            <Text block className={styles.muted}>
              {COPY[mode].blurb}
            </Text>
          </div>

          {message && (
            <MessageBar intent="warning">
              <MessageBarBody>{message}</MessageBarBody>
            </MessageBar>
          )}

          {mode === 'join' && (
            <Field
              label="Invite code"
              validationState={invitedRole ? 'success' : 'none'}
              validationMessage={invitedRole ? `This invite creates a ${invitedRole} account.` : undefined}
            >
              <Input
                value={inviteCode}
                placeholder="cf_…"
                onChange={(_, data) => setInviteCode(data.value)}
              />
            </Field>
          )}

          <Field label="Username">
            <Input value={username} onChange={(_, data) => setUsername(data.value)} />
          </Field>
          <Field
            label="Password"
            hint={mode === 'login' ? undefined : 'At least 8 characters.'}
          >
            <Input
              type="password"
              value={password}
              onChange={(_, data) => setPassword(data.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) void submit()
              }}
            />
          </Field>

          <div className={styles.actions}>
            <Button appearance="primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
              {busy ? COPY[mode].busy : COPY[mode].submit}
            </Button>
          </div>

          {mode !== 'setup' && (
            <div className={styles.switcher}>
              <Button
                appearance="transparent"
                size="small"
                onClick={() => {
                  setMessage(null)
                  setMode(mode === 'join' ? 'login' : 'join')
                }}
              >
                {mode === 'join' ? 'I already have an account' : 'I have an invite code'}
              </Button>
            </div>
          )}
        </Card>
        <Text className={styles.footnote}>
          This account manages your servers. A Chunkforge Portal keeps its own separate operator login.
        </Text>
      </div>
    </div>
  )
}
