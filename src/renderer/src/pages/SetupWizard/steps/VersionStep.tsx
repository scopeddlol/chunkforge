import { useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Title3,
  Badge,
  Spinner,
  mergeClasses
} from '@fluentui/react-components'
import type { VersionCatalogEntry } from '@shared/types'
import type { WizardState } from '../wizardState'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minHeight: 0
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '360px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: '6px'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    ':hover': {
      backgroundColor: tokens.colorSubtleBackgroundHover
    }
  },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '24px',
    color: tokens.colorNeutralForeground3
  },
  error: {
    color: tokens.colorPaletteRedForeground1
  }
})

interface VersionStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function VersionStep({ state, onChange }: VersionStepProps): JSX.Element {
  const styles = useStyles()
  const [versions, setVersions] = useState<VersionCatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setVersions(null)
    setError(null)

    window.chunkforge.servers
      .listVersions(state.serverType)
      .then((result) => {
        if (cancelled) return
        setVersions(result)
        const recommended = result.find((v) => v.isRecommended) ?? result[0]
        if (recommended && !state.minecraftVersion) {
          onChange({ minecraftVersion: recommended.id })
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.serverType])

  return (
    <div className={styles.root}>
      <Title3>Which version?</Title3>

      {error && <Text className={styles.error}>{error}</Text>}

      {!versions && !error && (
        <div className={styles.loading}>
          <Spinner size="tiny" />
          <Text>Fetching {state.serverType} versions…</Text>
        </div>
      )}

      {versions && (
        <div className={styles.list}>
          {versions.map((version) => {
            const selected = version.id === state.minecraftVersion
            return (
              <button
                key={version.id}
                type="button"
                className={mergeClasses(styles.row, selected && styles.rowSelected)}
                onClick={() => onChange({ minecraftVersion: version.id })}
              >
                <Text weight={selected ? 'semibold' : 'regular'}>{version.label}</Text>
                {version.isRecommended && (
                  <Badge appearance="tint" color="brand">
                    Recommended
                  </Badge>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
