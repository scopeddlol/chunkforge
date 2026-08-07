import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import { makeStyles, tokens, Text, mergeClasses } from '@fluentui/react-components'
import {
  Subtract24Regular,
  Square24Regular,
  SquareMultiple24Regular,
  Dismiss24Regular
} from '@fluentui/react-icons'
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
  },
  spacer: {
    flexGrow: 1
  },
  controls: {
    display: 'flex',
    height: '100%',
    gap: '2px',
    paddingRight: '6px',
    alignItems: 'center'
  },
  controlButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '42px',
    height: '30px',
    borderRadius: tokens.borderRadiusMedium,
    border: 'none',
    background: 'transparent',
    color: tokens.colorNeutralForeground2,
    cursor: 'default',
    transitionProperty: 'background-color, color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorSubtleBackgroundHover,
      color: tokens.colorNeutralForeground1
    }
  },
  closeButton: {
    ':hover': {
      backgroundColor: '#C42B1C',
      color: '#FFFFFF'
    }
  }
})

const dragStyle: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const noDragStyle: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

export function TitleBar(): JSX.Element {
  const styles = useStyles()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.chunkforge.window.isMaximized().then(setMaximized)
    return window.chunkforge.window.onMaximizedChanged(setMaximized)
  }, [])

  return (
    <div className={styles.root} style={dragStyle}>
      <div className={styles.brand}>
        <ChunkforgeMark size={18} />
        <Text weight="semibold" size={300}>
          Chunkforge
        </Text>
      </div>
      <div className={styles.spacer} />
      <div className={styles.controls} style={noDragStyle}>
        <button
          className={styles.controlButton}
          onClick={() => window.chunkforge.window.minimize()}
          aria-label="Minimize"
        >
          <Subtract24Regular fontSize={16} />
        </button>
        <button
          className={styles.controlButton}
          onClick={() => window.chunkforge.window.maximizeToggle()}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <SquareMultiple24Regular fontSize={16} /> : <Square24Regular fontSize={16} />}
        </button>
        <button
          className={mergeClasses(styles.controlButton, styles.closeButton)}
          onClick={() => window.chunkforge.window.close()}
          aria-label="Close"
        >
          <Dismiss24Regular fontSize={16} />
        </button>
      </div>
    </div>
  )
}
