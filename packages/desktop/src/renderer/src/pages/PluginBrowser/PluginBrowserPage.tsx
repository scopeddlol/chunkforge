import { useCallback, useEffect, useState, type JSX, type KeyboardEvent } from 'react'
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Input,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Field,
  Dropdown,
  Option,
  mergeClasses
} from '@fluentui/react-components'
import { Search24Regular, ArrowClockwise20Regular } from '@fluentui/react-icons'
import {
  pluginSourceLabels,
  type PluginSearchResult,
  type PluginSource,
  type InstanceSummary
} from '@shared/types'
import { sourceColors } from '../../components/SourceBadge'
import { useInstancesStore } from '../../state/instancesStore'
import { PluginCard } from './PluginCard'
import { InstallDialog } from './InstallDialog'
import { api } from '../../api'

const allSources: PluginSource[] = ['modrinth', 'hangar', 'spiget', 'curseforge']

// Empty value means no loader filter at all.
const loaderOptions = [
  { value: '', label: 'Any' },
  { value: 'paper', label: 'Paper' },
  { value: 'spigot', label: 'Spigot' },
  { value: 'bukkit', label: 'Bukkit' },
  { value: 'purpur', label: 'Purpur' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' }
]

const useStyles = makeStyles({
  root: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    padding: '28px 36px 0'
  },
  header: { marginBottom: '18px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  controls: { display: 'flex', gap: '10px', marginBottom: '14px' },
  search: { flexGrow: 1 },
  chips: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: tokens.durationFaster,
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover }
  },
  chipActive: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    color: tokens.colorNeutralForeground1
  },
  chipDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 },
  scroller: { flexGrow: 1, overflowY: 'auto', paddingBottom: '28px', minHeight: 0 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '14px'
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '64px 0',
    color: tokens.colorNeutralForeground3
  },
  warnings: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' },
  filters: { display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' },
  filterField: { minWidth: '150px' }
})

interface PluginBrowserPageProps {
  /** Plugin mode searches Bukkit-style plugins; mod mode searches loader mods. */
  mode?: 'plugins' | 'mods'
  scopedInstanceId?: string | null
}

export function PluginBrowserPage({
  mode = 'plugins',
  scopedInstanceId = null
}: PluginBrowserPageProps): JSX.Element {
  const styles = useStyles()
  const { instances, refresh } = useInstancesStore()

  const [term, setTerm] = useState('')
  const [activeSources, setActiveSources] = useState<PluginSource[]>(allSources)
  const [results, setResults] = useState<PluginSearchResult[]>([])
  const [errors, setErrors] = useState<{ source: PluginSource; message: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [installTarget, setInstallTarget] = useState<PluginSearchResult | null>(null)
  const [versionFilter, setVersionFilter] = useState('')
  const [loaderFilter, setLoaderFilter] = useState(mode === 'mods' ? 'fabric' : '')

  useEffect(() => {
    if (instances.length === 0) refresh()
  }, [instances.length, refresh])

  const runSearch = useCallback(
    async (query: string, sources: PluginSource[], version: string, loader: string) => {
      setLoading(true)
      try {
        const response = await api().addons.search({
          query,
          sources,
          gameVersion: version || undefined,
          loader: loader || undefined,
          limit: 20
        })
        setResults(response.results)
        setErrors(response.errors)
      } catch (err) {
        setErrors([{ source: 'modrinth', message: (err as Error).message }])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Start from the sources enabled in Settings, then show popular plugins so
  // the page is never empty on first open.
  useEffect(() => {
    let cancelled = false
    api()
      .settings.get()
      .then((settings) => {
        if (cancelled) return
        const enabled =
          settings.enabledPluginSources.length > 0 ? settings.enabledPluginSources : allSources
        setActiveSources(enabled)
        runSearch('', enabled, '', mode === 'mods' ? 'fabric' : '')
      })
    return () => {
      cancelled = true
    }
  }, [runSearch])

  function toggleSource(source: PluginSource): void {
    const next = activeSources.includes(source)
      ? activeSources.filter((s) => s !== source)
      : [...activeSources, source]
    setActiveSources(next)
    runSearch(term, next, versionFilter, loaderFilter)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') runSearch(term, activeSources, versionFilter, loaderFilter)
  }

  const scopedInstance: InstanceSummary | undefined = scopedInstanceId
    ? instances.find((i) => i.id === scopedInstanceId)
    : undefined

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title2>{mode === 'mods' ? 'Mods' : 'Plugins'}</Title2>
        <Text className={styles.subtitle} block>
          {scopedInstance
            ? `Browsing for ${scopedInstance.name}`
            : mode === 'mods'
              ? 'Mods for Fabric, Forge, and NeoForge servers.'
              : 'Search Modrinth, Hangar, SpigotMC, and CurseForge in one place.'}
        </Text>
      </div>

      <div className={styles.controls}>
        <Input
          className={styles.search}
          value={term}
          placeholder="Search plugins — try “essentials”, “worldedit”, “luckperms”…"
          contentBefore={<Search24Regular />}
          onChange={(_, data) => setTerm(data.value)}
          onKeyDown={handleKeyDown}
        />
        <Button appearance="primary" onClick={() => runSearch(term, activeSources, versionFilter, loaderFilter)} disabled={loading}>
          Search
        </Button>
        <Button
          appearance="subtle"
          icon={<ArrowClockwise20Regular />}
          title="Refresh"
          onClick={() => runSearch(term, activeSources, versionFilter, loaderFilter)}
        />
      </div>

      <div className={styles.chips}>
        {allSources.map((source) => {
          const active = activeSources.includes(source)
          return (
            <button
              key={source}
              type="button"
              className={mergeClasses(styles.chip, active && styles.chipActive)}
              onClick={() => toggleSource(source)}
              aria-pressed={active}
            >
              <span className={styles.chipDot} style={{ backgroundColor: sourceColors[source] }} />
              {pluginSourceLabels[source]}
            </button>
          )
        })}
      </div>

      <div className={styles.filters}>
        <Field label="Minecraft version" className={styles.filterField}>
          <Input
            size="small"
            value={versionFilter}
            placeholder="Any"
            onChange={(_, d) => setVersionFilter(d.value)}
            onKeyDown={handleKeyDown}
          />
        </Field>
        <Field label="Loader" className={styles.filterField}>
          <Dropdown
            size="small"
            value={loaderOptions.find((o) => o.value === loaderFilter)?.label ?? 'Any'}
            selectedOptions={[loaderFilter]}
            onOptionSelect={(_, d) => {
              const next = d.optionValue ?? ''
              setLoaderFilter(next)
              runSearch(term, activeSources, versionFilter, next)
            }}
          >
            {loaderOptions.map((option) => (
              <Option key={option.value || 'any'} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        {(versionFilter || loaderFilter) && (
          <Button
            size="small"
            appearance="subtle"
            onClick={() => {
              setVersionFilter('')
              setLoaderFilter('')
              runSearch(term, activeSources, '', '')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {errors.length > 0 && (
        <div className={styles.warnings}>
          {errors.map((e) => (
            <MessageBar key={e.source} intent="warning">
              <MessageBarBody>
                {pluginSourceLabels[e.source]}: {e.message}
              </MessageBarBody>
            </MessageBar>
          ))}
        </div>
      )}

      <div className={styles.scroller}>
        {loading && results.length === 0 && (
          <div className={styles.centered}>
            <Spinner label="Searching…" />
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className={styles.centered}>
            <Text>No plugins matched. Try a different search or enable more sources.</Text>
          </div>
        )}

        {results.length > 0 && (
          <div className={styles.grid}>
            {results.map((plugin) => (
              <PluginCard
                key={`${plugin.source}:${plugin.id}`}
                plugin={plugin}
                canInstall={instances.length > 0}
                onInstall={setInstallTarget}
              />
            ))}
          </div>
        )}
      </div>

      <InstallDialog
        plugin={installTarget}
        instances={instances}
        preselectedInstanceId={scopedInstanceId}
        onClose={() => setInstallTarget(null)}
        onInstalled={() => undefined}
      />
    </div>
  )
}
