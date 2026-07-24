/**
 * Widget appearance prefs (Android home-screen widgets).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

import type { WidgetScheme } from './theme';

const KEY = 'loga3.widgetPrefs';

export type WidgetThemePref = 'system' | 'light' | 'dark';

export type WidgetPrefs = {
  /** Chrome for NextShift + WeekPlan widgets. */
  theme: WidgetThemePref;
};

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  theme: 'system',
};

export function normalizeWidgetPrefs(raw: Partial<WidgetPrefs> | null | undefined): WidgetPrefs {
  const theme = raw?.theme;
  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
  };
}

export async function loadWidgetPrefs(): Promise<WidgetPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_WIDGET_PREFS };
    return normalizeWidgetPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WIDGET_PREFS };
  }
}

export async function saveWidgetPrefs(patch: Partial<WidgetPrefs>): Promise<WidgetPrefs> {
  const next = normalizeWidgetPrefs({ ...(await loadWidgetPrefs()), ...patch });
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function resolveWidgetScheme(): Promise<WidgetScheme> {
  const { theme } = await loadWidgetPrefs();
  if (theme === 'light' || theme === 'dark') return theme;
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}
