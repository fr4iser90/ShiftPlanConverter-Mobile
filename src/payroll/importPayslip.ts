import { File } from 'expo-file-system';

import { extractTextFromPdfBuffer } from '../convert/pdfText';
import { isLikelyPayslipText, parsePayslipText } from '../convert/parsers/engines/pdf-payslip';
import type { PayslipDocument } from '../payroll/types';
import { getSnapshot, upsertPayslip } from '../state/store';
import { t } from '../i18n';

async function pickPdfDocuments() {
  const DocumentPicker = await import('expo-document-picker');
  return DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: true,
  });
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  const ab = await file.arrayBuffer();
  return new Uint8Array(ab);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Pick Verdienstnachweis PDF(s), parse, store.
 * One path: fail loud if not a payslip.
 */
export async function importPayslipPdfs(): Promise<{
  imported: PayslipDocument[];
  errors: string[];
}> {
  const picked = await pickPdfDocuments();
  if (picked.canceled || !picked.assets?.length) {
    return { imported: [], errors: [] };
  }

  const snap = getSnapshot();
  const workplaceId = snap.activeWorkplaceId || undefined;
  const imported: PayslipDocument[] = [];
  const errors: string[] = [];

  for (const asset of picked.assets) {
    const name = asset.name || asset.uri || 'pdf';
    try {
      const bytes = await readUriBytes(asset.uri);
      const text = await extractTextFromPdfBuffer(toArrayBuffer(bytes));
      if (!isLikelyPayslipText(text)) {
        throw new Error(t('payrollNotPayslipPdf', { name }));
      }
      const doc = parsePayslipText(text, { workplaceId, source: 'pdf' });
      await upsertPayslip(doc);
      imported.push(doc);
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { imported, errors };
}
