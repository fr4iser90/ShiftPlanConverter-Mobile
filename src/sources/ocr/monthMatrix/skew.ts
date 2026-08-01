/**
 * Page/row skew for month-matrix OCR (mild clockwise/counterclockwise photos).
 * slope = Δy / Δx in page pixels (positive → row drops to the right).
 */
import type { OcrLine } from '../recognize';
import {
  looksLikeDayHeader,
  looksLikeDayNumber,
  looksLikeShiftCell,
  median,
  xCenter,
  yCenter,
} from './geometry';

/**
 * Geometry clamp for row Y expectations (skewed wall-plan photos).
 * ~40° — beyond this the lattice is usually wrong / sideways (use 90° orient).
 */
export const OCR_SKEW_MAX_ABS_SLOPE = 0.85;
/** Below this, treat as straight (noise). */
export const OCR_SKEW_MIN_ABS_SLOPE = 0.008;
/** Image deskew clamp (degrees via slope) — matches OCR_DESKEW_MAX_DEG. */
export const OCR_DESKEW_SLOPE_MAX = Math.tan((25 * Math.PI) / 180);

export function clampSlope(slope: number): number {
  if (!Number.isFinite(slope)) return 0;
  if (Math.abs(slope) < OCR_SKEW_MIN_ABS_SLOPE) return 0;
  return Math.max(-OCR_SKEW_MAX_ABS_SLOPE, Math.min(OCR_SKEW_MAX_ABS_SLOPE, slope));
}

/** Degrees for image rotate (positive = clockwise in expo-image-manipulator). */
export function slopeToDegrees(slope: number): number {
  if (!Number.isFinite(slope)) return 0;
  if (Math.abs(slope) < OCR_SKEW_MIN_ABS_SLOPE) return 0;
  // Deskew path: only mild tilts (geometry may be steeper).
  const s = Math.max(-OCR_DESKEW_SLOPE_MAX, Math.min(OCR_DESKEW_SLOPE_MAX, slope));
  if (Math.abs(s) < OCR_SKEW_MIN_ABS_SLOPE) return 0;
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
 * Drop Y-outliers (stray title "MO") before fitting so a flat strip stays flat.
 */
function slopeFromHeaderLikeStrip(headers: OcrLine[], pageWidth: number): number {
  if (headers.length < 4) return 0;
  const xs = headers.map((l) => xCenter(l));
  const ys = headers.map((l) => yCenter(l));
  const ySpan = Math.max(...ys) - Math.min(...ys);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  // Flat strip: drop Y-outliers (stray title "MO"). Mild diagonal (few dozen
  // px across the page) must NOT be collapsed to median-Y — that zeros slope
  // and leaves overlays as flat AABBs on skewed photos.
  let use = headers;
  const flatBand = Math.max(48, pageWidth * 0.02);
  if (xSpan > 40 && ySpan <= 8) {
    const medY = median(ys);
    const yTol = Math.max(36, pageWidth * 0.015);
    const inliers = headers.filter((l) => Math.abs(yCenter(l) - medY) <= yTol);
    if (inliers.length >= 4) use = inliers;
  } else if (xSpan > 80 || (xSpan > 40 && ySpan > 8 && ySpan <= flatBand)) {
    const rough = fitSlope(xs, ys);
    if (rough) {
      const x0 = median(xs);
      const y0 = median(ys);
      const res = headers.map((l) =>
        Math.abs(yCenter(l) - expectedYAtX(y0, x0, xCenter(l), rough))
      );
      const medR = median(res);
      const tol = Math.max(28, medR * 2.8, pageWidth * 0.012);
      const inliers = headers.filter((_, i) => res[i]! <= tol);
      if (inliers.length >= 4) use = inliers;
    }
  }
  const slope = fitSlope(
    use.map((l) => xCenter(l)),
    use.map((l) => yCenter(l))
  );
  // Noise floor — keep mild wall-plan skew for overlays / scoop.
  if (Math.abs(slope) < OCR_SKEW_MIN_ABS_SLOPE) return 0;
  // Tiny absolute drop across the strip ≈ OCR jitter, not camera skew.
  const useXs = use.map((l) => xCenter(l));
  const useYs = use.map((l) => yCenter(l));
  const useXSpan = Math.max(...useXs) - Math.min(...useXs);
  const useYSpan = Math.max(...useYs) - Math.min(...useYs);
  if (useXSpan > 80 && useYSpan <= Math.max(10, pageWidth * 0.006)) return 0;
  return slope;
}

export function estimateRowSlopeFromHeaders(
  lines: OcrLine[],
  pageWidth: number,
  nameMaxX?: number
): number {
  const left = nameMaxX && nameMaxX > 0 ? nameMaxX : pageWidth * 0.2;
  const headers = lines.filter((l) => {
    if (xCenter(l) < left * 0.55) return false;
    return looksLikeDayHeader(l.text);
  });
  if (headers.length >= 4) {
    return slopeFromHeaderLikeStrip(headers, pageWidth);
  }

  // Month-matrix screenshots often OCR day numbers without weekday ("1"…"30").
  // Prefer that flat top strip over the noisy multi-row cell fallback.
  const dayNums = lines.filter((l) => {
    if (xCenter(l) < left * 0.55) return false;
    return looksLikeDayNumber(l.text);
  });
  if (dayNums.length >= 6) {
    const band = densestYBand(dayNums, Math.max(28, pageWidth * 0.02));
    if (band.length >= 6) {
      const fromDays = slopeFromHeaderLikeStrip(band, pageWidth);
      // Flat day strip wins — do not invent slant from body cells.
      return fromDays;
    }
  }

  // Fallback: short shift tokens in ONE densest Y-band (never all rows by X —
  // that invents ~few-degree drift on straight multi-person grids).
  const cells = lines.filter((l) => {
    if (xCenter(l) < left) return false;
    return looksLikeShiftCell(l.text);
  });
  if (cells.length < 8) return 0;
  const band = densestYBand(cells, Math.max(22, pageWidth * 0.018));
  if (band.length < 6) return 0;
  const byX = band.slice().sort((a, b) => xCenter(a) - xCenter(b));
  const slope = fitSlope(
    byX.map((l) => xCenter(l)),
    byX.map((l) => yCenter(l))
  );
  // Cell fallback is noisy — only accept mild tilts with a real Y drop.
  if (Math.abs(slope) < OCR_SKEW_MIN_ABS_SLOPE || Math.abs(slope) > 0.045) return 0;
  const ySpan = Math.max(...byX.map((l) => yCenter(l))) - Math.min(...byX.map((l) => yCenter(l)));
  if (ySpan <= Math.max(10, pageWidth * 0.006)) return 0;
  return slope;
}

/** Densest cluster of lines within `windowPx` of Y (for header strip helpers). */
export function densestYBand(lines: OcrLine[], windowPx: number): OcrLine[] {
  if (lines.length < 2) return lines.slice();
  const sorted = lines.slice().sort((a, b) => yCenter(a) - yCenter(b));
  let best: OcrLine[] = [sorted[0]!];
  for (let i = 0; i < sorted.length; i++) {
    const band: OcrLine[] = [sorted[i]!];
    for (let j = i + 1; j < sorted.length; j++) {
      if (yCenter(sorted[j]!) - yCenter(sorted[i]!) <= windowPx) band.push(sorted[j]!);
      else break;
    }
    if (band.length > best.length) best = band;
  }
  return best;
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
  if (Math.abs(baseSlope) < 0.02) {
    // Flat header strip → never invent a steep own-row (neighbor bleed).
    return 0;
  }
  // Prefer header slope; refine only nudges.
  return clampSlope(baseSlope * 0.75 + refined * 0.25);
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
