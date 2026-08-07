import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme
} from '@fluentui/react-components'

export type ThemeId =
  | 'oled'
  | 'midnight'
  | 'nebula'
  | 'forest'
  | 'ember'
  | 'slate'
  | 'light'
  | 'parchment'

export interface ChunkforgeTheme {
  id: ThemeId
  label: string
  description: string
  isDark: boolean
  theme: Theme
  /** Swatch shown in the theme picker: [accent, surface]. */
  preview: [string, string]
  /** Elevated surface for popups, which must not match the page surface. */
  popupBackground: string
  popupBorder: string
}

function ramp(colors: string[]): BrandVariants {
  const keys = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160] as const
  return Object.fromEntries(keys.map((key, index) => [key, colors[index]])) as BrandVariants
}

export const violetRamp = ramp([
  '#130B28', '#1C1039', '#26154A', '#301A5B', '#3A1F6C', '#44257D', '#4E2A8E', '#58309F',
  '#6B40B8', '#7D4FD1', '#8B5CF6', '#A374F8', '#B98CFA', '#CBA3FB', '#DCBEFC', '#EDDBFE'
])

const cyanRamp = ramp([
  '#04191C', '#062529', '#083137', '#0A3D45', '#0C4953', '#0E5561', '#10616F', '#136D7D',
  '#178A9E', '#1BA7BF', '#22C3DE', '#3FD3EB', '#63DDF0', '#8CE6F4', '#B6EFF8', '#DDF8FC'
])

const emeraldRamp = ramp([
  '#04180C', '#062413', '#08301A', '#0A3C21', '#0C4828', '#0E542F', '#106036', '#136C3D',
  '#17884D', '#1BA45D', '#22C06E', '#3FD088', '#63DAA2', '#8CE5BE', '#B6EFD7', '#DDF8EC'
])

const amberRamp = ramp([
  '#2A0D03', '#3C1204', '#4D1706', '#5F1D08', '#71230A', '#83290D', '#963010', '#A93712',
  '#BC3F15', '#CF4718', '#E2521F', '#E8793A', '#ED8F5A', '#F2A87C', '#F7C4A3', '#FCE3D2'
])

const steelRamp = ramp([
  '#0B1119', '#101924', '#16212F', '#1B293A', '#213145', '#263950', '#2C425B', '#324B67',
  '#3F5F82', '#4D739D', '#5C88B8', '#7BA1C9', '#9ABAD9', '#B8D0E7', '#D5E4F2', '#EDF4FA'
])

/** Fluent's generated dark foregrounds assume its own lighter surfaces; against
 *  near-black they read as muddy, so dark themes pin explicit contrast values. */
const darkForegrounds = {
  colorNeutralForeground1: '#F4F2F7',
  colorNeutralForeground1Hover: '#FFFFFF',
  colorNeutralForeground1Pressed: '#FFFFFF',
  colorNeutralForeground2: '#DCD8E4',
  colorNeutralForeground2Hover: '#F4F2F7',
  colorNeutralForeground2Pressed: '#F4F2F7',
  colorNeutralForeground3: '#A9A2B8',
  colorNeutralForeground4: '#8B8399',
  colorNeutralForegroundDisabled: '#5F5872',
  colorNeutralForegroundOnBrand: '#FFFFFF'
}

interface DarkSurfaces {
  page: string
  surface: string
  hover: string
  pressed: string
  stroke1: string
  stroke2: string
  stroke3: string
}

function darkTheme(brand: BrandVariants, s: DarkSurfaces): Theme {
  return {
    ...createDarkTheme(brand),
    colorNeutralBackground1: s.surface,
    colorNeutralBackground2: s.page,
    colorNeutralBackground3: s.page,
    colorNeutralBackground4: s.surface,
    colorNeutralBackground1Hover: s.hover,
    colorNeutralBackground1Pressed: s.pressed,
    colorNeutralBackground1Selected: s.hover,
    colorNeutralBackground3Hover: s.hover,
    colorNeutralBackground3Pressed: s.pressed,
    colorSubtleBackground: 'transparent',
    colorSubtleBackgroundHover: s.hover,
    colorSubtleBackgroundPressed: s.pressed,
    colorNeutralStroke1: s.stroke1,
    colorNeutralStroke2: s.stroke2,
    colorNeutralStroke3: s.stroke3,
    ...darkForegrounds,
    colorNeutralForegroundInverted: s.page
  }
}

export const chunkforgeThemes: ChunkforgeTheme[] = [
  {
    id: 'oled',
    label: 'OLED Violet',
    description: 'True black with electric violet. Easiest on OLED panels.',
    isDark: true,
    preview: ['#8B5CF6', '#000000'],
    popupBackground: '#1A1524',
    popupBorder: '#3A3050',
    theme: darkTheme(violetRamp, {
      page: '#000000',
      surface: '#0C0A11',
      hover: '#1A1524',
      pressed: '#241D31',
      stroke1: '#332B42',
      stroke2: '#251E32',
      stroke3: '#1B1626'
    })
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep navy surfaces with a cool cyan accent.',
    isDark: true,
    preview: ['#22C3DE', '#0B1220'],
    popupBackground: '#182741',
    popupBorder: '#2F4766',
    theme: darkTheme(cyanRamp, {
      page: '#070C15',
      surface: '#0F1726',
      hover: '#182741',
      pressed: '#20314F',
      stroke1: '#2F4766',
      stroke2: '#1E2C44',
      stroke3: '#162135'
    })
  },
  {
    id: 'nebula',
    label: 'Nebula',
    description: 'Warm plum tones with a violet glow.',
    isDark: true,
    preview: ['#A374F8', '#17111F'],
    popupBackground: '#2B2039',
    popupBorder: '#493A5E',
    theme: darkTheme(violetRamp, {
      page: '#120D19',
      surface: '#1B1424',
      hover: '#2B2039',
      pressed: '#352847',
      stroke1: '#493A5E',
      stroke2: '#2E2440',
      stroke3: '#241B32'
    })
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Muted greens for long sessions.',
    isDark: true,
    preview: ['#22C06E', '#0A1410'],
    popupBackground: '#17291F',
    popupBorder: '#2C4A38',
    theme: darkTheme(emeraldRamp, {
      page: '#070F0B',
      surface: '#0E1A13',
      hover: '#17291F',
      pressed: '#1F3628',
      stroke1: '#2C4A38',
      stroke2: '#1B2E22',
      stroke3: '#14231A'
    })
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'The original forge-fire amber on charcoal.',
    isDark: true,
    preview: ['#E8793A', '#141110'],
    popupBackground: '#2A211C',
    popupBorder: '#4A3A2E',
    theme: darkTheme(amberRamp, {
      page: '#0D0B0A',
      surface: '#171312',
      hover: '#2A211C',
      pressed: '#352A23',
      stroke1: '#4A3A2E',
      stroke2: '#2C2420',
      stroke3: '#211B18'
    })
  },
  {
    id: 'slate',
    label: 'Slate',
    description: 'Neutral grey-blue. Quiet and low-contrast.',
    isDark: true,
    preview: ['#5C88B8', '#12161C'],
    popupBackground: '#232B36',
    popupBorder: '#3C4857',
    theme: darkTheme(steelRamp, {
      page: '#0E1116',
      surface: '#161A21',
      hover: '#232B36',
      pressed: '#2C3542',
      stroke1: '#3C4857',
      stroke2: '#252D38',
      stroke3: '#1C222B'
    })
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Clean white surfaces with violet accents.',
    isDark: false,
    preview: ['#7D4FD1', '#FFFFFF'],
    popupBackground: '#FFFFFF',
    popupBorder: '#D8D2E4',
    theme: {
      ...createLightTheme(violetRamp),
      colorNeutralBackground1: '#FFFFFF',
      colorNeutralBackground2: '#F7F5FC',
      colorNeutralBackground3: '#EFEBFA'
    }
  },
  {
    id: 'parchment',
    label: 'Parchment',
    description: 'Warm paper tones, easy in bright rooms.',
    isDark: false,
    preview: ['#CF4718', '#FAF6EF'],
    popupBackground: '#FFFDF8',
    popupBorder: '#E2D8C6',
    theme: {
      ...createLightTheme(amberRamp),
      colorNeutralBackground1: '#FFFDF8',
      colorNeutralBackground2: '#FAF6EF',
      colorNeutralBackground3: '#F2EBDD'
    }
  }
]

export function getTheme(id: ThemeId): ChunkforgeTheme {
  return chunkforgeThemes.find((t) => t.id === id) ?? chunkforgeThemes[0]
}

export const chunkforgeEmerald = '#2EBD59'

export const statusColors = {
  running: chunkforgeEmerald,
  starting: '#E8B23E',
  stopping: '#E8B23E',
  stopped: '#6E6A78',
  crashed: '#E0475E'
} as const
