import { useEffect, useState, type JSX } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  Switch,
  Text,
  Dropdown,
  Option,
  Field,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
  Badge
} from '@fluentui/react-components'
import { Open16Regular } from '@fluentui/react-icons'
import {
  pluginSourceLabels,
  type InstanceSummary,
  type PluginSearchResult,
  type PluginSource,
  type PluginVersion
} from '@shared/types'
import type { AddonEndpoint } from '@chunkforge/api/client'
import { api } from '../../api'
import { native } from '../../native'

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 'min(380px, 100%)',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflowWrap: 'anywhere'
  },
  surface: { maxWidth: 'min(560px, calc(100vw - 48px))' },
  title: { overflowWrap: 'anywhere' },
  versionMeta: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' },
  hint: { color: tokens.colorNeutralForeground3 }
})

interface InstallDialogProps {
  plugin: PluginSearchResult | null
  instances: InstanceSummary[]
  preselectedInstanceId: string | null
  onClose: () => void
  onInstalled: () => void
}

export function InstallDialog({
  plugin,
  instances,
  preselectedInstanceId,
  onClose,
  onInstalled
}: InstallDialogProps): JSX.Element {
  const styles = useStyles()
  const [versions, setVersions] = useState<PluginVersion[] | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [instanceId, setInstanceId] = useState<string | null>(preselectedInstanceId)
  const [chosenSource, setChosenSource] = useState<PluginSource | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [endpoint, setEndpoint] = useState<AddonEndpoint | null>(null)
  const [noMatchReason, setNoMatchReason] = useState<string | null>(null)
  const [showAllBuilds, setShowAllBuilds] = useState(false)

  // Every place this plugin can be fetched from, primary first.
  const sourceChoices = plugin
    ? [
        { source: plugin.source, id: plugin.id, downloads: plugin.downloads },
        ...(plugin.alternatives ?? []).map((a) => ({
          source: a.source,
          id: a.id,
          downloads: a.downloads
        }))
      ]
    : []

  useEffect(() => {
    if (!plugin) return
    setError(null)
    setDone(false)
    setEndpoint(null)
    setNoMatchReason(null)
    setShowAllBuilds(false)
    setInstanceId(preselectedInstanceId ?? instances[0]?.id ?? null)
    setChosenSource(plugin.source)
  }, [plugin, preselectedInstanceId, instances])

  /**
   * Ask the server which build fits, rather than working it out here.
   *
   * The answer depends on the target server, and the same question is asked
   * again by the installer before it writes anything. Two implementations of
   * that rule would eventually disagree, and the losing side is a user staring
   * at a greyed-out button for a plugin that would have worked fine.
   */
  useEffect(() => {
    if (!plugin || !chosenSource || !instanceId) return
    const choice = sourceChoices.find((c) => c.source === chosenSource)
    if (!choice) return

    let cancelled = false
    setVersions(null)
    setSelectedVersionId(null)
    setNoMatchReason(null)

    api()
      .addons.resolve(instanceId, { source: choice.source, projectId: choice.id, kind: plugin.kind })
      .then((resolved) => {
        if (cancelled) return
        setVersions(resolved.alternatives)
        // Already ordered best-match-first by the server, so the recommended
        // build is simply the one it picked.
        setSelectedVersionId(resolved.version?.id ?? null)
        setNoMatchReason(resolved.version ? null : (resolved.reason ?? 'No compatible build found.'))
      })
      .catch((err: Error) => !cancelled && setError(err.message))

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, chosenSource, instanceId])

  const selectedInstance = instances.find((i) => i.id === instanceId)
  const selectedVersion = versions?.find((v) => v.id === selectedVersionId) ?? null
  const verdict = selectedVersion?.compatibility ?? null
  /** A build the source has ruled out; installing it needs a deliberate override. */
  const knownWrong = verdict?.compatible === false && verdict.certain === true
  const usable = versions?.filter((v) => v.compatibility?.compatible !== false) ?? []
  const rejected = versions?.filter((v) => v.compatibility?.compatible === false) ?? []
  const shownVersions = showAllBuilds ? (versions ?? []) : usable

  async function handleInstall(): Promise<void> {
    if (!plugin || !selectedVersion || !instanceId) return
    setInstalling(true)
    setError(null)
    try {
      const choice = sourceChoices.find((c) => c.source === chosenSource)
      const result = await api().addons.install(
        instanceId,
        selectedVersion,
        plugin.name,
        choice?.id,
        // Only ever sent for a build the user picked *after* being told it is
        // wrong — the install refuses otherwise, which is what stops a bug up
        // here from putting a Fabric mod on a Paper server.
        knownWrong
      )
      /**
       * The add-on's port is open on the machine that runs the server; making
       * it reachable from outside is a Portal matter, and only this control
       * plane can ask. Best-effort — the install succeeded either way, and the
       * endpoint can be published from the server's Settings tab.
       */
      let endpointResult = result.endpoint
      if (endpointResult) {
        const published = await api()
          .endpoints.publish(instanceId, endpointResult.id)
          .catch(() => null)
        if (published) endpointResult = { ...published, configHint: endpointResult.configHint }
      }
      setEndpoint(endpointResult)
      setDone(true)
      onInstalled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed.')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog open={plugin !== null} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle className={styles.title}>Install {plugin?.name}</DialogTitle>
          <DialogContent className={styles.body}>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {done && (
              <MessageBar intent="success">
                <MessageBarBody>Installed to {selectedInstance?.name}. Restart the server to load it.</MessageBarBody>
              </MessageBar>
            )}
            {/*
              This add-on wants a port of its own, and Chunkforge has already
              opened one. The number is whatever was free rather than the one
              the add-on's documentation names, so it is worth stating plainly
              along with where to put it.
            */}
            {done && endpoint && (
              <MessageBar intent="info">
                <MessageBarBody>
                  {`Opened ${endpoint.protocol.toUpperCase()} port ${endpoint.localPort} for ${endpoint.label}. `}
                  {endpoint.publicHostname
                    ? `Reachable at ${endpoint.publicHostname}. `
                    : endpoint.publicPort
                      ? `Published on port ${endpoint.publicPort}. `
                      : ''}
                  {endpoint.configHint}
                </MessageBarBody>
              </MessageBar>
            )}

            {sourceChoices.length > 1 && (
              <Field label="Download from" hint="This plugin is published on more than one site.">
                <Dropdown
                  value={chosenSource ? pluginSourceLabels[chosenSource] : ''}
                  selectedOptions={chosenSource ? [chosenSource] : []}
                  onOptionSelect={(_, d) => setChosenSource((d.optionValue as PluginSource) ?? null)}
                >
                  {sourceChoices.map((choice) => (
                    <Option key={choice.source} value={choice.source}>
                      {`${pluginSourceLabels[choice.source]} — ${choice.downloads.toLocaleString()} downloads`}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            )}

            <Field label="Install to server">
              <Dropdown
                value={selectedInstance?.name ?? 'No servers yet'}
                selectedOptions={instanceId ? [instanceId] : []}
                disabled={instances.length === 0}
                onOptionSelect={(_, data) => setInstanceId(data.optionValue ?? null)}
              >
                {instances.map((instance) => (
                  <Option key={instance.id} value={instance.id}>
                    {`${instance.name} (${instance.serverType} ${instance.minecraftVersion})`}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            {!versions && !error && <Spinner size="tiny" label="Loading versions…" />}

            {versions && versions.length === 0 && (
              <Text className={styles.hint}>No downloadable versions were published for this plugin.</Text>
            )}

            {/*
              Nothing fits. Say what the project does offer instead — usually
              "this is a Fabric mod and yours is a Paper server", which answers
              the question on the spot rather than sending someone to a wiki.
            */}
            {noMatchReason && (
              <MessageBar intent="warning">
                <MessageBarBody>{noMatchReason}</MessageBarBody>
              </MessageBar>
            )}

            {versions && versions.length > 0 && (
              <Field
                label="Version"
                hint={
                  selectedInstance
                    ? `Chosen for ${selectedInstance.serverType} ${selectedInstance.minecraftVersion}`
                    : undefined
                }
              >
                <Dropdown
                  value={selectedVersion?.name ?? 'None that fit'}
                  selectedOptions={selectedVersionId ? [selectedVersionId] : []}
                  onOptionSelect={(_, data) => setSelectedVersionId(data.optionValue ?? null)}
                >
                  {shownVersions.map((version) => (
                    <Option key={version.id} value={version.id} text={version.name}>
                      {`${version.name}${version.compatibility?.compatible === false ? ` — ${version.compatibility.reason}` : ''}`}
                    </Option>
                  ))}
                </Dropdown>
                {selectedVersion && (
                  <div className={styles.versionMeta}>
                    {verdict?.compatible === true && verdict.certain && (
                      <Badge appearance="tint" color="success">
                        Built for {selectedInstance?.serverType} {selectedInstance?.minecraftVersion}
                      </Badge>
                    )}
                    {verdict?.compatible === true && !verdict.certain && (
                      <Badge appearance="tint" color="warning">
                        {verdict.reason ?? 'Not confirmed for this server'}
                      </Badge>
                    )}
                    {verdict?.compatible === false && (
                      <Badge appearance="tint" color="danger">
                        {verdict.reason ?? 'Not compatible'}
                      </Badge>
                    )}
                    {selectedVersion.gameVersions.slice(0, 3).map((gv) => (
                      <Badge key={gv} appearance="outline" color="informative">
                        {gv}
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>
            )}

            {/*
              The builds that were ruled out stay reachable, because the
              metadata is occasionally wrong and someone who knows that should
              not be stuck. Choosing one is a deliberate act with its own
              warning, not the default.
            */}
            {rejected.length > 0 && (
              <Switch
                label={
                  showAllBuilds
                    ? `Showing ${rejected.length} build${rejected.length === 1 ? '' : 's'} for other servers`
                    : `Show ${rejected.length} build${rejected.length === 1 ? '' : 's'} for other servers`
                }
                checked={showAllBuilds}
                onChange={(_, d) => setShowAllBuilds(d.checked)}
              />
            )}

            {knownWrong && (
              <MessageBar intent="error">
                <MessageBarBody>
                  {`This build is for ${selectedVersion?.loaders.join(', ') || 'another platform'}. Installing it on ${selectedInstance?.serverType} will not work unless you know something the listing does not.`}
                </MessageBarBody>
              </MessageBar>
            )}

            {selectedVersion && !selectedVersion.downloadUrl && selectedVersion.externalUrl && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  This one is hosted off-site, so it can&apos;t be installed automatically.
                </MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            {selectedVersion?.externalUrl && (
              <Button
                icon={<Open16Regular />}
                onClick={() => native().openExternal(selectedVersion.externalUrl as string)}
              >
                Open download page
              </Button>
            )}
            <Button appearance="secondary" onClick={onClose}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            <Button
              appearance={knownWrong ? 'outline' : 'primary'}
              disabled={!selectedVersion?.downloadUrl || !instanceId || installing || done}
              onClick={handleInstall}
            >
              {installing ? 'Installing…' : knownWrong ? 'Install anyway' : 'Install'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
