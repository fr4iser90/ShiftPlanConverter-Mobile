/**
 * Shared axis cues to tell person×day (month-matrix) from date×duty boards.
 * Used by scorers + auto-detect — not a layout itself.
 */
import type { OcrLine } from '../recognize';
import {
  cleanCell,
  looksLikeDayHeader,
  looksLikeDayNumber,
  looksLikeShiftCell,
  looksLikeWeekdayOnly,
  xCenter,
  yCenter,
} from './month-matrix/geometry';

/**
 * Leading calendar date (date×duty left gutter).
 * OCR often emits trailing junk: `01.09,` / `08.09.` / `14.09.Mo` / `04.09,Fr`.
 * Do not require `\b` after optional weekday — that fails when a comma was consumed.
 */
const DATE_ROW_RE =
  /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*[,.]?\s*(Mo|Di|Mi|Do|Fr|Sa|So)?\.?\s*[,.]?$/i;

export type AxisCues = {
  leftDateRows: number;
  /** Mo1 / Di2 style day headers (month-matrix). */
  moDiHeaders: number;
  dayNumbers: number;
  weekdays: number;
  /** Left column name-like tokens (no digits). */
  leftNames: number;
  shiftCells: number;
  /** Tokens in the top ~12% of the page (header band). */
  topBandTokens: number;
};

export function looksLikeDateRow(text: string): boolean {
  return DATE_ROW_RE.test(cleanCell(text));
}

export function measureAxisCues(
  lines: OcrLine[],
  pageWidth: number,
  pageHeight?: number
): AxisCues {
  const cues: AxisCues = {
    leftDateRows: 0,
    moDiHeaders: 0,
    dayNumbers: 0,
    weekdays: 0,
    leftNames: 0,
    shiftCells: 0,
    topBandTokens: 0,
  };
  if (!lines.length || pageWidth <= 0) return cues;

  let maxY = 0;
  for (const l of lines) {
    const y1 = l.boundingBox.y + l.boundingBox.height;
    if (y1 > maxY) maxY = y1;
  }
  const h = pageHeight && pageHeight > 0 ? pageHeight : Math.max(maxY, 1);
  const topBand = h * 0.12;
  const leftGutter = pageWidth * 0.28;

  for (const l of lines) {
    const t = cleanCell(l.text);
    if (!t) continue;
    const xc = xCenter(l);
    const yc = yCenter(l);

    if (yc <= topBand) cues.topBandTokens += 1;

    // Dates first — otherwise `01.09,` / names in the duty body skew month-matrix.
    if (xc < leftGutter && looksLikeDateRow(t)) {
      cues.leftDateRows += 1;
      continue;
    }
    if (looksLikeDayHeader(t)) {
      cues.moDiHeaders += 1;
      continue;
    }
    if (looksLikeWeekdayOnly(t)) {
      cues.weekdays += 1;
      continue;
    }
    if (looksLikeDayNumber(t)) {
      cues.dayNumbers += 1;
      continue;
    }
    if (looksLikeShiftCell(t)) {
      cues.shiftCells += 1;
      continue;
    }
    if (
      xc < leftGutter &&
      t.length >= 3 &&
      /[A-Za-zÄÖÜäöüß]/.test(t) &&
      !/\d/.test(t)
    ) {
      cues.leftNames += 1;
    }
  }

  return cues;
}

/** True when cues look like dates×duties rather than people×days. */
export function looksLikeDateDutyAxes(cues: AxisCues): boolean {
  return cues.leftDateRows >= 8 && cues.moDiHeaders < 6;
}

/** True when cues look like a classic month wall plan. */
export function looksLikeMonthMatrixAxes(cues: AxisCues): boolean {
  const daySignal =
    cues.moDiHeaders +
    Math.min(cues.weekdays, 7) +
    (cues.dayNumbers >= 10 ? Math.min(14, cues.dayNumbers / 2) : 0);
  return daySignal >= 7 && cues.leftNames >= 2 && cues.leftDateRows < 6;
}
