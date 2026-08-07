import type { JSX } from 'react'
import { makeStyles, Text } from '@fluentui/react-components'
import type { InstanceStatus } from '@shared/types'
import { statusColors } from '../theme/chunkforgeTheme'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  }
})

const statusLabels: Record<InstanceStatus, string> = {
  stopped: 'Stopped',
  starting: 'Starting…',
  running: 'Running',
  stopping: 'Stopping…',
  crashed: 'Crashed'
}

interface StatusDotProps {
  status: InstanceStatus
}

export function StatusDot({ status }: StatusDotProps): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.root}>
      <span className={styles.dot} style={{ backgroundColor: statusColors[status] }} />
      <Text size={200}>{statusLabels[status]}</Text>
    </div>
  )
}
