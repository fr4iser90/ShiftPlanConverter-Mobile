/**
 * Desktop content-gate helpers (loga3-workflow.js) — pure TS, no WebView.
 */

export const MONTH_LABELS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

const WEEKDAY_CODES = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'] as const;

export function expectedFirstWeekdayCode(month: number, year: number): string {
  const date = new Date(Number(year), Number(month) - 1, 1);
  return WEEKDAY_CODES[date.getDay()];
}

export function expectedLastDayOfMonth(month: number, year: number): string {
  return String(new Date(Number(year), Number(month), 0).getDate());
}

export type ContentSignature = {
  key: string;
  gridKey: string;
  bookingsLabel: string | null;
  firstWeekday: string | null;
  lastDay: string | null;
  dayCount: number;
  schichtfrei: number;
  ranges: string[];
  geKo: string[];
  sample: string;
};

export type PickerState = {
  month: string | null;
  year: string | null;
  label?: string | null;
  found?: boolean;
};

/** Desktop hasSchedulePlan — ranges / KO*|GE* / SCHICHTFREI */
export function hasSchedulePlanFromSignature(sig: ContentSignature): boolean {
  return (sig.ranges?.length || 0) > 0 || (sig.geKo?.length || 0) > 0 || (sig.schichtfrei || 0) > 0;
}

/**
 * Desktop verifyCalendarShowsMonth — header + day01 weekday + lastDay.
 * Title "Buchungen für …" alone is NOT enough.
 */
export function verifyCalendarFromSignature(
  sig: ContentSignature,
  picker: PickerState,
  targetMonth: number,
  targetYear: number
): { ok: boolean; reason?: string } {
  const mm = String(targetMonth).padStart(2, '0');
  const year = String(targetYear);
  const expectedWd = expectedFirstWeekdayCode(targetMonth, targetYear);
  const expectedLast = expectedLastDayOfMonth(targetMonth, targetYear);

  const headerOk = Boolean(picker?.month === mm && picker?.year === year);
  if (!headerOk) {
    return { ok: false, reason: `header ${picker.month}/${picker.year} != ${mm}/${year}` };
  }
  if (!sig.firstWeekday) {
    return { ok: false, reason: 'day01 weekday missing' };
  }
  if (sig.firstWeekday !== expectedWd) {
    return {
      ok: false,
      reason: `day01=${sig.firstWeekday} expected=${expectedWd} (stale grid?)`,
    };
  }
  if (sig.lastDay && sig.lastDay !== expectedLast) {
    return { ok: false, reason: `lastDay=${sig.lastDay} expected=${expectedLast}` };
  }
  return { ok: true };
}

/** Parse Abrechnungsmonat from PDF / page text → MM/YYYY */
export function extractAbrechnungsmonatFromText(text: string): string | null {
  if (!text) return null;
  const m =
    text.match(/Abrechnungsmonat\s*[:\-]?\s*(\d{2})\s*[\/.\-]\s*(\d{4})/i) ||
    text.match(/Abrechnungsmonat[\s\S]{0,80}?(\d{2})\s*[\/.\-]\s*(\d{4})/i) ||
    text.match(/\b(0[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/);
  if (!m) return null;
  return `${String(m[1]).padStart(2, '0')}/${m[2]}`;
}

/** Desktop validateDownloadedPdf */
export function validatePdfPeriod(
  text: string,
  targetMonth: number,
  targetYear: number
): { ok: boolean; found: string | null; expected: string } {
  const expected = `${String(targetMonth).padStart(2, '0')}/${targetYear}`;
  const found = extractAbrechnungsmonatFromText(text);
  return {
    ok: Boolean(found && found === expected),
    found,
    expected,
  };
}

export function monthLabelDe(month: number): string {
  return MONTH_LABELS_DE[month - 1] || String(month);
}
