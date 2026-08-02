/**
 * Pure raster enhance for light-on-dark OCR (no FS / Expo).
 *
 * Camera JPEGs often capture printed “white on blue” as pale-on-blue (L≈140 on
 * L≈50). Soft remap in dark cells + light dilation keeps page structure for ML Kit
 * while making those glyphs dark-on-light.
 */

/** Upscale factor for the invert OCR image (boxes are scaled back when merging). */
export const INVERT_OCR_UPSCALE = 2;

function buildIntegral(L: Float32Array, width: number, height: number): Float64Array {
  const W = width + 1;
  const integ = new Float64Array(W * (height + 1));
  for (let y = 1; y <= height; y++) {
    for (let x = 1; x <= width; x++) {
      const v = L[(y - 1) * width + (x - 1)]!;
      integ[y * W + x] =
        v + integ[y * W + (x - 1)]! + integ[(y - 1) * W + x]! - integ[(y - 1) * W + (x - 1)]!;
    }
  }
  return integ;
}

function rectMean(
  integ: Float64Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const W = width + 1;
  const sum =
    integ[y1 * W + x1]! -
    integ[y0 * W + x1]! -
    integ[y1 * W + x0]! +
    integ[y0 * W + x0]!;
  const area = (x1 - x0) * (y1 - y0);
  return area > 0 ? sum / area : 0;
}

function dilateDark(gray: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return gray;
  const out = new Uint8Array(gray.length);
  out.set(gray);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let min = 255;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const v = gray[yy * width + xx]!;
          if (v < min) min = v;
        }
      }
      out[y * width + x] = min;
    }
  }
  return out;
}

/**
 * Soft light-on-dark remap in dark/colored neighborhoods; keep normal luminance
 * elsewhere. Optional dilate + upscale for ML Kit.
 */
export function enhanceLightGlyphRaster(
  data: Uint8Array,
  width: number,
  height: number,
  opts?: {
    upscale?: number;
    darkMeanMax?: number;
    inkDelta?: number;
    paperLuma?: number;
    window?: number;
    dilate?: number;
  }
): { data: Uint8Array; width: number; height: number } {
  const stride = data.length >= width * height * 4 ? 4 : 3;
  const n = width * height;
  const darkMeanMax = opts?.darkMeanMax ?? 130;
  const inkDelta = opts?.inkDelta ?? 22;
  const paperLuma = opts?.paperLuma ?? 185;
  const win = Math.max(8, opts?.window ?? 16);
  const half = win >> 1;
  const dilateR = opts?.dilate ?? 1;

  const L = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += stride) {
    L[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  const integ = buildIntegral(L, width, height);
  const soft = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const Lp = L[p]!;
      const x0 = Math.max(0, x - half);
      const y0 = Math.max(0, y - half);
      const x1 = Math.min(width, x + half + 1);
      const y1 = Math.min(height, y + half + 1);
      const mean = rectMean(integ, width, x0, y0, x1, y1);
      if (mean < darkMeanMax && Lp < paperLuma) {
        const span = Math.max(18, inkDelta * 2.5);
        const t = (Lp - mean) / span;
        const v = 255 - Math.max(0, Math.min(255, t * 255));
        soft[p] = Math.round(v);
      } else {
        soft[p] = Math.round(Math.max(0, Math.min(255, Lp)));
      }
    }
  }
  const gray = dilateDark(soft, width, height, dilateR);

  const scale = Math.max(1, Math.floor(opts?.upscale ?? INVERT_OCR_UPSCALE));
  const outW = width * scale;
  const outH = height * scale;
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < outW; x++) {
      const sx = Math.floor(x / scale);
      const g = gray[sy * width + sx]!;
      const o = (y * outW + x) * 4;
      out[o] = g;
      out[o + 1] = g;
      out[o + 2] = g;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}
