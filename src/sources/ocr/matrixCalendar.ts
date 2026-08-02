/**
 * Month-matrix calendar helpers (column ↔ calendar day / weekend).
 * Geometry owns column index; calendar owns Sa/So — not cell color.
 */
import type { MonthMatrixGrid } from './layouts/month-matrix/types';

const WEEKEND_HEADER_RE = /^(Sa|So)\d*/i;

export function isWeekendHeaderLabel(h: string): boolean {
  return WEEKEND_HEADER_RE.test(String(h || '').trim());
}

/** Day-of-month for a matrix column (1–31), from header / dayFrame / sequential index. */
export function dayNumberForColumn(grid: MonthMatrixGrid, colIndex: number): number {
  const header = String(grid.headers[colIndex] || '').trim();
  const label = String(grid.dayFrames?.[colIndex]?.label || '').trim();
  const fromHeader = parseInt(header.replace(/\D/g, ''), 10);
  if (Number.isFinite(fromHeader) && fromHeader >= 1 && fromHeader <= 31) return fromHeader;
  const fromLabel = parseInt(label.replace(/\D/g, ''), 10);
  if (Number.isFinite(fromLabel) && fromLabel >= 1 && fromLabel <= 31) return fromLabel;
  return colIndex + 1;
}

export function isCalendarWeekend(day: number, month: number, year: number): boolean {
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000)) return false;
  const w = new Date(year, month - 1, day).getDay();
  return w === 0 || w === 6;
}

/** True when this column is Saturday/Sunday (header label or roster calendar). */
export function isMatrixWeekendColumn(grid: MonthMatrixGrid, colIndex: number): boolean {
  const header = String(grid.headers[colIndex] || '').trim();
  if (isWeekendHeaderLabel(header)) return true;
  const label = String(grid.dayFrames?.[colIndex]?.label || '').trim();
  if (isWeekendHeaderLabel(label)) return true;
  const month = Number(grid.rosterMonth);
  const year = Number(grid.rosterYear);
  if (!(month >= 1 && month <= 12 && year >= 2000)) return false;
  return isCalendarWeekend(dayNumberForColumn(grid, colIndex), month, year);
}
