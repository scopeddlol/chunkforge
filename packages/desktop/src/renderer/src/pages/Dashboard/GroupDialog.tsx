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
  Text,
  makeStyles,
  tokens,
  mergeClasses
} from '@fluentui/react-components'
import { Checkmark16Filled } from '@fluentui/react-icons'
import type { InstanceSummary } from '@shared/types'

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
  onClose: () => void
  onSaved: () => void
}

export function GroupDialog({ open, instances, onClose, onSaved }: GroupDialogProps): JSX.Element {
  const styles = useStyles()
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setColor(GROUP_COLORS[0])
      setSelected([])
    }
  }, [open])

  async function save(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    try {
      const group = await window.chunkforge.groups.create(name.trim(), color)
      // Assignments are sequential so a failure part-way still leaves the rest intact.
      for (const id of selected) {
        await window.chunkforge.groups.assign(id, group.id)
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>New server group</DialogTitle>
          <DialogContent className={styles.body}>
            <Field label="Group name">
              <Input
                value={name}
                placeholder="Survival Network"
                onChange={(_, d) => setName(d.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) save()
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
            <Button appearance="primary" disabled={!name.trim() || saving} onClick={save}>
              {saving ? 'Creating…' : 'Create Group'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
