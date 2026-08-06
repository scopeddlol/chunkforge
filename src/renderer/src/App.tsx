import { useEffect, useState, type JSX } from 'react'
import { FluentProvider, makeStyles } from '@fluentui/react-components'
import type { InstanceMetadata } from '@shared/types'
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

function usePreferredTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    window.chunkforge.theme.getSystemTheme().then(setTheme)
    return window.chunkforge.theme.onSystemThemeChanged(setTheme)
  }, [])

  return theme
}

type Overlay = { kind: 'wizard' } | { kind: 'instance'; instanceId: string } | null

export function App(): JSX.Element {
  const styles = useStyles()
  const systemTheme = usePreferredTheme()
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const refreshInstances = useInstancesStore((s) => s.refresh)

  function handleSelectNav(key: NavKey): void {
    setOverlay(null)
    setActiveNav(key)
  }

  function handleInstanceCreated(metadata: InstanceMetadata): void {
    refreshInstances()
    setOverlay({ kind: 'instance', instanceId: metadata.id })
  }

  return (
    <FluentProvider
      theme={systemTheme === 'dark' ? chunkforgeDarkTheme : chunkforgeLightTheme}
      className={styles.shell}
    >
      <TitleBar />
      <div className={styles.body}>
        <NavRail active={activeNav} onSelect={handleSelectNav} />

        {overlay?.kind === 'wizard' && (
          <SetupWizard onClose={() => setOverlay(null)} onCreated={handleInstanceCreated} />
        )}
        {overlay?.kind === 'instance' && (
          <InstancePage instanceId={overlay.instanceId} onBack={() => setOverlay(null)} />
        )}

        {!overlay && activeNav === 'dashboard' && (
          <DashboardPage
            onOpenWizard={() => setOverlay({ kind: 'wizard' })}
            onOpenInstance={(id) => setOverlay({ kind: 'instance', instanceId: id })}
          />
        )}
        {!overlay && activeNav === 'plugins' && <PluginBrowserPage />}
        {!overlay && activeNav === 'settings' && <SettingsPage />}
      </div>
    </FluentProvider>
  )
}
