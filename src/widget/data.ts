import type { ShiftEntry } from '../convert/types';
import {
  addDays,
  formatDeDate,
  sameDay,
  startOfWeek,
  toIsoDate,
  weekdayShort,
  weekTitle,
} from '../calendar/dates';
import { entriesByDate, findNextShift, formatShiftLine } from '../calendar/shifts';
import type { WidgetScheme } from './theme';

export type WeekDayChip = {
  label: string;
  dayNum: number;
  codes: string;
  isToday: boolean;
};

export type NextShiftWidgetData = {
  empty: boolean;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Optional sync-due hint under subtitle */
  badge?: string | null;
  scheme: WidgetScheme;
};

export type WeekPlanWidgetData = {
  empty: boolean;
  eyebrow: string;
  range: string;
  days: WeekDayChip[];
  badge?: string | null;
  scheme: WidgetScheme;
};

export function buildNextShiftData(
  entries: ShiftEntry[],
  scheme: WidgetScheme,
  now = new Date(),
  badge?: string | null
): NextShiftWidgetData {
  const next = findNextShift(entries, now);
  if (!next) {
    return {
      empty: true,
      eyebrow: 'LOGA3',
      title: 'Keine Schichten',
      subtitle: 'In der App aktualisieren',
      badge: badge || null,
      scheme,
    };
  }
  return {
    empty: false,
    eyebrow: 'Nächste Schicht',
    title: formatShiftLine(next),
    subtitle: formatDeDate(next.date),
    badge: badge || null,
    scheme,
  };
}

export function buildWeekPlanData(
  entries: ShiftEntry[],
  scheme: WidgetScheme,
  now = new Date(),
  badge?: string | null
): WeekPlanWidgetData {
  const sow = startOfWeek(now);
  const byDate = entriesByDate(entries);
  const days: WeekDayChip[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(sow, i);
    const iso = toIsoDate(day);
    const list = byDate.get(iso) || [];
    const codes = list
      .map((e) => (e.type || '?').replace(/\s*⚠️.*$/, '').trim())
      .filter(Boolean)
      .slice(0, 2)
      .join('·');
    return {
      label: weekdayShort(day),
      dayNum: day.getDate(),
      codes: codes || '—',
      isToday: sameDay(day, now),
    };
  });
  const hasAny = days.some((d) => d.codes !== '—');
  return {
    empty: !hasAny,
    eyebrow: 'Diese Woche',
    range: weekTitle(sow),
    days,
    badge: badge || null,
    scheme,
  };
}
