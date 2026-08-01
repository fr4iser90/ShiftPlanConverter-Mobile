/**
 * Persist an embedded PDF page JPEG for the OCR pipeline (cache only).
 */
import { Directory, File, Paths } from 'expo-file-system';

function safeStem(name: string): string {
  const base = String(name || 'page')
    .replace(/\.pdf$/i, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'page';
}

/** Write JPEG bytes under cache/pdf-ocr/ and return a file:// URI. */
export function writePdfPageJpegForOcr(bytes: Uint8Array, sourceName: string): string {
  const dir = new Directory(Paths.cache, 'pdf-ocr');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${safeStem(sourceName)}-${Date.now()}.jpg`);
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
  return file.uri;
}
