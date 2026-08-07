import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme
} from '@fluentui/react-components'

// Chunkforge brand ramp — electric violet, 10 (darkest) -> 160 (lightest).
export const chunkforgeBrandRamp: BrandVariants = {
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

export const chunkforgeEmerald = '#2EBD59'

export const chunkforgeLightTheme: Theme = {
  ...createLightTheme(chunkforgeBrandRamp),
  colorNeutralBackground1: '#FFFFFF',
  colorNeutralBackground2: '#F7F5FC',
  colorNeutralBackground3: '#EFEBFA'
}

export const chunkforgeDarkTheme: Theme = {
  ...createDarkTheme(chunkforgeBrandRamp),
  // True OLED black, with just enough lift on card surfaces to read as
  // distinct layers rather than a translucent Mica wash.
  colorNeutralBackground1: '#0C0A11',
  colorNeutralBackground2: '#000000',
  colorNeutralBackground3: '#000000',
  colorNeutralBackground4: '#0C0A11',
  colorNeutralBackground1Hover: '#1A1524',
  colorNeutralBackground1Pressed: '#241D31',
  colorNeutralBackground1Selected: '#1F1929',
  colorNeutralBackground3Hover: '#1A1524',
  colorNeutralBackground3Pressed: '#241D31',
  colorSubtleBackground: 'transparent',
  colorSubtleBackgroundHover: '#1A1524',
  colorSubtleBackgroundPressed: '#241D31',
  colorNeutralStroke1: '#332B42',
  colorNeutralStroke2: '#251E32',
  colorNeutralStroke3: '#1B1626',
  // Fluent's generated foregrounds assume its own lighter dark-mode surfaces;
  // against true black they read as muddy, so pin them to explicit high-contrast values.
  colorNeutralForeground1: '#F4F2F7',
  colorNeutralForeground1Hover: '#FFFFFF',
  colorNeutralForeground1Pressed: '#FFFFFF',
  colorNeutralForeground2: '#DCD8E4',
  colorNeutralForeground2Hover: '#F4F2F7',
  colorNeutralForeground2Pressed: '#F4F2F7',
  colorNeutralForeground3: '#A9A2B8',
  colorNeutralForeground4: '#8B8399',
  colorNeutralForegroundDisabled: '#5F5872',
  colorNeutralForegroundOnBrand: '#FFFFFF',
  colorNeutralForegroundInverted: '#0C0A11'
}

export const statusColors = {
  running: chunkforgeEmerald,
  starting: '#E8B23E',
  stopping: '#E8B23E',
  stopped: '#6E6A78',
  crashed: '#E0475E'
} as const
