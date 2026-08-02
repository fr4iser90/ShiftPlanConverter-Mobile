/**
 * Pure merge helpers for the luminance-invert OCR pass (no native FS).
 */
import type { OcrLine } from './recognize';
import { cleanCell, looksLikeShiftCell, xCenter, yCenter } from './layouts/month-matrix/geometry';

/** Short duty / vacation / slash tokens worth taking from the inverted pass. */
export function isInvertMergeCandidate(text: string): boolean {
  const t = cleanCell(text);
  if (!t || t.length > 6) return false;
  // Primary OCR already reads clock strings better on dark-on-light ink.
  if (/^\d{1,2}[:.]\d{2}/.test(t)) return false;
  if (/^\d{3,}$/.test(t.replace(/[^\d]/g, '')) && t.length >= 4) return false;
  if (t === '/' || /^[UuÜü]$/.test(t)) return true;
  if (looksLikeShiftCell(t) && t.length <= 5) return true;
  return false;
}

/** Map inverted-pass boxes into primary OCR page space (handles upscaled invert JPEG). */
export function scaleInvertLinesToPrimary(
  inverted: OcrLine[],
  invPage: { pageWidth: number; pageHeight: number },
  primaryPage: { pageWidth: number; pageHeight: number }
): OcrLine[] {
  const pw = primaryPage.pageWidth || 0;
  const ph = primaryPage.pageHeight || 0;
  const iw = invPage.pageWidth || 0;
  const ih = invPage.pageHeight || 0;
  if (!(pw > 0 && ph > 0 && iw > 0 && ih > 0)) return inverted;
  const sx = pw / iw;
  const sy = ph / ih;
  if (Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) return inverted;
  return inverted.map((l) => {
    const b = l.boundingBox;
    return {
      ...l,
      boundingBox: {
        x: b.x * sx,
        y: b.y * sy,
        width: b.width * sx,
        height: b.height * sy,
      },
    };
  });
}

/**
 * Append inverted-pass glyphs that primary OCR missed (same page coords).
 */
export function mergeInvertOcrLines(primary: OcrLine[], inverted: OcrLine[]): OcrLine[] {
  if (!inverted.length) return primary;
  const out = primary.slice();
  for (const inv of inverted) {
    if (!isInvertMergeCandidate(inv.text)) continue;
    const ix = xCenter(inv);
    const iy = yCenter(inv);
    const invKey = cleanCell(inv.text).toUpperCase();
    const dup = out.some((p) => {
      const dx = Math.abs(xCenter(p) - ix);
      const dy = Math.abs(yCenter(p) - iy);
      if (dx > 32 || dy > 24) return false;
      const a = cleanCell(p.text).toUpperCase();
      return a === invKey || a.includes(invKey) || invKey.includes(a);
    });
    if (!dup) out.push(inv);
  }
  return out;
}
