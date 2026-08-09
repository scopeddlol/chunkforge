import { useCallback, useEffect, useState, type JSX } from 'react'
import { FluentProvider, makeStyles } from '@fluentui/react-components'
import { serverTypeCategory, type InstanceMetadata, type ThemePreference } from '@shared/types'
import { getTheme, type ChunkforgeTheme } from './theme/chunkforgeTheme'
import { TitleBar } from './components/TitleBar'
import { NavRail, type NavKey } from './components/NavRail'
import { DashboardPage } from './pages/Dashboard/DashboardPage'
import { PluginBrowserPage } from './pages/PluginBrowser/PluginBrowserPage'
import { ModpackPage } from './pages/PluginBrowser/ModpackPage'
import { NodesPage } from './pages/Nodes/NodesPage'
import { AdminPage } from './pages/Admin/AdminPage'
import { SettingsPage } from './pages/Settings/SettingsPage'
import { SetupWizard } from './pages/SetupWizard/SetupWizard'
import { OnboardingWizard } from './pages/Onboarding/OnboardingWizard'
import { InstancePage } from './pages/Instance/InstancePage'
import { useInstancesStore } from './state/instancesStore'
import { useSessionStore } from './state/sessionStore'
import { api } from './api'
import { AuthGate } from './pages/Auth/AuthGate'
import { native } from './native'

const useStyles = makeStyles({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden'
  },
  body: {
    display: 'flex',
    flexGrow: 1,
    minHeight: 0
  }
})

/**
 * Resolves the active theme from the saved preference plus the OS setting, and
 * republishes its popup surface colours as CSS variables — portal content is
 * rendered outside our React tree, so it can't read them from the provider.
 */
function useResolvedTheme(): ChunkforgeTheme {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark')
  const [preference, setPreference] = useState<ThemePreference>('system')

  useEffect(() => {
    const host = native()
    host.theme.getSystemTheme().then(setSystemTheme)
    return host.theme.onSystemThemeChanged(setSystemTheme)
  }, [])

  const loadPreference = useCallback(() => {
    api()
      .settings.get()
      .then((settings) => setPreference(settings.themePreference))
      // Settings need a session, and this runs before there is one on every
      // signed-out load. Without a catch that is an unhandled rejection in the
      // console on the login screen, every time.
      .catch(() => undefined)
  }, [])

  useEffect(loadPreference, [loadPreference])

  // Settings writes this key when the theme changes, so the whole app restyles
  // without a reload.
  useEffect(() => {
    const onChanged = (): void => loadPreference()
    window.addEventListener('chunkforge:settings-changed', onChanged)
    return () => window.removeEventListener('chunkforge:settings-changed', onChanged)
  }, [loadPreference])

  const resolved = getTheme(preference === 'system' ? (systemTheme === 'dark' ? 'oled' : 'light') : preference)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--cf-popup-bg', resolved.popupBackground)
    root.style.setProperty('--cf-popup-border', resolved.popupBorder)
    document.body.style.backgroundColor = resolved.theme.colorNeutralBackground2
  }, [resolved])

  return resolved
}

type Overlay = { kind: 'wizard' } | { kind: 'instance'; instanceId: string } | null

export function App(): JSX.Element {
  const styles = useStyles()
  const resolvedTheme = useResolvedTheme()
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [pluginScopeId, setPluginScopeId] = useState<string | null>(null)
  const refreshInstances = useInstancesStore((s) => s.refresh)
  const isAdmin = useSessionStore((s) => s.user?.isAdmin ?? false)
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const [onboarding, setOnboarding] = useState(false)

  // Keyed on the signed-in user rather than on mount: every settings route
  // needs a session, so asking before AuthGate has one only ever answers 401,
  // and the wizard would never appear on the run it exists for.
  //
  // Admins only. Everything the wizard configures is admin-gated on the server,
  // so showing it to a member would be a tour of controls that all refuse —
  // and recording that it finished is itself an admin write, so it would come
  // back on every load.
  useEffect(() => {
    if (!userId || !isAdmin) return
    api()
      .settings.get()
      .then((settings) => setOnboarding(!settings.onboardingCompletedAt))
      .catch(() => setOnboarding(false))
  }, [userId, isAdmin])

  function handleSelectNav(key: NavKey): void {
    setOverlay(null)
    if (key !== 'plugins' && key !== 'mods') setPluginScopeId(null)
    setActiveNav(key)
  }

  function handleInstanceCreated(metadata: InstanceMetadata): void {
    refreshInstances()
    setOverlay({ kind: 'instance', instanceId: metadata.id })
  }

  // Mod servers should land on the Mods browser, plugin servers on Plugins.
  const handleBrowsePlugins = useCallback(async (instanceId: string) => {
    const metadata = await api().servers.get(instanceId)
    setPluginScopeId(instanceId)
    setOverlay(null)
    setActiveNav(serverTypeCategory[metadata.serverType] === 'mods' ? 'mods' : 'plugins')
  }, [])

  return (
    <FluentProvider theme={resolvedTheme.theme} className={styles.shell}>
      <AuthGate>
        <div className={styles.shell}>
          {onboarding && <OnboardingWizard onFinished={() => setOnboarding(false)} />}
          <TitleBar />
          <div className={styles.body}>
            <NavRail active={activeNav} onSelect={handleSelectNav} isAdmin={isAdmin} />

            {overlay?.kind === 'wizard' && (
              <SetupWizard onClose={() => setOverlay(null)} onCreated={handleInstanceCreated} />
            )}
            {overlay?.kind === 'instance' && (
              <InstancePage
                instanceId={overlay.instanceId}
                onBack={() => setOverlay(null)}
                onBrowsePlugins={handleBrowsePlugins}
              />
            )}

            {!overlay && activeNav === 'dashboard' && (
              <DashboardPage
                onOpenWizard={() => setOverlay({ kind: 'wizard' })}
                onOpenInstance={(id) => setOverlay({ kind: 'instance', instanceId: id })}
              />
            )}
            {!overlay && activeNav === 'plugins' && (
              <PluginBrowserPage mode="plugins" scopedInstanceId={pluginScopeId} />
            )}
            {!overlay && activeNav === 'mods' && (
              <PluginBrowserPage mode="mods" scopedInstanceId={pluginScopeId} />
            )}
            {!overlay && activeNav === 'modpacks' && <ModpackPage />}
            {!overlay && activeNav === 'nodes' && <NodesPage />}
            {!overlay && activeNav === 'admin' && isAdmin && <AdminPage />}
            {!overlay && activeNav === 'settings' && <SettingsPage />}
          </div>
        </div>
      </AuthGate>
    </FluentProvider>
  )
}
