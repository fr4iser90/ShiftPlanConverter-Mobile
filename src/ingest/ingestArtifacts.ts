import { anonymizeDienstplanText } from '../convert/anonymize';
import { convertPdfText, convertRawText } from '../convert/pipeline';
import { extractTextFromPdfBuffer } from '../convert/pdfText';
import type { MonthSummary, ShiftEntry } from '../convert/types';
import { getMappingForScope, getPackById, getParserIdForPack } from '../packs';
import { markSuccessfulFetch } from '../schedule/prefs';
import type { SourceArtifact } from '../sources/types';
import { getSnapshot, setEntries } from '../state/store';
import { refreshHomeWidgets } from '../widget/refresh';
import { parseCsvShifts } from './parseCsv';
import { parseIcsShifts } from './parseIcs';
import { t } from '../i18n';

export type IngestOptions = {
  replaceEntries?: boolean;
  preserveOutsideMonths?: boolean;
  onStatus?: (line: string) => void;
};

export type IngestResult = {
  entries: ShiftEntry[];
  summaries: MonthSummary[];
  texts: string[];
  savedPdfs: string[];
  skippedNoPlan: string[];
};

function pad(m: number) {
  return String(m).padStart(2, '0');
}

function workplaceOrThrow() {
  const snap = getSnapshot();
  if (!snap.preset || !snap.hospitalId || !snap.groupId || !snap.areaId) {
    throw new Error(t('fjWorkplaceMissing'));
  }
  const mapping = getMappingForScope(snap.hospitalId, snap.groupId, snap.areaId);
  if (!mapping) {
    throw new Error(
      t('fjMappingMissing', { scope: `${snap.hospitalId}/${snap.groupId}/${snap.areaId}` })
    );
  }
  const pack = getPackById(snap.hospitalId);
  const parserId = getParserIdForPack(pack);
  return { snap, mapping, parserId };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Turn Source artifacts into ShiftEntry[] and merge into the store.
 */
export async function ingestArtifacts(
  artifacts: SourceArtifact[],
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const { snap, mapping, parserId } = workplaceOrThrow();
  const result: IngestResult = {
    entries: [],
    summaries: [],
    texts: [],
    savedPdfs: [],
    skippedNoPlan: [],
  };

  const windowKeys = new Set<string>();

  for (const art of artifacts) {
    if (art.kind === 'skipped') {
      const label = `${pad(art.month)}/${art.year}`;
      result.skippedNoPlan.push(label);
      windowKeys.add(`${art.year}-${pad(art.month)}`);
      continue;
    }

    if (art.kind === 'pdf') {
      windowKeys.add(`${art.year}-${pad(art.month)}`);
      const label = `${pad(art.month)}/${art.year}`;
      opts.onStatus?.(t('fjStepAction', { step: `ingest ${label}` }));
      let text = art.text?.trim() || '';
      if (!text) {
        text = await extractTextFromPdfBuffer(toArrayBuffer(art.bytes));
      }
      if (!text.trim()) {
        throw new Error(t('fjPdfTextEmpty'));
      }
      if (art.savedPath) result.savedPdfs.push(art.savedPath);
      result.texts.push(`### ${label}\n${text}`);
      const converted = convertPdfText(text, {
        preset: snap.preset!,
        mapping,
        userMappings: snap.userMappings,
        parserId,
      });
      result.entries.push(...converted.entries);
      if (converted.summaries?.length) result.summaries.push(...converted.summaries);
      else if (converted.summary) result.summaries.push(converted.summary);
      continue;
    }

    if (art.kind === 'text') {
      if (art.month && art.year) windowKeys.add(`${art.year}-${pad(art.month)}`);
      result.texts.push(art.text);
      const converted = convertRawText(art.text, {
        preset: snap.preset!,
        mapping,
        userMappings: snap.userMappings,
        parserId,
      });
      result.entries.push(...converted.entries);
      if (converted.summaries?.length) result.summaries.push(...converted.summaries);
      else if (converted.summary) result.summaries.push(converted.summary);
      continue;
    }

    if (art.kind === 'csv') {
      result.texts.push(art.text);
      result.entries.push(...parseCsvShifts(art.text));
      continue;
    }

    if (art.kind === 'ics') {
      result.texts.push(art.text);
      result.entries.push(...parseIcsShifts(art.text));
      continue;
    }
  }

  result.entries.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '')
  );

  if (!result.entries.length) {
    return result;
  }

  let base: ShiftEntry[] = [];
  if (opts.preserveOutsideMonths && windowKeys.size) {
    base = getSnapshot().entries.filter((e) => !windowKeys.has(String(e.date || '').slice(0, 7)));
  } else if (opts.replaceEntries === false) {
    base = getSnapshot().entries;
  }
  const merged = [...base, ...result.entries];
  const seen = new Set<string>();
  const unique = merged.filter((e) => {
    const k = `${e.date}|${e.start || ''}|${e.end || ''}|${e.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const prevSummaries = opts.preserveOutsideMonths ? getSnapshot().summaries || [] : [];
  const summaries = opts.preserveOutsideMonths
    ? [
        ...prevSummaries.filter((s) => {
          const m = Number(s?.month);
          const y = Number(s?.year);
          if (!m || !y) return true;
          return !windowKeys.has(`${y}-${pad(m)}`);
        }),
        ...result.summaries,
      ]
    : result.summaries;
  await setEntries(unique, {
    rawText: anonymizeDienstplanText(result.texts.join('\n\n'), { maxChars: 80000 }),
    summaries,
    summary: summaries[summaries.length - 1] || null,
  });
  result.entries = unique;
  await markSuccessfulFetch();
  void refreshHomeWidgets(unique);

  return result;
}
