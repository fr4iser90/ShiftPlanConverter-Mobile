/**
 * Pre-OCR deskew from pixel lattice (one rotate, then a single OCR).
 * Optional post-OCR deskew (autoDeskew) remains a separate explicit path.
 */
import type { OcrLine } from './recognize';
import type { GrayImage } from './layouts/imageGrid';
import {
  estimateRowSlopeFromHeaders,
  slopeToDegrees,
} from './monthMatrix/skew';

/** Deskew when |degrees| is at least this (noise floor). */
export const OCR_DESKEW_MIN_DEG = 1.2;
/**
 * Max straighten for wall-plan photos (steep handheld tilt).
 * Beyond this → treat as wrong lattice / need ±90° upright first.
 */
export const OCR_DESKEW_MAX_DEG = 25;

export function deskewDegreesFromOcrLines(
  lines: OcrLine[],
  pageWidth: number
): number {
  const slope = estimateRowSlopeFromHeaders(lines, pageWidth);
  const deg = slopeToDegrees(slope);
  if (Math.abs(deg) < OCR_DESKEW_MIN_DEG) return 0;
  if (Math.abs(deg) > OCR_DESKEW_MAX_DEG) return 0;
  return deg;
}

/**
 * Estimate table skew from edge projections (no OCR).
 * Sweeps candidate slopes and picks the sharpest row-alignment projection.
 * Returns degrees in the same sense as slopeToDegrees (positive = row drops right);
 * counter-rotate with −deg via rotateImageDegrees.
 */
export function deskewDegreesFromGray(img: GrayImage): number {
  const { width: w, height: h, data: g } = img;
  if (w < 48 || h < 48 || g.length < w * h) return 0;

  // Collect strong edge samples (subsampled). Prefer the upper band — day-header
  // lattice is the cleanest skew cue; body text is denser and often flatter noise.
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (let y = 2; y < h - 2; y += 2) {
    const yWeight = y < h * 0.4 ? 2.2 : y < h * 0.55 ? 1.2 : 0.45;
    for (let x = 2; x < w - 2; x += 2) {
      const i = y * w + x;
      const gx =
        -g[i - w - 1]! -
        2 * g[i - 1]! -
        g[i + w - 1]! +
        g[i - w + 1]! +
        2 * g[i + 1]! +
        g[i + w + 1]!;
      const gy =
        -g[i - w - 1]! -
        2 * g[i - w]! -
        g[i - w + 1]! +
        g[i + w - 1]! +
        2 * g[i + w]! +
        g[i + w + 1]!;
      const mag = Math.abs(gx) + Math.abs(gy);
      if (mag < 80) continue;
      // Ruled ink (dark) over gray print / photo noise.
      if (g[i]! > 140 && mag < 160) continue;
      const ink = g[i]! < 100 ? 2 : g[i]! < 130 ? 1.3 : 0.7;
      xs.push(x);
      ys.push(y);
      ws.push(mag * ink * yWeight);
    }
  }
  if (xs.length < 80) return 0;

  const x0 = w * 0.5;
  const maxAbs = OCR_DESKEW_MAX_DEG;
  const binCount = Math.max(32, Math.floor(h * 0.55));

  const scoreSlope = (slope: number): number => {
    const residuals = new Float64Array(xs.length);
    let mean = 0;
    for (let i = 0; i < xs.length; i++) {
      const r = ys[i]! - slope * (xs[i]! - x0);
      residuals[i] = r;
      mean += r;
    }
    mean /= xs.length;
    const bins = new Float64Array(binCount);
    const half = h * 0.45;
    for (let i = 0; i < xs.length; i++) {
      const t = (residuals[i]! - mean) / (2 * half) + 0.5;
      const b = Math.floor(t * binCount);
      if (b < 0 || b >= binCount) continue;
      bins[b]! += ws[i]!;
    }
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < binCount; i++) {
      const v = bins[i]!;
      sum += v;
      sumSq += v * v;
    }
    if (sum <= 0) return 0;
    return sumSq / sum;
  };

  let bestSlope = 0;
  let bestScore = -1;
  // Coarse sweep in degrees → slope
  for (let deg = -maxAbs; deg <= maxAbs; deg += 1) {
    const slope = Math.tan((deg * Math.PI) / 180);
    const sc = scoreSlope(slope);
    if (sc > bestScore) {
      bestScore = sc;
      bestSlope = slope;
    }
  }
  // Fine refine ±1° around best
  const coarseDeg = (Math.atan(bestSlope) * 180) / Math.PI;
  for (let d = -10; d <= 10; d++) {
    const deg = coarseDeg + d * 0.1;
    if (Math.abs(deg) > maxAbs) continue;
    const slope = Math.tan((deg * Math.PI) / 180);
    const sc = scoreSlope(slope);
    if (sc > bestScore) {
      bestScore = sc;
      bestSlope = slope;
    }
  }

  const flatScore = scoreSlope(0);
  // Must beat flat alignment clearly (avoid rotating good photos).
  if (bestScore < flatScore * 1.04) return 0;

  const deg = (Math.atan(bestSlope) * 180) / Math.PI;
  if (Math.abs(deg) < OCR_DESKEW_MIN_DEG) return 0;
  if (Math.abs(deg) > OCR_DESKEW_MAX_DEG) return 0;
  return deg;
}

/**
 * Rotate image by degrees (positive = clockwise). Returns null if manipulator missing.
 * Counter-rotate with −deskewDegreesFrom* to straighten a drooping row.
 */
export async function rotateImageDegrees(
  imageUri: string,
  degrees: number
): Promise<string | null> {
  if (!degrees || !Number.isFinite(degrees)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manip = require('expo-image-manipulator') as {
      manipulateAsync: (
        uri: string,
        actions: { rotate: number }[],
        opts: { compress: number; format: unknown }
      ) => Promise<{ uri: string }>;
      SaveFormat: { JPEG: unknown };
    };
    const out = await manip.manipulateAsync(
      imageUri,
      [{ rotate: degrees }],
      { compress: 0.92, format: manip.SaveFormat.JPEG }
    );
    return out.uri || null;
  } catch {
    return null;
  }
}
