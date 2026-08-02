/**
 * Duty-agnostic short-glyph classifier for pale-on-dark / dark-on-light cells.
 * Returns "U" | "/" | null — pack mapping owns U→Urlaub.
 */
import { SHORT_GLYPH_POLICY as P } from './shortGlyphPolicy';

export type ShortGlyph = 'U' | '/';

export type ShortGlyphMatch = {
  glyph: ShortGlyph | null;
  score: number;
  inkFrac: number;
  meanLuma: number;
  contrast: number;
  meanBlueMinusRed: number;
};

function dens(
  ink: Uint8Array,
  cw: number,
  ch: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
): number {
  let n = 0;
  let t = 0;
  const xa = Math.max(0, x0);
  const xb = Math.min(cw, x1);
  const ya = Math.max(0, y0);
  const yb = Math.min(ch, y1);
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      t++;
      if (ink[y * cw + x]) n++;
    }
  }
  return t ? n / t : 0;
}

function dilateInk(ink: Uint8Array, cw: number, ch: number): Uint8Array {
  const out = new Uint8Array(ink.length);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= ch || xx < 0 || xx >= cw) continue;
          if (ink[yy * cw + xx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * cw + x] = v;
    }
  }
  return out;
}

/**
 * Classify a cell luminance patch as U, /, or empty.
 * Optional meanBlueMinusRed distinguishes gray weekend cells from blue vacation.
 */
export function matchShortGlyphFromLuma(
  L: Float32Array | number[],
  cw: number,
  ch: number,
  opts?: { meanBlueMinusRed?: number }
): ShortGlyphMatch {
  const n = cw * ch;
  if (n < 20 || cw < 6 || ch < 8) {
    return { glyph: null, score: 0, inkFrac: 0, meanLuma: 0, contrast: 0, meanBlueMinusRed: 0 };
  }
  let sum = 0;
  const vals = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    vals[i] = L[i]!;
    sum += L[i]!;
  }
  const mean = sum / n;
  const sorted = Array.from(vals).sort((a, b) => a - b);
  const p90 = sorted[Math.floor(n * 0.9)]!;
  const p10 = sorted[Math.floor(n * 0.1)]!;
  const span = Math.max(8, p90 - p10);
  const blueDelta = opts?.meanBlueMinusRed ?? 0;

  const darkCell = mean < 150;
  // Neutral gray weekend (not blue vacation fill).
  const grayish =
    mean >= P.grayMinLuma && mean <= P.grayMaxLuma && blueDelta < P.grayMaxBlueDelta;
  let ink = new Uint8Array(n);
  let inkN = 0;
  if (grayish || !darkCell) {
    // Dark ink on gray/light paper
    const thr = mean - span * 0.22;
    for (let i = 0; i < n; i++) {
      if (vals[i]! <= thr) {
        ink[i] = 1;
        inkN++;
      }
    }
    if (inkN < n * 0.015) {
      const cut = sorted[Math.min(n - 1, Math.ceil(n * 0.08))]!;
      inkN = 0;
      for (let i = 0; i < n; i++) {
        ink[i] = vals[i]! <= cut ? 1 : 0;
        if (ink[i]) inkN++;
      }
    }
  } else {
    // Pale ink on dark/blue fill
    let thr = mean + span * 0.22;
    if (p90 - mean < 22) thr = (mean + p90) * 0.5;
    for (let i = 0; i < n; i++) {
      if (vals[i]! >= thr) {
        ink[i] = 1;
        inkN++;
      }
    }
    if (inkN < n * 0.02) {
      const cut = sorted[Math.max(0, n - Math.ceil(n * 0.07))]!;
      inkN = 0;
      for (let i = 0; i < n; i++) {
        ink[i] = vals[i]! >= cut ? 1 : 0;
        if (ink[i]) inkN++;
      }
    }
  }

  const inkFrac = inkN / n;
  if (inkFrac < 0.012 || inkFrac > 0.5) {
    return {
      glyph: null,
      score: 0,
      inkFrac,
      meanLuma: mean,
      contrast: span,
      meanBlueMinusRed: blueDelta,
    };
  }

  const inkDilated = dilateInk(ink, cw, ch);

  let minX = cw;
  let maxX = 0;
  let minY = ch;
  let maxY = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (!inkDilated[y * cw + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  if (bw < 3 || bh < 5) {
    return {
      glyph: null,
      score: 0,
      inkFrac,
      meanLuma: mean,
      contrast: span,
      meanBlueMinusRed: blueDelta,
    };
  }

  const yMid = minY + Math.floor(bh * 0.55);
  const yBot0 = minY + Math.floor(bh * 0.6);
  const xL1 = minX + Math.max(1, Math.floor(bw * 0.32));
  const xR0 = minX + Math.floor(bw * 0.68);
  const leftUp = dens(inkDilated, cw, ch, minX, xL1, minY, yMid);
  const rightUp = dens(inkDilated, cw, ch, xR0, maxX + 1, minY, yMid);
  const midUp = dens(inkDilated, cw, ch, xL1, xR0, minY, yMid);
  const midBot = dens(inkDilated, cw, ch, xL1, xR0, yBot0, maxY + 1);

  let diagPos = 0;
  let diagNeg = 0;
  let diagN = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!inkDilated[y * cw + x]) continue;
      const nx = (x - minX) / Math.max(1, bw - 1);
      const ny = (y - minY) / Math.max(1, bh - 1);
      diagPos += 1 - Math.abs(nx - ny);
      diagNeg += 1 - Math.abs(nx - (1 - ny));
      diagN++;
    }
  }
  const slashAlign = diagN ? Math.max(diagPos, diagNeg) / diagN : 0;
  const stemMin = Math.min(leftUp, rightUp);
  const stems = (leftUp + rightUp) / 2;
  const uScore = stems * 1.15 - midUp * 0.85 + midBot * 1.05 + stemMin * 0.7;

  let glyph: ShortGlyph | null = null;
  let score = 0;
  if (grayish) {
    // Slash on gray weekend paper only — weekday gray is often a duty cell.
    if (
      slashAlign > P.slashMinAlignGray &&
      inkFrac < P.slashMaxInkFrac &&
      inkFrac > P.slashMinInkFrac
    ) {
      glyph = '/';
      score = slashAlign;
    }
  } else if (
    blueDelta > P.uMinBlueDelta &&
    span >= P.uMinContrast &&
    stemMin > P.uMinStem &&
    stems > P.uMinStems &&
    midBot > P.uMinMidBot &&
    uScore > P.uMinScore &&
    inkFrac >= P.uMinInkFrac &&
    inkFrac < P.uMaxInkFrac
  ) {
    glyph = 'U';
    score = uScore;
  } else if (
    slashAlign > P.slashMinAlignOther &&
    inkFrac < 0.22 &&
    stemMin < 0.1 &&
    blueDelta < 20
  ) {
    glyph = '/';
    score = slashAlign;
  }

  return {
    glyph,
    score,
    inkFrac,
    meanLuma: mean,
    contrast: span,
    meanBlueMinusRed: blueDelta,
  };
}

/** Match from RGBA/RGB buffer (stride 3 or 4). */
export function matchShortGlyphFromRgba(
  data: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): ShortGlyphMatch {
  const cx0 = Math.max(0, Math.min(width - 1, Math.floor(x0)));
  const cy0 = Math.max(0, Math.min(height - 1, Math.floor(y0)));
  const cx1 = Math.max(cx0 + 1, Math.min(width, Math.ceil(x1)));
  const cy1 = Math.max(cy0 + 1, Math.min(height, Math.ceil(y1)));
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;
  const stride = data.length >= width * height * 4 ? 4 : 3;
  const L = new Float32Array(cw * ch);
  let sumB = 0;
  let sumR = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = ((cy0 + y) * width + (cx0 + x)) * stride;
      const r = data[i]!;
      const b = data[i + 2]!;
      L[y * cw + x] = 0.299 * r + 0.587 * data[i + 1]! + 0.114 * b;
      sumR += r;
      sumB += b;
    }
  }
  const pix = cw * ch;
  return matchShortGlyphFromLuma(L, cw, ch, {
    meanBlueMinusRed: pix ? (sumB - sumR) / pix : 0,
  });
}
