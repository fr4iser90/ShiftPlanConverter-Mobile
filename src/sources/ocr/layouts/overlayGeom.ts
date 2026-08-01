/**
 * Shared geometry helpers for layout highlight overlays / region crops.
 */
import type { MonthMatrixGrid } from './month-matrix/types';

export type OcrHighlightKind = 'name-column' | 'day-header' | 'own-row';

export type OcrNormBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrHighlightBox = {
  kind: OcrHighlightKind;
  box: OcrNormBox;
};

export function clamp01(n: number): number {
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

export function rowBandY(grid: MonthMatrixGrid, index: number): { yLo: number; yHi: number } {
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
export function pushSkewedBandSegments(
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
export function colWidthAt(
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
  const x0 = Math.max(0, cx - halfL);
  const x1 = Math.min(pageWidth * 0.995, cx + halfR);
  return { x0, x1: Math.max(x0 + 6, x1) };
}

export function dayFrameAt(
  grid: MonthMatrixGrid,
  index: number,
  pageWidth: number
): { x0: number; x1: number; cx: number } {
  const exact = grid.dayFrames?.[index];
  if (exact && exact.x1 > exact.x0) {
    return { x0: exact.x0, x1: exact.x1, cx: (exact.x0 + exact.x1) / 2 };
  }
  const centers = grid.colCenters?.length ? grid.colCenters : [];
  const width = colWidthAt(
    centers,
    index,
    pageWidth,
    grid.nameMaxX ?? pageWidth * 0.22,
    grid.colGap
  );
  return { ...width, cx: centers[index]! };
}
