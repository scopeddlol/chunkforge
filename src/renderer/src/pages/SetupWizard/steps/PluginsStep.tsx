import type { JSX } from 'react'
import { makeStyles, tokens, Text, Title3 } from '@fluentui/react-components'
import { AppsAddIn24Regular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    maxWidth: '420px'
  },
  notice: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    textAlign: 'center',
    padding: '32px',
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    color: tokens.colorNeutralForeground3
  }
})

export function PluginsStep(): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <Title3>Plugins &amp; mods</Title3>
      <div className={styles.notice}>
        <AppsAddIn24Regular fontSize={28} />
        <Text>
          The multi-source Plugin Browser (Modrinth, Hangar, Spiget, CurseForge) isn&apos;t wired up
          yet. Create your server now — you&apos;ll be able to add plugins from its Plugins tab as
          soon as that lands.
        </Text>
      </div>
    </div>
  )
}
