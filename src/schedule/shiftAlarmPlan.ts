/**
 * Pure planning of shift wake reminders (no expo-notifications).
 */
import type { ShiftEntry } from '../convert/types';
import { remindsForCode, type ShiftAlarmPrefs, type ShiftRemind } from './shiftAlarmPrefs';

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
  /** True = fire on calendar day before the shift date. */
  eve: boolean;
};

function parseLocal(date: string, hhmm: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T${m[1]}:${m[2]}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve fire time for a remind.
 * - Same day: only if remindAt is strictly before shift start.
 * - Eve: previous calendar day at remindAt (user confirmed Vorabend).
 */
export function fireAtForRemindTime(
  shiftDate: string,
  shiftStart: string,
  remind: ShiftRemind | string,
  eveFlag?: boolean
): Date | null {
  const r: ShiftRemind =
    typeof remind === 'string'
      ? { time: remind, eve: eveFlag === true }
      : remind;
  const startAt = parseLocal(shiftDate, shiftStart);
  let fireAt = parseLocal(shiftDate, r.time);
  if (!startAt || !fireAt) return null;

  if (r.eve) {
    fireAt = new Date(fireAt.getTime() - 24 * 60 * 60 * 1000);
    return fireAt;
  }
  if (fireAt.getTime() >= startAt.getTime()) return null;
  return fireAt;
}

/** True when HH:MM remindAt is strictly before HH:MM shiftStart. */
export function isRemindBeforeShiftStart(remindAt: string, shiftStart: string): boolean {
  const rm = /^(\d{2}):(\d{2})$/.exec(remindAt);
  const sm = /^(\d{2}):(\d{2})$/.exec(shiftStart);
  if (!rm || !sm) return false;
  const r = Number(rm[1]) * 60 + Number(rm[2]);
  const s = Number(sm[1]) * 60 + Number(sm[2]);
  return r < s;
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
    const reminds = remindsForCode(prefs, code);
    for (const remind of reminds) {
      const fireAt = fireAtForRemindTime(entry.date, entry.start!, remind);
      if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
      const id = `${SHIFT_ALARM_ID_PREFIX}${entry.date}-${entry.start}-${remind.time}${
        remind.eve ? '-eve' : ''
      }`;
      planned.push({
        id,
        fireAt,
        shiftDate: entry.date,
        shiftStart: entry.start!,
        code,
        remindAt: remind.time,
        eve: remind.eve,
      });
    }
  }

  planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return planned.slice(0, MAX_SHIFT_ALARMS);
}
