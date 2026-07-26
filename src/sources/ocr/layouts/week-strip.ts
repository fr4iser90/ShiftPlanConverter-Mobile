/**
 * Week strip — Mon–Sun / ward board (~5–9 day columns).
 */
import { buildMonthMatrixGrid } from '../monthMatrix';
import type { OcrLine } from '../recognize';
import type { OcrLayoutProfile } from './types';
import { trimOcr } from './types';

const WEEKDAY_TOKEN = /\b(Mo|Di|Mi|Do|Fr|Sa|So|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi;

export const WEEK_STRIP_LAYOUT: OcrLayoutProfile = {
  id: 'week-strip',
  labelKey: 'ocrLayoutWeek',
  hintKey: 'ocrLayoutWeekHint',
  status: 'stub',
  postprocess: trimOcr,
};

export function scoreWeekStrip(text: string, lines: OcrLine[], pageWidth: number): number {
  const matches = String(text || '').match(WEEKDAY_TOKEN) || [];
  const unique = new Set(matches.map((m) => m.slice(0, 2).toLowerCase()));
  if (unique.size < 4) return 0;

  const grid = buildMonthMatrixGrid(lines, pageWidth);
  // Week boards look matrix-like but ~5–9 day columns, not a full month.
  if (grid.ok && grid.headers.length >= 5 && grid.headers.length <= 9 && grid.rows.length >= 2) {
    return Math.min(1, 0.5 + unique.size * 0.06 + Math.min(0.25, grid.rows.length / 20));
  }
  return Math.min(0.5, 0.2 + unique.size * 0.05);
}
