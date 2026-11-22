/**
 * @file        src/client/theme.ts
 * @purpose     Defines every colour, type size, spacing and radius token plus the WCAG contrast helper.
 * @layer       client (pure tokens: no DOM, no I/O)
 * @keyFunctions
 *   - COLORS
 *   - TYPE_PX / SPACE_PX / RADIUS_PX / FONTS
 *   - CONTRAST_PAIRS
 *   - relativeLuminance(hex): number
 *   - contrastRatio(foreground, background): number
 * @invariants  every UI colour comes from COLORS; every text pair used by the UI meets WCAG AA (4.5:1)
 * @security    none (visual tokens)
 * @tests       tests/client/theme.test.ts
 * @spec        06-design-and-ux.md look and feel; P4-client.md step 1; D-027
 */
export const COLORS = {
  ink: '#070b14',
  inkSoft: '#12203a',
  inkLine: '#2b3f5c',
  paper: '#f5ecd9',
  paperLight: '#f7f1e3',
  paperDeep: '#eadfc6',
  paperText: '#5b5346',
  paperShade: '#e8dcc4',
  paperLine: '#cdbd9f',
  coral: '#ff6b4a',
  coralDeep: '#b5391f',
  mint: '#63e6c3',
  mintDeep: '#136b57',
  cream: '#fffaf0',
  muted: '#aebcd1',
  white: '#ffffff',
  inkText: '#101722',
} as const;

export const TYPE_PX = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  xxl: 34,
  display: 48,
} as const;

export const SPACE_PX = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  tap: 44,
} as const;

export const RADIUS_PX = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const FONTS = {
  body: "ui-rounded, 'Segoe UI', system-ui, sans-serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
} as const;

export type ContrastPair = {
  name: string;
  foreground: string;
  background: string;
};

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { name: 'cream on ink', foreground: COLORS.cream, background: COLORS.ink },
  { name: 'muted on ink', foreground: COLORS.muted, background: COLORS.ink },
  { name: 'coral on ink', foreground: COLORS.coral, background: COLORS.ink },
  { name: 'mint on ink', foreground: COLORS.mint, background: COLORS.ink },
  {
    name: 'cream on ink soft',
    foreground: COLORS.cream,
    background: COLORS.inkSoft,
  },
  {
    name: 'muted on ink soft',
    foreground: COLORS.muted,
    background: COLORS.inkSoft,
  },
  {
    name: 'ink text on paper',
    foreground: COLORS.inkText,
    background: COLORS.paper,
  },
  {
    name: 'coral deep on paper',
    foreground: COLORS.coralDeep,
    background: COLORS.paper,
  },
  {
    name: 'mint deep on paper',
    foreground: COLORS.mintDeep,
    background: COLORS.paper,
  },
  {
    name: 'ink on coral',
    foreground: COLORS.ink,
    background: COLORS.coral,
  },
  { name: 'ink on mint', foreground: COLORS.ink, background: COLORS.mint },
  {
    name: 'cream on coral deep',
    foreground: COLORS.cream,
    background: COLORS.coralDeep,
  },
  {
    name: 'ink text on paper shade',
    foreground: COLORS.inkText,
    background: COLORS.paperShade,
  },
  {
    name: 'ink text on cream',
    foreground: COLORS.inkText,
    background: COLORS.cream,
  },
];

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`invalid hex colour: ${hex}`);
  }

  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex).map(channel);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
