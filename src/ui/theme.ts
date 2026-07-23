/**
 * LOGA3 Mobile design tokens — product UI (not marketing).
 *
 * Decisions:
 * - One primary: deep teal (trust / clinical-adjacent). No Expo default blue.
 * - Surfaces: cool gray canvas + white cards; borders hairline slate.
 * - Type: system sans; hierarchy via size/weight only (no decorative fonts).
 * - Controls: custom Pressables, sentence case — never stock Button ALL-CAPS.
 * - Radius 10–12; touch targets ≥ 44; spacing 8-grid.
 */
export const theme = {
  color: {
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
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  type: {
    title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
    h2: { fontSize: 17, fontWeight: '600' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    meta: { fontSize: 13, fontWeight: '400' as const },
    caption: { fontSize: 12, fontWeight: '500' as const },
    mono: { fontSize: 11, fontFamily: 'SpaceMono' as const },
  },
  shadow: {
    // Subtle elevation — Android elevation + iOS opacity, no glow stacks
    card: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  },
} as const;

export type Theme = typeof theme;
