import type { JSX } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

/**
 * The Chunkforge mark: an isometric voxel chunk with a forge spark struck into
 * its top face. Duplicated from the desktop renderer rather than shared —
 * Portal's UI is a separate bundle with no dependency on the desktop package,
 * and a two-dozen-line SVG is cheaper to copy than a package boundary to cross.
 */
export function ChunkforgeMark({ size = 28, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M24 3 L44 14.5 V33.5 L24 45 L4 33.5 V14.5 Z" fill="#000000" />
      <path d="M24 3 L44 14.5 L24 26 L4 14.5 Z" fill="#CBA3FB" />
      <path d="M24 26 L44 14.5 V33.5 L24 45 Z" fill="#7D4FD1" />
      <path d="M24 26 L4 14.5 V33.5 L24 45 Z" fill="#A374F8" />
      <path
        d="M27 9 L18 21 L23 21 L20 30 L31 17 L25.5 17 Z"
        fill="#EDDBFE"
        stroke="#000000"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const useStyles = makeStyles({
  lockup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' },
  markGlow: {
    display: 'grid',
    placeItems: 'center',
    width: '76px',
    height: '76px',
    borderRadius: '20px',
    background: 'linear-gradient(150deg, rgba(163,116,248,0.20), rgba(125,79,209,0.06))',
    border: '1px solid rgba(163,116,248,0.28)',
    boxShadow: '0 12px 32px -14px rgba(139,92,246,0.75)'
  },
  // "Chunk" reads as plain text, "forge" carries the violet — the same split
  // the product name has, so the eye lands on the half that is the brand.
  wordmark: {
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '-0.5px',
    lineHeight: 1,
    color: tokens.colorNeutralForeground1
  },
  forge: {
    background: 'linear-gradient(92deg, #A374F8, #CBA3FB)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent'
  },
  product: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '2.6px',
    color: tokens.colorNeutralForeground3
  }
})

/**
 * Mark, wordmark, and the name of *which* Chunkforge this is.
 *
 * The last line matters more than it looks: Portal and the Web panel are
 * different products that both greet you with a sign-in box, and the previous
 * screens were near enough identical that the only way to tell which one you
 * had open was the URL.
 */
export function BrandLockup({ product }: { product: string }): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.lockup}>
      <div className={styles.markGlow}>
        <ChunkforgeMark size={44} />
      </div>
      <div className={styles.wordmark}>
        Chunk<span className={styles.forge}>forge</span>
      </div>
      <div className={styles.product}>{product}</div>
    </div>
  )
}
