import type { JSX } from 'react'
import { makeStyles, tokens, Text, mergeClasses } from '@fluentui/react-components'
import { Checkmark16Filled } from '@fluentui/react-icons'
import { stepLabel, type WizardStepKey } from './wizardState'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '18px 36px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  dot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: tokens.borderRadiusCircular,
    fontSize: '11px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0
  },
  dotDone: {
    backgroundColor: tokens.colorBrandBackground,
    border: `1px solid ${tokens.colorBrandBackground}`,
    color: tokens.colorNeutralForegroundOnBrand
  },
  dotActive: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    color: tokens.colorBrandForeground1
  },
  label: {
    color: tokens.colorNeutralForeground3
  },
  labelActive: {
    color: tokens.colorNeutralForeground1,
    fontWeight: 600
  },
  connector: {
    width: '20px',
    height: '1px',
    backgroundColor: tokens.colorNeutralStroke3,
    flexShrink: 0
  }
})

interface WizardStepperProps {
  steps: WizardStepKey[]
  currentStep: number
}

export function WizardStepper({ steps, currentStep }: WizardStepperProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      {steps.map((key, index) => {
        const label = stepLabel(key)
        const isDone = index < currentStep
        const isActive = index === currentStep
        return (
          <div className={styles.step} key={key}>
            <span
              className={mergeClasses(styles.dot, isDone && styles.dotDone, isActive && styles.dotActive)}
            >
              {isDone ? <Checkmark16Filled /> : index + 1}
            </span>
            <Text size={200} className={mergeClasses(styles.label, isActive && styles.labelActive)}>
              {label}
            </Text>
            {index < steps.length - 1 && <span className={styles.connector} />}
          </div>
        )
      })}
    </div>
  )
}
