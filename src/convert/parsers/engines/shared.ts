import type { ParseResult, ShiftEntry } from '../../types';

export function emptyParseResult(): ParseResult {
  return {
    year: '',
    month: '',
    mainEntries: [],
    onCallEntries: [],
    summary: null,
    summaries: [],
  };
}

/** Infer dominant YYYY-MM from parsed entry dates. */
export function inferMonthYear(entries: ShiftEntry[]): { year: string; month: string } {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(e.date || '');
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  if (!best) {
    const now = new Date();
    return {
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, '0'),
    };
  }
  const [year, month] = best.split('-');
  return { year, month };
}

export function finishParseResult(entries: ShiftEntry[]): ParseResult {
  const { year, month } = inferMonthYear(entries);
  return {
    year,
    month,
    mainEntries: entries,
    onCallEntries: [],
    summary: null,
    summaries: [],
  };
}

/** Scan text for Abrechnungsmonat MM/YYYY or similar headers. */
export function scanHeaderMonthYear(text: string): { year: string; month: string } | null {
  const abr = /Abrechnungsmonat\s+(\d{2})\/(\d{4})/i.exec(text);
  if (abr) return { month: abr[1], year: abr[2] };
  const de = /(?:Monat|Zeitraum|Periode)[^\d]{0,12}(\d{2})[./](\d{4})/i.exec(text);
  if (de) return { month: de[1], year: de[2] };
  return null;
}

export function toIsoDate(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function normTime(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/** Compile a pack JSON regex pattern (default flag `i` when flags omitted). */
export function compilePattern(pattern: string, flags?: string): RegExp {
  return new RegExp(pattern, flags ?? 'i');
}
