/**
 * Second OCR pass on a luminance-enhanced JPEG so light-on-dark cell glyphs
 * (e.g. white "U" on blue vacation cells) become readable to ML Kit.
 *
 * Duty-agnostic merge lives in invertOcrMerge.ts; pack mapping still owns codes.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { normalizeLocalImageUri } from './capture';
import { enhanceLightGlyphRaster, INVERT_OCR_UPSCALE } from './invertOcrEnhance';
export { enhanceLightGlyphRaster, INVERT_OCR_UPSCALE } from './invertOcrEnhance';
export {
  isInvertMergeCandidate,
  mergeInvertOcrLines,
  scaleInvertLinesToPrimary,
} from './invertOcrMerge';
import type { OcrLine } from './recognize';

type JpegCodec = {
  decode: (
    data: Uint8Array,
    opts?: { useTArray?: boolean }
  ) => { width: number; height: number; data: Uint8Array };
  encode: (
    img: { data: Uint8Array; width: number; height: number },
    quality?: number
  ) => { data: Uint8Array };
};

export type InvertPrepareResult = {
  uri: string;
  /** Map OCR boxes from the crop image into primary page space. */
  toPage: (line: OcrLine) => OcrLine;
  meta: {
    imgW: number;
    imgH: number;
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
    upscale: number;
  };
};

export type InvertPageCrop = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pageWidth: number;
  pageHeight: number;
};

function ensureBufferPolyfill(): void {
  const g = globalThis as { Buffer?: unknown };
  if (typeof g.Buffer !== 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  g.Buffer = require('buffer').Buffer;
}

function loadJpeg(): JpegCodec {
  ensureBufferPolyfill();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('jpeg-js') as JpegCodec;
}

function b64ToBytes(b64: string): Uint8Array {
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (typeof atobFn === 'function') {
    const bin = atobFn(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Buffer } = require('buffer') as { Buffer: { from: (s: string, e: string) => Uint8Array } };
    return new Uint8Array(Buffer.from(b64, 'base64'));
  } catch {
    throw new Error('b64ToBytes: no atob/buffer');
  }
}

function bytesToB64(bytes: Uint8Array): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fromByteArray } = require('base64-js') as {
      fromByteArray: (b: Uint8Array) => string;
    };
    return fromByteArray(bytes);
  } catch {
    // fall through
  }
  const btoaFn = (globalThis as { btoa?: (s: string) => string }).btoa;
  if (typeof btoaFn === 'function') {
    const CHUNK = 0x2000;
    let s = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
      for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]!);
    }
    return btoaFn(s);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Buffer } = require('buffer') as {
      Buffer: { from: (b: Uint8Array) => { toString: (e: string) => string } };
    };
    return Buffer.from(bytes).toString('base64');
  } catch {
    throw new Error('bytesToB64: no base64-js/btoa/buffer');
  }
}

async function readJpegBytes(uri: string): Promise<Uint8Array | null> {
  const input = normalizeLocalImageUri(uri);
  const fsPath = input.replace(/^file:\/\//, '');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    if (typeof fs.existsSync === 'function' && fs.existsSync(fsPath)) {
      return new Uint8Array(fs.readFileSync(fsPath));
    }
  } catch {
    // Expo path below
  }
  const b64 = await FileSystem.readAsStringAsync(input, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!b64 || b64.length < 32) return null;
  return b64ToBytes(b64);
}

function nearestUpscale(
  data: Uint8Array,
  width: number,
  height: number,
  scale: number
): { data: Uint8Array; width: number; height: number } {
  const s = Math.max(1, Math.floor(scale));
  if (s === 1) return { data, width, height };
  const outW = width * s;
  const outH = height * s;
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.floor(y / s);
    for (let x = 0; x < outW; x++) {
      const sx = Math.floor(x / s);
      const si = (sy * width + sx) * 4;
      const o = (y * outW + x) * 4;
      out[o] = data[si]!;
      out[o + 1] = data[si + 1]!;
      out[o + 2] = data[si + 2]!;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

function cropRgba(
  data: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { data: Uint8Array; width: number; height: number; originX: number; originY: number } {
  const cx0 = Math.max(0, Math.min(width - 1, Math.floor(x0)));
  const cy0 = Math.max(0, Math.min(height - 1, Math.floor(y0)));
  const cx1 = Math.max(cx0 + 1, Math.min(width, Math.ceil(x1)));
  const cy1 = Math.max(cy0 + 1, Math.min(height, Math.ceil(y1)));
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((cy0 + y) * width + (cx0 + x)) * 4;
      const o = (y * cw + x) * 4;
      out[o] = data[si]!;
      out[o + 1] = data[si + 1]!;
      out[o + 2] = data[si + 2]!;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: cw, height: ch, originX: cx0, originY: cy0 };
}

/**
 * Soft light-on-dark enhance, optional page-space grid crop, then upscale for ML Kit.
 */
export async function prepareLuminanceInvertedJpeg(
  uri: string,
  opts?: { crop?: InvertPageCrop; cropUpscale?: number }
): Promise<InvertPrepareResult | null> {
  try {
    const bytes = await readJpegBytes(uri);
    if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

    const jpeg = loadJpeg();
    const decoded = jpeg.decode(bytes, { useTArray: true });
    const { width: imgW, height: imgH, data } = decoded;
    if (!(imgW > 0 && imgH > 0) || data.length < imgW * imgH * 3) return null;

    const enhanced = enhanceLightGlyphRaster(data, imgW, imgH, { upscale: 1 });

    const crop = opts?.crop;
    const pageW = crop?.pageWidth || imgW;
    const pageH = crop?.pageHeight || imgH;
    const sx = imgW / Math.max(1, pageW);
    const sy = imgH / Math.max(1, pageH);

    let region = {
      data: enhanced.data,
      width: enhanced.width,
      height: enhanced.height,
    };
    let cropX = 0;
    let cropY = 0;
    if (crop) {
      const ix0 = crop.x0 * sx;
      const iy0 = crop.y0 * sy;
      const ix1 = crop.x1 * sx;
      const iy1 = crop.y1 * sy;
      const cropped = cropRgba(enhanced.data, enhanced.width, enhanced.height, ix0, iy0, ix1, iy1);
      region = cropped;
      cropX = cropped.originX;
      cropY = cropped.originY;
    }

    const upscale = Math.max(1, Math.floor(opts?.cropUpscale ?? (crop ? 3 : INVERT_OCR_UPSCALE)));
    const scaled = nearestUpscale(region.data, region.width, region.height, upscale);

    const encoded = jpeg.encode(
      { data: scaled.data, width: scaled.width, height: scaled.height },
      92
    );
    const raw = encoded.data as Uint8Array | ArrayBuffer | number[];
    const outBytes =
      raw instanceof Uint8Array
        ? raw
        : ArrayBuffer.isView(raw)
          ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
          : new Uint8Array(raw as ArrayLike<number>);
    const outB64 = bytesToB64(outBytes);
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) {
      // eslint-disable-next-line no-console
      console.warn('[ocr-invert] no cache/document directory');
      return null;
    }
    const outPath = `${base}ocr-invert-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(outPath, outB64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const toPage = (line: OcrLine): OcrLine => {
      const b = line.boundingBox;
      return {
        ...line,
        boundingBox: {
          x: ((cropX + b.x / upscale) / imgW) * pageW,
          y: ((cropY + b.y / upscale) / imgH) * pageH,
          width: (b.width / upscale / imgW) * pageW,
          height: (b.height / upscale / imgH) * pageH,
        },
      };
    };

    return {
      uri: normalizeLocalImageUri(outPath),
      toPage,
      meta: {
        imgW,
        imgH,
        cropX,
        cropY,
        cropW: region.width,
        cropH: region.height,
        upscale,
      },
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ocr-invert] prepare error', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Infer horizontal duty-row bands from surname/name OCR lines. */
export function inferInvertRowBands(
  lines: OcrLine[],
  pageWidth: number,
  pageHeight: number,
  nameMaxX: number
): InvertPageCrop[] {
  const nameLike = lines.filter((l) => {
    const t = String(l.text || '').trim();
    if (!t || t.length < 3 || t.length > 28) return false;
    if (l.boundingBox.x > nameMaxX * 0.95) return false;
    // Surname tokens often end with comma, or look like names
    return /,/.test(t) || /^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(t);
  });
  const ys = nameLike
    .map((l) => l.boundingBox.y + l.boundingBox.height / 2)
    .sort((a, b) => a - b);
  // Dedup nearby name Ys (first+last name)
  const centers: number[] = [];
  for (const y of ys) {
    if (!centers.length || Math.abs(y - centers[centers.length - 1]!) > 28) centers.push(y);
  }
  const bands: InvertPageCrop[] = [];
  for (let i = 0; i < centers.length; i++) {
    const y = centers[i]!;
    const prev = i > 0 ? centers[i - 1]! : y - 55;
    const next = i + 1 < centers.length ? centers[i + 1]! : y + 55;
    const y0 = Math.max(0, (y + prev) / 2);
    const y1 = Math.min(pageHeight, (y + next) / 2);
    if (y1 - y0 < 20) continue;
    bands.push({
      x0: Math.max(0, nameMaxX - 4),
      y0,
      x1: pageWidth,
      y1,
      pageWidth,
      pageHeight,
    });
  }
  return bands;
}
