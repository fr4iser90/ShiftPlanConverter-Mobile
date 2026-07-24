import type { ShiftEntry } from '../convert/types';
import { parseEntryDate, startOfLocalDay, toIsoDate } from './dates';

/** Pack colors or stable hash fallback. */
export function colorForShiftType(
  type: string,
  packColors?: Record<string, string> | null
): string {
  const code = (type || '').replace(/\s*⚠️.*$/, '').trim();
  if (packColors?.[code]) return packColors[code]!;
  // strip common suffixes
  const base = code.replace(/\*$/, '');
  if (packColors?.[base]) return packColors[base]!;
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 55% 42%)`;
}

export function entriesByDate(entries: ShiftEntry[]): Map<string, ShiftEntry[]> {
  const map = new Map<string, ShiftEntry[]>();
  for (const e of entries) {
    const list = map.get(e.date) || [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}

/** Next upcoming shift (today or later), preferring earliest start. */
export function findNextShift(entries: ShiftEntry[], now = new Date()): ShiftEntry | null {
  const today = toIsoDate(startOfLocalDay(now));
  const upcoming = entries
    .filter((e) => e.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.start || '').localeCompare(b.start || '');
    });
  return upcoming[0] || null;
}

export function formatShiftLine(e: ShiftEntry): string {
  const code = e.type || '?';
  if (e.allDay) return `${code} · ganztägig`;
  if (e.start && e.end) return `${code} · ${e.start}–${e.end}`;
  return code;
}

export function entrySortKey(e: ShiftEntry): string {
  return `${e.date}|${e.start || ''}|${e.type}`;
}

export function isPastEntry(e: ShiftEntry, now = new Date()): boolean {
  const d = parseEntryDate(e.date);
  if (!d) return false;
  return d.getTime() < startOfLocalDay(now).getTime();
}
