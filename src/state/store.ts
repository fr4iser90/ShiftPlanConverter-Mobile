import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShiftEntry, MonthSummary } from '../convert/types';
import { clearDataEncryptionKey, decryptUtf8, encryptUtf8 } from './securePayload';

function pingHomeWidgets(entries: ShiftEntry[]): void {
  void import('../widget/refresh')
    .then((m) => m.refreshHomeWidgets(entries))
    .catch(() => {
      // widget optional (tests / non-android)
    });
}

const KEYS = {
  entries: 'loga3.entries',
  rawText: 'loga3.rawText',
  userMappings: 'loga3.userMappings',
  locale: 'loga3.locale',
  themePref: 'loga3.themePref',
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
/** App chrome: follow system, or force light/dark. */
export type ThemePref = 'system' | 'light' | 'dark';

export type AppStateSnapshot = {
  entries: ShiftEntry[];
  rawText: string;
  userMappings: Record<string, string>;
  locale: AppLocale;
  themePref: ThemePref;
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
  themePref: 'system',
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

/**
 * Re-render only when selected snapshot fields change (reference / value).
 * Avoids waking Abrufen/Calendar on every unrelated store write.
 */
export function subscribeKeys(
  keys: (keyof AppStateSnapshot)[],
  listener: () => void
): () => void {
  let prev = cache;
  return subscribe(() => {
    const next = cache;
    let changed = false;
    for (const k of keys) {
      if (next[k] !== prev[k]) {
        changed = true;
        break;
      }
    }
    prev = next;
    if (changed) listener();
  });
}

export function getSnapshot(): AppStateSnapshot {
  return cache;
}

export function isWorkplaceConfigured(snap: AppStateSnapshot = cache): boolean {
  return !!(snap.hospitalId && snap.groupId && snap.areaId && snap.preset);
}

async function parseJsonEnc<T>(raw: string | null, fallback: T): Promise<T> {
  const plain = await decryptUtf8(raw);
  if (!plain) return fallback;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return fallback;
  }
}

export async function hydrateStore(): Promise<AppStateSnapshot> {
  if (hydrated) return cache;
  try {
    const [
      entriesRaw,
      rawTextEnc,
      mappingsRaw,
      locale,
      themePrefRaw,
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
      AsyncStorage.getItem(KEYS.themePref),
      AsyncStorage.getItem(KEYS.richDetails),
      AsyncStorage.getItem(KEYS.preset),
      AsyncStorage.getItem(KEYS.hospitalId),
      AsyncStorage.getItem(KEYS.groupId),
      AsyncStorage.getItem(KEYS.areaId),
      AsyncStorage.getItem(KEYS.summary),
      AsyncStorage.getItem(KEYS.summaries),
    ]);
    const themePref: ThemePref =
      themePrefRaw === 'light' || themePrefRaw === 'dark' || themePrefRaw === 'system'
        ? themePrefRaw
        : 'system';

    // Workplace keys are plaintext — apply them even if encrypted fields fail to decrypt.
    cache = {
      ...cache,
      userMappings: (() => {
        try {
          return mappingsRaw ? (JSON.parse(mappingsRaw) as Record<string, string>) : {};
        } catch {
          return {};
        }
      })(),
      locale: locale === 'en' ? 'en' : 'de',
      themePref,
      richDetails: rich === '1',
      preset: preset || '',
      hospitalId: hospitalId || '',
      groupId: groupId || '',
      areaId: areaId || '',
    };

    try {
      const [entries, rawText, summary, summaries] = await Promise.all([
        parseJsonEnc<ShiftEntry[]>(entriesRaw, []),
        decryptUtf8(rawTextEnc),
        parseJsonEnc<MonthSummary | null>(summaryRaw, null),
        parseJsonEnc<MonthSummary[]>(summariesRaw, []),
      ]);
      cache = {
        ...cache,
        entries,
        rawText,
        summary,
        summaries,
      };
      // Migrate legacy plaintext sensitive keys → encrypted at rest.
      if (entriesRaw && !entriesRaw.startsWith('enc:v1:')) {
        await AsyncStorage.setItem(KEYS.entries, await encryptUtf8(JSON.stringify(entries)));
      }
      if (rawTextEnc && !rawTextEnc.startsWith('enc:v1:') && rawText) {
        await AsyncStorage.setItem(KEYS.rawText, await encryptUtf8(rawText));
      }
      if (summaryRaw && !summaryRaw.startsWith('enc:v1:')) {
        await AsyncStorage.setItem(KEYS.summary, await encryptUtf8(JSON.stringify(summary)));
      }
      if (summariesRaw && !summariesRaw.startsWith('enc:v1:')) {
        await AsyncStorage.setItem(KEYS.summaries, await encryptUtf8(JSON.stringify(summaries)));
      }
    } catch {
      // Keep workplace; encrypted payloads can retry next session.
    }
    hydrated = true;
  } catch {
    // Do NOT stick hydrated=true on empty cache — that forced Setup on every open.
    hydrated = false;
    notify();
    return cache;
  }
  notify();
  pingHomeWidgets(cache.entries);
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
  await AsyncStorage.setItem(KEYS.entries, await encryptUtf8(JSON.stringify(entries)));
  if (opts.rawText != null) {
    await AsyncStorage.setItem(KEYS.rawText, await encryptUtf8(opts.rawText));
  }
  if (opts.summary !== undefined || opts.summaries !== undefined) {
    await AsyncStorage.setItem(KEYS.summary, await encryptUtf8(JSON.stringify(summary)));
    await AsyncStorage.setItem(KEYS.summaries, await encryptUtf8(JSON.stringify(summaries)));
  }
  notify();
  pingHomeWidgets(entries);
  void import('../schedule/shiftAlarms')
    .then((m) => m.rescheduleShiftAlarms())
    .catch(() => {
      // optional
    });
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

export async function setThemePref(themePref: ThemePref): Promise<void> {
  cache = { ...cache, themePref };
  await AsyncStorage.setItem(KEYS.themePref, themePref);
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

/**
 * Wipe local app data: shifts, raw text, mappings, workplace, summaries,
 * Google calendar id, PDFs, credentials, tenant URL, encryption key.
 * Keeps locale/theme prefs.
 */
export async function wipeAllLocalData(): Promise<void> {
  const { clearCredentials } = await import('../sources/loga3/credentials');
  const { setLoga3BaseUrl } = await import('../sources/loga3/env');
  const { deleteAllPdfFiles } = await import('../sources/webview/pdfStore');
  const { disconnectGoogle } = await import('../sync/google');
  const { setSmokeFetchIntent, clearMatrixStatus } = await import('../setup/smokeFetchIntent');
  const { clearBiometricSession, setBiometricLockEnabled } = await import('../security/biometric');

  await Promise.all([
    clearCredentials(),
    setLoga3BaseUrl(''),
    deleteAllPdfFiles(),
    disconnectGoogle(),
    setSmokeFetchIntent(null),
    clearMatrixStatus(),
    setBiometricLockEnabled(false),
    clearDataEncryptionKey(),
    AsyncStorage.multiRemove([
      KEYS.entries,
      KEYS.rawText,
      KEYS.userMappings,
      KEYS.preset,
      KEYS.hospitalId,
      KEYS.groupId,
      KEYS.areaId,
      KEYS.googleCalendarId,
      KEYS.summary,
      KEYS.summaries,
    ]),
  ]);
  const { clearActiveSourceId } = await import('./activeSource');
  await clearActiveSourceId();
  clearBiometricSession();

  cache = {
    ...cache,
    entries: [],
    rawText: '',
    userMappings: {},
    preset: '',
    hospitalId: '',
    groupId: '',
    areaId: '',
    summary: null,
    summaries: [],
  };
  notify();
  pingHomeWidgets([]);
  void import('../schedule/shiftAlarms')
    .then((m) => m.rescheduleShiftAlarms())
    .catch(() => {
      // optional
    });
}
