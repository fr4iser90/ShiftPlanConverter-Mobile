export type Pt = { x: number; y: number };

export type Homography = [
  h11: number,
  h12: number,
  h13: number,
  h21: number,
  h22: number,
  h23: number,
  h31: number,
  h32: number,
  h33: number
];

/**
 * Compute projective homography H (3x3) such that:
 *   [u v 1]^T ~ H * [x y 1]^T
 * using 4 point correspondences (DLT), with h33 normalized to 1.
 *
 * Notes:
 * - No external deps; small Gaussian elimination for the 8 unknowns.
 * - Expects non-degenerate quads.
 */
export function computeHomography(
  src: [Pt, Pt, Pt, Pt],
  dst: [Pt, Pt, Pt, Pt]
): Homography {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const n = 8;
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) {
      throw new Error('computeHomography: degenerate point configuration');
    }
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const div = M[col]![col]!;
    for (let k = col; k <= n; k++) M[col]![k] = M[col]![k]! / div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r]![col]!;
      if (Math.abs(factor) < 1e-15) continue;
      for (let k = col; k <= n; k++) M[r]![k] = M[r]![k]! - factor * M[col]![k]!;
    }
  }

  const x = M.map((row) => row[n]!);
  const [h11, h12, h13, h21, h22, h23, h31, h32] = x;
  return [h11!, h12!, h13!, h21!, h22!, h23!, h31!, h32!, 1];
}

export function applyHomography(pt: Pt, H: Homography): Pt {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = H;
  const denom = h31 * pt.x + h32 * pt.y + h33;
  if (Math.abs(denom) < 1e-12) {
    return { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
  }
  return {
    x: (h11 * pt.x + h12 * pt.y + h13) / denom,
    y: (h21 * pt.x + h22 * pt.y + h23) / denom,
  };
}

/** Invert H via adjugate / det (3×3). Throws on singular matrices. */
export function invertHomography(H: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const Hh = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) {
    throw new Error('invertHomography: singular matrix');
  }
  const inv: Homography = [
    A / det,
    D / det,
    G / det,
    B / det,
    E / det,
    Hh / det,
    C / det,
    F / det,
    I / det,
  ];
  // Normalize so h33 ≈ 1 when possible (matches computeHomography convention).
  if (Math.abs(inv[8]) > 1e-12) {
    const s = inv[8];
    return inv.map((v) => v / s) as Homography;
  }
  return inv;
}

export function applyHomographyToBox(
  box: { x: number; y: number; width: number; height: number },
  H: Homography
): { x: number; y: number; width: number; height: number } {
  const pts = [
    applyHomography({ x: box.x, y: box.y }, H),
    applyHomography({ x: box.x + box.width, y: box.y }, H),
    applyHomography({ x: box.x, y: box.y + box.height }, H),
    applyHomography({ x: box.x + box.width, y: box.y + box.height }, H),
  ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return box;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/** Mean Euclidean residual of applying H then comparing to expected dst points. */
export function homographyResidualRms(
  src: Pt[],
  dst: Pt[],
  H: Homography
): number {
  const n = Math.min(src.length, dst.length);
  if (n === 0) return Infinity;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const got = applyHomography(src[i]!, H);
    if (!Number.isFinite(got.x) || !Number.isFinite(got.y)) continue;
    const dx = got.x - dst[i]!.x;
    const dy = got.y - dst[i]!.y;
    sum += dx * dx + dy * dy;
    count += 1;
  }
  if (!count) return Infinity;
  return Math.sqrt(sum / count);
}

/** Round-trip residual: mean || inv(H)·H·p - p ||. */
export function roundTripResidualRms(pts: Pt[], H: Homography, inv?: Homography): number {
  let Hinv: Homography;
  try {
    Hinv = inv || invertHomography(H);
  } catch {
    return Infinity;
  }
  if (!pts.length) return Infinity;
  let sum = 0;
  let count = 0;
  for (const p of pts) {
    const mid = applyHomography(p, H);
    if (!Number.isFinite(mid.x) || !Number.isFinite(mid.y)) continue;
    const back = applyHomography(mid, Hinv);
    if (!Number.isFinite(back.x) || !Number.isFinite(back.y)) continue;
    const dx = back.x - p.x;
    const dy = back.y - p.y;
    sum += dx * dx + dy * dy;
    count += 1;
  }
  if (!count) return Infinity;
  return Math.sqrt(sum / count);
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex + positive area for ordered TL,TR,BR,BL or TL,TR,BL,BR. */
export function quadQuality(
  tl: Pt,
  tr: Pt,
  bl: Pt,
  br: Pt
): { ok: boolean; area: number; reason?: string } {
  const pts = [tl, tr, br, bl];
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { ok: false, area: 0, reason: 'non-finite-corner' };
    }
  }
  // Area via shoelace (TL→TR→BR→BL).
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % 4]!;
    area += a.x * b.y - b.x * a.y;
  }
  area = Math.abs(area) / 2;
  if (area < 1) return { ok: false, area, reason: 'tiny-area' };

  // All turns same sign → convex.
  const signs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const o = pts[i]!;
    const a = pts[(i + 1) % 4]!;
    const b = pts[(i + 2) % 4]!;
    signs.push(Math.sign(cross(o, a, b)));
  }
  const nonzero = signs.filter((s) => s !== 0);
  if (nonzero.length < 3) return { ok: false, area, reason: 'collinear' };
  if (nonzero.some((s) => s !== nonzero[0])) {
    return { ok: false, area, reason: 'non-convex' };
  }

  // Reject extreme aspect / bowtie-like skinny quads.
  const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const widthBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const heightL = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const heightR = Math.hypot(br.x - tr.x, br.y - tr.y);
  const w = (widthTop + widthBot) / 2;
  const h = (heightL + heightR) / 2;
  if (w < 40 || h < 40) return { ok: false, area, reason: 'too-small-span' };
  if (w / h > 12 || h / w > 4) return { ok: false, area, reason: 'extreme-aspect' };
  // Perspective taper: top/bottom widths should stay within a sane ratio.
  if (Math.min(widthTop, widthBot) / Math.max(widthTop, widthBot) < 0.35) {
    return { ok: false, area, reason: 'extreme-taper' };
  }
  return { ok: true, area };
}
