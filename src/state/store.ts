import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShiftEntry, MonthSummary } from '../convert/types';

function pingNextShiftWidget(entries: ShiftEntry[]): void {
  void import('../widget/refresh')
    .then((m) => m.refreshNextShiftWidget(entries))
    .catch(() => {
      // widget optional (tests / non-android)
    });
}

const KEYS = {
  entries: 'loga3.entries',
  rawText: 'loga3.rawText',
  userMappings: 'loga3.userMappings',
  locale: 'loga3.locale',
  richDetails: 'loga3.richDetails',
  preset: 'loga3.preset',
  hospitalId: 'loga3.hospitalId',
  groupId: 'loga3.groupId',
  areaId: 'loga3.areaId',
  googleCalendarId: 'loga3.googleCalendarId',
  summary: 'loga3.summary',
  summaries: 'loga3.summaries',
} as const;

export type AppLocale = 'de' | 'en';

export type AppStateSnapshot = {
  entries: ShiftEntry[];
  rawText: string;
  userMappings: Record<string, string>;
  locale: AppLocale;
  richDetails: boolean;
  /** Empty until user picks an employer pack on this device */
  preset: string;
  hospitalId: string;
  groupId: string;
  areaId: string;
  summary: MonthSummary | null;
  summaries: MonthSummary[];
};

const listeners = new Set<() => void>();
let cache: AppStateSnapshot = {
  entries: [],
  rawText: '',
  userMappings: {},
  locale: 'de',
  richDetails: false,
  preset: '',
  hospitalId: '',
  groupId: '',
  areaId: '',
  summary: null,
  summaries: [],
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

export function isWorkplaceConfigured(snap: AppStateSnapshot = cache): boolean {
  return !!(snap.hospitalId && snap.groupId && snap.areaId && snap.preset);
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
      hospitalId,
      groupId,
      areaId,
      summaryRaw,
      summariesRaw,
    ] = await Promise.all([
      AsyncStorage.getItem(KEYS.entries),
      AsyncStorage.getItem(KEYS.rawText),
      AsyncStorage.getItem(KEYS.userMappings),
      AsyncStorage.getItem(KEYS.locale),
      AsyncStorage.getItem(KEYS.richDetails),
      AsyncStorage.getItem(KEYS.preset),
      AsyncStorage.getItem(KEYS.hospitalId),
      AsyncStorage.getItem(KEYS.groupId),
      AsyncStorage.getItem(KEYS.areaId),
      AsyncStorage.getItem(KEYS.summary),
      AsyncStorage.getItem(KEYS.summaries),
    ]);
    cache = {
      ...cache,
      entries: entriesRaw ? JSON.parse(entriesRaw) : [],
      rawText: rawText || '',
      userMappings: mappingsRaw ? JSON.parse(mappingsRaw) : {},
      locale: locale === 'en' ? 'en' : 'de',
      richDetails: rich === '1',
      preset: preset || '',
      hospitalId: hospitalId || '',
      groupId: groupId || '',
      areaId: areaId || '',
      summary: summaryRaw ? JSON.parse(summaryRaw) : null,
      summaries: summariesRaw ? JSON.parse(summariesRaw) : [],
    };
  } catch {
    // keep defaults
  }
  hydrated = true;
  notify();
  pingNextShiftWidget(cache.entries);
  return cache;
}

export async function setEntries(
  entries: ShiftEntry[],
  opts: {
    rawText?: string;
    summary?: MonthSummary | null;
    summaries?: MonthSummary[];
  } = {}
): Promise<void> {
  const summaries =
    opts.summaries !== undefined
      ? opts.summaries
      : opts.summary !== undefined && opts.summary
        ? [opts.summary]
        : opts.summary === null
          ? []
          : cache.summaries;
  const summary =
    opts.summary !== undefined
      ? opts.summary
      : summaries.length
        ? summaries[summaries.length - 1]
        : cache.summary;

  cache = {
    ...cache,
    entries,
    rawText: opts.rawText ?? cache.rawText,
    summary,
    summaries,
  };
  await AsyncStorage.setItem(KEYS.entries, JSON.stringify(entries));
  if (opts.rawText != null) await AsyncStorage.setItem(KEYS.rawText, opts.rawText);
  if (opts.summary !== undefined || opts.summaries !== undefined) {
    await AsyncStorage.setItem(KEYS.summary, JSON.stringify(summary));
    await AsyncStorage.setItem(KEYS.summaries, JSON.stringify(summaries));
  }
  notify();
  pingNextShiftWidget(entries);
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

export async function setWorkplace(scope: {
  hospitalId: string;
  groupId: string;
  areaId: string;
  preset: string;
}): Promise<void> {
  cache = {
    ...cache,
    hospitalId: scope.hospitalId,
    groupId: scope.groupId,
    areaId: scope.areaId,
    preset: scope.preset,
  };
  await Promise.all([
    AsyncStorage.setItem(KEYS.hospitalId, scope.hospitalId),
    AsyncStorage.setItem(KEYS.groupId, scope.groupId),
    AsyncStorage.setItem(KEYS.areaId, scope.areaId),
    AsyncStorage.setItem(KEYS.preset, scope.preset),
  ]);
  notify();
}

export async function setGoogleCalendarId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.googleCalendarId, id);
}

export async function getGoogleCalendarId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.googleCalendarId);
}
