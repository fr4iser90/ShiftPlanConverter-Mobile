import type { ShiftEntry } from '../../types';
import type { PackPdfConfig } from './types';
import {
  compilePattern,
  emptyParseResult,
  finishParseResult,
  normTime,
  scanHeaderMonthYear,
  toIsoDate,
} from './shared';

const TIME_RANGE = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/;
const DAY_PREFIX = /^\s*(\d{1,2})\b/;
const ALL_DAY_WORD = /^(URLAUB|URLTV|KRANK|KR|KROAU|FEIER|FEIERTAG|FREI)\b/i;

export const PDF_TIMESHEET_ENGINE_ID = 'pdf-timesheet' as const;

/** Heuristic score for payroll / timesheet blocks. */
export function scoreTimesheetLayout(text: string, config?: PackPdfConfig | null): number {
  let score = 0;
  if (/Abrechnungsmonat/i.test(text)) score += 5;
  if (/(?:Ü|Ue|U)bertrag/i.test(text)) score += 2;
  if (/Periode\s*\(/i.test(text)) score += 2;
  if (/Bereitschaft/i.test(text)) score += 1;
  for (const hint of config?.scoreHints || []) {
    if (hint && new RegExp(hint, 'i').test(text)) score += 2;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (DAY_PREFIX.test(line) && TIME_RANGE.test(line)) score += 2;
    if (ALL_DAY_WORD.test(line)) score += 1;
  }
  return score;
}

export function parsePdfTimesheet(text: string, config?: PackPdfConfig | null) {
  const lines = text.normalize('NFC').split('\n');
  const header = scanHeaderMonthYear(text);
  let year = header?.year || '';
  let month = header?.month || '';
  const entries: ShiftEntry[] = [];
  const monthRe = config?.monthHeader
    ? compilePattern(config.monthHeader.pattern, config.monthHeader.flags)
    : /Abrechnungsmonat\s+(\d{2})\/(\d{4})/i;
  const monthG = config?.monthHeader?.monthGroup ?? 1;
  const yearG = config?.monthHeader?.yearGroup ?? 2;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const abr = monthRe.exec(line);
    if (abr) {
      month = abr[monthG];
      year = abr[yearG];
      continue;
    }

    if (!year || !month) continue;

    const dayMatch = DAY_PREFIX.exec(line);
    if (!dayMatch) continue;
    const day = dayMatch[1];
    if (Number(day) < 1 || Number(day) > 31) continue;

    const date = toIsoDate(year, month, day);

    const allDay = ALL_DAY_WORD.exec(line);
    if (allDay) {
      entries.push({
        date,
        type: allDay[1].toUpperCase(),
        allDay: true,
        isSpecial: true,
        isValidated: false,
      });
      continue;
    }

    const times = [...line.matchAll(new RegExp(TIME_RANGE.source, 'g'))];
    if (!times.length) continue;

    const first = times[0];
    const codeMatch = line.match(/\b([A-Z][A-Z0-9*]{0,5})\b/);
    entries.push({
      date,
      type: codeMatch ? codeMatch[1] : 'WORK',
      start: normTime(first[1]),
      end: normTime(first[2]),
      isWork: true,
      isValidated: false,
    });
  }

  if (!entries.length) return emptyParseResult();
  return finishParseResult(entries);
}
