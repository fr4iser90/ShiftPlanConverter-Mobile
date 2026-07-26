/**
 * Pixel-first table/grid cues (no OCR text).
 * Pros: find H/V structure on the image, then OCR into cells.
 */
export type GrayImage = {
  width: number;
  height: number;
  /** Row-major luma 0..255 */
  data: Uint8Array;
};

export type ImageGridMetrics = {
  hLines: number;
  vLines: number;
  /** 0..1 month-matrix-likeness from line lattice */
  monthMatrixScore: number;
  /** Weaker week-board cue (~5–9 verticals, several horizontals) */
  weekStripScore: number;
};

function peaks(proj: Float64Array, minSep: number, thrFrac = 0.4): number[] {
  let mx = 0;
  for (let i = 0; i < proj.length; i++) if (proj[i] > mx) mx = proj[i];
  const thr = mx * thrFrac;
  if (thr <= 0) return [];
  const idxs: number[] = [];
  let i = 0;
  const n = proj.length;
  while (i < n) {
    if (proj[i] >= thr) {
      let j = i;
      while (j + 1 < n && proj[j + 1] >= thr) j += 1;
      let best = i;
      let bestV = proj[i];
      for (let k = i; k <= j; k++) {
        if (proj[k] > bestV) {
          bestV = proj[k];
          best = k;
        }
      }
      idxs.push(best);
      i = j + minSep;
    } else {
      i += 1;
    }
  }
  return idxs;
}

/**
 * Sobel-ish edges + dark ink boost → projection peaks ≈ ruled table lines.
 */
export function measureImageGrid(img: GrayImage): ImageGridMetrics {
  const { width: w, height: h, data: g } = img;
  if (w < 32 || h < 32 || g.length < w * h) {
    return { hLines: 0, vLines: 0, monthMatrixScore: 0, weekStripScore: 0 };
  }

  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -g[i - w - 1] -
        2 * g[i - 1] -
        g[i + w - 1] +
        g[i - w + 1] +
        2 * g[i + 1] +
        g[i + w + 1];
      const gy =
        -g[i - w - 1] -
        2 * g[i - w] -
        g[i - w + 1] +
        g[i + w - 1] +
        2 * g[i + w] +
        g[i + w + 1];
      const m = Math.abs(gx) + Math.abs(gy);
      edge[i] = m > 80 ? 255 : 0;
    }
  }

  const hp = new Float64Array(h);
  const vp = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = edge[i];
      if (g[i] < 90) v = Math.max(v, 180);
      if (v) {
        hp[y] += v;
        vp[x] += v;
      }
    }
  }

  const hs = peaks(hp, Math.max(3, Math.floor(h / 50)));
  const vs = peaks(vp, Math.max(3, Math.floor(w / 50)));

  const col =
    vs.length >= 20
      ? 1
      : vs.length >= 10
        ? 0.75
        : vs.length >= 5
          ? 0.45
          : vs.length >= 3
            ? 0.15
            : 0;
  const row =
    hs.length >= 12
      ? 1
      : hs.length >= 7
        ? 0.8
        : hs.length >= 4
          ? 0.5
          : hs.length >= 2
            ? 0.15
            : 0;

  const monthMatrixScore = Math.min(1, 0.55 * col + 0.45 * row);

  // Week-strip image cue is easy to confuse with a partial month lattice
  // (glare / few detected verticals). Leave week to OCR-text scoring for now.
  const weekStripScore = 0;

  return {
    hLines: hs.length,
    vLines: vs.length,
    monthMatrixScore,
    weekStripScore,
  };
}

/** Nearest-neighbor downscale so layout probe stays cheap on phone photos. */
export function downscaleGray(img: GrayImage, maxWidth: number): GrayImage {
  if (img.width <= maxWidth) return img;
  const scale = maxWidth / img.width;
  const w = maxWidth;
  const h = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      data[y * w + x] = img.data[sy * img.width + sx];
    }
  }
  return { width: w, height: h, data };
}

/** Build GrayImage from RGB/RGBA interleaved buffer. */
export function grayFromRgba(
  width: number,
  height: number,
  rgba: Uint8Array,
  channels = 4
): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += channels) {
    data[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return { width, height, data };
}
