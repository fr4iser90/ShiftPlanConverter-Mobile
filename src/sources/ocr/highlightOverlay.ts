/**
 * Normalized highlight boxes for OCR photo overlay (snapshot review — not live cam).
 */
import { normalizeNameKeyPublic } from './names';
import type { MonthMatrixGrid } from './monthMatrix/types';
import { estimateRegionBoxes, type OcrRegionSnapshot } from './regionSnapshots';

export type OcrHighlightKind = 'name-column' | 'day-header' | 'own-row';

export type OcrHighlightBox = {
  kind: OcrHighlightKind;
  /** Normalized crop on source image (0..1). */
  box: OcrRegionSnapshot['box'];
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function rowHeightPx(grid: MonthMatrixGrid, index: number): number {
  const r = grid.rows[index];
  if (!r) return 36;
  const next = grid.rows[index + 1];
  if (next) return Math.max(16, Math.abs(next.yCenter - r.yCenter));
  const prev = grid.rows[index - 1];
  if (prev) return Math.max(16, Math.abs(r.yCenter - prev.yCenter));
  return grid.rowYPad ? grid.rowYPad * 2 : 36;
}

function findMatchedRowIndex(grid: MonthMatrixGrid, matchedName: string): number {
  const key = normalizeNameKeyPublic(matchedName);
  if (!key) return -1;
  const exact = grid.rows.findIndex((r) => normalizeNameKeyPublic(r.name) === key);
  if (exact >= 0) return exact;
  // Surname-only soft match when preferred is short.
  return grid.rows.findIndex((r) => {
    const rk = normalizeNameKeyPublic(r.name);
    return rk.startsWith(key) || key.startsWith(rk.split(',')[0] || rk);
  });
}

/**
 * Name column + day header (+ own row when matchedName hits a grid row).
 * Coordinates are normalized to pageWidth × pageHeight (OCR page space).
 */
export function estimateHighlightOverlays(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName?: string | null
): OcrHighlightBox[] {
  const regions = estimateRegionBoxes(grid, pageWidth, pageHeight);
  if (!regions) return [];

  const out: OcrHighlightBox[] = [
    { kind: 'name-column', box: regions.name },
    { kind: 'day-header', box: regions.header },
  ];

  const name = String(matchedName || '').trim();
  if (!name || !pageHeight) return out;

  const idx = findMatchedRowIndex(grid, name);
  if (idx < 0) return out;

  const row = grid.rows[idx]!;
  const h = rowHeightPx(grid, idx);
  const yTop = row.yCenter - h / 2;
  out.push({
    kind: 'own-row',
    box: {
      x: clamp01(0),
      y: clamp01(yTop / pageHeight),
      width: 1,
      height: clamp01(Math.max(0.02, (h * 1.15) / pageHeight)),
    },
  });
  return out;
}
