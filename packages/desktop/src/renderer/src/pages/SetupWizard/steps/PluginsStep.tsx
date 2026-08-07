import { useCallback, useEffect, useState, type JSX, type KeyboardEvent } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Title3,
  Input,
  Button,
  Spinner,
  Badge,
  mergeClasses
} from '@fluentui/react-components'
import { Search20Regular, Add20Regular, Checkmark20Filled, Dismiss16Regular } from '@fluentui/react-icons'
import { modServerTypes, type PluginSearchResult, type QueuedPlugin } from '@shared/types'
import { SourceBadge } from '../../../components/SourceBadge'
import type { WizardState } from '../wizardState'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0, maxWidth: '640px' },
  searchRow: { display: 'flex', gap: '8px' },
  grow: { flexGrow: 1 },
  queue: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '300px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: '6px'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent'
  },
  rowQueued: { backgroundColor: tokens.colorBrandBackground2 },
  icon: { width: '28px', height: '28px', borderRadius: '4px', flexShrink: 0 },
  info: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  summary: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  hint: { color: tokens.colorNeutralForeground3 },
  empty: { padding: '24px', textAlign: 'center', color: tokens.colorNeutralForeground3 }
})

interface PluginsStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function PluginsStep({ state, onChange }: PluginsStepProps): JSX.Element {
  const styles = useStyles()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PluginSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  const isModLoader = modServerTypes.includes(state.serverType)

  const search = useCallback(
    async (query: string) => {
      setLoading(true)
      try {
        const response = await window.chunkforge.plugins.search({
          query,
          sources: [],
          gameVersion: state.minecraftVersion || undefined,
          limit: 15
        })
        setResults(response.results)
      } finally {
        setLoading(false)
      }
    },
    [state.minecraftVersion]
  )

  useEffect(() => {
    search('')
  }, [search])

  function isQueued(result: PluginSearchResult): boolean {
    return state.initialPlugins.some((p) => p.source === result.source && p.projectId === result.id)
  }

  function toggle(result: PluginSearchResult): void {
    if (isQueued(result)) {
      onChange({
        initialPlugins: state.initialPlugins.filter(
          (p) => !(p.source === result.source && p.projectId === result.id)
        )
      })
      return
    }
    const queued: QueuedPlugin = { source: result.source, projectId: result.id, name: result.name }
    onChange({ initialPlugins: [...state.initialPlugins, queued] })
  }

  return (
    <div className={styles.root}>
      <Title3>{isModLoader ? 'Mods' : 'Plugins'}</Title3>
      <Text size={200} className={styles.hint}>
        Pick anything you want installed right after the server is created. You can always add more later.
      </Text>

      {state.initialPlugins.length > 0 && (
        <div className={styles.queue}>
          {state.initialPlugins.map((plugin) => (
            <Badge
              key={`${plugin.source}:${plugin.projectId}`}
              appearance="tint"
              color="brand"
              icon={<Dismiss16Regular />}
              iconPosition="after"
              style={{ cursor: 'pointer' }}
              onClick={() =>
                onChange({
                  initialPlugins: state.initialPlugins.filter(
                    (p) => !(p.source === plugin.source && p.projectId === plugin.projectId)
                  )
                })
              }
            >
              {plugin.name}
            </Badge>
          ))}
        </div>
      )}

      <div className={styles.searchRow}>
        <Input
          className={styles.grow}
          value={term}
          placeholder={`Search ${isModLoader ? 'mods' : 'plugins'}…`}
          contentBefore={<Search20Regular />}
          onChange={(_, d) => setTerm(d.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') search(term)
          }}
        />
        <Button appearance="primary" disabled={loading} onClick={() => search(term)}>
          Search
        </Button>
      </div>

      {loading && !results && <Spinner size="tiny" label="Searching…" />}

      {results && (
        <div className={styles.results}>
          {results.length === 0 && <Text className={styles.empty}>No results. Try another search.</Text>}
          {results.map((result) => {
            const queued = isQueued(result)
            return (
              <div
                key={`${result.source}:${result.id}`}
                className={mergeClasses(styles.row, queued && styles.rowQueued)}
              >
                {result.iconUrl && (
                  <img className={styles.icon} src={result.iconUrl} alt="" loading="lazy" />
                )}
                <div className={styles.info}>
                  <Text weight="semibold" size={200} className={styles.name}>
                    {result.name}
                  </Text>
                  <Text size={100} className={styles.summary}>
                    {result.summary}
                  </Text>
                </div>
                <SourceBadge source={result.source} />
                <Button
                  appearance={queued ? 'subtle' : 'secondary'}
                  size="small"
                  icon={queued ? <Checkmark20Filled /> : <Add20Regular />}
                  onClick={() => toggle(result)}
                >
                  {queued ? 'Added' : 'Add'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
