import { useState, type JSX } from 'react'
import { Button, Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { Copy16Regular, Checkmark16Regular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  address: { fontFamily: 'Consolas, monospace', color: tokens.colorNeutralForeground2 }
})

interface CopyableAddressProps {
  address: string
  size?: 200 | 300
}

/** An address plus a one-click copy button, since typing a subdomain by hand is how it gets typo'd. */
export function CopyableAddress({ address, size = 200 }: CopyableAddressProps): JSX.Element {
  const styles = useStyles()
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <span className={styles.root}>
      <Text size={size} className={styles.address}>
        {address}
      </Text>
      <Tooltip content={copied ? 'Copied!' : 'Copy address'} relationship="label">
        <Button
          appearance="subtle"
          size="small"
          icon={copied ? <Checkmark16Regular /> : <Copy16Regular />}
          onClick={(e) => {
            e.stopPropagation()
            void copy()
          }}
        />
      </Tooltip>
    </span>
  )
}
