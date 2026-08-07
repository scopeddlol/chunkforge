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
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Dropdown,
  Option,
  Field,
  ProgressBar,
  Badge
} from '@fluentui/react-components'
import { Search24Regular, ArrowDownload20Regular, Open16Regular } from '@fluentui/react-icons'
import {
  serverTypeLabels,
  type InstanceSummary,
  type ModpackInstallProgress,
  type PluginSearchResult,
  type PluginVersion,
  type ServerType
} from '@shared/types'
import { SourceBadge } from '../../components/SourceBadge'
import { useInstancesStore } from '../../state/instancesStore'
import { api, onEvent } from '../../api'
import { native } from '../../native'

const useStyles = makeStyles({
  root: { flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '28px 36px 0' },
  header: { marginBottom: '18px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  controls: { display: 'flex', gap: '10px', marginBottom: '16px' },
  search: { flexGrow: 1 },
  scroller: { flexGrow: 1, overflowY: 'auto', paddingBottom: '28px', minHeight: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  head: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  icon: { width: '44px', height: '44px', borderRadius: tokens.borderRadiusMedium, flexShrink: 0 },
  titleBlock: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flexGrow: 1 },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  author: { color: tokens.colorNeutralForeground3 },
  summary: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    minHeight: '36px',
    lineHeight: '18px'
  },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  muted: { color: tokens.colorNeutralForeground3 },
  centered: { display: 'flex', justifyContent: 'center', padding: '64px 0' },
  // minWidth must yield on narrow windows or the dialog pushes past the viewport.
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 'min(400px, 100%)',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflowWrap: 'anywhere'
  },
  dialogSurface: { maxWidth: 'min(560px, calc(100vw - 48px))' },
  dialogTitle: { overflowWrap: 'anywhere' },
  // Badges size to content; inside a Field they would otherwise stretch full width.
  inlineBadge: { alignSelf: 'flex-start' },
  progressBlock: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }
})

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

export function ModpackPage(): JSX.Element {
  const styles = useStyles()
  const { instances, refresh } = useInstancesStore()

  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PluginSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<PluginSearchResult | null>(null)
  const [versions, setVersions] = useState<PluginVersion[] | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [packTarget, setPackTarget] = useState<{ serverType: ServerType; minecraftVersion: string } | null>(
    null
  )
  const [progress, setProgress] = useState<ModpackInstallProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (query: string) => {
    setLoading(true)
    try {
      setResults(await api().modpacks.search(query))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    search('')
    if (instances.length === 0) refresh()
  }, [search, instances.length, refresh])

  useEffect(() => {
    return onEvent('modpack-progress', (event) => setProgress(event))
  }, [])

  async function openInstall(pack: PluginSearchResult): Promise<void> {
    setTarget(pack)
    setVersions(null)
    setVersionId(null)
    setPackTarget(null)
    setProgress(null)
    setError(null)
    setInstanceId(instances[0]?.id ?? null)
    try {
      const list = await api().modpacks.versions(pack.source, pack.id)
      setVersions(list)
      setVersionId(list.find((v) => v.downloadUrl)?.id ?? list[0]?.id ?? null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const selectedVersion = versions?.find((v) => v.id === versionId) ?? null
  const selectedInstance = instances.find((i) => i.id === instanceId)

  // Inspecting the archive is what tells us which loader the pack actually needs.
  useEffect(() => {
    if (!target || !selectedVersion?.downloadUrl) return
    let cancelled = false
    setPackTarget(null)
    api()
      .modpacks.inspect(target.source, selectedVersion.downloadUrl)
      .then((t) => !cancelled && setPackTarget(t))
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [target, selectedVersion])

  const mismatch =
    packTarget && selectedInstance
      ? packTarget.serverType !== selectedInstance.serverType ||
        packTarget.minecraftVersion !== selectedInstance.minecraftVersion
      : false

  async function install(): Promise<void> {
    if (!target || !selectedVersion?.downloadUrl || !instanceId) return
    setError(null)
    try {
      await api().modpacks.install(instanceId, target.source, selectedVersion.downloadUrl)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title2>Modpacks</Title2>
        <Text className={styles.subtitle} block>
          Install a full modpack onto an existing Forge, NeoForge, or Fabric server.
        </Text>
      </div>

      <div className={styles.controls}>
        <Input
          className={styles.search}
          value={term}
          placeholder="Search modpacks — try “create”, “better mc”, “cobblemon”…"
          contentBefore={<Search24Regular />}
          onChange={(_, d) => setTerm(d.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') search(term)
          }}
        />
        <Button appearance="primary" disabled={loading} onClick={() => search(term)}>
          Search
        </Button>
      </div>

      {error && !target && (
        <MessageBar intent="warning">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.scroller}>
        {loading && !results && (
          <div className={styles.centered}>
            <Spinner label="Searching modpacks…" />
          </div>
        )}

        {results && (
          <div className={styles.grid}>
            {results.map((pack) => (
              <div className={styles.card} key={`${pack.source}:${pack.id}`}>
                <div className={styles.head}>
                  {pack.iconUrl && <img className={styles.icon} src={pack.iconUrl} alt="" loading="lazy" />}
                  <div className={styles.titleBlock}>
                    <Text weight="semibold" className={styles.name}>
                      {pack.name}
                    </Text>
                    <Text size={200} className={styles.author}>
                      by {pack.author}
                    </Text>
                  </div>
                  <SourceBadge source={pack.source} />
                </div>
                <Text size={200} className={styles.summary}>
                  {pack.summary}
                </Text>
                <div className={styles.footer}>
                  <Text size={200} className={styles.muted}>
                    {formatDownloads(pack.downloads)} downloads
                  </Text>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<Open16Regular />}
                      onClick={() => native().openExternal(pack.sourceUrl)}
                    />
                    <Button
                      appearance="primary"
                      size="small"
                      icon={<ArrowDownload20Regular />}
                      disabled={instances.length === 0}
                      onClick={() => openInstall(pack)}
                    >
                      Install
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={target !== null} onOpenChange={(_, d) => !d.open && setTarget(null)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle className={styles.dialogTitle}>Install {target?.name}</DialogTitle>
            <DialogContent className={styles.dialogBody}>
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}

              <Field label="Install onto server">
                <Dropdown
                  value={selectedInstance?.name ?? 'No servers yet'}
                  selectedOptions={instanceId ? [instanceId] : []}
                  onOptionSelect={(_, d) => setInstanceId(d.optionValue ?? null)}
                >
                  {instances.map((instance: InstanceSummary) => (
                    <Option key={instance.id} value={instance.id}>
                      {`${instance.name} (${serverTypeLabels[instance.serverType]} ${instance.minecraftVersion})`}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              {!versions && <Spinner size="tiny" label="Loading pack versions…" />}

              {versions && (
                <Field label="Pack version">
                  <Dropdown
                    value={selectedVersion?.name ?? ''}
                    selectedOptions={versionId ? [versionId] : []}
                    onOptionSelect={(_, d) => setVersionId(d.optionValue ?? null)}
                  >
                    {versions.map((v) => (
                      <Option key={v.id} value={v.id}>
                        {v.name}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
              )}

              {packTarget && (
                <Field label="Pack requires">
                  <Badge className={styles.inlineBadge} appearance="tint" color={mismatch ? 'warning' : 'success'}>
                    {serverTypeLabels[packTarget.serverType]} {packTarget.minecraftVersion}
                  </Badge>
                </Field>
              )}

              {mismatch && (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    This pack targets a different loader or Minecraft version than the selected server.
                    Installing anyway will most likely fail to boot.
                  </MessageBarBody>
                </MessageBar>
              )}

              {progress && (
                <div className={styles.progressBlock}>
                  <ProgressBar value={progress.percent / 100} />
                  <Text size={200}>{progress.message}</Text>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setTarget(null)}>
                {progress?.stage === 'done' ? 'Close' : 'Cancel'}
              </Button>
              <Button
                appearance="primary"
                disabled={
                  !selectedVersion?.downloadUrl ||
                  !instanceId ||
                  (progress !== null && progress.stage !== 'done')
                }
                onClick={install}
              >
                {progress && progress.stage !== 'done' ? 'Installing…' : 'Install Modpack'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
