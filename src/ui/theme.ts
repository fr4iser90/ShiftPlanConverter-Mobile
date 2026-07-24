/**
 * LOGA3 Mobile design tokens — product UI (not marketing).
 *
 * Light + dark follow the system appearance. Status bar icons adapt;
 * we do not force a black chrome bar in light mode.
 */
const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

const type = {
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  meta: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  mono: { fontSize: 11, fontFamily: 'SpaceMono' as const },
} as const;

export type ThemeColors = {
  canvas: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  inkFaint: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primaryTint: string;
  primaryText: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnSoft: string;
  today: string;
  week: string;
  month: string;
  overlay: string;
  /** Status bar / system chrome behind icons */
  statusBar: string;
  cardAccentBorder: string;
};

const lightColors: ThemeColors = {
  canvas: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  ink: '#0F172A',
  inkSecondary: '#475569',
  inkMuted: '#64748B',
  inkFaint: '#94A3B8',
  primary: '#0F766E',
  primaryPressed: '#0D9488',
  primarySoft: '#CCFBF1',
  primaryTint: '#ECFDF5',
  primaryText: '#FFFFFF',
  danger: '#B91C1C',
  dangerSoft: '#FEF2F2',
  warn: '#B45309',
  warnSoft: '#FFFBEB',
  today: 'rgba(15, 118, 110, 0.18)',
  week: 'rgba(15, 118, 110, 0.10)',
  month: 'rgba(15, 118, 110, 0.05)',
  overlay: 'rgba(15, 23, 42, 0.04)',
  statusBar: '#F1F5F9',
  cardAccentBorder: '#A7F3D0',
};

const darkColors: ThemeColors = {
  canvas: '#0B1220',
  surface: '#111827',
  surfaceMuted: '#1E293B',
  border: '#1E293B',
  borderStrong: '#334155',
  ink: '#F8FAFC',
  inkSecondary: '#CBD5E1',
  inkMuted: '#94A3B8',
  inkFaint: '#64748B',
  primary: '#2DD4BF',
  primaryPressed: '#5EEAD4',
  primarySoft: '#134E4A',
  primaryTint: '#042F2E',
  primaryText: '#042F2E',
  danger: '#F87171',
  dangerSoft: '#450A0A',
  warn: '#FBBF24',
  warnSoft: '#422006',
  today: 'rgba(45, 212, 191, 0.22)',
  week: 'rgba(45, 212, 191, 0.12)',
  month: 'rgba(45, 212, 191, 0.06)',
  overlay: 'rgba(248, 250, 252, 0.04)',
  statusBar: '#0B1220',
  cardAccentBorder: '#115E59',
};

export type ColorSchemeName = 'light' | 'dark';

export function colorsFor(scheme: ColorSchemeName | null | undefined): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

export function themeFor(scheme: ColorSchemeName | null | undefined) {
  const color = colorsFor(scheme);
  return {
    color,
    space,
    radius,
    type,
    scheme: (scheme === 'dark' ? 'dark' : 'light') as ColorSchemeName,
    shadow: {
      card: {
        shadowColor: scheme === 'dark' ? '#000000' : '#0F172A',
        shadowOpacity: scheme === 'dark' ? 0.35 : 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      },
    },
  } as const;
}

export type AppTheme = ReturnType<typeof themeFor>;

/** @deprecated Prefer useTheme() — static light tokens for modules that cannot hook. */
export const theme = themeFor('light');

export type Theme = typeof theme;
