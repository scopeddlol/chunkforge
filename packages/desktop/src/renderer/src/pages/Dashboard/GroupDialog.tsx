import { useEffect, useState, type JSX } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  Checkbox,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
  mergeClasses
} from '@fluentui/react-components'
import { Checkmark16Filled } from '@fluentui/react-icons'
import type { InstanceSummary, ServerGroup } from '@shared/types'
import { api } from '../../api'

const GROUP_COLORS = ['#8B5CF6', '#2EBD59', '#3E9CF2', '#E0459C', '#E0475E', '#E0C22E', '#22B8CF', '#F97316']

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '380px' },
  swatches: { display: 'flex', gap: '8px' },
  swatch: {
    width: '28px',
    height: '28px',
    borderRadius: tokens.borderRadiusCircular,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    outlineOffset: '2px'
  },
  swatchSelected: { outline: `2px solid ${tokens.colorNeutralForeground1}` },
  list: { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '220px', overflowY: 'auto' },
  muted: { color: tokens.colorNeutralForeground3 }
})

interface GroupDialogProps {
  open: boolean
  instances: InstanceSummary[]
  /** The group being edited, or null to create a new one. */
  group?: ServerGroup | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Creates a group, or edits an existing one — name, colour and which servers
 * are in it. Editing membership here rather than only at creation is what lets
 * a group be corrected after the fact instead of deleted and rebuilt.
 */
export function GroupDialog({
  open,
  instances,
  group = null,
  onClose,
  onSaved
}: GroupDialogProps): JSX.Element {
  const styles = useStyles()
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editing = group !== null

  useEffect(() => {
    if (!open) return
    setName(group?.name ?? '')
    setColor(group?.color ?? GROUP_COLORS[0])
    // Membership is read from the servers themselves, which is the only place
    // it is recorded — a group has no member list of its own.
    setSelected(group ? instances.filter((i) => i.groupId === group.id).map((i) => i.id) : [])
    setError(null)
  }, [open, group, instances])

  /**
   * Creates the group, then puts the chosen servers in it.
   *
   * The group is created first and kept even if some assignments fail: losing
   * the group as well would throw away the part that did work. Whatever went
   * wrong is reported here rather than escaping as an unhandled rejection —
   * which is what previously left the dialog sitting open with no explanation.
   */
  async function save(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const target = group
        ? (await api().groups.rename(group.id, name.trim(), color), group)
        : await api().groups.create(name.trim(), color)

      // Only the difference is written. Re-assigning every member on each save
      // would be a pile of needless writes, and on a node each one is a round
      // trip through Portal.
      const before = editing ? instances.filter((i) => i.groupId === target.id).map((i) => i.id) : []
      const added = selected.filter((id) => !before.includes(id))
      const removed = before.filter((id) => !selected.includes(id))

      const failed: string[] = []
      const nameFor = (id: string): string => instances.find((i) => i.id === id)?.name ?? id
      // Sequential so a failure part-way still leaves the rest intact.
      for (const id of added) {
        try {
          await api().groups.assign(id, target.id)
        } catch {
          failed.push(nameFor(id))
        }
      }
      for (const id of removed) {
        try {
          await api().groups.assign(id, null)
        } catch {
          failed.push(nameFor(id))
        }
      }

      onSaved()
      if (failed.length > 0) {
        // The group itself is kept: discarding it would throw away the part
        // that did work.
        setError(`Saved, but these servers could not be updated: ${failed.join(', ')}`)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that group.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{editing ? `Edit ${group?.name}` : 'New server group'}</DialogTitle>
          <DialogContent className={styles.body}>
            {error && (
              <MessageBar intent="warning">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            <Field label="Group name">
              <Input
                value={name}
                placeholder="Survival Network"
                onChange={(_, d) => setName(d.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) void save()
                }}
              />
            </Field>

            <Field label="Colour">
              <div className={styles.swatches}>
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    className={mergeClasses(styles.swatch, color === c && styles.swatchSelected)}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <Checkmark16Filled />}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Servers in this group">
              {instances.length === 0 ? (
                <Text className={styles.muted}>No servers to add yet.</Text>
              ) : (
                <div className={styles.list}>
                  {instances.map((instance) => (
                    <Checkbox
                      key={instance.id}
                      label={instance.name}
                      checked={selected.includes(instance.id)}
                      onChange={(_, d) =>
                        setSelected((prev) =>
                          d.checked ? [...prev, instance.id] : prev.filter((i) => i !== instance.id)
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </Field>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="primary" disabled={!name.trim() || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Group'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
