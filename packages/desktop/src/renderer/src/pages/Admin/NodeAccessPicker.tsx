import type { JSX } from 'react'
import { Checkbox, Radio, RadioGroup, Text, makeStyles, tokens } from '@fluentui/react-components'
import type { Node } from '@shared/types'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '8px' },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '190px',
    overflowY: 'auto',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2
  },
  hint: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  offline: { color: tokens.colorNeutralForeground4, fontSize: '11px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  empty: { color: tokens.colorNeutralForeground3, padding: '6px 2px' }
})

/**
 * The local node is called "This machine" by default, so blindly appending
 * "(this machine)" stutters. The suffix is only there for an operator who has
 * renamed it to something that no longer says where it is.
 */
function labelFor(node: Node): string {
  if (node.kind !== 'local') return node.name
  return /this machine/i.test(node.name) ? node.name : `${node.name} (this machine)`
}

interface NodeAccessPickerProps {
  nodes: Node[]
  /** null means unrestricted — every node, including ones added later. */
  value: string[] | null
  onChange: (value: string[] | null) => void
  disabled?: boolean
}

/**
 * Choosing which machines an account may use.
 *
 * "Every node" is a separate choice from "these nodes", not a checkbox state
 * that happens to have everything ticked. The two differ in the future: an
 * unrestricted account picks up nodes added next month, a list of every node
 * ticked today does not. Collapsing them would quietly narrow someone's access
 * the next time the operator paired a machine.
 */
export function NodeAccessPicker({ nodes, value, onChange, disabled }: NodeAccessPickerProps): JSX.Element {
  const styles = useStyles()
  const restricted = value !== null
  const selected = value ?? []

  function toggle(nodeId: string, checked: boolean): void {
    const next = checked ? [...selected, nodeId] : selected.filter((id) => id !== nodeId)
    onChange(next)
  }

  return (
    <div className={styles.root}>
      <RadioGroup
        value={restricted ? 'some' : 'all'}
        disabled={disabled}
        onChange={(_, data) => onChange(data.value === 'all' ? null : [])}
      >
        <Radio value="all" label="Every node, including ones added later" />
        <Radio value="some" label="Only the nodes I pick" />
      </RadioGroup>

      {restricted && (
        <>
          <div className={styles.list}>
            {nodes.length === 0 && <Text className={styles.empty}>No nodes are paired yet.</Text>}
            {nodes.map((node) => (
              <div key={node.id} className={styles.row}>
                <Checkbox
                  label={labelFor(node)}
                  checked={selected.includes(node.id)}
                  disabled={disabled}
                  onChange={(_, data) => toggle(node.id, Boolean(data.checked))}
                />
                {node.status === 'offline' && <Text className={styles.offline}>offline</Text>}
              </div>
            ))}
          </div>
          {selected.length === 0 && (
            <Text className={styles.hint}>
              With nothing picked this account can see no servers at all.
            </Text>
          )}
        </>
      )}
    </div>
  )
}
