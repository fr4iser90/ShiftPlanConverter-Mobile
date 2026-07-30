/**
 * Shift reminders: clock times per Dienst code from the active mapping
 * (e.g. F → 06:00 same day, or 22:00 evening before).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PackMapping, MappingValue } from '../convert/types';
import { mappingCode } from '../convert/shiftMapping';

const KEY = 'loga3.shiftAlarmPrefs';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_TIMES = 7;

/** One reminder: clock time, optionally on the evening before the shift day. */
export type ShiftRemind = {
  time: string;
  eve: boolean;
};

export type ShiftAlarmPrefs = {
  enabled: boolean;
  /**
   * Default reminds when a code has no entry in codeTimes.
   * Empty = only codes with explicit times get reminders.
   */
  times: ShiftRemind[];
  /** Per shift code. Explicit empty array = no reminders for that code. */
  codeTimes: Record<string, ShiftRemind[]>;
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
  /** Planned window from pack mapping (HH:MM–HH:MM) */
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

export function remindKey(r: ShiftRemind): string {
  return r.eve ? `${r.time}|eve` : r.time;
}

/** Persist token: `06:00` or `22:00|eve`. */
export function remindToken(r: ShiftRemind): string {
  return remindKey(r);
}

export function parseRemindToken(raw: unknown): ShiftRemind | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { time?: unknown; eve?: unknown };
    const time = normalizeTime(o.time);
    if (!time) return null;
    return { time, eve: o.eve === true };
  }
  const s = String(raw || '').trim();
  if (!s) return null;
  const eve = /\|eve$/i.test(s);
  const time = normalizeTime(s.replace(/\|eve$/i, ''));
  if (!time) return null;
  return { time, eve };
}

export function normalizeReminds(raw: unknown): ShiftRemind[] {
  if (!Array.isArray(raw)) return [];
  const out: ShiftRemind[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const r = parseRemindToken(x);
    if (!r) continue;
    const k = remindKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= MAX_TIMES) break;
  }
  return out.sort((a, b) => {
    if (a.eve !== b.eve) return a.eve ? 1 : -1;
    return a.time.localeCompare(b.time);
  });
}

export function normalizeCodeTimes(raw: unknown): Record<string, ShiftRemind[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ShiftRemind[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = String(k || '')
      .trim()
      .toUpperCase();
    if (!code) continue;
    if (Array.isArray(v) && v.length === 0) {
      out[code] = [];
      continue;
    }
    const reminds = normalizeReminds(v);
    if (reminds.length) out[code] = reminds;
  }
  return out;
}

export function normalizeShiftAlarmPrefs(
  raw: Partial<ShiftAlarmPrefs> | Record<string, unknown> | null | undefined
): ShiftAlarmPrefs {
  const r = (raw || {}) as Record<string, unknown>;
  const horizon = Math.max(1, Math.min(21, Math.round(Number(r.horizonDays) || 14)));
  return {
    enabled: r.enabled === true,
    times: normalizeReminds(r.times),
    codeTimes: normalizeCodeTimes(r.codeTimes),
    horizonDays: horizon,
  };
}

export function remindsForCode(
  prefs: ShiftAlarmPrefs,
  code: string | null | undefined
): ShiftRemind[] {
  const c = String(code || '')
    .trim()
    .toUpperCase();
  if (c && Object.prototype.hasOwnProperty.call(prefs.codeTimes, c)) {
    return prefs.codeTimes[c];
  }
  return prefs.times;
}

export function formatRemindLabel(r: ShiftRemind, eveLabel: string): string {
  return r.eve ? `${r.time} · ${eveLabel}` : r.time;
}

export function formatRemindsList(reminds: ShiftRemind[], eveLabel: string): string {
  if (!reminds.length) return '—';
  return reminds.map((r) => formatRemindLabel(r, eveLabel)).join(', ');
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
  mapping: PackMapping | null | undefined,
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
  // Persist encoded tokens so JSON stays compact and readable.
  const serializable = {
    ...next,
    times: next.times.map(remindToken),
    codeTimes: Object.fromEntries(
      Object.entries(next.codeTimes).map(([k, v]) => [k, v.map(remindToken)])
    ),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(serializable));
  try {
    const { rescheduleShiftAlarms } = await import('./shiftAlarms');
    await rescheduleShiftAlarms(next);
  } catch {
    // notifications optional
  }
  return next;
}
