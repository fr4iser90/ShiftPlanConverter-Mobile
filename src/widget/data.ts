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
import type { WidgetDensity } from './prefs';
import type { WidgetScheme } from './theme';

export type WeekDayChip = {
  label: string;
  dayNum: number;
  codes: string;
  times: string;
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
  density: WidgetDensity;
};

export type WeekPlanWidgetData = {
  empty: boolean;
  eyebrow: string;
  range: string;
  days: WeekDayChip[];
  badge?: string | null;
  scheme: WidgetScheme;
  density: WidgetDensity;
  showTimes: boolean;
};

export function buildNextShiftData(
  entries: ShiftEntry[],
  scheme: WidgetScheme,
  now = new Date(),
  badge?: string | null,
  density: WidgetDensity = 'comfortable'
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
      density,
    };
  }
  return {
    empty: false,
    eyebrow: 'Nächste Schicht',
    title: formatShiftLine(next),
    subtitle: formatDeDate(next.date),
    badge: badge || null,
    scheme,
    density,
  };
}

function dayTimes(list: ShiftEntry[]): string {
  const t = list
    .map((e) => {
      if (e.start && e.end) return `${e.start}–${e.end}`;
      return e.start || e.end || '';
    })
    .filter(Boolean)
    .slice(0, 1);
  return t[0] || '';
}

/** Short duty label for week chips — never dump embedded times (BEREIT_00:00-…). */
export function shortDutyCode(type: string): string {
  let s = (type || '?').replace(/\s*⚠️.*$/u, '').trim();
  s = s.replace(/[_\s]+(\d{1,2}:\d{2}).*$/u, '').trim();
  s = s.replace(/\s+\d{1,2}:\d{2}.*$/u, '').trim();
  if (s.length > 7) s = s.slice(0, 7);
  return s || '?';
}

export function buildWeekPlanData(
  entries: ShiftEntry[],
  scheme: WidgetScheme,
  now = new Date(),
  badge?: string | null,
  density: WidgetDensity = 'comfortable',
  showTimes = false
): WeekPlanWidgetData {
  const sow = startOfWeek(now);
  const byDate = entriesByDate(entries);
  const days: WeekDayChip[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(sow, i);
    const iso = toIsoDate(day);
    const list = byDate.get(iso) || [];
    const codes = list
      .map((e) => shortDutyCode(e.type || ''))
      .filter(Boolean)
      .slice(0, 2)
      .join('·');
    return {
      label: weekdayShort(day),
      dayNum: day.getDate(),
      codes: codes || '—',
      times: dayTimes(list),
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
    density,
    showTimes,
  };
}
