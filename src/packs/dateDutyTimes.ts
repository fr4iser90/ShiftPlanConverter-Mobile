/**
 * Resolve display/calendar times for date×duty column shorts from pack `times`.
 */
import type { PackDateDutyColumn, PackDateDutyConfig, PackDateDutyWhen } from './types';

export type ResolvedDateDutyTime = {
  start: string;
  end: string;
  endNextDay?: boolean;
};

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function matchesWhen(
  when: PackDateDutyWhen | undefined,
  d: Date,
  isHoliday: boolean
): boolean {
  const w = when || 'any';
  if (w === 'any') return true;
  const weekend = isWeekend(d) || isHoliday;
  const dow = d.getDay(); // 0=Sun … 5=Fri
  if (w === 'weekend-or-holiday') return weekend;
  if (w === 'weekday') return !weekend;
  if (w === 'weekday-mon-thu') return !weekend && dow >= 1 && dow <= 4;
  if (w === 'friday') return !weekend && dow === 5;
  return false;
}

/** Prefer specific `when` over `any` when several slots match. */
function whenRank(when: PackDateDutyWhen | undefined): number {
  const w = when || 'any';
  if (w === 'any') return 0;
  if (w === 'weekday' || w === 'weekend-or-holiday') return 1;
  return 2;
}

export function resolveDateDutyColumnTime(
  column: PackDateDutyColumn,
  date: Date,
  isHoliday = false
): ResolvedDateDutyTime | null {
  const slots = column.times;
  if (!slots?.length) return null;
  let best: { rank: number; slot: ResolvedDateDutyTime } | null = null;
  for (const slot of slots) {
    if (!matchesWhen(slot.when, date, isHoliday)) continue;
    const rank = whenRank(slot.when);
    if (!best || rank > best.rank) {
      best = {
        rank,
        slot: {
          start: slot.start,
          end: slot.end,
          endNextDay: slot.endNextDay,
        },
      };
    }
  }
  return best?.slot || null;
}

export function findDateDutyColumnByShort(
  config: PackDateDutyConfig | null | undefined,
  short: string
): PackDateDutyColumn | null {
  const s = String(short || '')
    .trim()
    .toUpperCase();
  if (!s || !config?.columns?.length) return null;
  for (const col of config.columns) {
    const cs = String(col.short || col.id || '')
      .trim()
      .toUpperCase();
    if (cs === s) return col;
  }
  return null;
}

/** Format for table: `11:30-08:30+1` when end is next day. */
export function formatDateDutyTimeLabel(t: ResolvedDateDutyTime): string {
  const base = `${t.start}-${t.end}`;
  return t.endNextDay ? `${base}+1` : base;
}

/**
 * Cell may be `HD` or `HD+RD`. Resolve each short; join with `·` when times differ.
 */
export function formatDateDutyCellTime(
  cell: string,
  config: PackDateDutyConfig | null | undefined,
  date: Date | null,
  isHoliday = false
): string {
  const parts = String(cell || '')
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length || !date) return '';
  const labels: string[] = [];
  for (const short of parts) {
    const col = findDateDutyColumnByShort(config, short);
    if (!col) continue;
    const t = resolveDateDutyColumnTime(col, date, isHoliday);
    if (!t) continue;
    const label = formatDateDutyTimeLabel(t);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join('·');
}
