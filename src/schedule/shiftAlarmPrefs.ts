/**
 * Shift reminders: clock times per Dienst code from the active mapping
 * (e.g. F → 06:00), not “minutes before start”.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HospitalMapping, MappingValue } from '../convert/types';
import { mappingCode } from '../convert/shiftMapping';

const KEY = 'loga3.shiftAlarmPrefs';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_TIMES = 7;

export type ShiftAlarmPrefs = {
  enabled: boolean;
  /**
   * Default clock times (HH:MM) when a code has no entry in codeTimes.
   * Empty = only codes with explicit times get reminders.
   */
  times: string[];
  /** Per shift code reminder times. Empty array = no reminders for that code (overrides default). */
  codeTimes: Record<string, string[]>;
  /** How many days ahead to schedule (1–21). */
  horizonDays: number;
};

export const DEFAULT_SHIFT_ALARM_PREFS: ShiftAlarmPrefs = {
  enabled: false,
  times: [],
  codeTimes: {},
  horizonDays: 14,
};

export type MappingShiftOption = {
  code: string;
  label: string;
  /** Planned window from mapping, e.g. 07:35–15:50 */
  window: string;
  color?: string;
};

export function normalizeTime(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (!TIME_RE.test(s)) return null;
  return s;
}

/**
 * Loose clock input → HH:MM.
 * Accepts `6:30`, `6.30`, `6 30`, `630`, `0630`, `6` (= 06:00).
 */
export function parseLooseTime(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const strict = normalizeTime(s);
  if (strict) return strict;

  const sep = /^(\d{1,2})\s*[:.,\s]\s*(\d{1,2})$/.exec(s);
  if (sep) {
    const h = Number(sep[1]);
    const m = Number(sep[2]);
    if (h > 23 || m > 59) return null;
    return formatHHMM(h, m);
  }

  const digits = s.replace(/\D/g, '');
  if (!digits || digits.length > 4) return null;
  let h: number;
  let m: number;
  if (digits.length <= 2) {
    h = Number(digits);
    m = 0;
  } else if (digits.length === 3) {
    h = Number(digits.slice(0, 1));
    m = Number(digits.slice(1));
  } else {
    h = Number(digits.slice(0, 2));
    m = Number(digits.slice(2));
  }
  if (h > 23 || m > 59) return null;
  return formatHHMM(h, m);
}

export function normalizeTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const t = normalizeTime(x);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TIMES) break;
  }
  return out.sort();
}

export function normalizeCodeTimes(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = String(k || '')
      .trim()
      .toUpperCase();
    if (!code) continue;
    // Explicit empty array = “off for this code” (blocks default times).
    if (Array.isArray(v) && v.length === 0) {
      out[code] = [];
      continue;
    }
    const times = normalizeTimes(v);
    if (times.length) out[code] = times;
  }
  return out;
}

/** Migrate legacy minutes-before prefs → empty clock prefs (user reconfigures). */
function fromLegacy(raw: Record<string, unknown>): Partial<ShiftAlarmPrefs> {
  const hasNew =
    Array.isArray(raw.times) ||
    (raw.codeTimes && typeof raw.codeTimes === 'object');
  if (hasNew) {
    return {
      enabled: raw.enabled === true,
      times: normalizeTimes(raw.times),
      codeTimes: normalizeCodeTimes(raw.codeTimes),
      horizonDays: Number(raw.horizonDays),
    };
  }
  return {
    enabled: raw.enabled === true,
    times: [],
    codeTimes: {},
    horizonDays: Number(raw.horizonDays),
  };
}

export function normalizeShiftAlarmPrefs(
  raw: Partial<ShiftAlarmPrefs> | Record<string, unknown> | null | undefined
): ShiftAlarmPrefs {
  const base = fromLegacy((raw || {}) as Record<string, unknown>);
  const horizon = Math.max(1, Math.min(21, Math.round(Number(base.horizonDays) || 14)));
  return {
    enabled: base.enabled === true,
    times: normalizeTimes(base.times),
    codeTimes: normalizeCodeTimes(base.codeTimes),
    horizonDays: horizon,
  };
}

export function timesForCode(prefs: ShiftAlarmPrefs, code: string | null | undefined): string[] {
  const c = String(code || '')
    .trim()
    .toUpperCase();
  if (c && Object.prototype.hasOwnProperty.call(prefs.codeTimes, c)) {
    return prefs.codeTimes[c];
  }
  return prefs.times;
}

export function formatTimesList(times: string[]): string {
  return times.length ? times.join(', ') : '—';
}

export function formatHHMM(hour: number, minute: number): string {
  const h = Math.max(0, Math.min(23, Math.round(hour)));
  const m = Math.max(0, Math.min(59, Math.round(minute)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function mappingLabel(value: MappingValue): string {
  if (typeof value === 'object' && value.label) return value.label;
  return mappingCode(value).code || '';
}

/** Unique Dienste from the active preset (order = mapping file order). */
export function listMappingShiftOptions(
  mapping: HospitalMapping | null | undefined,
  preset: string | null | undefined
): MappingShiftOption[] {
  const table = mapping?.presets?.[preset || ''] || {};
  const colors = mapping?.colors || {};
  const seen = new Set<string>();
  const out: MappingShiftOption[] = [];
  for (const [window, value] of Object.entries(table)) {
    const { code } = mappingCode(value);
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = mappingLabel(value) || key;
    out.push({
      code: key,
      label,
      window: window.replace('-', '–'),
      color: colors[key] || colors[code],
    });
  }
  return out;
}

export async function loadShiftAlarmPrefs(): Promise<ShiftAlarmPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SHIFT_ALARM_PREFS };
    return normalizeShiftAlarmPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SHIFT_ALARM_PREFS };
  }
}

export async function saveShiftAlarmPrefs(
  patch: Partial<ShiftAlarmPrefs>
): Promise<ShiftAlarmPrefs> {
  const next = normalizeShiftAlarmPrefs({ ...(await loadShiftAlarmPrefs()), ...patch });
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  try {
    const { rescheduleShiftAlarms } = await import('./shiftAlarms');
    await rescheduleShiftAlarms(next);
  } catch {
    // notifications optional
  }
  return next;
}
