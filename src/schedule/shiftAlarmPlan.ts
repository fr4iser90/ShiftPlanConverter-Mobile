/**
 * Pure planning of shift wake reminders (no expo-notifications).
 */
import type { ShiftEntry } from '../convert/types';
import { timesForCode, type ShiftAlarmPrefs } from './shiftAlarmPrefs';

export const SHIFT_ALARM_ID_PREFIX = 'loga3-shift-';
/** Soft cap — Android / Expo scheduled notif limits. */
export const MAX_SHIFT_ALARMS = 64;

export type PlannedShiftAlarm = {
  id: string;
  fireAt: Date;
  shiftDate: string;
  shiftStart: string;
  code: string;
  /** Clock time configured by user (HH:MM). */
  remindAt: string;
};

function parseLocal(date: string, hhmm: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T${m[1]}:${m[2]}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Fire at remindAt on the shift day if that is still before shift start;
 * otherwise the previous calendar day (e.g. 22:00 for a 07:35 Frühdienst).
 */
export function fireAtForRemindTime(
  shiftDate: string,
  shiftStart: string,
  remindAt: string
): Date | null {
  const startAt = parseLocal(shiftDate, shiftStart);
  let fireAt = parseLocal(shiftDate, remindAt);
  if (!startAt || !fireAt) return null;
  if (fireAt.getTime() >= startAt.getTime()) {
    fireAt = new Date(fireAt.getTime() - 24 * 60 * 60 * 1000);
  }
  return fireAt;
}

function prefsHaveAnyTimes(prefs: ShiftAlarmPrefs): boolean {
  if (prefs.times.length) return true;
  return Object.values(prefs.codeTimes).some((t) => t.length > 0);
}

/** Pure: which alarms to schedule from entries + prefs. */
export function planShiftAlarms(
  entries: ShiftEntry[],
  prefs: ShiftAlarmPrefs,
  now = new Date()
): PlannedShiftAlarm[] {
  if (!prefs.enabled || !prefsHaveAnyTimes(prefs)) return [];
  const horizonEnd = new Date(now.getTime() + prefs.horizonDays * 24 * 60 * 60 * 1000);
  const planned: PlannedShiftAlarm[] = [];

  const timed = entries
    .filter((e) => e.start && !e.allDay)
    .slice()
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));

  for (const entry of timed) {
    const startAt = parseLocal(entry.date, entry.start!);
    if (!startAt || startAt.getTime() <= now.getTime()) continue;
    if (startAt.getTime() > horizonEnd.getTime()) continue;

    const code = String(entry.type || '').trim() || '?';
    const times = timesForCode(prefs, code);
    for (const remindAt of times) {
      const fireAt = fireAtForRemindTime(entry.date, entry.start!, remindAt);
      if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
      const id = `${SHIFT_ALARM_ID_PREFIX}${entry.date}-${entry.start}-${remindAt}`;
      planned.push({
        id,
        fireAt,
        shiftDate: entry.date,
        shiftStart: entry.start!,
        code,
        remindAt,
      });
    }
  }

  planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return planned.slice(0, MAX_SHIFT_ALARMS);
}
