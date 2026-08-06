import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme
} from '@fluentui/react-components'

// Chunkforge brand ramp — forge-fire amber (#E8793A), 10 (darkest) -> 160 (lightest).
export const chunkforgeBrandRamp: BrandVariants = {
  10: '#2A0D03',
  20: '#3C1204',
  30: '#4D1706',
  40: '#5F1D08',
  50: '#71230A',
  60: '#83290D',
  70: '#963010',
  80: '#A93712',
  90: '#BC3F15',
  100: '#CF4718',
  110: '#E2521F',
  120: '#E8793A',
  130: '#ED8F5A',
  140: '#F2A87C',
  150: '#F7C4A3',
  160: '#FCE3D2'
}

export const chunkforgeEmerald = '#2EBD59'

export const chunkforgeLightTheme: Theme = {
  ...createLightTheme(chunkforgeBrandRamp),
  colorNeutralBackground1: '#FFFFFF',
  colorNeutralBackground2: '#FAF7F2',
  colorNeutralBackground3: '#F2EDE5'
}

export const chunkforgeDarkTheme: Theme = {
  ...createDarkTheme(chunkforgeBrandRamp),
  colorNeutralBackground1: '#242428',
  colorNeutralBackground2: '#1B1B1F',
  colorNeutralBackground3: '#1B1B1F'
}

// Semi-transparent so Windows 11 Mica shows through behind the app chrome.
chunkforgeDarkTheme.colorNeutralBackground1 = '#242428E6'
chunkforgeLightTheme.colorNeutralBackground1 = '#FFFFFFE6'

export const statusColors = {
  running: chunkforgeEmerald,
  starting: chunkforgeBrandRamp[120],
  stopping: chunkforgeBrandRamp[90],
  stopped: '#8A8886',
  crashed: '#D13438'
} as const
