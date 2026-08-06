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

export function SettingsPage(): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.root}>
      <Title2>Settings</Title2>
      <Text className={styles.subtitle}>
        Appearance, Java runtimes, API keys, storage, and network settings land in Phase 5.
      </Text>
    </div>
  )
}
