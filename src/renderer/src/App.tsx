import { useCallback, useEffect, useState, type JSX } from 'react'
import { FluentProvider, makeStyles } from '@fluentui/react-components'
import type { InstanceMetadata, ThemePreference } from '@shared/types'
import { chunkforgeDarkTheme, chunkforgeLightTheme } from './theme/chunkforgeTheme'
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

/** Resolves the effective theme from the saved preference plus the OS setting. */
function useResolvedTheme(): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark')
  const [preference, setPreference] = useState<ThemePreference>('system')

  useEffect(() => {
    window.chunkforge.theme.getSystemTheme().then(setSystemTheme)
    return window.chunkforge.theme.onSystemThemeChanged(setSystemTheme)
  }, [])

  useEffect(() => {
    window.chunkforge.settings.get().then((settings) => setPreference(settings.themePreference))
  }, [])

  return preference === 'system' ? systemTheme : preference
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
    if (key !== 'plugins') setPluginScopeId(null)
    setActiveNav(key)
  }

  function handleInstanceCreated(metadata: InstanceMetadata): void {
    refreshInstances()
    setOverlay({ kind: 'instance', instanceId: metadata.id })
  }

  const handleBrowsePlugins = useCallback((instanceId: string) => {
    setPluginScopeId(instanceId)
    setOverlay(null)
    setActiveNav('plugins')
  }, [])

  return (
    <FluentProvider
      theme={resolvedTheme === 'dark' ? chunkforgeDarkTheme : chunkforgeLightTheme}
      className={styles.shell}
    >
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
        {!overlay && activeNav === 'plugins' && <PluginBrowserPage scopedInstanceId={pluginScopeId} />}
        {!overlay && activeNav === 'settings' && <SettingsPage />}
      </div>
    </FluentProvider>
  )
}
