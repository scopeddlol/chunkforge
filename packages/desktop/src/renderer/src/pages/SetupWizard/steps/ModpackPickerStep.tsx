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
  MessageBar,
  MessageBarBody,
  mergeClasses
} from '@fluentui/react-components'
import { Search20Regular, Checkmark20Filled, Dismiss16Regular } from '@fluentui/react-icons'
import {
  serverTypeLabels,
  type PluginSearchResult,
  type SelectedModpack
} from '@shared/types'
import { SourceBadge } from '../../../components/SourceBadge'
import type { WizardState } from '../wizardState'
import { api } from '../../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '660px', minHeight: 0 },
  hint: { color: tokens.colorNeutralForeground3 },
  searchRow: { display: 'flex', gap: '8px' },
  grow: { flexGrow: 1 },
  selected: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '320px',
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
    borderRadius: tokens.borderRadiusMedium
  },
  rowActive: { backgroundColor: tokens.colorBrandBackground2 },
  icon: { width: '32px', height: '32px', borderRadius: '4px', flexShrink: 0 },
  info: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  summary: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  empty: { padding: '24px', textAlign: 'center', color: tokens.colorNeutralForeground3 }
})

interface ModpackPickerStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function ModpackPickerStep({ state, onChange }: ModpackPickerStepProps): JSX.Element {
  const styles = useStyles()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PluginSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      setResults(await api().modpacks.search(query, 15))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    search('')
  }, [search])

  /**
   * Picking a pack resolves its newest downloadable version and reads the
   * archive, so the wizard can set the server type and Minecraft version from
   * what the pack actually needs rather than asking the user to match them.
   */
  async function choose(pack: PluginSearchResult): Promise<void> {
    setResolving(pack.id)
    setError(null)
    try {
      const versions = await api().modpacks.versions(pack.source, pack.id)
      const version = versions.find((v) => v.downloadUrl)
      if (!version?.downloadUrl) throw new Error('This pack has no downloadable server version.')

      const target = await api().modpacks.inspect(pack.source, version.downloadUrl)
      const selected: SelectedModpack = {
        source: pack.source,
        projectId: pack.id,
        name: pack.name,
        downloadUrl: version.downloadUrl,
        serverType: target.serverType,
        minecraftVersion: target.minecraftVersion
      }
      onChange({
        modpack: selected,
        serverType: target.serverType,
        minecraftVersion: target.minecraftVersion
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className={styles.root}>
      <Title3>Start from a modpack</Title3>
      <Text size={200} className={styles.hint}>
        Optional. Picking a pack sets the loader and Minecraft version to whatever it requires, and
        installs its mods once the server is created.
      </Text>

      {error && (
        <MessageBar intent="warning">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {state.modpack && (
        <div className={styles.selected}>
          <div className={styles.info}>
            <Text weight="semibold">{state.modpack.name}</Text>
            <Text size={200} className={styles.hint}>
              {serverTypeLabels[state.modpack.serverType]} {state.modpack.minecraftVersion}
            </Text>
          </div>
          <Button
            appearance="subtle"
            size="small"
            icon={<Dismiss16Regular />}
            onClick={() => onChange({ modpack: null })}
          >
            Remove
          </Button>
        </div>
      )}

      <div className={styles.searchRow}>
        <Input
          className={styles.grow}
          value={term}
          placeholder="Search modpacks…"
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

      {loading && !results && <Spinner size="tiny" label="Searching modpacks…" />}

      {results && (
        <div className={styles.results}>
          {results.length === 0 && <Text className={styles.empty}>No modpacks matched.</Text>}
          {results.map((pack) => {
            const active = state.modpack?.projectId === pack.id
            return (
              <div key={`${pack.source}:${pack.id}`} className={mergeClasses(styles.row, active && styles.rowActive)}>
                {pack.iconUrl && <img className={styles.icon} src={pack.iconUrl} alt="" loading="lazy" />}
                <div className={styles.info}>
                  <Text weight="semibold" size={200} className={styles.name}>
                    {pack.name}
                  </Text>
                  <Text size={100} className={styles.summary}>
                    {pack.summary}
                  </Text>
                </div>
                <SourceBadge source={pack.source} />
                <Button
                  appearance={active ? 'subtle' : 'secondary'}
                  size="small"
                  disabled={resolving !== null}
                  icon={active ? <Checkmark20Filled /> : undefined}
                  onClick={() => choose(pack)}
                >
                  {active ? 'Selected' : resolving === pack.id ? 'Reading…' : 'Use'}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {state.modpack && (
        <Badge appearance="tint" color="brand">
          Server type and version are locked to this pack
        </Badge>
      )}
    </div>
  )
}
