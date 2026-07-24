/**
 * Home-screen widget chrome — light/dark (system or Settings override).
 * Keep in sync with product tokens in src/ui/theme.ts where practical.
 */
export type WidgetScheme = 'light' | 'dark';

type Hex = `#${string}`;

export type WidgetChrome = {
  canvas: Hex;
  surface: Hex;
  ink: Hex;
  inkMuted: Hex;
  accent: Hex;
  accentSoft: Hex;
  todayBg: Hex;
  todayBorder: Hex;
  dayEmpty: Hex;
};

const light: WidgetChrome = {
  canvas: '#F1F5F9',
  surface: '#FFFFFF',
  ink: '#0F172A',
  inkMuted: '#64748B',
  accent: '#0F766E',
  accentSoft: '#CCFBF1',
  todayBg: '#ECFDF5',
  todayBorder: '#0F766E',
  dayEmpty: '#94A3B8',
};

const dark: WidgetChrome = {
  canvas: '#0B1220',
  surface: '#111827',
  ink: '#F8FAFC',
  inkMuted: '#94A3B8',
  accent: '#2DD4BF',
  accentSoft: '#134E4A',
  todayBg: '#042F2E',
  todayBorder: '#2DD4BF',
  dayEmpty: '#64748B',
};

export function widgetChrome(scheme: WidgetScheme): WidgetChrome {
  return scheme === 'dark' ? dark : light;
}
