/**
 * Normalized highlight boxes for OCR photo overlay (snapshot review).
 * pageWidth/pageHeight must be the **full image** size (same space as ML Kit boxes).
 *
 * Names / days / own-row use the same stored bands as cell scoop (yLo/yHi, headerBand*).
 * Day overlays align to real colCenters (not fake equal segments).
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

/** Duty-row height from stored band (fallback: neighbor midpoints). */
export function rowHeightPx(grid: MonthMatrixGrid, index: number): number {
  const r = grid.rows[index];
  if (!r) return 36;
  if (r.yLo != null && r.yHi != null && r.yHi > r.yLo) {
    return Math.max(16, r.yHi - r.yLo);
  }
  const next = grid.rows[index + 1];
  const prev = grid.rows[index - 1];
  if (prev || next) {
    const yLo = prev ? (prev.yCenter + r.yCenter) / 2 : r.yCenter - (grid.rowYPad || 36);
    const yHi = next ? (r.yCenter + next.yCenter) / 2 : r.yCenter + (grid.rowYPad || 36);
    return Math.max(16, yHi - yLo);
  }
  if (
    r.yNameTop != null &&
    r.yNameBot != null &&
    r.yNameBot > r.yNameTop &&
    r.yNameBot - r.yNameTop >= 10
  ) {
    return Math.max(16, (r.yNameBot - r.yNameTop) * 1.15);
  }
  return grid.rowYPad ? grid.rowYPad * 1.6 : 36;
}

function rowBandY(grid: MonthMatrixGrid, index: number): { yLo: number; yHi: number } {
  const exact = grid.personFrames?.find((f) => f.rowIndex === index);
  if (exact) {
    return { yLo: exact.y0, yHi: exact.y1 };
  }
  const r = grid.rows[index]!;
  if (r.yLo != null && r.yHi != null && r.yHi > r.yLo) {
    return { yLo: r.yLo, yHi: r.yHi };
  }
  const h = rowHeightPx(grid, index);
  const prev = grid.rows[index - 1];
  const next = grid.rows[index + 1];
  const yLo = prev ? (prev.yCenter + r.yCenter) / 2 : r.yCenter - h / 2;
  const yHi = next ? (r.yCenter + next.yCenter) / 2 : r.yCenter + h / 2;
  return { yLo, yHi };
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

/** Person-band edge (yLo or yHi) at x — parallelogram from axis-aligned rules at xRef. */
export function bandEdgeAtX(
  yEdgeAtRef: number,
  x: number,
  xRef: number,
  rowSlope: number
): number {
  return yEdgeAtRef + rowSlope * (x - xRef);
}

/**
 * Emit one or more AABB segments covering [x0,x1] × skewed [yLo,yHi].
 * Flat when slope≈0; otherwise vertical strips track the printed parallelogram.
 */
function pushSkewedBandSegments(
  out: OcrHighlightBox[],
  kind: OcrHighlightKind,
  yLo: number,
  yHi: number,
  x0: number,
  x1: number,
  xRef: number,
  slope: number,
  pageWidth: number,
  pageHeight: number,
  opts?: { maxSegs?: number }
): void {
  const h = yHi - yLo;
  if (!(h > 2) || !(x1 > x0 + 1)) return;
  const span = x1 - x0;
  const absSlope = Math.abs(slope);
  const segs =
    absSlope < 1e-4
      ? 1
      : Math.max(
          2,
          Math.min(
            opts?.maxSegs ?? 28,
            Math.ceil((span * absSlope) / Math.max(3, h * 0.06))
          )
        );
  const segW = span / segs;
  for (let i = 0; i < segs; i++) {
    const sx0 = x0 + i * segW;
    const sx1 = i === segs - 1 ? x1 : x0 + (i + 1) * segW;
    const cx = (sx0 + sx1) / 2;
    const yTop = bandEdgeAtX(yLo, cx, xRef, slope);
    const yBot = bandEdgeAtX(yHi, cx, xRef, slope);
    out.push({
      kind,
      box: {
        x: clamp01(sx0 / pageWidth),
        y: clamp01(Math.min(yTop, yBot) / pageHeight),
        width: clamp01(Math.max(1, sx1 - sx0) / pageWidth),
        height: clamp01(Math.max(0.008, Math.abs(yBot - yTop) / pageHeight)),
      },
    });
  }
}

/** Half-gap column width around center i (printed day cell approx). */
function colWidthAt(
  centers: number[],
  index: number,
  pageWidth: number,
  _nameMaxX: number,
  colGap?: number
): { x0: number; x1: number } {
  const cx = centers[index]!;
  const prev = centers[index - 1];
  const next = centers[index + 1];
  const fallback = (colGap && colGap > 0 ? colGap : 40) * 0.5;
  const gapL = prev != null ? (cx - prev) / 2 : null;
  const gapR = next != null ? (next - cx) / 2 : null;
  const halfL = gapL ?? gapR ?? fallback;
  const halfR = gapR ?? gapL ?? fallback;
  // Do not clamp to nameMaxX — that crushed early day boxes when the divider
  // sat past colCenters[0].
  const x0 = Math.max(0, cx - halfL);
  const x1 = Math.min(pageWidth * 0.995, cx + halfR);
  return { x0, x1: Math.max(x0 + 6, x1) };
}

function dayFrameAt(
  grid: MonthMatrixGrid,
  index: number,
  pageWidth: number
): { x0: number; x1: number; cx: number } {
  const exact = grid.dayFrames?.[index];
  if (exact && exact.x1 > exact.x0) {
    return { x0: exact.x0, x1: exact.x1, cx: (exact.x0 + exact.x1) / 2 };
  }
  const centers = grid.colCenters?.length ? grid.colCenters : [];
  const width = colWidthAt(centers, index, pageWidth, grid.nameMaxX ?? pageWidth * 0.22, grid.colGap);
  return { ...width, cx: centers[index]! };
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
  const yFirst = grid.rows[0]!.yCenter;
  const xRef = nameMaxX;
  const centers = grid.colCenters?.length ? grid.colCenters : [];
  const out: OcrHighlightBox[] = [];
  // Table ink box — never paint name/own strips into photo margins / metal frame.
  const tableLeft = Math.max(0, grid.contentLeft ?? 0);
  const tableRight = Math.min(
    pageWidth,
    grid.contentRight ??
      (centers.length
        ? Math.max(...centers) + (grid.colGap || 40)
        : pageWidth * 0.98)
  );

  // --- Name column: skewed person cell frame (yLo/yHi) in the name gutter ---
  for (let i = 0; i < grid.rows.length; i++) {
    const band = rowBandY(grid, i);
    const yMid = (band.yLo + band.yHi) / 2;
    const xRight = Math.min(
      tableRight,
      nameColRightAtY(nameMaxX, yMid, yFirst, slope) + 6
    );
    pushSkewedBandSegments(
      out,
      'name-column',
      band.yLo,
      band.yHi,
      tableLeft,
      Math.max(tableLeft + 24, xRight),
      xRef,
      slope,
      pageWidth,
      pageHeight,
      { maxSegs: 8 }
    );
  }

  // --- Day header: one box per real day column (colCenters) ---
  // Prefer glyph Mo/Di band; extend slightly toward the rule under the header
  // so the strip covers the printed day cell (not just glyph ink).
  let hTop =
    grid.headerFrame != null
      ? grid.headerFrame.y0
      : grid.headerBandTop != null && grid.headerBandBot != null
        ? grid.headerBandTop
      : (grid.headerBandY || yFirst - 40) - 12;
  let hBot =
    grid.headerFrame != null
      ? grid.headerFrame.y1
      : grid.headerBandTop != null && grid.headerBandBot != null
        ? grid.headerBandBot
      : (grid.headerBandY || yFirst - 40) + 12;
  const glyphH = Math.max(10, hBot - hTop);
  // Pad toward printed cell frame (KW line / bottom rule) without eating row 1.
  const pad = Math.min(glyphH * 0.35, pageHeight * 0.012);
  hTop = Math.max(0, hTop - pad * 0.25);
  hBot = hBot + pad;
  const headerBand = Math.min(hBot - hTop, Math.max(12, pageHeight * 0.04));
  const yHeaderAtRef =
    grid.headerBandY && grid.headerBandY > 0
      ? grid.headerBandY + pad * 0.35
      : (hTop + hBot) / 2;

  if (centers.length >= 3) {
    for (let i = 0; i < centers.length; i++) {
      const { x0, x1, cx } = dayFrameAt(grid, i, pageWidth);
      const yMid = headerYAtX(yHeaderAtRef, cx, xRef, slope);
      const hx0 = Math.max(tableLeft, x0);
      const hx1 = Math.min(tableRight, x1);
      if (hx1 <= hx0 + 2) continue;
      out.push({
        kind: 'day-header',
        box: {
          x: clamp01(hx0 / pageWidth),
          y: clamp01((yMid - headerBand / 2) / pageHeight),
          width: clamp01((hx1 - hx0) / pageWidth),
          height: clamp01(headerBand / pageHeight),
        },
      });
    }
  } else {
    // No columns — one strip across the header band inside the table.
    out.push({
      kind: 'day-header',
      box: {
        x: clamp01(Math.max(tableLeft, nameMaxX) / pageWidth),
        y: clamp01((yHeaderAtRef - headerBand / 2) / pageHeight),
        width: clamp01((tableRight - Math.max(tableLeft, nameMaxX)) / pageWidth),
        height: clamp01(headerBand / pageHeight),
      },
    });
  }

  const name = String(matchedName || '').trim();
  if (!name) return out;

  const idx = findMatchedRowIndex(grid, name);
  if (idx < 0) return out;

  const band = rowBandY(grid, idx);
  const yRow = (band.yLo + band.yHi) / 2;
  const nameRight = Math.min(
    tableRight,
    nameColRightAtY(nameMaxX, yRow, yFirst, slope)
  );

  // Own-row name gutter (skewed) + day cells along the same parallelogram.
  pushSkewedBandSegments(
    out,
    'own-row',
    band.yLo,
    band.yHi,
    tableLeft,
    Math.max(tableLeft + 24, nameRight + 4),
    xRef,
    slope,
    pageWidth,
    pageHeight,
    { maxSegs: 8 }
  );

  if (centers.length >= 3) {
    for (let i = 0; i < centers.length; i++) {
      const { x0, x1 } = dayFrameAt(grid, i, pageWidth);
      const ox0 = Math.max(tableLeft, x0);
      const ox1 = Math.min(tableRight, x1);
      if (ox1 <= ox0 + 2) continue;
      pushSkewedBandSegments(
        out,
        'own-row',
        band.yLo,
        band.yHi,
        ox0,
        ox1,
        xRef,
        slope,
        pageWidth,
        pageHeight,
        { maxSegs: 4 }
      );
    }
  } else {
    pushSkewedBandSegments(
      out,
      'own-row',
      band.yLo,
      band.yHi,
      nameRight,
      tableRight,
      xRef,
      slope,
      pageWidth,
      pageHeight,
      { maxSegs: 28 }
    );
  }

  return out;
}
