import { useCallback, useEffect, useState, type JSX } from 'react'
import { FluentProvider, makeStyles } from '@fluentui/react-components'
import { serverTypeCategory, type InstanceMetadata, type ThemePreference } from '@shared/types'
import { getTheme, type ChunkforgeTheme } from './theme/chunkforgeTheme'
import { TitleBar } from './components/TitleBar'
import { NavRail, type NavKey } from './components/NavRail'
import { DashboardPage } from './pages/Dashboard/DashboardPage'
import { PluginBrowserPage } from './pages/PluginBrowser/PluginBrowserPage'
import { SettingsPage } from './pages/Settings/SettingsPage'
import { SetupWizard } from './pages/SetupWizard/SetupWizard'
import { InstancePage } from './pages/Instance/InstancePage'
import { useInstancesStore } from './state/instancesStore'

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
    window.chunkforge.theme.getSystemTheme().then(setSystemTheme)
    return window.chunkforge.theme.onSystemThemeChanged(setSystemTheme)
  }, [])

  const loadPreference = useCallback(() => {
    window.chunkforge.settings.get().then((settings) => setPreference(settings.themePreference))
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
    const metadata = await window.chunkforge.servers.getMetadata(instanceId)
    setPluginScopeId(instanceId)
    setOverlay(null)
    setActiveNav(serverTypeCategory[metadata.serverType] === 'mods' ? 'mods' : 'plugins')
  }, [])

  return (
    <FluentProvider theme={resolvedTheme.theme} className={styles.shell}>
      <TitleBar />
      <div className={styles.body}>
        <NavRail active={activeNav} onSelect={handleSelectNav} />

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
        {!overlay && activeNav === 'settings' && <SettingsPage />}
      </div>
    </FluentProvider>
  )
}
