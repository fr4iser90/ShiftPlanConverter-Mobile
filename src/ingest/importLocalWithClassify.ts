/**
 * Local file pick → classify PDF → payslips or shift ingest.
 * CSV/ICS always go to shift store.
 */
import { File } from 'expo-file-system';

import {
  extractLargestJpegFromPdf,
  extractTextFromPdfBuffer,
  isPdfTextEmptyError,
} from '../convert/pdfText';
import { writePdfPageJpegForOcr } from '../convert/pdfOcrImage';
import { ingestArtifacts, type IngestResult } from './ingestArtifacts';
import { classifyKindFromText, type DocumentKind } from './classifyKind';
import { importPayslipFromUris } from '../payroll/importPayslip';
import type { PayslipDocument } from '../payroll/types';
import { getMappingForScope, getPackById, getPdfConfigForPack } from '../packs';
import { getSnapshot } from '../state/store';
import type { SourceArtifact, SourcePeriod } from '../sources/types';
import { t } from '../i18n';

export type LocalOcrImage = {
  uri: string;
  name: string;
};

export type LocalClassifyResult = {
  shift: IngestResult | null;
  payslips: PayslipDocument[];
  errors: string[];
  cancelled: boolean;
  /**
   * Image-only PDFs (no text layer): page JPEG URIs for the OCR pipeline.
   * Not a retry — text PDFs stay on the text path; these never had text.
   */
  ocrImages: LocalOcrImage[];
};

export type AskDocumentKind = (opts: {
  name: string;
}) => Promise<Exclude<DocumentKind, 'unknown'>>;

async function pickDocuments() {
  const DocumentPicker = await import('expo-document-picker');
  return DocumentPicker.getDocumentAsync({
    type: [
      'application/pdf',
      'text/csv',
      'text/calendar',
      'text/plain',
      'application/octet-stream',
      '*/*',
    ],
    copyToCacheDirectory: true,
    multiple: true,
  });
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  const ab = await file.arrayBuffer();
  return new Uint8Array(ab);
}

async function readUriText(uri: string): Promise<string> {
  const bytes = await readUriBytes(uri);
  return new TextDecoder('utf-8').decode(bytes);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Pick files, classify PDFs, route to payslip store or shift ingest.
 * `askKind` required when classification is unknown (UI override).
 */
export async function importLocalWithClassify(opts: {
  period?: SourcePeriod;
  onStatus?: (line: string) => void;
  askKind: AskDocumentKind;
  allowPayslip?: boolean;
}): Promise<LocalClassifyResult> {
  const allowPayslip = opts.allowPayslip !== false;
  opts.onStatus?.(t('sourceLocalRunning'));
  const picked = await pickDocuments();
  if (picked.canceled || !picked.assets?.length) {
    return { shift: null, payslips: [], errors: [], cancelled: true, ocrImages: [] };
  }

  const snap = getSnapshot();
  const pack = snap.packId ? getPackById(snap.packId) : null;
  const pdfConfig = getPdfConfigForPack(pack);
  const mapping =
    snap.packId && snap.groupId && snap.areaId
      ? getMappingForScope(snap.packId, snap.groupId, snap.areaId)
      : null;

  const now = new Date();
  const fallbackMonth = opts.period?.months?.[0] || now.getMonth() + 1;
  const fallbackYear = opts.period?.year || now.getFullYear();

  const shiftArtifacts: SourceArtifact[] = [];
  const payslipAssets: Array<{ uri: string; name?: string }> = [];
  const ocrImages: LocalOcrImage[] = [];
  const errors: string[] = [];

  for (const asset of picked.assets) {
    const name = asset.name || asset.uri || 'file';
    const nameLower = name.toLowerCase();
    const mime = (asset.mimeType || '').toLowerCase();
    try {
      if (mime.includes('pdf') || nameLower.endsWith('.pdf')) {
        const bytes = await readUriBytes(asset.uri);
        let text = '';
        try {
          text = await extractTextFromPdfBuffer(toArrayBuffer(bytes));
        } catch (e) {
          if (!isPdfTextEmptyError(e)) throw e;
          // Image PDF (scan / PaperPort): one path → embedded page → OCR.
          const jpeg = extractLargestJpegFromPdf(bytes);
          if (!jpeg) throw e;
          opts.onStatus?.(t('sourceOcrFromPdf', { name }));
          ocrImages.push({
            uri: writePdfPageJpegForOcr(jpeg, name),
            name,
          });
          continue;
        }
        let kind = classifyKindFromText(text, {
          pdfConfig,
          mapping,
          preset: snap.preset,
        });
        if (kind === 'payslip' && !allowPayslip) {
          kind = 'shift';
        }
        if (kind === 'unknown') {
          if (!allowPayslip) {
            kind = 'shift';
          } else {
            kind = await opts.askKind({ name });
          }
        }
        if (kind === 'payslip') {
          payslipAssets.push({ uri: asset.uri, name });
        } else {
          shiftArtifacts.push({
            kind: 'pdf',
            month: fallbackMonth,
            year: fallbackYear,
            bytes,
          });
        }
        continue;
      }
      if (mime.includes('csv') || nameLower.endsWith('.csv')) {
        shiftArtifacts.push({ kind: 'csv', text: await readUriText(asset.uri) });
        continue;
      }
      if (
        mime.includes('calendar') ||
        nameLower.endsWith('.ics') ||
        nameLower.endsWith('.ical')
      ) {
        shiftArtifacts.push({ kind: 'ics', text: await readUriText(asset.uri) });
        continue;
      }
      if (mime.includes('text') || nameLower.endsWith('.txt')) {
        shiftArtifacts.push({
          kind: 'text',
          month: fallbackMonth,
          year: fallbackYear,
          text: await readUriText(asset.uri),
        });
        continue;
      }
      errors.push(t('sourceLocalUnsupported', { name }));
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let payslips: PayslipDocument[] = [];
  if (payslipAssets.length) {
    const pr = await importPayslipFromUris(payslipAssets);
    payslips = pr.imported;
    errors.push(...pr.errors);
  }

  let shift: IngestResult | null = null;
  if (shiftArtifacts.length) {
    shift = await ingestArtifacts(shiftArtifacts, {
      replaceEntries: false,
      preserveOutsideMonths: true,
      onStatus: opts.onStatus,
    });
  }

  return { shift, payslips, errors, cancelled: false, ocrImages };
}
