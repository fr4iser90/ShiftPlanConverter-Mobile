/**
 * Layout detection from the photo pixels (before OCR text).
 * One path: downsample → gray → H/V grid cues → layout id.
 */
import { normalizeLocalImageUri } from '../capture';
import {
  OCR_TEXT_ONLY_FALLBACK,
  type ConcreteOcrLayoutId,
  type OcrTextOnlyFallbackId,
} from './types';
import { grayFromRgba, measureImageGrid, downscaleGray, type GrayImage, type ImageGridMetrics } from './imageGrid';

export type ImageLayoutDetection = {
  layoutId: ConcreteOcrLayoutId | OcrTextOnlyFallbackId;
  score: number;
  scores: Record<ConcreteOcrLayoutId, number>;
  metrics: ImageGridMetrics;
  reason: string;
};

/** Same gate as text detect — image lattice must be this strong. */
export const OCR_IMAGE_LAYOUT_MIN_SCORE = 0.42;

/** Long edge for layout probe (fast, enough for ruled tables). */
export const LAYOUT_PROBE_MAX_WIDTH = 800;

function emptyScores(): Record<ConcreteOcrLayoutId, number> {
  return {
    'month-matrix': 0,
    'week-strip': 0,
    'list-protocol': 0,
    'day-plan': 0,
    'single-calendar': 0,
  };
}

export function detectLayoutFromGray(img: GrayImage): ImageLayoutDetection {
  const metrics = measureImageGrid(img);
  const scores = emptyScores();
  scores['month-matrix'] = metrics.monthMatrixScore;
  scores['week-strip'] = metrics.weekStripScore;
  // list / day / single-calendar need text or different vision — stay 0 here

  let layoutId: ConcreteOcrLayoutId = 'month-matrix';
  let score = -1;
  for (const id of Object.keys(scores) as ConcreteOcrLayoutId[]) {
    if (scores[id] > score) {
      score = scores[id];
      layoutId = id;
    }
  }

  if (score < OCR_IMAGE_LAYOUT_MIN_SCORE) {
    return {
      layoutId: OCR_TEXT_ONLY_FALLBACK,
      score: 0,
      scores,
      metrics,
      reason: `image uncertain (best ${layoutId}=${score.toFixed(2)}, H${metrics.hLines}/V${metrics.vLines}) → text-only`,
    };
  }

  return {
    layoutId,
    score,
    scores,
    metrics,
    reason: `image ${layoutId} score=${score.toFixed(2)} H${metrics.hLines}/V${metrics.vLines}`,
  };
}

function b64ToBytes(b64: string): Uint8Array {
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (typeof atobFn === 'function') {
    const bin = atobFn(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function decodeJpegToGray(bytes: Uint8Array): GrayImage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jpeg = require('jpeg-js') as {
    decode: (
      data: Uint8Array,
      opts?: { useTArray?: boolean }
    ) => { width: number; height: number; data: Uint8Array };
  };
  const decoded = jpeg.decode(bytes, { useTArray: true });
  return grayFromRgba(decoded.width, decoded.height, decoded.data, 4);
}

/**
 * Load a local image URI, downscale for speed, return gray buffer.
 * Uses expo-image-manipulator when available; otherwise reads JPEG bytes as-is.
 */
export async function loadGrayImageForLayout(uri: string): Promise<GrayImage | null> {
  const input = normalizeLocalImageUri(uri);
  const fsPath = input.replace(/^file:\/\//, '');

  // Node / Jest: read JPEG from disk first (no native FS/manipulator).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    if (typeof fs.existsSync === 'function' && fs.existsSync(fsPath)) {
      const bytes = new Uint8Array(fs.readFileSync(fsPath));
      // PNG — skip (device path always re-encodes to JPEG via manipulator).
      if (bytes[0] === 0x89 && bytes[1] === 0x50) {
        // fall through to manipulator path when present
      } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        return downscaleGray(decodeJpegToGray(bytes), LAYOUT_PROBE_MAX_WIDTH);
      }
    }
  } catch {
    // continue to Expo path
  }

  let probeUri = input;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manip = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const resized = await manip.manipulateAsync(
      input,
      [{ resize: { width: LAYOUT_PROBE_MAX_WIDTH } }],
      { compress: 0.75, format: manip.SaveFormat.JPEG }
    );
    probeUri = normalizeLocalImageUri(resized.uri);
  } catch {
    // keep original
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as {
      readAsStringAsync: (
        u: string,
        opts: { encoding: string }
      ) => Promise<string>;
      EncodingType?: { Base64: string };
    };
    const encoding = FileSystem.EncodingType?.Base64 || 'base64';
    const b64 = await FileSystem.readAsStringAsync(probeUri, { encoding });
    return downscaleGray(decodeJpegToGray(b64ToBytes(b64)), LAYOUT_PROBE_MAX_WIDTH);
  } catch {
    return null;
  }
}

/** Image-first layout detect from a local photo URI. */
export async function detectLayoutFromImageUri(uri: string): Promise<ImageLayoutDetection | null> {
  const gray = await loadGrayImageForLayout(uri);
  if (!gray) return null;
  return detectLayoutFromGray(gray);
}
