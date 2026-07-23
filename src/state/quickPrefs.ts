/**
 * Prefs for one-tap „Aktualisieren“ (current ± N months → fetch → optional Google).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'loga3.quickUpdatePrefs';

export type QuickUpdatePrefs = {
  /** Months before current (0–6). Default 0. */
  prevMonths: number;
  /** Months after current (0–6). Default 2. */
  nextMonths: number;
  /** After fetch, sync to Google if calendar configured. Default true. */
  syncGoogle: boolean;
};

export const DEFAULT_QUICK_PREFS: QuickUpdatePrefs = {
  prevMonths: 0,
  nextMonths: 2,
  syncGoogle: true,
};

const clamp = (n: number) => Math.max(0, Math.min(6, Math.round(Number(n) || 0)));

export function normalizeQuickPrefs(raw: Partial<QuickUpdatePrefs> | null | undefined): QuickUpdatePrefs {
  return {
    prevMonths: clamp(raw?.prevMonths ?? DEFAULT_QUICK_PREFS.prevMonths),
    nextMonths: clamp(raw?.nextMonths ?? DEFAULT_QUICK_PREFS.nextMonths),
    syncGoogle: raw?.syncGoogle !== false,
  };
}

export async function loadQuickPrefs(): Promise<QuickUpdatePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_QUICK_PREFS };
    return normalizeQuickPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_QUICK_PREFS };
  }
}

export async function saveQuickPrefs(prefs: Partial<QuickUpdatePrefs>): Promise<QuickUpdatePrefs> {
  const next = normalizeQuickPrefs({ ...(await loadQuickPrefs()), ...prefs });
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
