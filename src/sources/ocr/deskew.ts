/**
 * Optional mild deskew before / after first OCR (gallery & camera — scan already warps).
 * One rotate pass only — not a layout retry chain.
 */
import {
  estimateRowSlopeFromHeaders,
  slopeToDegrees,
} from './monthMatrix/skew';
import type { OcrLine } from './recognize';

/** Deskew when |degrees| is at least this (noise floor). */
export const OCR_DESKEW_MIN_DEG = 1.2;
/** Skip absurd rotates (wrong lattice). */
export const OCR_DESKEW_MAX_DEG = 10;

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
 * Rotate image by degrees (positive = clockwise). Returns null if manipulator missing.
 * Counter-rotate with −deskewDegreesFromOcrLines to straighten a drooping row.
 */
export async function rotateImageDegrees(
  imageUri: string,
  degrees: number
): Promise<string | null> {
  if (!degrees || !Number.isFinite(degrees)) return null;
  try {
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
