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

const ISO_LINE =
  /^(\d{4}-\d{2}-\d{2})\s+([^\s,;]+)(?:\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2}))?/;
const DE_DATE_LINE =
  /^(\d{2})\.(\d{2})\.(\d{4})\s+([^\s,;]+)(?:\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2}))?/;
const DAY_TIME_LINE =
  /^(\d{1,2})\s+(\S+)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/;

export const PDF_LIST_ENGINE_ID = 'pdf-list' as const;

/** Heuristic score for tabular list / export with explicit dates. */
export function scoreListLayout(text: string, config?: PackPdfConfig | null): number {
  let score = 0;
  const lines = text.split('\n');
  const header = lines.slice(0, 3).join(' ').toLowerCase();
  if (/\bdate\b/.test(header) && /\btype\b/.test(header)) score += 4;
  if (/\bdatum\b/.test(header) && /\b(dienst|code|typ)\b/.test(header)) score += 4;
  for (const hint of config?.scoreHints || []) {
    if (hint && text.toLowerCase().includes(hint.toLowerCase())) score += 2;
  }
  for (const line of lines) {
    if (ISO_LINE.test(line.trim())) score += 2;
    if (DE_DATE_LINE.test(line.trim())) score += 2;
  }
  return score;
}

export function parsePdfList(text: string, config?: PackPdfConfig | null) {
  const lines = text.normalize('NFC').split('\n');
  const entries: ShiftEntry[] = [];
  const header = scanHeaderMonthYear(text);
  let ctxYear = header?.year || '';
  let ctxMonth = header?.month || '';
  const monthRe = config?.monthHeader
    ? compilePattern(config.monthHeader.pattern, config.monthHeader.flags)
    : /Abrechnungsmonat\s+(\d{2})\/(\d{4})/i;
  const monthG = config?.monthHeader?.monthGroup ?? 1;
  const yearG = config?.monthHeader?.yearGroup ?? 2;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const iso = ISO_LINE.exec(line);
    if (iso) {
      const start = iso[3] ? normTime(iso[3]) : undefined;
      const end = iso[4] ? normTime(iso[4]) : undefined;
      entries.push({
        date: iso[1],
        type: iso[2],
        start,
        end,
        allDay: !start && !end,
        isValidated: false,
      });
      continue;
    }

    const de = DE_DATE_LINE.exec(line);
    if (de) {
      const date = `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`;
      const start = de[5] ? normTime(de[5]) : undefined;
      const end = de[6] ? normTime(de[6]) : undefined;
      entries.push({
        date,
        type: de[4],
        start,
        end,
        allDay: !start && !end,
        isValidated: false,
      });
      continue;
    }

    const abr = monthRe.exec(line);
    if (abr) {
      ctxMonth = abr[monthG];
      ctxYear = abr[yearG];
      continue;
    }

    if (ctxYear && ctxMonth) {
      const dayTime = DAY_TIME_LINE.exec(line);
      if (dayTime) {
        const day = dayTime[1];
        if (Number(day) >= 1 && Number(day) <= 31) {
          entries.push({
            date: toIsoDate(ctxYear, ctxMonth, day),
            type: dayTime[2] || 'SHIFT',
            start: normTime(dayTime[3]),
            end: normTime(dayTime[4]),
            isValidated: false,
          });
        }
      }
    }
  }

  if (!entries.length) return emptyParseResult();
  return finishParseResult(entries);
}
