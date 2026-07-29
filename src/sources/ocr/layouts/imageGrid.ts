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

/** Horizontal + vertical ruled lines in image pixel space. */
export type RuledLattice = {
  hYs: number[];
  vXs: number[];
};

function peaks(proj: Float64Array, minSep: number, thrFrac = 0.4): number[] {
  let mx = 0;
  for (let i = 0; i < proj.length; i++) if (proj[i]! > mx) mx = proj[i]!;
  const thr = mx * thrFrac;
  if (thr <= 0) return [];
  const idxs: number[] = [];
  let i = 0;
  const n = proj.length;
  while (i < n) {
    if (proj[i]! >= thr) {
      let j = i;
      while (j + 1 < n && proj[j + 1]! >= thr) j += 1;
      let best = i;
      let bestV = proj[i]!;
      for (let k = i; k <= j; k++) {
        if (proj[k]! > bestV) {
          bestV = proj[k]!;
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

/** Shared edge map + H/V projections for lattice / layout scoring. */
function edgeProjections(img: GrayImage): {
  hp: Float64Array;
  vp: Float64Array;
  w: number;
  h: number;
} | null {
  const { width: w, height: h, data: g } = img;
  if (w < 32 || h < 32 || g.length < w * h) return null;

  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
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
      edge[i] = Math.abs(gx) + Math.abs(gy) > 80 ? 255 : 0;
    }
  }

  const hp = new Float64Array(h);
  const vp = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = edge[i]!;
      if (g[i]! < 90) v = Math.max(v, 180);
      if (v) {
        hp[y] += v;
        vp[x] += v;
      }
    }
  }
  return { hp, vp, w, h };
}

/**
 * Sobel-ish edges + dark ink boost → projection peaks ≈ ruled table lines.
 */
export function measureImageGrid(img: GrayImage): ImageGridMetrics {
  const proj = edgeProjections(img);
  if (!proj) {
    return { hLines: 0, vLines: 0, monthMatrixScore: 0, weekStripScore: 0 };
  }
  const { hp, vp, w, h } = proj;

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

/**
 * Full printed lattice (H + V) in image pixel space.
 * Professional table path: structure first, then OCR into cells.
 */
export type LatticeRoi = { x0: number; y0: number; x1: number; y1: number };

function cropGrayImage(img: GrayImage, roi: LatticeRoi): GrayImage | null {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(roi.x0)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(roi.y0)));
  const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil(roi.x1)));
  const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil(roi.y1)));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 32 || h < 32) return null;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = img.data[(y0 + y) * img.width + (x0 + x)]!;
    }
  }
  return { width: w, height: h, data: out };
}

export function detectRuledLattice(
  img: GrayImage,
  opts?: { thrFrac?: number; minSepFracH?: number; minSepFracV?: number; roi?: LatticeRoi }
): RuledLattice {
  const roi = opts?.roi;
  const cropped = roi ? cropGrayImage(img, roi) : null;
  const base = cropped || img;
  const proj = edgeProjections(base);
  if (!proj) return { hYs: [], vXs: [] };
  const { hp, vp, w, h } = proj;
  const thrFrac = opts?.thrFrac ?? 0.32;
  const minSepH = Math.max(2, Math.floor(h * (opts?.minSepFracH ?? 1 / 70)));
  const minSepV = Math.max(2, Math.floor(w * (opts?.minSepFracV ?? 1 / 80)));
  let hYs = peaks(hp, minSepH, thrFrac);
  let vXs = peaks(vp, minSepV, thrFrac);
  // One explicit quality relaxation: sparse printed rules on photos often need a
  // slightly lower threshold, but we do it once only, not as retry logic.
  if (vXs.length < 6 || hYs.length < 3) {
    const relaxed = Math.max(0.24, thrFrac - 0.06);
    hYs = peaks(hp, minSepH, relaxed);
    vXs = peaks(vp, minSepV, relaxed);
  }
  if (!cropped || !roi) return { hYs, vXs };
  // Translate back into original image coords.
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(roi.x0)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(roi.y0)));
  return { hYs: hYs.map((y) => y + y0), vXs: vXs.map((x) => x + x0) };
}

/**
 * Y positions of strong horizontal ruled lines (image pixel space).
 * Prefer detectRuledLattice when both axes are needed.
 */
export function detectRuledHorizontalYs(
  img: GrayImage,
  opts?: { thrFrac?: number; minSepFrac?: number }
): number[] {
  return detectRuledLattice(img, {
    thrFrac: opts?.thrFrac,
    minSepFracH: opts?.minSepFrac,
  }).hYs;
}

/** Scale ruled Ys from probe gray height into OCR/page coordinates. */
export function scaleRuledYsToPage(
  ruledYs: number[],
  grayHeight: number,
  pageHeight: number
): number[] {
  if (!(grayHeight > 0) || !(pageHeight > 0)) return [];
  const s = pageHeight / grayHeight;
  return ruledYs.map((y) => y * s);
}

/** Scale full lattice from probe gray into OCR/page coordinates. */
export function scaleLatticeToPage(
  lattice: RuledLattice,
  grayWidth: number,
  grayHeight: number,
  pageWidth: number,
  pageHeight: number
): RuledLattice {
  if (!(grayWidth > 0) || !(grayHeight > 0) || !(pageWidth > 0) || !(pageHeight > 0)) {
    return { hYs: [], vXs: [] };
  }
  const sx = pageWidth / grayWidth;
  const sy = pageHeight / grayHeight;
  return {
    hYs: lattice.hYs.map((y) => y * sy),
    vXs: lattice.vXs.map((x) => x * sx),
  };
}

/** Local copy of layout min score — avoid circular import with detectFromImage. */
const OCR_IMAGE_LAYOUT_MIN_SCORE_LOCAL = 0.42;

/** Rotate gray buffer 90° clockwise (for upright probe — no second OCR). */
export function rotateGrayCw90(img: GrayImage): GrayImage {
  const w = img.height;
  const h = img.width;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const nx = img.height - 1 - y;
      const ny = x;
      data[ny * w + nx] = img.data[y * img.width + x]!;
    }
  }
  return { width: w, height: h, data };
}

/**
 * If the table lattice scores clearly better after ±90°, return that rotate.
 * One path before OCR — EXIF bake alone can leave wall plans sideways.
 */
export function uprightRotateDegreesFromGray(img: GrayImage): 0 | 90 | -90 {
  const base = measureImageGrid(img);
  const cw = measureImageGrid(rotateGrayCw90(img));
  const ccw = measureImageGrid(rotateGrayCw90(rotateGrayCw90(rotateGrayCw90(img))));
  const candidates: { deg: 0 | 90 | -90; score: number }[] = [
    { deg: 0, score: base.monthMatrixScore },
    { deg: 90, score: cw.monthMatrixScore },
    { deg: -90, score: ccw.monthMatrixScore },
  ];
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const upright = candidates.find((c) => c.deg === 0)!;
  if (best.deg === 0) return 0;
  if (best.score < OCR_IMAGE_LAYOUT_MIN_SCORE_LOCAL) return 0;
  if (best.score < upright.score + 0.12) return 0;
  return best.deg;
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
      data[y * w + x] = img.data[sy * img.width + sx]!;
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
    data[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8;
  }
  return { width, height, data };
}
