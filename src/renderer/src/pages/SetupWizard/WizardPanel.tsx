import type { JSX, PropsWithChildren } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  }
})

export function WizardPanel({ children }: PropsWithChildren): JSX.Element {
  const styles = useStyles()
  return <div className={styles.panel}>{children}</div>
}
