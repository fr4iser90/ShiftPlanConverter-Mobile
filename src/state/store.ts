import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShiftEntry, MonthSummary } from '../convert/types';
import type { PayslipDocument } from '../payroll/types';
import { getPackById } from '../packs';
import {
  DEFAULT_EVENT_FORMAT,
  parseEventFormat,
  type EventFormatPrefs,
} from './eventFormat';
import { clearDataEncryptionKey, decryptUtf8, encryptUtf8, getExistingDataKey, isEncryptedPayload } from './securePayload';
import { appendDiag } from '../support/diagLog';
import { t } from '../i18n';
import {
  defaultLabelForPack,
  newWorkplaceId,
  parseWorkplacesJson,
  profileConfigured,
  relabelWorkplace,
  type WorkplaceProfile,
} from './workplaces';

export type { EventFormatPrefs, OvernightMode } from './eventFormat';
export { DEFAULT_EVENT_FORMAT } from './eventFormat';
export type { WorkplaceProfile } from './workplaces';

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
  eventFormat: 'loga3.eventFormat',
  /** Mirrored from active workplace for quick reads / older tooling. */
  preset: 'loga3.preset',
  packId: 'loga3.packId',
  groupId: 'loga3.groupId',
  areaId: 'loga3.areaId',
  workplaces: 'loga3.workplaces',
  activeWorkplaceId: 'loga3.activeWorkplaceId',
  googleCalendarId: 'loga3.googleCalendarId',
  summary: 'loga3.summary',
  summaries: 'loga3.summaries',
  payslips: 'loga3.payslips',
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
  /** ICS / Google event title & description options */
  eventFormat: EventFormatPrefs;
  /** Mirrored from active workplace (empty until configured). */
  preset: string;
  packId: string;
  groupId: string;
  areaId: string;
  workplaces: WorkplaceProfile[];
  activeWorkplaceId: string;
  summary: MonthSummary | null;
  summaries: MonthSummary[];
  /** Verdienstnachweise keyed for active multi-WP (Abrechnungsprüfer). */
  payslips: PayslipDocument[];
};

const listeners = new Set<() => void>();
let cache: AppStateSnapshot = {
  entries: [],
  rawText: '',
  userMappings: {},
  locale: 'de',
  themePref: 'system',
  eventFormat: { ...DEFAULT_EVENT_FORMAT },
  preset: '',
  packId: '',
  groupId: '',
  areaId: '',
  workplaces: [],
  activeWorkplaceId: '',
  summary: null,
  summaries: [],
  payslips: [],
};
let hydrated = false;
/** Encrypted payloads present but undecryptable — block overwrites. */
let payloadLocked = false;
let payloadError: string | null = null;

export function isPayloadLocked(): boolean {
  return payloadLocked;
}

export function getPayloadError(): string | null {
  return payloadError;
}

export type StorageProbe = {
  entriesPresent: boolean;
  entriesEncrypted: boolean;
  entriesChars: number;
  keyPresent: boolean;
  loadedEntries: number;
  locked: boolean;
  error: string | null;
};

/** Non-destructive check — for UI / Fehler melden. */
export async function probeEncryptedStorage(): Promise<StorageProbe> {
  const raw = await AsyncStorage.getItem(KEYS.entries);
  const key = await getExistingDataKey();
  return {
    entriesPresent: !!raw,
    entriesEncrypted: isEncryptedPayload(raw),
    entriesChars: raw?.length || 0,
    keyPresent: !!key,
    loadedEntries: cache.entries.length,
    locked: payloadLocked,
    error: payloadError,
  };
}

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

export function getActiveWorkplace(
  snap: AppStateSnapshot = cache
): WorkplaceProfile | null {
  if (!snap.activeWorkplaceId) return null;
  return snap.workplaces.find((w) => w.id === snap.activeWorkplaceId) || null;
}

function mirrorActive(workplaces: WorkplaceProfile[], activeId: string) {
  const active = workplaces.find((w) => w.id === activeId) || workplaces[0] || null;
  return {
    workplaces,
    activeWorkplaceId: active?.id || '',
    packId: active?.packId || '',
    groupId: active?.groupId || '',
    areaId: active?.areaId || '',
    preset: active?.preset || '',
  };
}

export function isWorkplaceConfigured(snap: AppStateSnapshot = cache): boolean {
  return profileConfigured(getActiveWorkplace(snap));
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

function tagEntries(
  entries: ShiftEntry[],
  workplaceId: string
): ShiftEntry[] {
  return entries.map((e) =>
    e.workplaceId ? e : { ...e, workplaceId }
  );
}

async function persistWorkplaces(
  workplaces: WorkplaceProfile[],
  activeWorkplaceId: string
): Promise<void> {
  const mirrored = mirrorActive(workplaces, activeWorkplaceId);
  await Promise.all([
    AsyncStorage.setItem(KEYS.workplaces, JSON.stringify(mirrored.workplaces)),
    AsyncStorage.setItem(KEYS.activeWorkplaceId, mirrored.activeWorkplaceId),
    AsyncStorage.setItem(KEYS.packId, mirrored.packId),
    AsyncStorage.setItem(KEYS.groupId, mirrored.groupId),
    AsyncStorage.setItem(KEYS.areaId, mirrored.areaId),
    AsyncStorage.setItem(KEYS.preset, mirrored.preset),
  ]);
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
      eventFormatRaw,
      preset,
      packIdStored,
      groupId,
      areaId,
      workplacesRaw,
      activeWorkplaceIdRaw,
      summaryRaw,
      summariesRaw,
      payslipsRaw,
    ] = await Promise.all([
      AsyncStorage.getItem(KEYS.entries),
      AsyncStorage.getItem(KEYS.rawText),
      AsyncStorage.getItem(KEYS.userMappings),
      AsyncStorage.getItem(KEYS.locale),
      AsyncStorage.getItem(KEYS.themePref),
      AsyncStorage.getItem(KEYS.eventFormat),
      AsyncStorage.getItem(KEYS.preset),
      AsyncStorage.getItem(KEYS.packId),
      AsyncStorage.getItem(KEYS.groupId),
      AsyncStorage.getItem(KEYS.areaId),
      AsyncStorage.getItem(KEYS.workplaces),
      AsyncStorage.getItem(KEYS.activeWorkplaceId),
      AsyncStorage.getItem(KEYS.summary),
      AsyncStorage.getItem(KEYS.summaries),
      AsyncStorage.getItem(KEYS.payslips),
    ]);
    const themePref: ThemePref =
      themePrefRaw === 'light' || themePrefRaw === 'dark' || themePrefRaw === 'system'
        ? themePrefRaw
        : 'system';

    let eventFormat = parseEventFormat(eventFormatRaw);
    if (!eventFormat) {
      eventFormat = { ...DEFAULT_EVENT_FORMAT };
      await AsyncStorage.setItem(KEYS.eventFormat, JSON.stringify(eventFormat));
    }

    const packId = packIdStored || '';

    let workplaces = parseWorkplacesJson(workplacesRaw);
    let activeWorkplaceId = String(activeWorkplaceIdRaw || '').trim();

    // Migrate flat workplace → one profile.
    if (!workplaces.length && (packId || groupId || areaId || preset)) {
      const pack = packId ? getPackById(packId) : null;
      const group = pack?.groups.find((g) => g.id === groupId);
      const area = group?.areas.find((a) => a.id === areaId);
      const id = newWorkplaceId();
      workplaces = [
        {
          id,
          label: defaultLabelForPack(packId || '', pack?.name, area?.label, preset || ''),
          packId: packId || '',
          groupId: groupId || '',
          areaId: areaId || '',
          preset: preset || '',
        },
      ];
      activeWorkplaceId = id;
      await persistWorkplaces(workplaces, activeWorkplaceId);
    }

    if (workplaces.length && !workplaces.some((w) => w.id === activeWorkplaceId)) {
      activeWorkplaceId = workplaces[0].id;
      await persistWorkplaces(workplaces, activeWorkplaceId);
    }

    // Refresh chip labels (locale / generic “Ohne Arbeitgeber”).
    {
      const relabeled = workplaces.map(relabelWorkplace);
      if (JSON.stringify(relabeled) !== JSON.stringify(workplaces)) {
        workplaces = relabeled;
        await persistWorkplaces(workplaces, activeWorkplaceId);
      }
    }

    const mirrored = mirrorActive(workplaces, activeWorkplaceId);

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
      eventFormat,
      ...mirrored,
    };

    try {
      const [entriesIn, rawText, summary, summariesIn, payslipsIn] = await Promise.all([
        parseJsonEnc<ShiftEntry[]>(entriesRaw, []),
        decryptUtf8(rawTextEnc),
        parseJsonEnc<MonthSummary | null>(summaryRaw, null),
        parseJsonEnc<MonthSummary[]>(summariesRaw, []),
        parseJsonEnc<PayslipDocument[]>(payslipsRaw, []),
      ]);
      const defaultWp = mirrored.activeWorkplaceId;
      const entries = defaultWp ? tagEntries(entriesIn, defaultWp) : entriesIn;
      const summaries = defaultWp
        ? summariesIn.map((s) => (s.workplaceId ? s : { ...s, workplaceId: defaultWp }))
        : summariesIn;
      const payslips = defaultWp
        ? payslipsIn.map((p) => (p.workplaceId ? p : { ...p, workplaceId: defaultWp }))
        : payslipsIn;
      const summaryTagged =
        summary && defaultWp && !summary.workplaceId
          ? { ...summary, workplaceId: defaultWp }
          : summary;

      cache = {
        ...cache,
        entries,
        rawText,
        summary: summaryTagged,
        summaries,
        payslips,
      };
      payloadLocked = false;
      payloadError = null;
      // Migrate legacy plaintext sensitive keys → encrypted at rest.
      if (entriesRaw && !entriesRaw.startsWith('enc:v1:')) {
        await AsyncStorage.setItem(KEYS.entries, await encryptUtf8(JSON.stringify(entries)));
      } else if (defaultWp && entriesIn.some((e) => !e.workplaceId)) {
        await AsyncStorage.setItem(KEYS.entries, await encryptUtf8(JSON.stringify(entries)));
      }
      if (rawTextEnc && !rawTextEnc.startsWith('enc:v1:') && rawText) {
        await AsyncStorage.setItem(KEYS.rawText, await encryptUtf8(rawText));
      }
      if (summaryRaw && !summaryRaw.startsWith('enc:v1:')) {
        await AsyncStorage.setItem(
          KEYS.summary,
          await encryptUtf8(JSON.stringify(summaryTagged))
        );
      }
      if (
        (summariesRaw && !summariesRaw.startsWith('enc:v1:')) ||
        (defaultWp && summariesIn.some((s) => !s.workplaceId))
      ) {
        await AsyncStorage.setItem(
          KEYS.summaries,
          await encryptUtf8(JSON.stringify(summaries))
        );
      }
      if (
        (payslipsRaw && !payslipsRaw.startsWith('enc:v1:')) ||
        (defaultWp && payslipsIn.some((p) => !p.workplaceId))
      ) {
        await AsyncStorage.setItem(
          KEYS.payslips,
          await encryptUtf8(JSON.stringify(payslips))
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hasCipher =
        isEncryptedPayload(entriesRaw) ||
        isEncryptedPayload(rawTextEnc) ||
        isEncryptedPayload(summaryRaw) ||
        isEncryptedPayload(summariesRaw) ||
        isEncryptedPayload(payslipsRaw);
      if (hasCipher) {
        // Keep ciphertext intact — never treat as empty store.
        payloadLocked = true;
        payloadError = msg;
        appendDiag(`hydrate decrypt fail: ${msg} (ciphertext kept, writes blocked)`);
      } else {
        payloadLocked = false;
        payloadError = null;
      }
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
  void import('../sources/webview/loga3/shared/env')
    .then((m) => m.hydrateLoga3EnvForActiveWorkplace())
    .catch(() => {});
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
  if (payloadLocked) {
    throw new Error(t('storePayloadLocked'));
  }
  const wpId = cache.activeWorkplaceId;
  const tagged = wpId ? tagEntries(entries, wpId) : entries;
  const summaries =
    opts.summaries !== undefined
      ? opts.summaries.map((s) =>
          wpId && !s.workplaceId ? { ...s, workplaceId: wpId } : s
        )
      : opts.summary !== undefined && opts.summary
        ? [
            wpId && !opts.summary.workplaceId
              ? { ...opts.summary, workplaceId: wpId }
              : opts.summary,
          ]
        : opts.summary === null
          ? []
          : cache.summaries;
  const summary =
    opts.summary !== undefined
      ? opts.summary && wpId && !opts.summary.workplaceId
        ? { ...opts.summary, workplaceId: wpId }
        : opts.summary
      : summaries.length
        ? summaries[summaries.length - 1]
        : cache.summary;

  cache = {
    ...cache,
    entries: tagged,
    rawText: opts.rawText ?? cache.rawText,
    summary,
    summaries,
  };
  await AsyncStorage.setItem(KEYS.entries, await encryptUtf8(JSON.stringify(tagged)));
  if (opts.rawText != null) {
    await AsyncStorage.setItem(KEYS.rawText, await encryptUtf8(opts.rawText));
  }
  if (opts.summary !== undefined || opts.summaries !== undefined) {
    await AsyncStorage.setItem(KEYS.summary, await encryptUtf8(JSON.stringify(summary)));
    await AsyncStorage.setItem(KEYS.summaries, await encryptUtf8(JSON.stringify(summaries)));
  }
  notify();
  pingHomeWidgets(tagged);
  void import('../schedule/shiftAlarms')
    .then((m) => m.rescheduleShiftAlarms())
    .catch(() => {
      // optional
    });
}

/** Upsert one Verdienstnachweis by payMonth + workplace. */
export async function upsertPayslip(doc: PayslipDocument): Promise<void> {
  if (payloadLocked) {
    throw new Error(t('storePayloadLocked'));
  }
  const wpId = doc.workplaceId || cache.activeWorkplaceId;
  const tagged = wpId && !doc.workplaceId ? { ...doc, workplaceId: wpId } : doc;
  const rest = cache.payslips.filter(
    (p) =>
      !(
        p.payMonth === tagged.payMonth &&
        (p.workplaceId || '') === (tagged.workplaceId || '')
      )
  );
  const payslips = [...rest, tagged].sort((a, b) => a.payMonth.localeCompare(b.payMonth));
  cache = { ...cache, payslips };
  await AsyncStorage.setItem(KEYS.payslips, await encryptUtf8(JSON.stringify(payslips)));
  notify();
}

/** Existing VN for payMonth (YYYY-MM) + optional workplace — or null. */
export function findPayslip(
  payMonth: string,
  workplaceId?: string | null
): PayslipDocument | null {
  const wp = workplaceId || cache.activeWorkplaceId || '';
  const match = cache.payslips.find((p) => {
    if (p.payMonth !== payMonth) return false;
    if (!wp) return true;
    return !p.workplaceId || p.workplaceId === wp;
  });
  return match || null;
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

export async function setEventFormat(patch: Partial<EventFormatPrefs>): Promise<void> {
  const eventFormat = { ...cache.eventFormat, ...patch };
  cache = { ...cache, eventFormat };
  await AsyncStorage.setItem(KEYS.eventFormat, JSON.stringify(eventFormat));
  notify();
}

export async function setPreset(preset: string): Promise<void> {
  const active = getActiveWorkplace();
  if (!active) {
    cache = { ...cache, preset };
    await AsyncStorage.setItem(KEYS.preset, preset);
    notify();
    return;
  }
  await setWorkplace({
    packId: active.packId,
    groupId: active.groupId,
    areaId: active.areaId,
    preset,
  });
}

/** Update pack scope on the active workplace (creates one if none). */
export async function setWorkplace(scope: {
  packId: string;
  groupId: string;
  areaId: string;
  preset: string;
  label?: string;
}): Promise<void> {
  const pack = scope.packId ? getPackById(scope.packId) : null;
  const group = pack?.groups.find((g) => g.id === scope.groupId);
  const area = group?.areas.find((a) => a.id === scope.areaId);
  const label =
    scope.label?.trim() ||
    defaultLabelForPack(scope.packId, pack?.name, area?.label, scope.preset);

  let workplaces = [...cache.workplaces];
  let activeId = cache.activeWorkplaceId;
  const idx = workplaces.findIndex((w) => w.id === activeId);
  if (idx >= 0) {
    workplaces[idx] = {
      ...workplaces[idx],
      packId: scope.packId,
      groupId: scope.groupId,
      areaId: scope.areaId,
      preset: scope.preset,
      label,
    };
  } else {
    activeId = newWorkplaceId();
    workplaces = [
      ...workplaces,
      {
        id: activeId,
        label,
        packId: scope.packId,
        groupId: scope.groupId,
        areaId: scope.areaId,
        preset: scope.preset,
      },
    ];
  }

  const mirrored = mirrorActive(workplaces, activeId);
  cache = { ...cache, ...mirrored };
  await persistWorkplaces(mirrored.workplaces, mirrored.activeWorkplaceId);
  notify();
}

/** Switch which employer Import/Fetch/Setup use. Preview stays merged. */
export async function setActiveWorkplaceId(id: string): Promise<void> {
  if (!cache.workplaces.some((w) => w.id === id)) return;
  if (cache.activeWorkplaceId === id) return;
  const mirrored = mirrorActive(cache.workplaces, id);
  cache = { ...cache, ...mirrored };
  await persistWorkplaces(mirrored.workplaces, mirrored.activeWorkplaceId);
  notify();
  void import('../sources/webview/loga3/shared/env')
    .then((m) => m.hydrateLoga3EnvForActiveWorkplace())
    .catch(() => {});
}

/** Add a second (or first) employer profile and make it active. */
export async function addWorkplace(scope?: {
  packId?: string;
  groupId?: string;
  areaId?: string;
  preset?: string;
  label?: string;
}): Promise<WorkplaceProfile> {
  const packId = scope?.packId || '';
  const pack = packId ? getPackById(packId) : null;
  const groupId = scope?.groupId || pack?.groups[0]?.id || '';
  const group = pack?.groups.find((g) => g.id === groupId);
  const area =
    group?.areas.find((a) => a.id === scope?.areaId) ||
    group?.areas.find((a) => a.supported) ||
    group?.areas[0];
  const areaId = scope?.areaId || area?.id || '';
  const preset = scope?.preset || area?.defaultPreset || '';
  const label =
    scope?.label?.trim() ||
    defaultLabelForPack(packId, pack?.name, area?.label, preset);
  const profile: WorkplaceProfile = {
    id: newWorkplaceId(),
    label,
    packId,
    groupId,
    areaId,
    preset,
  };
  const workplaces = [...cache.workplaces, profile];
  const mirrored = mirrorActive(workplaces, profile.id);
  cache = { ...cache, ...mirrored };
  await persistWorkplaces(mirrored.workplaces, mirrored.activeWorkplaceId);
  notify();
  void import('../sources/webview/loga3/shared/env')
    .then((m) => m.hydrateLoga3EnvForActiveWorkplace())
    .catch(() => {});
  return profile;
}

export async function removeWorkplace(id: string): Promise<void> {
  if (cache.workplaces.length <= 1) {
    // Last profile: clear scope but keep structure empty via wipe-style clear of workplace fields.
    const workplaces: WorkplaceProfile[] = [];
    cache = {
      ...cache,
      ...mirrorActive(workplaces, ''),
      entries: [],
      rawText: '',
      summary: null,
      summaries: [],
      payslips: [],
    };
    await persistWorkplaces([], '');
    await AsyncStorage.setItem(KEYS.entries, await encryptUtf8('[]'));
    await AsyncStorage.setItem(KEYS.rawText, await encryptUtf8(''));
    await AsyncStorage.setItem(KEYS.summary, await encryptUtf8('null'));
    await AsyncStorage.setItem(KEYS.summaries, await encryptUtf8('[]'));
    await AsyncStorage.setItem(KEYS.payslips, await encryptUtf8('[]'));
    notify();
    pingHomeWidgets([]);
    return;
  }
  const workplaces = cache.workplaces.filter((w) => w.id !== id);
  const nextActive =
    cache.activeWorkplaceId === id ? workplaces[0].id : cache.activeWorkplaceId;
  const entries = cache.entries.filter((e) => e.workplaceId !== id);
  const summaries = cache.summaries.filter((s) => s.workplaceId !== id);
  const payslips = cache.payslips.filter((p) => p.workplaceId !== id);
  const mirrored = mirrorActive(workplaces, nextActive);
  cache = {
    ...cache,
    ...mirrored,
    entries,
    summaries,
    payslips,
    summary: summaries[summaries.length - 1] || null,
  };
  await persistWorkplaces(mirrored.workplaces, mirrored.activeWorkplaceId);
  await AsyncStorage.setItem(KEYS.entries, await encryptUtf8(JSON.stringify(entries)));
  await AsyncStorage.setItem(KEYS.summaries, await encryptUtf8(JSON.stringify(summaries)));
  await AsyncStorage.setItem(KEYS.payslips, await encryptUtf8(JSON.stringify(payslips)));
  await AsyncStorage.setItem(
    KEYS.summary,
    await encryptUtf8(JSON.stringify(cache.summary))
  );
  const { clearCredentialsForWorkplace } = await import(
    '../sources/webview/loga3/shared/credentials'
  );
  const { clearLoga3BaseUrlForWorkplace } = await import('../sources/webview/loga3/shared/env');
  await clearCredentialsForWorkplace(id);
  await clearLoga3BaseUrlForWorkplace(id);
  notify();
  pingHomeWidgets(entries);
  void import('../sources/webview/loga3/shared/env')
    .then((m) => m.hydrateLoga3EnvForActiveWorkplace())
    .catch(() => {});
}

export async function renameWorkplace(id: string, label: string): Promise<void> {
  const next = label.trim();
  if (!next) return;
  const workplaces = cache.workplaces.map((w) =>
    w.id === id ? { ...w, label: next } : w
  );
  const mirrored = mirrorActive(workplaces, cache.activeWorkplaceId);
  cache = { ...cache, ...mirrored };
  await persistWorkplaces(mirrored.workplaces, mirrored.activeWorkplaceId);
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
  const { clearAllCredentials } = await import('../sources/webview/loga3/shared/credentials');
  const { clearAllLoga3BaseUrls } = await import('../sources/webview/loga3/shared/env');
  const { deleteAllPdfFiles } = await import('../sources/webview/pdfStore');
  const { disconnectGoogle } = await import('../sync/google');
  const { setSmokeFetchIntent, clearMatrixStatus } = await import('../setup/smokeFetchIntent');
  const { clearBiometricSession, setBiometricLockEnabled } = await import('../security/biometric');

  const ids = cache.workplaces.map((w) => w.id);

  await Promise.all([
    clearAllCredentials(ids),
    clearAllLoga3BaseUrls(ids),
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
      KEYS.packId,
      KEYS.groupId,
      KEYS.areaId,
      KEYS.workplaces,
      KEYS.activeWorkplaceId,
      KEYS.googleCalendarId,
      KEYS.summary,
      KEYS.summaries,
      KEYS.payslips,
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
    packId: '',
    groupId: '',
    areaId: '',
    workplaces: [],
    activeWorkplaceId: '',
    summary: null,
    summaries: [],
    payslips: [],
  };
  notify();
  pingHomeWidgets([]);
  void import('../schedule/shiftAlarms')
    .then((m) => m.rescheduleShiftAlarms())
    .catch(() => {
      // optional
    });
}
