import type { JSX } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { ChunkforgeMark } from './ChunkforgeMark'

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
 * The last line matters more than it looks: this panel and a Portal are
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
