/**
 * Serialize OCR line geometry for fixtures / device debugging.
 * Enable with EXPO_PUBLIC_OCR_DUMP_GEOMETRY=1 (logs JSON in __DEV__).
 */
import type { OcrLine, OcrResult } from './recognize';

export type OcrGeometryFixture = {
  pageWidth: number;
  pageHeight: number;
  lines: OcrLine[];
};

export function serializeOcrGeometry(ocr: OcrResult): OcrGeometryFixture {
  return {
    pageWidth: ocr.pageWidth,
    pageHeight: ocr.pageHeight,
    lines: ocr.lines.map((l) => ({
      text: l.text,
      boundingBox: { ...l.boundingBox },
    })),
  };
}

export function maybeDumpOcrGeometry(ocr: OcrResult, tag = 'ocr-geometry'): void {
  try {
    // eslint-disable-next-line no-undef
    const dump = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_OCR_DUMP_GEOMETRY === '1';
    if (!dump && typeof __DEV__ !== 'undefined' && !__DEV__) return;
    if (!dump) return;
    const payload = JSON.stringify(serializeOcrGeometry(ocr));
    // eslint-disable-next-line no-console
    console.log(`[${tag}] ${payload}`);
  } catch {
    // ignore dump failures
  }
}
