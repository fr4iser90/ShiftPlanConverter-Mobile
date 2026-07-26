/**
 * Apply a normalized crop rect (0–1 of image) via expo-image-manipulator.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export type NormalizedCropRect = {
  /** 0–1 left */
  x: number;
  /** 0–1 top */
  y: number;
  /** 0–1 width */
  width: number;
  /** 0–1 height */
  height: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function sanitizeNormalizedCrop(rect: NormalizedCropRect): NormalizedCropRect {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const width = Math.max(0.05, Math.min(1 - x, clamp01(rect.width)));
  const height = Math.max(0.05, Math.min(1 - y, clamp01(rect.height)));
  return { x, y, width, height };
}

/** Default band: full width, middle ~28% — good starting point for “my row”. */
export function defaultRowCrop(): NormalizedCropRect {
  return { x: 0.02, y: 0.36, width: 0.96, height: 0.28 };
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    // Lazy require for Jest (avoids RN flow entry at import time).
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

export async function cropImageNormalized(
  uri: string,
  rect: NormalizedCropRect
): Promise<string> {
  const clean = sanitizeNormalizedCrop(rect);
  const { width, height } = await getImageSize(uri);
  const originX = Math.round(clean.x * width);
  const originY = Math.round(clean.y * height);
  const cropW = Math.max(1, Math.round(clean.width * width));
  const cropH = Math.max(1, Math.round(clean.height * height));
  const result = await manipulateAsync(
    uri,
    [
      {
        crop: {
          originX: Math.min(originX, Math.max(0, width - 1)),
          originY: Math.min(originY, Math.max(0, height - 1)),
          width: Math.min(cropW, width - originX),
          height: Math.min(cropH, height - originY),
        },
      },
    ],
    { compress: 0.95, format: SaveFormat.JPEG }
  );
  return result.uri;
}
