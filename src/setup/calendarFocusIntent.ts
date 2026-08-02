/**
 * After import/fetch: Kalender opens on the updated month/week.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShiftEntry } from '@/src/convert/types';

export type CalendarFocusIntent = {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 optional — week view centers near this day */
  day?: number;
};

const KEY = 'loga3.calendarFocusIntent.v1';

let memory: CalendarFocusIntent | null = null;

export async function setCalendarFocusIntent(
  intent: CalendarFocusIntent | null
): Promise<void> {
  memory = intent;
  if (!intent) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(intent));
}

export async function peekCalendarFocusIntent(): Promise<CalendarFocusIntent | null> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    memory = JSON.parse(raw) as CalendarFocusIntent;
    return memory;
  } catch {
    return null;
  }
}

/** Consume intent (clears storage). */
export async function takeCalendarFocusIntent(): Promise<CalendarFocusIntent | null> {
  const v = await peekCalendarFocusIntent();
  memory = null;
  await AsyncStorage.removeItem(KEY);
  return v;
}

/** Prefer month containing today if present in `entries`, else earliest date. */
export function calendarFocusFromEntries(
  entries: ShiftEntry[]
): CalendarFocusIntent | null {
  const dates = entries
    .map((e) => String(e.date || '').trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!dates.length) return null;
  const todayYm = new Date().toISOString().slice(0, 7);
  const pick = dates.find((d) => d.startsWith(todayYm)) || dates[0]!;
  const [y, m, d] = pick.split('-').map((x) => Number(x));
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

export function calendarFocusFromYearMonth(
  year: number,
  month: number,
  day = 1
): CalendarFocusIntent | null {
  if (!year || month < 1 || month > 12) return null;
  return { year, month, day: Math.min(31, Math.max(1, day)) };
}
