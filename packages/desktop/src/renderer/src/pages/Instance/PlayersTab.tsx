import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Badge,
  Input,
  Spinner,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MessageBar,
  MessageBarBody
} from '@fluentui/react-components'
import {
  PersonAdd20Regular,
  MoreHorizontal20Regular,
  People24Regular,
  ArrowClockwise20Regular
} from '@fluentui/react-icons'
import type { PlayerEntry } from '@shared/types'
import { api, onEvent } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, minHeight: 0 },
  toolbar: { display: 'flex', gap: '8px', alignItems: 'center' },
  grow: { flexGrow: 1 },
  hint: { color: tokens.colorNeutralForeground3 },
  list: { display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flexGrow: 1, minHeight: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  avatar: {
    width: '30px',
    height: '30px',
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground3,
    imageRendering: 'pixelated'
  },
  name: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tags: { display: 'flex', gap: '6px', flexShrink: 0 },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '56px 0',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center'
  }
})

interface PlayersTabProps {
  instanceId: string
  serverRunning: boolean
}

export function PlayersTab({ instanceId, serverRunning }: PlayersTabProps): JSX.Element {
  const styles = useStyles()
  const [players, setPlayers] = useState<PlayerEntry[] | null>(null)
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api()
      .players.list(instanceId)
      .then(setPlayers)
      .catch((err: Error) => setError(err.message))
  }, [instanceId])

  useEffect(load, [load])

  // Join/leave events refresh the roster without polling.
  useEffect(() => {
    return onEvent('players', (event) => {
      if (event.instanceId === instanceId) load()
    })
  }, [instanceId, load])

  async function act(action: string, name: string): Promise<void> {
    setError(null)
    try {
      await api().players.action(instanceId, action, name)
      // The server writes ops/whitelist files a beat after the command runs.
      setTimeout(load, 400)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (error && !players) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    )
  }

  if (!players) return <Spinner size="tiny" label="Loading players…" />

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="warning">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.toolbar}>
        <Input
          className={styles.grow}
          value={invite}
          placeholder="Player name — add to whitelist…"
          onChange={(_, d) => setInvite(d.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invite.trim() && serverRunning) {
              act('whitelistAdd', invite.trim())
              setInvite('')
            }
          }}
        />
        <Button
          icon={<PersonAdd20Regular />}
          disabled={!serverRunning || !invite.trim()}
          onClick={() => {
            act('whitelistAdd', invite.trim())
            setInvite('')
          }}
        >
          Whitelist
        </Button>
        <Button appearance="subtle" icon={<ArrowClockwise20Regular />} title="Refresh" onClick={load} />
      </div>

      {!serverRunning && (
        <Text size={200} className={styles.hint}>
          Start the server to moderate players — these actions run as console commands.
        </Text>
      )}

      {players.length === 0 ? (
        <div className={styles.empty}>
          <People24Regular fontSize={32} />
          <Text>No players yet. Anyone who joins, or is opped/whitelisted/banned, shows up here.</Text>
        </div>
      ) : (
        <div className={styles.list}>
          {players.map((player) => (
            <div className={styles.row} key={player.name}>
              <img
                className={styles.avatar}
                src={`https://minotar.net/helm/${encodeURIComponent(player.name)}/30.png`}
                alt=""
                loading="lazy"
              />
              <Text weight={player.online ? 'semibold' : 'regular'} className={styles.name}>
                {player.name}
              </Text>
              <div className={styles.tags}>
                {player.online && (
                  <Badge appearance="filled" color="success">
                    Online
                  </Badge>
                )}
                {player.op && (
                  <Badge appearance="tint" color="brand">
                    OP
                  </Badge>
                )}
                {player.whitelisted && (
                  <Badge appearance="outline" color="informative">
                    Whitelist
                  </Badge>
                )}
                {player.banned && (
                  <Badge appearance="tint" color="danger">
                    Banned
                  </Badge>
                )}
              </div>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<MoreHorizontal20Regular />}
                    disabled={!serverRunning}
                  />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {player.op ? (
                      <MenuItem onClick={() => act('deop', player.name)}>Remove operator</MenuItem>
                    ) : (
                      <MenuItem onClick={() => act('op', player.name)}>Make operator</MenuItem>
                    )}
                    {player.whitelisted ? (
                      <MenuItem onClick={() => act('whitelistRemove', player.name)}>
                        Remove from whitelist
                      </MenuItem>
                    ) : (
                      <MenuItem onClick={() => act('whitelistAdd', player.name)}>Add to whitelist</MenuItem>
                    )}
                    {player.online && <MenuItem onClick={() => act('kick', player.name)}>Kick</MenuItem>}
                    {player.banned ? (
                      <MenuItem onClick={() => act('pardon', player.name)}>Unban</MenuItem>
                    ) : (
                      <MenuItem onClick={() => act('ban', player.name)}>Ban</MenuItem>
                    )}
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
