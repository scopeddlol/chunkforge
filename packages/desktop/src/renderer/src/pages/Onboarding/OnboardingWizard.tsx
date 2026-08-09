import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  Switch,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  Checkmark20Filled,
  Copy20Regular,
  Globe24Regular,
  PersonAdd24Regular,
  Server24Regular,
  Sparkle24Regular
} from '@fluentui/react-icons'
import { BrandLockup } from '../../components/BrandLockup'
import { useSessionStore } from '../../state/sessionStore'
import { api } from '../../api'
import { isDesktopHost } from '../../native'

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    overflowY: 'auto',
    backgroundColor: tokens.colorNeutralBackground2
  },
  glow: {
    position: 'absolute',
    top: '-26%',
    left: '50%',
    width: '900px',
    height: '900px',
    transform: 'translateX(-50%)',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.13), transparent 62%)',
    pointerEvents: 'none'
  },
  shell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '22px',
    width: '100%',
    maxWidth: '520px'
  },
  card: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    padding: '28px',
    boxShadow: '0 28px 70px -30px rgba(0,0,0,0.7)'
  },
  heading: { display: 'flex', gap: '14px', alignItems: 'flex-start' },
  headingText: { display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1 },
  icon: { color: tokens.colorBrandForeground1, marginTop: '2px' },
  muted: { color: tokens.colorNeutralForeground3 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  rightActions: { display: 'flex', gap: '8px' },
  dots: { display: 'flex', gap: '6px', alignItems: 'center' },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: tokens.colorNeutralStroke2
  },
  dotActive: { backgroundColor: tokens.colorBrandBackground },
  dotDone: { backgroundColor: tokens.colorBrandBackground2Hover },
  codeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3
  },
  codeText: { fontFamily: tokens.fontFamilyMonospace, wordBreak: 'break-all', flexGrow: 1 },
  ok: { display: 'flex', alignItems: 'center', gap: '6px', color: tokens.colorPaletteGreenForeground1 }
})

type StepKey = 'welcome' | 'portal' | 'hosting' | 'defaults' | 'invite' | 'done'

interface OnboardingWizardProps {
  onFinished: () => void
}

/**
 * The first-run wizard, for Chunkforge Desktop and Chunkforge Web alike.
 *
 * They share one renderer, so they share one wizard — but not one script: a
 * browser panel in Docker cannot pick a folder and its "this machine" is a
 * container, while the desktop app is the machine. The steps below adapt
 * rather than fork, because two wizards would drift.
 *
 * Every step past the welcome is skippable. Someone who just wants to make a
 * server should be able to get to one, and everything here is reachable later
 * from Settings and Admin.
 */
export function OnboardingWizard({ onFinished }: OnboardingWizardProps): JSX.Element {
  const styles = useStyles()
  const desktop = isDesktopHost()
  const me = useSessionStore((s) => s.user)

  const [step, setStep] = useState<StepKey>('welcome')
  const [portalUrl, setPortalUrl] = useState('')
  const [pin, setPin] = useState('')
  const [planeName, setPlaneName] = useState(desktop ? 'Chunkforge Desktop' : 'Chunkforge Web')
  const [portalLinked, setPortalLinked] = useState(false)
  const [hostLocally, setHostLocally] = useState(true)
  const [installLocation, setInstallLocation] = useState('')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Someone may have linked a Portal before ever opening this wizard — on an
  // upgrade, that is the normal case — so the Portal step reflects reality
  // instead of asking again for something already done.
  useEffect(() => {
    void api()
      .portal.status()
      .then((status) => setPortalLinked(status.connectionStatus === 'connected'))
      .catch(() => undefined)
    void api()
      .settings.get()
      .then((settings) => setInstallLocation(settings.defaultInstallLocation ?? ''))
      .catch(() => undefined)
  }, [])

  const ALL_STEPS: StepKey[] = ['welcome', 'portal', 'hosting', 'defaults', 'invite', 'done']

  /**
   * Which steps this run actually has.
   *
   * Takes `linked` rather than reading state so the Portal step can ask what
   * comes next *given the link it just made*. Reading the state variable there
   * would see the value from before the connect, and skip the very step the
   * connect unlocked.
   */
  function stepsWhen(linked: boolean): StepKey[] {
    return ALL_STEPS.filter((key) => {
      // Only an admin can cut invites, so a non-admin never sees that step.
      if (key === 'invite') return Boolean(me?.isAdmin)
      // Offering this machine is a thing you do *to a Portal*. With none linked
      // there is nobody to offer it to, and asking anyway would present a
      // switch whose only possible outcome is an error.
      if (key === 'hosting') return linked
      return true
    })
  }

  const visible = stepsWhen(portalLinked)
  const index = visible.indexOf(step)

  function goNext(from: StepKey = step, linked = portalLinked): void {
    setError(null)
    const list = stepsWhen(linked)
    const at = list.indexOf(from)
    setStep(list[Math.min(at + 1, list.length - 1)])
  }

  function goBack(): void {
    setError(null)
    setStep(visible[Math.max(index - 1, 0)])
  }

  async function connectPortal(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await api().portal.connect(portalUrl.trim(), pin.trim(), planeName.trim(), desktop ? 'desktop' : 'web')
      setPortalLinked(true)
      goNext('portal', true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach that Portal.')
    } finally {
      setBusy(false)
    }
  }

  async function applyHosting(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await api().portal.hostLocally(hostLocally)
      goNext()
    } catch (err) {
      // Surfaced, but not a wall: this is a setting the Settings page can fix,
      // and trapping someone on step three of a wizard over it would be worse
      // than letting them carry on knowing it did not take.
      setError(
        `${err instanceof Error ? err.message : 'Could not offer this machine to Portal.'} You can turn this on later in Settings.`
      )
      setStep('defaults')
    } finally {
      setBusy(false)
    }
  }

  async function saveDefaults(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await api().settings.update({ defaultInstallLocation: installLocation.trim() || null })
      goNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that location.')
    } finally {
      setBusy(false)
    }
  }

  async function createInvite(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const created = await api().invites.create({ role: 'member', uses: 1, expiresInDays: 7 })
      setInviteCode(created.code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create an invite.')
    } finally {
      setBusy(false)
    }
  }

  async function finish(): Promise<void> {
    setBusy(true)
    try {
      await api().settings.update({ onboardingCompletedAt: new Date().toISOString() })
    } catch {
      // Not being able to record that the wizard ran is not a reason to trap
      // someone inside it — worst case it offers itself once more.
    } finally {
      setBusy(false)
      onFinished()
    }
  }

  return (
    <div className={styles.root}>
      <span className={styles.glow} />
      <div className={styles.shell}>
        <BrandLockup product={desktop ? 'Desktop' : 'Web'} />
        <Card className={styles.card}>
          {error && (
            <MessageBar intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}

          {step === 'welcome' && (
            <>
              <Heading
                icon={<Sparkle24Regular />}
                title={`Welcome, ${me?.username ?? 'there'}`}
                blurb={
                  desktop
                    ? 'A few questions and Chunkforge is ready. All of it can be changed later in Settings.'
                    : 'A few questions and this panel is ready. All of it can be changed later in Settings.'
                }
              />
              <Text className={styles.muted}>
                Chunkforge runs Minecraft servers here, on other machines you pair as nodes, or both.
                A Portal is what gives those servers a real address like <b>survival.example.com</b>,
                so nobody has to remember a port or open one on their router.
              </Text>
            </>
          )}

          {step === 'portal' && (
            <>
              <Heading
                icon={<Globe24Regular />}
                title="Connect a Portal"
                blurb="Optional. A Portal hands out subdomains and reaches your nodes."
              />
              {portalLinked ? (
                <div className={styles.ok}>
                  <Checkmark20Filled />
                  <Text>This panel is already connected to a Portal.</Text>
                </div>
              ) : (
                <>
                  <Field label="Portal address" hint="For example https://portal.example.com">
                    <Input
                      value={portalUrl}
                      placeholder="https://portal.example.com"
                      onChange={(_, data) => setPortalUrl(data.value)}
                    />
                  </Field>
                  <Field label="Pairing pin" hint="Generated in the Portal admin page.">
                    <Input value={pin} onChange={(_, data) => setPin(data.value)} />
                  </Field>
                  <Field label="What to call this panel on the Portal">
                    <Input value={planeName} onChange={(_, data) => setPlaneName(data.value)} />
                  </Field>
                </>
              )}
            </>
          )}

          {step === 'hosting' && (
            <>
              <Heading
                icon={<Server24Regular />}
                title={desktop ? 'Run servers on this computer' : 'Run servers in this container'}
                blurb={
                  portalLinked
                    ? 'Offering this machine to Portal is what lets a server here get a subdomain.'
                    : 'Without a Portal this only decides where new servers run.'
                }
              />
              <Switch
                checked={hostLocally}
                label={desktop ? 'Host servers on this computer' : 'Host servers in this container'}
                onChange={(_, data) => setHostLocally(Boolean(data.checked))}
              />
              <Text className={styles.muted}>
                Leave this off if this panel only manages servers on other machines. You can pair
                those any time from the Nodes page.
              </Text>
            </>
          )}

          {step === 'defaults' && (
            <>
              <Heading
                icon={<Server24Regular />}
                title="Where servers live"
                blurb={
                  desktop
                    ? 'New servers are created here unless you pick somewhere else at the time.'
                    : 'Inside the container this should stay on the volume you mounted.'
                }
              />
              <Field
                label="Default location for new servers"
                hint={desktop ? 'Leave blank to use the Chunkforge data folder.' : 'Leave blank for /data.'}
              >
                <Input
                  value={installLocation}
                  placeholder={desktop ? 'Chunkforge data folder' : '/data'}
                  onChange={(_, data) => setInstallLocation(data.value)}
                />
              </Field>
            </>
          )}

          {step === 'invite' && (
            <>
              <Heading
                icon={<PersonAdd24Regular />}
                title="Invite someone"
                blurb="Optional. An invite lets someone create their own account and pick their own password."
              />
              {inviteCode ? (
                <>
                  <Text className={styles.muted}>
                    Send this to whoever is joining. It works once, expires in a week, and is shown
                    only here — Chunkforge stores a hash of it, not the code.
                  </Text>
                  <div className={styles.codeBox}>
                    <Text className={styles.codeText}>{inviteCode}</Text>
                    <Button
                      icon={<Copy20Regular />}
                      onClick={() => {
                        void navigator.clipboard.writeText(inviteCode)
                        setCopied(true)
                      }}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Text className={styles.muted}>
                    Invited accounts are members: they can create and run servers, but not manage
                    other accounts. You can hand out more, with narrower access, from the Admin page.
                  </Text>
                  <div>
                    <Button disabled={busy} onClick={() => void createInvite()}>
                      {busy ? 'Creating…' : 'Create an invite'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 'done' && (
            <>
              <Heading
                icon={<Checkmark20Filled />}
                title="You're set up"
                blurb="Create your first server from the Servers page."
              />
              <Text className={styles.muted}>
                Nodes, Portal and defaults all live in Settings.
                {me?.isAdmin ? ' Accounts and invites live under Admin.' : ''}
              </Text>
            </>
          )}

          <div className={styles.footer}>
            <div className={styles.dots}>
              {visible.map((key, i) => (
                <span
                  key={key}
                  className={`${styles.dot} ${i === index ? styles.dotActive : i < index ? styles.dotDone : ''}`}
                />
              ))}
            </div>
            <div className={styles.rightActions}>
              {index > 0 && step !== 'done' && (
                <Button appearance="subtle" disabled={busy} onClick={goBack}>
                  Back
                </Button>
              )}
              {step === 'welcome' && (
                <>
                  <Button appearance="subtle" disabled={busy} onClick={() => void finish()}>
                    Skip setup
                  </Button>
                  <Button appearance="primary" onClick={() => goNext()}>
                    Get started
                  </Button>
                </>
              )}
              {step === 'portal' && !portalLinked && (
                <>
                  <Button appearance="subtle" disabled={busy} onClick={() => goNext()}>
                    Not now
                  </Button>
                  <Button
                    appearance="primary"
                    disabled={busy || !portalUrl.trim() || !pin.trim()}
                    onClick={() => void connectPortal()}
                  >
                    {busy ? 'Connecting…' : 'Connect'}
                  </Button>
                </>
              )}
              {step === 'portal' && portalLinked && (
                <Button appearance="primary" onClick={() => goNext()}>
                  Next
                </Button>
              )}
              {step === 'hosting' && (
                <Button appearance="primary" disabled={busy} onClick={() => void applyHosting()}>
                  {busy ? 'Applying…' : 'Next'}
                </Button>
              )}
              {step === 'defaults' && (
                <Button appearance="primary" disabled={busy} onClick={() => void saveDefaults()}>
                  {busy ? 'Saving…' : 'Next'}
                </Button>
              )}
              {step === 'invite' && (
                <Button appearance="primary" disabled={busy} onClick={() => goNext()}>
                  {inviteCode ? 'Next' : 'Skip'}
                </Button>
              )}
              {step === 'done' && (
                <Button appearance="primary" disabled={busy} onClick={() => void finish()}>
                  {busy ? 'Finishing…' : 'Open Chunkforge'}
                </Button>
              )}
            </div>
          </div>
        </Card>
        {busy && step === 'welcome' && <Spinner size="tiny" />}
      </div>
    </div>
  )
}

function Heading({
  icon,
  title,
  blurb
}: {
  icon: JSX.Element
  title: string
  blurb: string
}): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.heading}>
      <span className={styles.icon}>{icon}</span>
      <div className={styles.headingText}>
        <Title2>{title}</Title2>
        <Text block className={styles.muted}>
          {blurb}
        </Text>
      </div>
    </div>
  )
}
