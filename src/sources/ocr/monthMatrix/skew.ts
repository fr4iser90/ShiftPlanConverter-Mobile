/**
 * Page/row skew for month-matrix OCR (mild clockwise/counterclockwise photos).
 * slope = Δy / Δx in page pixels (positive → row drops to the right).
 */
import type { OcrLine } from '../recognize';
import { looksLikeDayHeader, looksLikeShiftCell, median, xCenter, yCenter } from './geometry';

/** Ignore absurd photo tilts (user / wrong lattice). */
export const OCR_SKEW_MAX_ABS_SLOPE = 0.22;
/** Below this, treat as straight (noise). */
export const OCR_SKEW_MIN_ABS_SLOPE = 0.008;

export function clampSlope(slope: number): number {
  if (!Number.isFinite(slope)) return 0;
  if (Math.abs(slope) < OCR_SKEW_MIN_ABS_SLOPE) return 0;
  return Math.max(-OCR_SKEW_MAX_ABS_SLOPE, Math.min(OCR_SKEW_MAX_ABS_SLOPE, slope));
}

/** Degrees for image rotate (positive = clockwise in expo-image-manipulator). */
export function slopeToDegrees(slope: number): number {
  const s = clampSlope(slope);
  if (!s) return 0;
  return (Math.atan(s) * 180) / Math.PI;
}

export function expectedYAtX(yAnchor: number, xAnchor: number, x: number, slope: number): number {
  return yAnchor + clampSlope(slope) * (x - xAnchor);
}

/**
 * Ordinary least-squares slope for y ~ a + b·x.
 * Returns 0 when not enough spread / points.
 */
export function fitSlope(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-6) return 0;
  const xSpan = Math.max(...xs.slice(0, n)) - Math.min(...xs.slice(0, n));
  if (xSpan < 40) return 0;
  return clampSlope((n * sumXY - sumX * sumY) / denom);
}

/**
 * Prefer day-header lattice (Mo14… across the top) — usually one physical line.
 */
export function estimateRowSlopeFromHeaders(
  lines: OcrLine[],
  pageWidth: number,
  nameMaxX?: number
): number {
  const left = nameMaxX && nameMaxX > 0 ? nameMaxX : pageWidth * 0.2;
  const headers = lines.filter((l) => {
    if (xCenter(l) < left * 0.9) return false;
    return looksLikeDayHeader(l.text);
  });
  if (headers.length >= 4) {
    return fitSlope(
      headers.map((l) => xCenter(l)),
      headers.map((l) => yCenter(l))
    );
  }
  // Fallback: short shift tokens across the board (noisy — median of local slopes).
  const cells = lines.filter((l) => {
    if (xCenter(l) < left) return false;
    return looksLikeShiftCell(l.text);
  });
  if (cells.length < 8) return 0;
  const byX = cells.slice().sort((a, b) => xCenter(a) - xCenter(b));
  const xs = byX.map((l) => xCenter(l));
  const ys = byX.map((l) => yCenter(l));
  // Robust-ish: fit on every other point to reduce vertical stacking noise.
  const sx: number[] = [];
  const sy: number[] = [];
  for (let i = 0; i < xs.length; i += 2) {
    sx.push(xs[i]!);
    sy.push(ys[i]!);
  }
  return fitSlope(sx, sy);
}

/**
 * Refine slope using cells that already sit near a name row (after name groups exist).
 * Keeps global header slope when refinement is weak.
 */
export function refineRowSlopeNearAnchor(
  lines: OcrLine[],
  yAnchor: number,
  xAnchor: number,
  nameMaxX: number,
  rowYPad: number,
  baseSlope: number
): number {
  const near = lines.filter((l) => {
    const xc = xCenter(l);
    if (xc < nameMaxX * 0.95) return false;
    if (!looksLikeShiftCell(l.text)) return false;
    const yExp = expectedYAtX(yAnchor, xAnchor, xc, baseSlope);
    return Math.abs(yCenter(l) - yExp) <= rowYPad * 1.35;
  });
  if (near.length < 4) return baseSlope;
  const refined = fitSlope(
    near.map((l) => xCenter(l)),
    near.map((l) => yCenter(l))
  );
  if (!refined) return baseSlope;
  // Blend — don't trust a single noisy row completely.
  return clampSlope(baseSlope * 0.35 + refined * 0.65);
}

/** Median absolute residual useful for status / deskew gate. */
export function headerSkewResidualPx(
  lines: OcrLine[],
  pageWidth: number,
  slope: number,
  nameMaxX?: number
): number {
  const left = nameMaxX && nameMaxX > 0 ? nameMaxX : pageWidth * 0.2;
  const headers = lines.filter((l) => xCenter(l) >= left * 0.9 && looksLikeDayHeader(l.text));
  if (headers.length < 3) return 0;
  const x0 = xCenter(headers[0]!);
  const y0 = yCenter(headers[0]!);
  const residuals = headers.map((l) =>
    Math.abs(yCenter(l) - expectedYAtX(y0, x0, xCenter(l), slope))
  );
  return median(residuals);
}
