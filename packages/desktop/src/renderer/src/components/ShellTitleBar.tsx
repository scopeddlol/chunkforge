import type { JSX } from 'react'
import { makeStyles, tokens, Text } from '@fluentui/react-components'
import { ChunkforgeMark } from './ChunkforgeMark'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    height: '40px',
    flexShrink: 0,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    paddingLeft: '16px',
    paddingRight: '12px',
    color: tokens.colorNeutralForeground1
  }
})

export function ShellTitleBar(): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <ChunkforgeMark size={18} />
        <Text weight="semibold" size={300}>
          Chunkforge
        </Text>
      </div>
    </div>
  )
}
