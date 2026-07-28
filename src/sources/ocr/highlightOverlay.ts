/**
 * Normalized highlight boxes for OCR photo overlay (snapshot review).
 * pageWidth/pageHeight must be the **full image** size (same space as ML Kit boxes).
 *
 * Name column + day header follow page skew (segmented AABBs — no CSS rotate).
 * Own-row: name strip + dense day segments along rowSlope.
 */
import { normalizeNameKeyPublic } from './names';
import type { MonthMatrixGrid } from './monthMatrix/types';
import type { OcrRegionSnapshot } from './regionSnapshots';

export type OcrHighlightKind = 'name-column' | 'day-header' | 'own-row';

export type OcrNormBox = OcrRegionSnapshot['box'];

export type OcrHighlightBox = {
  kind: OcrHighlightKind;
  box: OcrNormBox;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Prefer the tighter neighbor gap so the bar does not bleed into adjacent rows. */
export function rowHeightPx(grid: MonthMatrixGrid, index: number): number {
  const r = grid.rows[index];
  if (!r) return 36;
  if (
    r.yNameTop != null &&
    r.yNameBot != null &&
    r.yNameBot > r.yNameTop &&
    r.yNameBot - r.yNameTop >= 10
  ) {
    const glyphH = r.yNameBot - r.yNameTop;
    const next = grid.rows[index + 1];
    const prev = grid.rows[index - 1];
    const gaps: number[] = [];
    if (next) gaps.push(Math.abs(next.yCenter - r.yCenter));
    if (prev) gaps.push(Math.abs(r.yCenter - prev.yCenter));
    if (gaps.length) {
      return Math.max(glyphH * 1.05, Math.min(...gaps) * 0.72);
    }
    return Math.max(16, glyphH * 1.15);
  }
  const next = grid.rows[index + 1];
  const prev = grid.rows[index - 1];
  const gaps: number[] = [];
  if (next) gaps.push(Math.abs(next.yCenter - r.yCenter));
  if (prev) gaps.push(Math.abs(r.yCenter - prev.yCenter));
  if (gaps.length) return Math.max(16, Math.min(...gaps) * 0.78);
  return grid.rowYPad ? grid.rowYPad * 1.6 : 36;
}

function findMatchedRowIndex(grid: MonthMatrixGrid, matchedName: string): number {
  const key = normalizeNameKeyPublic(matchedName);
  if (!key) return -1;
  const exact = grid.rows.findIndex((r) => normalizeNameKeyPublic(r.name) === key);
  if (exact >= 0) return exact;
  return grid.rows.findIndex((r) => {
    const rk = normalizeNameKeyPublic(r.name);
    return rk.startsWith(key) || key.startsWith(rk.split(',')[0] || rk);
  });
}

/** Vertical divider x at row y — tapers with skew (narrower name col toward bottom when slope>0). */
export function nameColRightAtY(
  nameMaxX: number,
  y: number,
  yRef: number,
  rowSlope: number
): number {
  // Perpendicular to row slope: x ≈ x0 − s·(y − yRef)
  return Math.max(24, nameMaxX - rowSlope * (y - yRef));
}

/** Header baseline y at column x. */
export function headerYAtX(
  yAtNameEdge: number,
  x: number,
  xRef: number,
  rowSlope: number
): number {
  return yAtNameEdge + rowSlope * (x - xRef);
}

/**
 * Build all overlay boxes. Crops still use estimateRegionBoxes AABB separately.
 */
export function estimateHighlightOverlays(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName?: string | null
): OcrHighlightBox[] {
  if (!grid.ok || !pageWidth || !pageHeight || !grid.rows.length) return [];

  const slope = grid.rowSlope || 0;
  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.22;
  const rh0 = rowHeightPx(grid, 0);
  const yFirst = grid.rows[0]!.yCenter;
  const yLast = grid.rows[grid.rows.length - 1]!.yCenter;
  const yTop = yFirst - rh0 * 0.55;
  const yBot = yLast + rowHeightPx(grid, grid.rows.length - 1) * 0.5;
  const xRef = nameMaxX;

  const out: OcrHighlightBox[] = [];

  // --- Name column: stacked strips, right edge follows skew ---
  const nameSegH = Math.max(10, Math.min(28, rh0 * 0.55));
  for (let y = yTop; y < yBot; y += nameSegH) {
    const yMid = y + nameSegH / 2;
    const xRight = nameColRightAtY(nameMaxX, yMid, yFirst, slope);
    out.push({
      kind: 'name-column',
      box: {
        x: 0,
        y: clamp01(y / pageHeight),
        width: clamp01(Math.max(0.08, (xRight + 6) / pageWidth)),
        height: clamp01(Math.max(0.008, nameSegH / pageHeight)),
      },
    });
  }

  // --- Day header: use measured headerBandY when available (not invented above first name) ---
  const headerBand = Math.min(48, Math.max(18, rh0 * 0.55));
  const yHeaderAtRef =
    grid.headerBandY && grid.headerBandY > 0
      ? grid.headerBandY
      : yFirst - rh0 * 0.85;
  const hx0 = nameMaxX;
  const hx1 = pageWidth * 0.98;
  const hSpan = Math.max(1, hx1 - hx0);
  const hSegCount = Math.max(8, Math.min(24, Math.round(hSpan / 36)));
  const hSegW = hSpan / hSegCount;
  for (let i = 0; i < hSegCount; i++) {
    const cx = hx0 + (i + 0.5) * hSegW;
    const yMid = headerYAtX(yHeaderAtRef, cx, xRef, slope);
    out.push({
      kind: 'day-header',
      box: {
        x: clamp01((cx - hSegW * 0.55) / pageWidth),
        y: clamp01((yMid - headerBand / 2) / pageHeight),
        width: clamp01((hSegW * 1.08) / pageWidth),
        height: clamp01(headerBand / pageHeight),
      },
    });
  }

  const name = String(matchedName || '').trim();
  if (!name) return out;

  const idx = findMatchedRowIndex(grid, name);
  if (idx < 0) return out;

  const row = grid.rows[idx]!;
  const h = rowHeightPx(grid, idx);
  // Prefer glyph mid when we have a tight name box (less neighbor-row bleed).
  const yRow =
    row.yNameTop != null && row.yNameBot != null
      ? (row.yNameTop + row.yNameBot) / 2
      : row.yCenter;
  const xAnchor = Math.min(nameMaxX * 0.55, nameMaxX - 4);
  const nameRight = nameColRightAtY(nameMaxX, yRow, yFirst, slope);

  out.push({
    kind: 'own-row',
    box: {
      x: clamp01(0),
      y: clamp01((yRow - h / 2) / pageHeight),
      width: clamp01(Math.max(0.1, (nameRight + 4) / pageWidth)),
      height: clamp01(Math.max(0.012, h / pageHeight)),
    },
  });

  const x0 = nameRight;
  const x1 = pageWidth;
  const span = Math.max(1, x1 - x0);
  const segCount = Math.max(10, Math.min(28, Math.round(span / 28)));
  const segW = span / segCount;
  for (let i = 0; i < segCount; i++) {
    const cx = x0 + (i + 0.5) * segW;
    const yMid = yRow + slope * (cx - xAnchor);
    out.push({
      kind: 'own-row',
      box: {
        x: clamp01((cx - segW * 0.55) / pageWidth),
        y: clamp01((yMid - h / 2) / pageHeight),
        width: clamp01((segW * 1.05) / pageWidth),
        height: clamp01(Math.max(0.01, h / pageHeight)),
      },
    });
  }

  return out;
}
