import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShiftEntry, MonthSummary } from '../convert/types';
import {
  BUILTIN_AREA_ID,
  BUILTIN_GROUP_ID,
  BUILTIN_HOSPITAL_ID,
  BUILTIN_PRESET,
} from '../packs';

const KEYS = {
  entries: 'loga3.entries',
  rawText: 'loga3.rawText',
  userMappings: 'loga3.userMappings',
  locale: 'loga3.locale',
  richDetails: 'loga3.richDetails',
  preset: 'loga3.preset',
  googleCalendarId: 'loga3.googleCalendarId',
  summary: 'loga3.summary',
} as const;

export type AppLocale = 'de' | 'en';

export type AppStateSnapshot = {
  entries: ShiftEntry[];
  rawText: string;
  userMappings: Record<string, string>;
  locale: AppLocale;
  richDetails: boolean;
  preset: string;
  hospitalId: string;
  groupId: string;
  areaId: string;
  summary: MonthSummary | null;
};

const listeners = new Set<() => void>();
let cache: AppStateSnapshot = {
  entries: [],
  rawText: '',
  userMappings: {},
  locale: 'de',
  richDetails: false,
  preset: BUILTIN_PRESET,
  hospitalId: BUILTIN_HOSPITAL_ID,
  groupId: BUILTIN_GROUP_ID,
  areaId: BUILTIN_AREA_ID,
  summary: null,
};
let hydrated = false;

function notify() {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): AppStateSnapshot {
  return cache;
}

export async function hydrateStore(): Promise<AppStateSnapshot> {
  if (hydrated) return cache;
  try {
    const [
      entriesRaw,
      rawText,
      mappingsRaw,
      locale,
      rich,
      preset,
      summaryRaw,
    ] = await Promise.all([
      AsyncStorage.getItem(KEYS.entries),
      AsyncStorage.getItem(KEYS.rawText),
      AsyncStorage.getItem(KEYS.userMappings),
      AsyncStorage.getItem(KEYS.locale),
      AsyncStorage.getItem(KEYS.richDetails),
      AsyncStorage.getItem(KEYS.preset),
      AsyncStorage.getItem(KEYS.summary),
    ]);
    cache = {
      ...cache,
      entries: entriesRaw ? JSON.parse(entriesRaw) : [],
      rawText: rawText || '',
      userMappings: mappingsRaw ? JSON.parse(mappingsRaw) : {},
      locale: locale === 'en' ? 'en' : 'de',
      richDetails: rich === '1',
      preset: preset || BUILTIN_PRESET,
      summary: summaryRaw ? JSON.parse(summaryRaw) : null,
    };
  } catch {
    // keep defaults
  }
  hydrated = true;
  notify();
  return cache;
}

export async function setEntries(
  entries: ShiftEntry[],
  opts: { rawText?: string; summary?: MonthSummary | null } = {}
): Promise<void> {
  cache = {
    ...cache,
    entries,
    rawText: opts.rawText ?? cache.rawText,
    summary: opts.summary !== undefined ? opts.summary : cache.summary,
  };
  await AsyncStorage.setItem(KEYS.entries, JSON.stringify(entries));
  if (opts.rawText != null) await AsyncStorage.setItem(KEYS.rawText, opts.rawText);
  if (opts.summary !== undefined) {
    await AsyncStorage.setItem(KEYS.summary, JSON.stringify(opts.summary));
  }
  notify();
}

export async function setUserMappings(mappings: Record<string, string>): Promise<void> {
  cache = { ...cache, userMappings: mappings };
  await AsyncStorage.setItem(KEYS.userMappings, JSON.stringify(mappings));
  notify();
}

export async function setLocale(locale: AppLocale): Promise<void> {
  cache = { ...cache, locale };
  await AsyncStorage.setItem(KEYS.locale, locale);
  notify();
}

export async function setRichDetails(enabled: boolean): Promise<void> {
  cache = { ...cache, richDetails: enabled };
  await AsyncStorage.setItem(KEYS.richDetails, enabled ? '1' : '0');
  notify();
}

export async function setPreset(preset: string): Promise<void> {
  cache = { ...cache, preset };
  await AsyncStorage.setItem(KEYS.preset, preset);
  notify();
}

export async function setGoogleCalendarId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.googleCalendarId, id);
}

export async function getGoogleCalendarId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.googleCalendarId);
}
