import type { ShiftEntry } from './types';
import type { OvernightMode } from '../state/eventFormat';

export function nextCalendarDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export function isOvernightEntry(entry: ShiftEntry): boolean {
  return Boolean(
    !entry.allDay && entry.start && entry.end && entry.end < entry.start
  );
}

/**
 * Wipe range for Google sync: include the next calendar day when any
 * overnight entry ends after midnight (span or split).
 */
export function calendarWipeRange(
  entries: ShiftEntry[]
): { startDate: string; endDate: string } | null {
  if (!entries.length) return null;
  let startDate = '';
  let endDate = '';
  for (const entry of entries) {
    if (!entry.date) continue;
    if (!startDate || entry.date < startDate) startDate = entry.date;
    let dayEnd = entry.date;
    if (isOvernightEntry(entry)) dayEnd = nextCalendarDay(entry.date);
    if (!endDate || dayEnd > endDate) endDate = dayEnd;
  }
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
}

/**
 * Expand overnight shifts for ICS / Google when the user chose split mode.
 * Store entries stay untouched; call only at export time.
 *
 * Part 1: start → 00:00 next day (still modeled as overnight end `00:00`).
 * Part 2: next day 00:00 → original end. Payroll detail lines only on part 1.
 */
export function expandEntriesForExport(
  entries: ShiftEntry[],
  overnightMode: OvernightMode = 'span'
): ShiftEntry[] {
  if (overnightMode !== 'split') return entries;

  const out: ShiftEntry[] = [];
  for (const entry of entries) {
    if (!isOvernightEntry(entry) || !entry.start || !entry.end) {
      out.push(entry);
      continue;
    }
    const window = { start: entry.start, end: entry.end };
    out.push({
      ...entry,
      end: '00:00',
      calendarPart: '1/2',
      overnightWindow: window,
    });
    out.push({
      ...entry,
      date: nextCalendarDay(entry.date),
      start: '00:00',
      end: entry.end,
      calendarPart: '2/2',
      overnightWindow: window,
      breakMinutes: undefined,
      actual: undefined,
      timeAccountDaily: undefined,
      onCallPercent: undefined,
      onCallRated: undefined,
    });
  }
  return out;
}
