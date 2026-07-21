import type {
  ConvertResult,
  HospitalMapping,
  MappingValue,
  ParseResult,
  ShiftEntry,
} from './types';

type ParserFn = (text: string) => ParseResult;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function pickDayDetails(entry: ShiftEntry): Partial<ShiftEntry> {
  const details: Partial<ShiftEntry> = {};
  if (entry.pause != null) details.pause = entry.pause;
  if (entry.ist != null) details.ist = entry.ist;
  if (entry.azkDaily != null) details.azkDaily = entry.azkDaily;
  if (entry.pepSoll != null) details.pepSoll = entry.pepSoll;
  if (entry.vertrSoll != null) details.vertrSoll = entry.vertrSoll;
  return details;
}

function pickBereitschaftDetails(chainParts: ShiftEntry[]): Partial<ShiftEntry> {
  const withMeta = chainParts.find((p) => p.bereitPercent != null || p.bewertet != null);
  if (!withMeta) return {};
  const details: Partial<ShiftEntry> = {};
  if (withMeta.bereitPercent != null) details.bereitPercent = withMeta.bereitPercent;
  if (withMeta.bewertet != null) details.bewertet = withMeta.bewertet;
  return details;
}

function mappingCode(value: MappingValue | undefined): {
  code: string | null;
  isValidated: boolean;
} {
  if (!value) return { code: null, isValidated: false };
  if (typeof value === 'object') {
    return { code: value.code, isValidated: !!value.isValidated };
  }
  return { code: value, isValidated: false };
}

export function parseTimeSheet(
  pdfText: string,
  _profession: string,
  _bereich: string,
  preset: string,
  hospitalMapping: HospitalMapping | null | undefined,
  parserFn: ParserFn
): ConvertResult {
  if (!parserFn) {
    throw new Error('Kein Parser-Funktion übergeben!');
  }

  const {
    year,
    month,
    mainEntries: rawMain,
    bereitschaftEntries: rawBereitschaft,
    summary = null,
    summaries = null,
  } = parserFn(pdfText);

  if (!year || !month) {
    return { entries: [], year: null, month: null, summary: null, summaries: [] };
  }

  const mapping =
    (hospitalMapping && hospitalMapping.presets && hospitalMapping.presets[preset]) || {};

  const specialCodes: Record<string, boolean> = {};
  Object.entries(mapping).forEach(([key, value]) => {
    if (key.startsWith('SPECIAL:')) {
      const code = typeof value === 'object' ? value.code : value;
      specialCodes[code] = true;
    }
  });

  const finalEntries: ShiftEntry[] = [];
  const handledMainIndices = new Set<number>();
  const handledBereitschaftIndices = new Set<number>();

  for (let m = 0; m < rawMain.length; m++) {
    const mainEntry = rawMain[m];
    if (mainEntry.allDay) continue;

    const chain: ShiftEntry[] = [mainEntry];
    let currentEnd = mainEntry.end!;
    let currentDate = mainEntry.date;

    for (let loop = 0; loop < 10; loop++) {
      let found = false;
      for (let b = 0; b < rawBereitschaft.length; b++) {
        if (handledBereitschaftIndices.has(b)) continue;
        const bEntry = rawBereitschaft[b];

        if (bEntry.date === currentDate && bEntry.start === currentEnd) {
          chain.push(bEntry);
          currentEnd = bEntry.end!;
          handledBereitschaftIndices.add(b);
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
          handledBereitschaftIndices.add(b);
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    if (chain.length > 1) {
      const timeKey = `${mainEntry.start}-${chain[chain.length - 1].end}`;
      const { code, isValidated } = mappingCode(mapping[timeKey]);
      finalEntries.push({
        type: code || 'MO',
        date: mainEntry.date,
        start: mainEntry.start,
        end: chain[chain.length - 1].end,
        isValidated: code ? isValidated : true,
        ...pickDayDetails(mainEntry),
        ...pickBereitschaftDetails(chain.slice(1)),
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
    const mappingValue = mapping[timeKey];
    let shiftType = `⚠️ ${timeKey}`;
    let isValidated = false;

    if (typeof mappingValue === 'object') {
      shiftType = mappingValue.code;
      isValidated = !!mappingValue.isValidated;
    } else if (typeof mappingValue === 'string') {
      shiftType = mappingValue;
    }

    finalEntries.push({
      type: shiftType,
      date: entry.date,
      start: entry.start,
      end: entry.end,
      isValidated,
      ...pickDayDetails(entry),
    });
  }

  for (let i = 0; i < rawBereitschaft.length; i++) {
    if (handledBereitschaftIndices.has(i)) continue;
    const item = rawBereitschaft[i];
    const timeKey = `${item.start}-${item.end}`;
    const { code, isValidated } = mappingCode(mapping[timeKey]);

    finalEntries.push({
      type: code || `BEREIT_${timeKey}`,
      date: item.date,
      start: item.start,
      end: item.end,
      isValidated,
      ...pickDayDetails(item),
      ...(item.bereitPercent != null ? { bereitPercent: item.bereitPercent } : {}),
      ...(item.bewertet != null ? { bewertet: item.bewertet } : {}),
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
