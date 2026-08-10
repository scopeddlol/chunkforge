import { useCallback, useEffect, useState, type JSX, type KeyboardEvent } from 'react'
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Input,
  Button,
  Spinner,
  Switch,
  MessageBar,
  MessageBarBody,
  Field,
  Dropdown,
  Option,
  mergeClasses
} from '@fluentui/react-components'
import { Search24Regular, ArrowClockwise20Regular } from '@fluentui/react-icons'
import {
  platformsForServer,
  pluginSourceLabels,
  type PluginSearchResult,
  type PluginSource,
  type InstanceSummary,
  type ServerType
} from '@shared/types'
import { sourceColors } from '../../components/SourceBadge'
import type { GameVersionOption } from '@shared/types'
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

/**
 * The loader id a source should be asked about for a given server.
 *
 * The first entry of the server's platform list is its own name, which is the
 * narrowest true answer — a Purpur server asks for `purpur` and gets Purpur,
 * Paper, Spigot and Bukkit content, because sources tag a project with every
 * platform it supports rather than only the newest.
 */
function primaryPlatform(serverType: ServerType): string | undefined {
  return platformsForServer(serverType)[0]
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
  const [gameVersions, setGameVersions] = useState<GameVersionOption[]>([])
  // The server results are judged against. Attaching one replaces the manual
  // version and loader pickers, because the server already knows both and
  // keeping two sources of truth is how they end up disagreeing.
  const [attachedId, setAttachedId] = useState<string | null>(scopedInstanceId)
  const [hideIncompatible, setHideIncompatible] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [filteredOut, setFilteredOut] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (instances.length === 0) refresh()
  }, [instances.length, refresh])

  // Mojang's own release list, so the options are the same on every tab
  // regardless of which sources happen to be enabled.
  useEffect(() => {
    let cancelled = false
    api()
      .addons.gameVersions()
      .then((versions) => {
        if (!cancelled) setGameVersions(versions)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * One search path for both the first page and every page after it. `offset`
   * of zero replaces the grid; anything else appends, which is what keeps
   * scrolling continuous instead of restarting the list.
   */
  const runSearch = useCallback(
    async (
      query: string,
      sources: PluginSource[],
      version: string,
      loader: string,
      options?: { offset?: number; attached?: InstanceSummary | null; hide?: boolean }
    ) => {
      const offset = options?.offset ?? 0
      const attached = options?.attached
      const append = offset > 0
      if (append) setLoadingMore(true)
      else setLoading(true)
      try {
        const response = await api().addons.search({
          query,
          sources,
          // An attached server decides both, so the pickers stop mattering.
          gameVersion: attached?.minecraftVersion ?? version ?? undefined,
          /**
           * Tell the source what the server runs.
           *
           * This used to send nothing when a server was attached, on the
           * grounds that `serverType` already said it — but the loader is what
           * sources filter their catalogue by, and without it a Paper server
           * was searching the whole of Modrinth and judging afterwards. Naming
           * the platform is what makes a Paper-compatible mod show up at all.
           */
          loader: attached ? primaryPlatform(attached.serverType) : loader || undefined,
          serverType: attached?.serverType,
          hideIncompatible: attached ? (options?.hide ?? hideIncompatible) : false,
          /**
           * With a server attached the tabs stop dividing anything useful: a
           * Paper server wants everything that runs on Paper, and several of
           * those are typed as mods by their source.
           */
          kind: attached ? undefined : mode === 'mods' ? 'mod' : 'plugin',
          offset,
          limit: 20
        })
        setResults((prev) => (append ? [...prev, ...response.results] : response.results))
        setErrors(response.errors)
        setHasMore(response.hasMore)
        setNextOffset(response.nextOffset)
        setFilteredOut((prev) => (append ? prev + (response.filteredOut ?? 0) : response.filteredOut ?? 0))
      } catch (err) {
        setErrors([{ source: 'modrinth', message: (err as Error).message }])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [hideIncompatible, mode]
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
    void runSearch(term, next, versionFilter, loaderFilter, { attached: attached ?? null })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') search()
  }

  const attached: InstanceSummary | undefined = attachedId
    ? instances.find((i) => i.id === attachedId)
    : undefined
  const scopedInstance = attached

  function search(overrides?: { offset?: number; hide?: boolean }): void {
    void runSearch(term, activeSources, versionFilter, loaderFilter, {
      attached: attached ?? null,
      ...overrides
    })
  }

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
        <Button appearance="primary" onClick={() => search()} disabled={loading}>
          Search
        </Button>
        <Button
          appearance="subtle"
          icon={<ArrowClockwise20Regular />}
          title="Refresh"
          onClick={() => search()}
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
        <Field label="For server" className={styles.filterField}>
          <Dropdown
            size="small"
            value={attached ? attached.name : 'Not attached'}
            selectedOptions={[attachedId ?? '']}
            onOptionSelect={(_, d) => {
              const next = d.optionValue || null
              setAttachedId(next)
              const target = next ? instances.find((i) => i.id === next) ?? null : null
              void runSearch(term, activeSources, versionFilter, loaderFilter, { attached: target })
            }}
          >
            <Option value="">Not attached</Option>
            {instances.map((instance) => (
              <Option key={instance.id} value={instance.id}>
                {`${instance.name} — ${instance.serverType} ${instance.minecraftVersion}`}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Field
          label="Minecraft version"
          className={styles.filterField}
          hint={attached ? 'From the attached server' : undefined}
        >
          <Dropdown
            size="small"
            disabled={Boolean(attached)}
            value={attached ? attached.minecraftVersion : versionFilter || 'Any'}
            selectedOptions={[attached ? attached.minecraftVersion : versionFilter]}
            onOptionSelect={(_, d) => {
              const next = d.optionValue ?? ''
              setVersionFilter(next)
              void runSearch(term, activeSources, next, loaderFilter, { attached: null })
            }}
          >
            <Option value="">Any</Option>
            {gameVersions.map((version) => (
              <Option key={version.id} value={version.id}>
                {version.isLatest ? `${version.id} (latest)` : version.id}
              </Option>
            ))}
          </Dropdown>
        </Field>
        {attached && (
          <Field label="Compatibility" className={styles.filterField}>
            <Switch
              label={hideIncompatible ? 'Hiding incompatible' : 'Showing everything'}
              checked={hideIncompatible}
              onChange={(_, d) => {
                setHideIncompatible(d.checked)
                void runSearch(term, activeSources, versionFilter, loaderFilter, {
                  attached,
                  hide: d.checked
                })
              }}
            />
          </Field>
        )}
        <Field
          label="Loader"
          className={styles.filterField}
          hint={attached ? 'From the attached server' : undefined}
        >
          <Dropdown
            size="small"
            disabled={Boolean(attached)}
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

        {results.length > 0 && (
          <div className={styles.centered}>
            {filteredOut > 0 && (
              <Text size={200}>
                {filteredOut} result{filteredOut === 1 ? '' : 's'} hidden as incompatible with{' '}
                {attached?.name}.
              </Text>
            )}
            {hasMore ? (
              <Button
                appearance="secondary"
                disabled={loadingMore}
                onClick={() => search({ offset: nextOffset })}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            ) : (
              <Text size={200}>That is everything these sources have.</Text>
            )}
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
