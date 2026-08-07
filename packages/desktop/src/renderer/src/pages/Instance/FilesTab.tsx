import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  Textarea,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  BreadcrumbDivider,
  MessageBar,
  MessageBarBody,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem
} from '@fluentui/react-components'
import {
  Folder20Filled,
  Document20Regular,
  ArrowLeft20Regular,
  Save20Regular,
  MoreHorizontal20Regular,
  ArrowClockwise20Regular,
  FolderOpen20Regular
} from '@fluentui/react-icons'
import type { FileEntry } from '@shared/types'
import { api } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '10px', flexGrow: 1, minHeight: 0 },
  toolbar: { display: 'flex', gap: '8px', alignItems: 'center' },
  crumbs: { flexGrow: 1, overflow: 'hidden' },
  list: { display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto', flexGrow: 1, minHeight: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover }
  },
  folderIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  fileIcon: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  name: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  editor: { display: 'flex', flexDirection: 'column', gap: '10px', flexGrow: 1, minHeight: 0 },
  editorHeader: { display: 'flex', alignItems: 'center', gap: '8px' },
  editorPath: { flexGrow: 1, color: tokens.colorNeutralForeground2 },
  textarea: {
    flexGrow: 1,
    minHeight: 0,
    '& textarea': {
      height: '100%',
      fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
      fontSize: '12.5px',
      lineHeight: '19px'
    }
  }
})

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

interface FilesTabProps {
  instanceId: string
}

export function FilesTab({ instanceId }: FilesTabProps): JSX.Element {
  const styles = useStyles()
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ path: string; contents: string; dirty: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    (target: string) => {
      setError(null)
      api()
        .files.list(instanceId, target)
        .then(setEntries)
        .catch((err: Error) => setError(err.message))
    },
    [instanceId]
  )

  useEffect(() => load(path), [load, path])

  async function openEntry(entry: FileEntry): Promise<void> {
    if (entry.isDirectory) {
      setPath(entry.relativePath)
      return
    }
    if (!entry.editable) {
      setError(`${entry.name} isn't a text file Chunkforge can edit.`)
      return
    }
    try {
      const { content } = await api().files.read(instanceId, entry.relativePath)
      setEditing({ path: entry.relativePath, contents: content, dirty: false })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function save(): Promise<void> {
    if (!editing) return
    setSaving(true)
    try {
      await api().files.write(instanceId, editing.path, editing.contents)
      setEditing({ ...editing, dirty: false })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(entry: FileEntry): Promise<void> {
    try {
      await api().files.remove(instanceId, entry.relativePath)
      load(path)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (editing) {
    return (
      <div className={styles.editor}>
        <div className={styles.editorHeader}>
          <Button
            appearance="subtle"
            icon={<ArrowLeft20Regular />}
            onClick={() => setEditing(null)}
          >
            Back
          </Button>
          <Text weight="semibold" className={styles.editorPath}>
            {editing.path}
            {editing.dirty ? ' •' : ''}
          </Text>
          <Button
            appearance="primary"
            icon={<Save20Regular />}
            disabled={!editing.dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        <Textarea
          className={styles.textarea}
          value={editing.contents}
          onChange={(_, d) => setEditing({ ...editing, contents: d.value, dirty: true })}
        />
      </div>
    )
  }

  const segments = path ? path.split('/') : []

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Breadcrumb className={styles.crumbs} size="small">
          <BreadcrumbItem>
            <BreadcrumbButton onClick={() => setPath('')} current={segments.length === 0}>
              Server root
            </BreadcrumbButton>
          </BreadcrumbItem>
          {segments.map((segment, index) => (
            <BreadcrumbItem key={segment + index}>
              <BreadcrumbDivider />
              <BreadcrumbButton
                current={index === segments.length - 1}
                onClick={() => setPath(segments.slice(0, index + 1).join('/'))}
              >
                {segment}
              </BreadcrumbButton>
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
        <Button appearance="subtle" icon={<ArrowClockwise20Regular />} title="Refresh" onClick={() => load(path)} />
        <Button
          appearance="subtle"
          icon={<FolderOpen20Regular />}
          title="Open in Explorer"
          onClick={() => window.native.openFolder(instanceId)}
        />
      </div>

      {error && (
        <MessageBar intent="warning">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {!entries ? (
        <Spinner size="tiny" label="Reading folder…" />
      ) : (
        <div className={styles.list}>
          {segments.length > 0 && (
            <button className={styles.row} onClick={() => setPath(segments.slice(0, -1).join('/'))}>
              <ArrowLeft20Regular className={styles.fileIcon} />
              <Text className={styles.name}>..</Text>
            </button>
          )}
          {entries.length === 0 && segments.length === 0 && (
            <Text className={styles.meta}>This folder is empty.</Text>
          )}
          {entries.map((entry) => (
            <div className={styles.row} key={entry.relativePath}>
              <span
                style={{ display: 'contents', cursor: 'pointer' }}
                onClick={() => openEntry(entry)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openEntry(entry)
                }}
              >
                {entry.isDirectory ? (
                  <Folder20Filled className={styles.folderIcon} />
                ) : (
                  <Document20Regular className={styles.fileIcon} />
                )}
                <Text className={styles.name}>{entry.name}</Text>
                <Text size={200} className={styles.meta}>
                  {entry.isDirectory ? '' : formatSize(entry.sizeBytes)}
                </Text>
              </span>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {entry.editable && <MenuItem onClick={() => openEntry(entry)}>Edit</MenuItem>}
                    <MenuItem onClick={() => remove(entry)}>Delete</MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
