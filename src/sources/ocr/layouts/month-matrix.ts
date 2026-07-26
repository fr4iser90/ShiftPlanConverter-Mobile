/**
 * Month matrix — wall plan: name left, days across, duty codes in cells.
 *
 * Detection markers (score) ≠ successful parse:
 * - day-header tokens (Mo1… / Di2…) or many day numbers across the top band
 * - several left-column name-like tokens
 * - many short shift/code cells in the body
 * Full `buildMonthMatrixGrid` success boosts the score; hints alone can still pick this layout.
 */
import { buildMonthMatrixGrid } from '../monthMatrix';
import {
  cleanCell,
  looksLikeDayHeader,
  looksLikeDayNumber,
  looksLikeShiftCell,
  looksLikeWeekdayOnly,
  xCenter,
} from '../monthMatrix/geometry';
import type { OcrLine } from '../recognize';
import type { OcrLayoutProfile } from './types';
import { trimOcr } from './types';

export const MONTH_MATRIX_LAYOUT: OcrLayoutProfile = {
  id: 'month-matrix',
  labelKey: 'ocrLayoutMonth',
  hintKey: 'ocrLayoutMonthHint',
  status: 'experimental',
  postprocess: trimOcr,
};

function scoreFromBuiltGrid(lines: OcrLine[], pageWidth: number): number {
  const grid = buildMonthMatrixGrid(lines, pageWidth);
  if (!grid.ok || grid.headers.length < 3 || grid.rows.length < 1) return 0;

  const cols = grid.headers.length;
  const rows = grid.rows.length;
  const filled = grid.rows.reduce(
    (n, r) => n + r.cells.filter((c) => String(c || '').trim()).length,
    0
  );
  const capacity = Math.max(1, rows * cols);
  const fillRatio = filled / capacity;

  const colScore = cols >= 20 ? 1 : cols >= 10 ? 0.75 : cols >= 7 ? 0.45 : 0.25;
  const rowScore = rows >= 10 ? 1 : rows >= 5 ? 0.8 : rows >= 2 ? 0.55 : 0.3;
  const cellScore = Math.min(1, fillRatio / 0.25);

  return Math.min(1, 0.4 * colScore + 0.35 * rowScore + 0.25 * cellScore);
}

/**
 * Light geometry hints — do not require a complete grid.
 * Used so auto can pick month-matrix even when the parser later fails clearly.
 */
export function scoreMonthMatrixHints(lines: OcrLine[], pageWidth: number): number {
  if (!lines.length || pageWidth <= 0) return 0;

  let dayHeaders = 0;
  let dayNums = 0;
  let weekdays = 0;
  let leftNames = 0;
  let shiftCells = 0;

  for (const l of lines) {
    const t = cleanCell(l.text);
    if (!t) continue;
    const xc = xCenter(l);

    if (looksLikeDayHeader(t)) {
      dayHeaders += 1;
      continue;
    }
    if (looksLikeWeekdayOnly(t)) {
      weekdays += 1;
      continue;
    }
    if (looksLikeDayNumber(t)) {
      dayNums += 1;
      continue;
    }
    if (looksLikeShiftCell(t)) {
      shiftCells += 1;
      continue;
    }
    // Left name column: letters, no digits, not tiny abbreviations.
    if (
      xc < pageWidth * 0.3 &&
      t.length >= 3 &&
      /[A-Za-zÄÖÜäöüß]/.test(t) &&
      !/\d/.test(t)
    ) {
      leftNames += 1;
    }
  }

  // Need both “many days” and “several people” signals.
  const daySignal = dayHeaders + Math.min(weekdays, 7) + (dayNums >= 10 ? Math.min(14, dayNums / 2) : 0);
  if (daySignal < 7 || leftNames < 2) return 0;

  const colScore =
    dayHeaders >= 20 || dayNums >= 24
      ? 1
      : dayHeaders >= 10 || dayNums >= 14
        ? 0.75
        : dayHeaders >= 7 || daySignal >= 10
          ? 0.55
          : 0.35;
  const rowScore = leftNames >= 10 ? 1 : leftNames >= 5 ? 0.8 : leftNames >= 2 ? 0.55 : 0;
  const cellScore = Math.min(1, shiftCells / 40);

  // Hint path tops out under a fully built grid so real parses still win.
  return Math.min(0.85, 0.4 * colScore + 0.4 * rowScore + 0.2 * cellScore);
}

export function scoreMonthMatrix(lines: OcrLine[], pageWidth: number): number {
  return Math.max(scoreFromBuiltGrid(lines, pageWidth), scoreMonthMatrixHints(lines, pageWidth));
}
