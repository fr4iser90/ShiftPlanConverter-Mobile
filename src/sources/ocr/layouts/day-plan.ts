/**
 * Day plan (Tagesplan) — one calendar day, many people / rooms / slots.
 * Stub until real photo samples land.
 */
import type { OcrLayoutProfile } from './types';
import { trimOcr } from './types';

const DAY_PLAN_TITLE = /\b(tagesplan|tag(?:es)?\s*plan|daily\s*plan|day\s*roster)\b/i;
const CLOCK = /\b\d{1,2}:\d{2}\b/g;
// Dot/slash dates only — hyphen ranges like 07:00-15:30 must not count as dates.
const DATE_TOKEN = /\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/g;

export const DAY_PLAN_LAYOUT: OcrLayoutProfile = {
  id: 'day-plan',
  labelKey: 'ocrLayoutDay',
  hintKey: 'ocrLayoutDayHint',
  status: 'stub',
  postprocess: trimOcr,
};

export function scoreDayPlan(text: string): number {
  const raw = String(text || '');
  if (!raw.trim()) return 0;

  const titleHit = DAY_PLAN_TITLE.test(raw) ? 0.35 : 0;
  const clocks = raw.match(CLOCK) || [];
  const dates = raw.match(DATE_TOKEN) || [];
  const uniqueDates = new Set(dates.map((d) => d.replace(/\s/g, '')));

  // Many clock times + at most one/two dates → day board, not month protocol.
  if (clocks.length < 4) return titleHit > 0 ? Math.min(0.4, titleHit + clocks.length * 0.05) : 0;
  if (uniqueDates.size > 3) return 0;

  const clockScore = Math.min(0.55, clocks.length / 16);
  const dateScore = uniqueDates.size <= 1 ? 0.2 : uniqueDates.size === 2 ? 0.1 : 0;
  return Math.min(1, titleHit + clockScore + dateScore);
}
