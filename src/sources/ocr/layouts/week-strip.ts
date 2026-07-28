/**
 * Week strip — Mon–Sun / ward board (~5–9 day columns).
 * Uses the shared month-matrix grid builder when column count is week-sized.
 */
import { buildMonthMatrixGrid, type MonthMatrixGrid } from '../monthMatrix';
import type { OcrLine } from '../recognize';
import type { OcrLayoutProfile } from './types';
import { trimOcr } from './types';

const WEEKDAY_TOKEN = /(Mo|Di|Mi|Do|Fr|Sa|So|Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?=[0-9]|\b)/gi;

export const WEEK_STRIP_LAYOUT: OcrLayoutProfile = {
  id: 'week-strip',
  labelKey: 'ocrLayoutWeek',
  hintKey: 'ocrLayoutWeekHint',
  status: 'experimental',
  postprocess: trimOcr,
};

/** True when grid looks like a week board (not a full month). */
export function isWeekSizedGrid(grid: MonthMatrixGrid): boolean {
  return grid.ok && grid.headers.length >= 5 && grid.headers.length <= 9 && grid.rows.length >= 2;
}

/** Build week-strip table via shared grid (5–9 day columns). */
export function buildWeekStripGrid(lines: OcrLine[], pageWidth: number): MonthMatrixGrid {
  const grid = buildMonthMatrixGrid(lines, pageWidth);
  if (!grid.ok) return grid;
  if (grid.headers.length > 9) {
    // Likely a month — reject as week strip (one path; caller may ask user).
    return { ...grid, ok: false, reason: 'too-many-day-columns-for-week-strip' };
  }
  return grid;
}

export function scoreWeekStrip(text: string, lines: OcrLine[], pageWidth: number): number {
  const matches = String(text || '').match(WEEKDAY_TOKEN) || [];
  const unique = new Set(matches.map((m) => m.slice(0, 2).toLowerCase()));
  if (unique.size < 4) return 0;

  const grid = buildMonthMatrixGrid(lines, pageWidth);
  if (isWeekSizedGrid(grid)) {
    return Math.min(1, 0.55 + unique.size * 0.06 + Math.min(0.3, grid.rows.length / 16));
  }
  return Math.min(0.45, 0.18 + unique.size * 0.05);
}
