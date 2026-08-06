import { useEffect, useState, type JSX } from 'react'
import { FluentProvider, makeStyles } from '@fluentui/react-components'
import { chunkforgeDarkTheme, chunkforgeLightTheme } from './theme/chunkforgeTheme'
import { TitleBar } from './components/TitleBar'
import { NavRail, type NavKey } from './components/NavRail'
import { DashboardPage } from './pages/Dashboard/DashboardPage'
import { PluginBrowserPage } from './pages/PluginBrowser/PluginBrowserPage'
import { SettingsPage } from './pages/Settings/SettingsPage'

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

export function App(): JSX.Element {
  const styles = useStyles()
  const systemTheme = usePreferredTheme()
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard')

  return (
    <FluentProvider
      theme={systemTheme === 'dark' ? chunkforgeDarkTheme : chunkforgeLightTheme}
      className={styles.shell}
    >
      <TitleBar />
      <div className={styles.body}>
        <NavRail active={activeNav} onSelect={setActiveNav} />
        {activeNav === 'dashboard' && <DashboardPage />}
        {activeNav === 'plugins' && <PluginBrowserPage />}
        {activeNav === 'settings' && <SettingsPage />}
      </div>
    </FluentProvider>
  )
}
