import type {
  ConvertResult,
  PackMapping,
  ParseResult,
  ShiftEntry,
} from './types';
import { mappingCode, resolveShiftMapping } from './shiftMapping';

type ParserFn = (text: string) => ParseResult;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function pickDayDetails(entry: ShiftEntry): Partial<ShiftEntry> {
  const details: Partial<ShiftEntry> = {};
  if (entry.breakMinutes != null) details.breakMinutes = entry.breakMinutes;
  if (entry.actual != null) details.actual = entry.actual;
  if (entry.timeAccountDaily != null) details.timeAccountDaily = entry.timeAccountDaily;
  if (entry.pepTarget != null) details.pepTarget = entry.pepTarget;
  if (entry.contractTarget != null) details.contractTarget = entry.contractTarget;
  return details;
}

function pickOnCallDetails(chainParts: ShiftEntry[]): Partial<ShiftEntry> {
  const withMeta = chainParts.find((p) => p.onCallPercent != null || p.onCallRated != null);
  if (!withMeta) return {};
  const details: Partial<ShiftEntry> = {};
  if (withMeta.onCallPercent != null) details.onCallPercent = withMeta.onCallPercent;
  if (withMeta.onCallRated != null) details.onCallRated = withMeta.onCallRated;
  return details;
}

export function parseTimeSheet(
  pdfText: string,
  _profession: string,
  _bereich: string,
  preset: string,
  packMapping: PackMapping | null | undefined,
  parserFn: ParserFn
): ConvertResult {
  if (!parserFn) {
    throw new Error('No parser function provided');
  }

  const {
    year,
    month,
    mainEntries: rawMain,
    onCallEntries: rawOnCall,
    summary = null,
    summaries = null,
  } = parserFn(pdfText);

  if (!year || !month) {
    return { entries: [], year: null, month: null, summary: null, summaries: [] };
  }

  const mapping =
    (packMapping && packMapping.presets && packMapping.presets[preset]) || {};

  const specialCodes: Record<string, boolean> = {};
  Object.entries(mapping).forEach(([key, value]) => {
    if (key.startsWith('SPECIAL:')) {
      const code = typeof value === 'object' ? value.code : value;
      specialCodes[code] = true;
    }
  });

  const finalEntries: ShiftEntry[] = [];
  const handledMainIndices = new Set<number>();
  const handledOnCallIndices = new Set<number>();

  for (let m = 0; m < rawMain.length; m++) {
    const mainEntry = rawMain[m];
    if (mainEntry.allDay) continue;

    const chain: ShiftEntry[] = [mainEntry];
    let currentEnd = mainEntry.end!;
    let currentDate = mainEntry.date;

    for (let loop = 0; loop < 10; loop++) {
      let found = false;
      for (let b = 0; b < rawOnCall.length; b++) {
        if (handledOnCallIndices.has(b)) continue;
        const bEntry = rawOnCall[b];

        if (bEntry.date === currentDate && bEntry.start === currentEnd) {
          chain.push(bEntry);
          currentEnd = bEntry.end!;
          handledOnCallIndices.add(b);
          found = true;
          break;
        }
        if (
          bEntry.start === '00:00' &&
          bEntry.date === addDays(currentDate, 1) &&
          currentEnd === '00:00'
        ) {
          chain.push(bEntry);
          currentEnd = bEntry.end!;
          currentDate = bEntry.date;
          handledOnCallIndices.add(b);
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    if (chain.length > 1) {
      const end = chain[chain.length - 1].end!;
      const resolved = resolveShiftMapping(mainEntry.start!, end, mapping);
      finalEntries.push({
        type: resolved.code || 'MO',
        date: mainEntry.date,
        start: mainEntry.start,
        end,
        isValidated: resolved.code ? resolved.isValidated : true,
        ...pickDayDetails(mainEntry),
        ...pickOnCallDetails(chain.slice(1)),
      });
      handledMainIndices.add(m);
    }
  }

  for (let i = 0; i < rawMain.length; i++) {
    if (handledMainIndices.has(i)) continue;
    const entry = rawMain[i];

    if (entry.allDay) {
      void specialCodes;
      finalEntries.push({ ...entry, isValidated: true });
      continue;
    }

    const timeKey = `${entry.start}-${entry.end}`;
    const resolved = resolveShiftMapping(entry.start!, entry.end!, mapping);
    const shiftType = resolved.code || `⚠️ ${timeKey}`;

    finalEntries.push({
      type: shiftType,
      date: entry.date,
      start: entry.start,
      end: entry.end,
      isValidated: resolved.isValidated,
      ...pickDayDetails(entry),
    });
  }

  for (let i = 0; i < rawOnCall.length; i++) {
    if (handledOnCallIndices.has(i)) continue;
    const item = rawOnCall[i];
    const timeKey = `${item.start}-${item.end}`;
    // Exact only — do not infer work codes onto leftover on-call slices
    const { code, isValidated } = mappingCode(mapping[timeKey]);

    finalEntries.push({
      type: code || `BEREIT_${timeKey}`,
      date: item.date,
      start: item.start,
      end: item.end,
      isValidated,
      ...pickDayDetails(item),
      ...(item.onCallPercent != null ? { onCallPercent: item.onCallPercent } : {}),
      ...(item.onCallRated != null ? { onCallRated: item.onCallRated } : {}),
    });
  }

  finalEntries.sort((a, b) => a.date.localeCompare(b.date));
  const allSummaries =
    Array.isArray(summaries) && summaries.length ? summaries : summary ? [summary] : [];

  return {
    entries: finalEntries,
    year,
    month,
    summary: allSummaries[allSummaries.length - 1] || null,
    summaries: allSummaries,
  };
}
