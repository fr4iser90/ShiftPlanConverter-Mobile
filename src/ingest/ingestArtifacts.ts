import { anonymizeDienstplanText } from '../convert/anonymize';
import { convertPdfText, convertRawText } from '../convert/pipeline';
import { extractTextFromPdfBuffer } from '../convert/pdfText';
import type { MonthSummary, ShiftEntry } from '../convert/types';
import { getMappingForScope, getPackById, getParserIdForPack, getPdfConfigForPack } from '../packs';
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
  if (!snap.preset || !snap.packId || !snap.groupId || !snap.areaId) {
    throw new Error(t('fjWorkplaceMissing'));
  }
  const mapping = getMappingForScope(snap.packId, snap.groupId, snap.areaId);
  if (!mapping) {
    throw new Error(
      t('fjMappingMissing', { scope: `${snap.packId}/${snap.groupId}/${snap.areaId}` })
    );
  }
  const pack = getPackById(snap.packId);
  const engineId = getParserIdForPack(pack);
  const pdfConfig = getPdfConfigForPack(pack);
  return { snap, mapping, engineId, pdfConfig };
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
  const { snap, mapping, engineId, pdfConfig } = workplaceOrThrow();
  const result: IngestResult = {
    entries: [],
    summaries: [],
    texts: [],
    savedPdfs: [],
    skippedNoPlan: [],
  };

  // Only months with real replacement data — NO_PLAN / failed months must NOT wipe store.
  const replaceMonthKeys = new Set<string>();

  for (const art of artifacts) {
    if (art.kind === 'skipped') {
      const label = `${pad(art.month)}/${art.year}`;
      result.skippedNoPlan.push(label);
      continue;
    }

    if (art.kind === 'pdf') {
      replaceMonthKeys.add(`${art.year}-${pad(art.month)}`);
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
        engineId,
        pdfConfig,
      });
      result.entries.push(...converted.entries);
      if (converted.summaries?.length) result.summaries.push(...converted.summaries);
      else if (converted.summary) result.summaries.push(converted.summary);
      continue;
    }

    if (art.kind === 'text') {
      if (art.month && art.year) replaceMonthKeys.add(`${art.year}-${pad(art.month)}`);
      result.texts.push(art.text);
      const converted = convertRawText(art.text, {
        preset: snap.preset!,
        mapping,
        userMappings: snap.userMappings,
        engineId,
        pdfConfig,
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

  const wpId = snap.activeWorkplaceId || '';
  const taggedNew = wpId
    ? result.entries.map((e) => ({ ...e, workplaceId: wpId }))
    : result.entries;
  const taggedSummaries = wpId
    ? result.summaries.map((s) => ({ ...s, workplaceId: wpId }))
    : result.summaries;

  const all = getSnapshot().entries;
  const otherWorkplaces = wpId
    ? all.filter((e) => e.workplaceId && e.workplaceId !== wpId)
    : [];
  const sameWorkplace = wpId
    ? all.filter((e) => !e.workplaceId || e.workplaceId === wpId)
    : all;

  let baseSame: ShiftEntry[] = [];
  if (opts.preserveOutsideMonths && replaceMonthKeys.size) {
    baseSame = sameWorkplace.filter(
      (e) => !replaceMonthKeys.has(String(e.date || '').slice(0, 7))
    );
  } else if (opts.replaceEntries === false) {
    baseSame = sameWorkplace;
  }

  const merged = [...otherWorkplaces, ...baseSame, ...taggedNew];
  const seen = new Set<string>();
  const unique = merged.filter((e) => {
    const k = `${e.workplaceId || ''}|${e.date}|${e.start || ''}|${e.end || ''}|${e.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const prevSummaries = getSnapshot().summaries || [];
  const otherSummaries = wpId
    ? prevSummaries.filter((s) => s.workplaceId && s.workplaceId !== wpId)
    : [];
  const sameSummaries = wpId
    ? prevSummaries.filter((s) => !s.workplaceId || s.workplaceId === wpId)
    : prevSummaries;
  const keptSameSummaries = opts.preserveOutsideMonths
    ? sameSummaries.filter((s) => {
        const m = Number(s?.month);
        const y = Number(s?.year);
        if (!m || !y) return true;
        return !replaceMonthKeys.has(`${y}-${pad(m)}`);
      })
    : [];
  const summaries = [
    ...otherSummaries,
    ...(opts.preserveOutsideMonths ? keptSameSummaries : []),
    ...taggedSummaries,
  ];
  const newRaw = anonymizeDienstplanText(result.texts.join('\n\n'), { maxChars: 80000 });
  const prevRaw = (getSnapshot().rawText || '').trim();
  const rawText =
    opts.preserveOutsideMonths && prevRaw
      ? anonymizeDienstplanText([prevRaw, newRaw].filter(Boolean).join('\n\n'), {
          maxChars: 80000,
        })
      : newRaw;
  await setEntries(unique, {
    rawText,
    summaries,
    summary: summaries[summaries.length - 1] || null,
  });
  result.entries = unique;
  await markSuccessfulFetch();
  void refreshHomeWidgets(unique);

  return result;
}
