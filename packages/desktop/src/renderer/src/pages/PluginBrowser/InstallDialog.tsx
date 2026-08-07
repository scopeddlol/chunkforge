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
    setInstanceId(preselectedInstanceId ?? instances[0]?.id ?? null)
    setChosenSource(plugin.source)
  }, [plugin, preselectedInstanceId, instances])

  // Versions are per-source, so they reload whenever the source changes.
  useEffect(() => {
    if (!plugin || !chosenSource) return
    const choice = sourceChoices.find((c) => c.source === chosenSource)
    if (!choice) return

    let cancelled = false
    setVersions(null)
    setSelectedVersionId(null)

    api()
      .addons.versions(choice.source, choice.id)
      .then((result) => {
        if (cancelled) return
        setVersions(result)
        setSelectedVersionId(result[0]?.id ?? null)
      })
      .catch((err: Error) => !cancelled && setError(err.message))

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, chosenSource])

  const selectedInstance = instances.find((i) => i.id === instanceId)
  const selectedVersion = versions?.find((v) => v.id === selectedVersionId) ?? null

  // Surface compatibility rather than silently installing a mismatched build.
  const compatible =
    selectedVersion && selectedInstance && selectedVersion.gameVersions.length > 0
      ? selectedVersion.gameVersions.includes(selectedInstance.minecraftVersion)
      : null

  async function handleInstall(): Promise<void> {
    if (!plugin || !selectedVersion || !instanceId) return
    setInstalling(true)
    setError(null)
    try {
      await api().addons.install(instanceId, selectedVersion, plugin.name)
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

            {versions && versions.length > 0 && (
              <Field label="Version">
                <Dropdown
                  value={selectedVersion?.name ?? ''}
                  selectedOptions={selectedVersionId ? [selectedVersionId] : []}
                  onOptionSelect={(_, data) => setSelectedVersionId(data.optionValue ?? null)}
                >
                  {versions.map((version) => (
                    <Option key={version.id} value={version.id}>
                      {version.name}
                    </Option>
                  ))}
                </Dropdown>
                {selectedVersion && (
                  <div className={styles.versionMeta}>
                    {compatible === true && (
                      <Badge appearance="tint" color="success">
                        Compatible with {selectedInstance?.minecraftVersion}
                      </Badge>
                    )}
                    {compatible === false && (
                      <Badge appearance="tint" color="warning">
                        Not listed for {selectedInstance?.minecraftVersion}
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
              appearance="primary"
              disabled={!selectedVersion?.downloadUrl || !instanceId || installing || done}
              onClick={handleInstall}
            >
              {installing ? 'Installing…' : 'Install'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
