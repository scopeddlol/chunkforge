import { useEffect, useState, type JSX } from 'react'
import { makeStyles, tokens, Text } from '@fluentui/react-components'
import type { DashboardStats } from '@shared/types'
import { statusColors } from '../../theme/chunkforgeTheme'
import { api } from '../../api'

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
    gap: '12px',
    marginBottom: '24px'
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '14px 16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  label: {
    color: tokens.colorNeutralForeground4,
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  valueRow: { display: 'flex', alignItems: 'baseline', gap: '6px' },
  value: { fontSize: '22px', fontWeight: 600, lineHeight: '26px' },
  unit: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  sub: { color: tokens.colorNeutralForeground3, fontSize: '11px' },
  // Thin meter reads as a gauge without competing with the number above it.
  meter: {
    height: '4px',
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: 'hidden'
  },
  meterFill: {
    height: '100%',
    borderRadius: '2px',
    transitionProperty: 'width',
    transitionDuration: tokens.durationSlow
  }
})

function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes >= 1024 ** 4) return { value: (bytes / 1024 ** 4).toFixed(1), unit: 'TB' }
  if (bytes >= 1024 ** 3) return { value: (bytes / 1024 ** 3).toFixed(1), unit: 'GB' }
  if (bytes >= 1024 ** 2) return { value: (bytes / 1024 ** 2).toFixed(0), unit: 'MB' }
  return { value: (bytes / 1024).toFixed(0), unit: 'KB' }
}

/** Green under load, amber when busy, red when close to saturated. */
function loadColor(percent: number): string {
  if (percent >= 85) return statusColors.crashed
  if (percent >= 65) return statusColors.starting
  return statusColors.running
}

interface TileProps {
  label: string
  value: string
  unit?: string
  sub?: string
  percent?: number
  color?: string
}

function Tile({ label, value, unit, sub, percent, color }: TileProps): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.tile}>
      <Text className={styles.label}>{label}</Text>
      <div className={styles.valueRow}>
        <span className={styles.value}>{value}</span>
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {percent !== undefined && (
        <div className={styles.meter}>
          <div
            className={styles.meterFill}
            style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color ?? loadColor(percent) }}
          />
        </div>
      )}
      {sub && <Text className={styles.sub}>{sub}</Text>}
    </div>
  )
}

export function AnalyticsPanel(): JSX.Element | null {
  const styles = useStyles()
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = (): void => {
      api()
        .stats()
        .then((next) => {
          if (!cancelled) setStats(next)
        })
    }
    poll()
    // CPU is a delta between samples, so it needs repeated polling to mean anything.
    const timer = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (!stats) return null

  const memPercent = Math.round((stats.usedMemoryBytes / stats.totalMemoryBytes) * 100)
  const used = formatBytes(stats.usedMemoryBytes)
  const total = formatBytes(stats.totalMemoryBytes)
  const allocated = formatBytes(stats.allocatedMemoryBytes)
  const backups = formatBytes(stats.backupBytes)
  const disk = formatBytes(stats.diskBytes)

  return (
    <div className={styles.grid}>
      <Tile
        label="CPU"
        value={String(stats.cpuPercent)}
        unit="%"
        percent={stats.cpuPercent}
        sub={`${stats.cpuCores} cores`}
      />
      <Tile
        label="Memory"
        value={used.value}
        unit={`${used.unit} / ${total.value} ${total.unit}`}
        percent={memPercent}
        sub={`${allocated.value} ${allocated.unit} allocated to servers`}
      />
      <Tile
        label="Servers"
        value={String(stats.runningCount)}
        unit={`/ ${stats.serverCount} running`}
        percent={stats.serverCount ? (stats.runningCount / stats.serverCount) * 100 : 0}
        color={statusColors.running}
      />
      <Tile label="Players online" value={String(stats.playersOnline)} sub="across all servers" />
      <Tile
        label="Backups"
        value={String(stats.backupCount)}
        sub={`${backups.value} ${backups.unit} archived`}
      />
      <Tile label="Disk used" value={disk.value} unit={disk.unit} sub="all server folders" />
    </div>
  )
}
