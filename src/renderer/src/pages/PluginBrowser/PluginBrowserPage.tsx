import type { JSX } from 'react'
import { makeStyles, Title2, Text, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 36px',
    overflow: 'auto'
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: '8px'
  }
})

export function PluginBrowserPage(): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.root}>
      <Title2>Plugin &amp; Mod Browser</Title2>
      <Text className={styles.subtitle}>
        Search Modrinth, Hangar, Spiget, and CurseForge in one place. Coming in Phase 4.
      </Text>
    </div>
  )
}
