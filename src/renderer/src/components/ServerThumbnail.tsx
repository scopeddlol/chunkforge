import { useMemo, type JSX } from 'react'
import { makeStyles, tokens, mergeClasses } from '@fluentui/react-components'
import type { ServerType } from '@shared/types'

const useStyles = makeStyles({
  root: {
    position: 'relative',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorNeutralBackground3
  },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  initials: {
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '0.5px',
    textShadow: '0 1px 2px rgba(0,0,0,0.45)',
    userSelect: 'none'
  }
})

/** Deterministic hash so a given server always gets the same artwork. */
function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function initialsOf(name: string): string {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean)
  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// Voxel-ish gradient pairs, picked by hash so the grid stays colourful but stable.
const GRADIENTS: [string, string][] = [
  ['#8B5CF6', '#4E2A8E'],
  ['#2EBD59', '#146B31'],
  ['#3E9CF2', '#1B4F86'],
  ['#E0459C', '#7C1F53'],
  ['#E0475E', '#7C2029'],
  ['#E0C22E', '#7A6A11'],
  ['#22B8CF', '#0F5A66'],
  ['#F97316', '#8A3E08']
]

interface ServerThumbnailProps {
  name: string
  serverType: ServerType
  /** Custom image (data: or file: URL) that overrides the generated artwork. */
  iconUrl?: string | null
  accentColor?: string
  size?: number
  className?: string
}

export function ServerThumbnail({
  name,
  serverType,
  iconUrl,
  size = 44,
  className
}: ServerThumbnailProps): JSX.Element {
  const styles = useStyles()

  const { gradient, pattern } = useMemo(() => {
    const hash = hashString(`${name}:${serverType}`)
    return {
      gradient: GRADIENTS[hash % GRADIENTS.length],
      // A small deterministic voxel pattern gives each server a distinct face.
      pattern: Array.from({ length: 9 }, (_, i) => ((hash >> i) & 1) === 1)
    }
  }, [name, serverType])

  if (iconUrl) {
    return (
      <div className={mergeClasses(styles.root, className)} style={{ width: size, height: size }}>
        <img className={styles.image} src={iconUrl} alt="" />
      </div>
    )
  }

  const cell = size / 3

  return (
    <div
      className={mergeClasses(styles.root, className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`
      }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }}>
        {pattern.map((filled, index) =>
          filled ? (
            <rect
              key={index}
              x={(index % 3) * cell}
              y={Math.floor(index / 3) * cell}
              width={cell}
              height={cell}
              fill="rgba(255,255,255,0.13)"
            />
          ) : null
        )}
      </svg>
      <span className={styles.initials} style={{ fontSize: size * 0.34, position: 'relative' }}>
        {initialsOf(name)}
      </span>
    </div>
  )
}
