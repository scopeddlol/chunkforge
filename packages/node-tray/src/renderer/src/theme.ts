import { createDarkTheme, type BrandVariants, type Theme } from '@fluentui/react-components'

/**
 * The node tray borrows Chunkforge's violet so the two obviously belong together,
 * but it is a single fixed dark theme. Portal is infrastructure you configure
 * once and then leave alone — it does not need eight themes, and duplicating
 * the desktop app's theme engine here would imply a kinship the two UIs
 * deliberately do not have.
 */
const violet: BrandVariants = {
  10: '#130B28',
  20: '#1C1039',
  30: '#26154A',
  40: '#301A5B',
  50: '#3A1F6C',
  60: '#44257D',
  70: '#4E2A8E',
  80: '#58309F',
  90: '#6B40B8',
  100: '#7D4FD1',
  110: '#8B5CF6',
  120: '#A374F8',
  130: '#B98CFA',
  140: '#CBA3FB',
  150: '#DCBEFC',
  160: '#EDDBFE'
}

export const nodeTheme: Theme = {
  ...createDarkTheme(violet),
  colorNeutralBackground1: '#12101A',
  colorNeutralBackground2: '#1A1725',
  colorNeutralBackground3: '#221E30',
  colorNeutralBackground4: '#0C0A12'
}
