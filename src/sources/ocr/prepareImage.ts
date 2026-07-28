/**
 * Downscale / lightly upscale gallery/camera JPEGs before ML Kit OCR.
 * Wall-plan photos are often 3000–4000px; soft crops can be &lt;1200px.
 *
 * One pass only (resize + re-encode). No second OCR attempt.
 * expo-image-manipulator applies EXIF on decode when resizing — prefer resize path
 * so orientation is baked without a full-frame no-op re-encode of huge files.
 *
 * Loaded lazily so a missing native module does not crash app boot.
 */
import { normalizeLocalImageUri } from './capture';

/** Long edge cap for OCR — denser glyphs for wall-plan month matrices. */
export const OCR_MAX_LONG_EDGE = 3000;
/** Soft / chat-downscaled photos: lift toward this long edge (capped). */
export const OCR_MIN_LONG_EDGE = 1800;
export const OCR_JPEG_QUALITY = 0.92;

type Manipulator = typeof import('expo-image-manipulator');

function tryLoadManipulator(): Manipulator | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator') as Manipulator;
  } catch {
    return null;
  }
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('react-native') as {
      Image: {
        getSize: (
          u: string,
          ok: (w: number, h: number) => void,
          fail: (e: unknown) => void
        ) => void;
      };
    };
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err instanceof Error ? err : new Error(String(err)))
    );
  });
}

/** Compute target size for one-pass OCR normalize (downscale large, mild upscale soft). */
export function ocrTargetSize(
  width: number,
  height: number
): { width: number; height: number; changed: boolean } {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0) return { width, height, changed: false };

  if (longEdge > OCR_MAX_LONG_EDGE) {
    const scale = OCR_MAX_LONG_EDGE / longEdge;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      changed: true,
    };
  }

  if (longEdge < OCR_MIN_LONG_EDGE) {
    const scale = Math.min(OCR_MIN_LONG_EDGE / longEdge, 1.5);
    if (scale > 1.05) {
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        changed: true,
      };
    }
  }

  return { width, height, changed: false };
}

/**
 * Return a local JPEG suitable for OCR. Skips work when size is already in band
 * or when the native image manipulator is unavailable.
 *
 * When resizing, Expo applies EXIF orientation into the output pixels.
 * Callers with EXIF-only mismatch (size already in band) should pre-bake on host
 * or force a 1px-noop resize — we always re-encode when long-edge needs work.
 */
export async function prepareImageForOcr(uri: string): Promise<string> {
  const input = normalizeLocalImageUri(uri);
  let width = 0;
  let height = 0;
  try {
    const size = await getImageSize(input);
    width = size.width;
    height = size.height;
  } catch {
    return input;
  }

  const target = ocrTargetSize(width, height);
  const manip = tryLoadManipulator();
  if (!manip) return input;

  // Always re-encode through manipulator so EXIF orientation is baked even when
  // dimensions are already in-band (cheap when already ≤3000 long edge).
  const actions = target.changed
    ? [{ resize: { width: target.width, height: target.height } }]
    : [{ resize: { width, height } }];

  try {
    const resized = await manip.manipulateAsync(input, actions, {
      compress: OCR_JPEG_QUALITY,
      format: manip.SaveFormat.JPEG,
    });
    return normalizeLocalImageUri(resized.uri);
  } catch {
    return input;
  }
}

/** JPEG Start-Of-Frame size (raw pixel buffer, ignores EXIF). Exported for unit tests. */
export function jpegSofSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const size = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (marker === 0xc0 || marker === 0xc2) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    if (size < 2) return null;
    offset += 2 + size;
    if (marker === 0xda) break;
  }
  return null;
}
