/**
 * Single-person calendar (Einzelkalender) — one name, month calendar cells.
 * Stub until real photo samples land.
 */
import type { OcrLine } from '../../recognize';
import type { OcrLayoutProfile } from '../types';
import { trimOcr } from '../types';

const CALENDAR_TITLE =
  /\b(einzelkalender|mein\s*kalender|personal\s*calendar|my\s*calendar|monatskalender)\b/i;
const DAY_NUM = /^\d{1,2}$/;
const MONTH_NAME =
  /\b(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

export const SINGLE_CALENDAR_LAYOUT: OcrLayoutProfile = {
  id: 'single-calendar',
  labelKey: 'ocrLayoutSingleCalendar',
  hintKey: 'ocrLayoutSingleCalendarHint',
  status: 'stub',
  postprocess: trimOcr,
};

export function scoreSingleCalendar(text: string, lines: OcrLine[]): number {
  const raw = String(text || '');
  if (!raw.trim()) return 0;

  const titleHit = CALENDAR_TITLE.test(raw) ? 0.4 : 0;
  const monthHit = MONTH_NAME.test(raw) ? 0.15 : 0;

  const dayNums = (lines || []).filter((l) => DAY_NUM.test(String(l.text || '').trim()));
  // Calendar grids show many day numbers (1–31), not a full name×day wall matrix.
  if (dayNums.length < 10 && titleHit === 0) return 0;

  const dayScore =
    dayNums.length >= 28 ? 0.45 : dayNums.length >= 20 ? 0.35 : dayNums.length >= 10 ? 0.2 : 0;

  return Math.min(1, titleHit + monthHit + dayScore);
}
