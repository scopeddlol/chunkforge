import type { JSX } from 'react'
import { makeStyles, tokens, Text } from '@fluentui/react-components'
import { pluginSourceLabels, type PluginSource } from '@shared/types'

// Each source keeps its own recognisable accent so results are scannable.
export const sourceColors: Record<PluginSource, string> = {
  modrinth: '#1BD96A',
  hangar: '#2C7DD8',
  spiget: '#E8A33D',
  curseforge: '#F16436'
}

const useStyles = makeStyles({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '2px 8px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0
  },
  label: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap'
  }
})

export function SourceBadge({ source }: { source: PluginSource }): JSX.Element {
  const styles = useStyles()
  return (
    <span className={styles.badge}>
      <span className={styles.dot} style={{ backgroundColor: sourceColors[source] }} />
      <Text size={100} className={styles.label}>
        {pluginSourceLabels[source]}
      </Text>
    </span>
  )
}
