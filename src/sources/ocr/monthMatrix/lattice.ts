/**
 * Printed table lattice → cells = H×V intersections.
 * Professional path: structure first, then drop OCR glyphs into cells.
 */
import type { RuledLattice } from '../layouts/imageGrid';
import { median } from './geometry';
import type { DayFrame, HeaderFrame, LatticeQuality, PersonFrame } from './types';

export type { RuledLattice };

export type LatticeColBound = { x0: number; x1: number; cx: number };

/** OCR glyph AABB in page space — used to ignore photo frame / margins. */
export type ContentBounds = { x0: number; y0: number; x1: number; y1: number };

function gapStats(values: number[]): { medianGap: number; cv: number; regularity: number } {
  const gaps = values.slice(1).map((v, i) => v - values[i]!).filter((g) => g > 0);
  const medianGap = median(gaps) || 0;
  if (!(medianGap > 0) || gaps.length < 2) {
    return { medianGap, cv: 0, regularity: gaps.length ? 1 : 0 };
  }
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  const stdev = Math.sqrt(Math.max(0, variance));
  const cv = mean > 0 ? stdev / mean : 1;
  return { medianGap, cv, regularity: Math.max(0, 1 - Math.min(1, cv / 0.35)) };
}

/**
 * Day-column bounds from vertical rules to the right of the name column.
 * Centers are midpoints of consecutive V-lines (true printed day cells).
 *
 * Never invent a right edge at the photo margin — that turns a metal frame
 * into a fake last day column spanning half the image.
 */
export function dayColBoundsFromVerticals(
  vXs: number[],
  nameMaxX: number,
  pageWidth: number,
  contentRight?: number
): LatticeColBound[] {
  const xs = [...vXs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const rightLimit =
    contentRight != null && contentRight > nameMaxX
      ? Math.min(pageWidth, contentRight + 8)
      : pageWidth * 0.995;
  // Body verticals: start at/after name divider; drop frame edges past content.
  const body = xs.filter((x) => x >= nameMaxX * 0.85 && x <= rightLimit);
  if (body.length < 3) return [];

  // Ensure a left edge at the name divider when the first V is far right.
  const left = body[0]! > nameMaxX + 8 ? [nameMaxX, ...body] : body;

  // Provisional gaps → reject absurdly wide intervals (margin / frame).
  const rawGaps = left.slice(1).map((x, i) => x - left[i]!).filter((g) => g > 8);
  const medGap = median(rawGaps) || pageWidth / 30;
  const maxGap = Math.max(medGap * 2.4, 48);

  const filtered: number[] = [left[0]!];
  for (let i = 1; i < left.length; i++) {
    const prev = filtered[filtered.length - 1]!;
    const x = left[i]!;
    const gap = x - prev;
    if (gap < 8) continue;
    if (gap > maxGap) {
      // Skip this V — likely jumped to a photo-frame edge.
      continue;
    }
    filtered.push(x);
  }
  if (filtered.length < 3) return [];

  const out: LatticeColBound[] = [];
  for (let i = 0; i < filtered.length - 1; i++) {
    const x0 = filtered[i]!;
    const x1 = filtered[i + 1]!;
    if (x1 - x0 < 8) continue;
    out.push({ x0, x1, cx: (x0 + x1) / 2 });
  }
  return out;
}

/**
 * Keep lattice peaks that fall inside the OCR content box (plus pad).
 * Drops locker/frame borders that dominate full-frame photos.
 */
export function clipLatticeToContent(
  lattice: RuledLattice,
  content: ContentBounds,
  padX = 24,
  padY = 24
): RuledLattice {
  const x0 = content.x0 - padX;
  const x1 = content.x1 + padX;
  const y0 = content.y0 - padY;
  const y1 = content.y1 + padY;
  return {
    hYs: lattice.hYs.filter((y) => y >= y0 && y <= y1),
    vXs: lattice.vXs.filter((x) => x >= x0 && x <= x1),
  };
}

export function dayFramesFromBounds(
  bounds: LatticeColBound[],
  headers: string[]
): DayFrame[] {
  return bounds.map((b, i) => ({
    dayIndex: i,
    label: headers[i] || String(i + 1),
    x0: b.x0,
    x1: b.x1,
  }));
}

export function dayFramesFromCenters(
  centers: number[],
  headers: string[],
  pageWidth: number,
  colGap?: number
): DayFrame[] {
  if (!centers.length) return [];
  return centers.map((cx, i) => {
    const prev = centers[i - 1];
    const next = centers[i + 1];
    const fallback = Math.max(10, (colGap || 40) * 0.5);
    const halfL = prev != null ? (cx - prev) / 2 : (next != null ? (next - cx) / 2 : fallback);
    const halfR = next != null ? (next - cx) / 2 : (prev != null ? (cx - prev) / 2 : fallback);
    return {
      dayIndex: i,
      label: headers[i] || String(i + 1),
      x0: Math.max(0, cx - halfL),
      x1: Math.min(pageWidth, cx + halfR),
    };
  });
}

/**
 * Snap OCR-derived day centers onto lattice column centers (nearest V-gap).
 * Keeps header labels; replaces X with printed cell midpoints.
 */
export function snapDayCentersToLattice(
  centers: number[],
  headers: string[],
  vXs: number[],
  nameMaxX: number,
  pageWidth: number,
  contentRight?: number
): { centers: number[]; headers: string[]; bounds: LatticeColBound[] } {
  const bounds = dayColBoundsFromVerticals(vXs, nameMaxX, pageWidth, contentRight);
  if (bounds.length < 3 || centers.length < 3) {
    return { centers, headers, bounds: [] };
  }

  // Map each OCR center to nearest lattice col (unique, left-to-right).
  const used = new Set<number>();
  const snapped: { cx: number; header: string; bi: number }[] = [];
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]!;
    let best = -1;
    let bestD = Infinity;
    for (let bi = 0; bi < bounds.length; bi++) {
      if (used.has(bi)) continue;
      const d = Math.abs(bounds[bi]!.cx - c);
      if (d < bestD) {
        bestD = d;
        best = bi;
      }
    }
    if (best < 0) continue;
    // Reject absurd jumps (OCR center far from any V-gap).
    const medGap =
      median(bounds.slice(1).map((b, j) => b.cx - bounds[j]!.cx).filter((g) => g > 0)) ||
      pageWidth / 30;
    if (bestD > medGap * 1.35) continue;
    used.add(best);
    snapped.push({ cx: bounds[best]!.cx, header: headers[i] || '', bi: best });
  }

  if (snapped.length < 3) {
    return { centers, headers, bounds };
  }
  snapped.sort((a, b) => a.cx - b.cx);
  return {
    centers: snapped.map((s) => s.cx),
    headers: snapped.map((s) => s.header),
    bounds: snapped.map((s) => bounds[s.bi]!),
  };
}

export function scoreLatticeColumns(
  vXs: number[],
  nameMaxX: number,
  pageWidth: number,
  expectedCols?: number,
  contentRight?: number
): { quality: LatticeQuality; bounds: LatticeColBound[] } {
  const bounds = dayColBoundsFromVerticals(vXs, nameMaxX, pageWidth, contentRight);
  let statsBounds = bounds.slice();
  if (statsBounds.length >= 4) {
    const widths = statsBounds.map((b) => b.x1 - b.x0).filter((w) => w > 0);
    const medWidth = median(widths) || 0;
    if (medWidth > 0 && statsBounds[0]!.x1 - statsBounds[0]!.x0 < medWidth * 0.55) {
      statsBounds = statsBounds.slice(1);
    }
  }
  const centers = statsBounds.map((b) => b.cx);
  const stats = gapStats(centers);
  const inferredCols = bounds.length;
  const enoughCols =
    expectedCols != null ? inferredCols >= Math.max(3, expectedCols - 2) : inferredCols >= 3;
  const regularEnough = stats.regularity >= 0.45 || stats.cv <= 0.22;
  const ok = enoughCols && regularEnough;
  let reason: string | undefined;
  if (!enoughCols) {
    reason = `weak-v-count:${inferredCols}`;
  } else if (!regularEnough) {
    reason = `irregular-v-pitch:${stats.cv.toFixed(3)}`;
  }
  return {
    bounds,
    quality: {
      ok,
      reason,
      hLines: 0,
      vLines: vXs.length,
      expectedCols,
      inferredCols,
      regularity: stats.regularity,
      dayPitchCv: stats.cv,
    },
  };
}

/**
 * Header strip Y from lattice + day-header glyphs.
 *
 * The rule immediately above the first person is often the *top* of the date
 * row (or a title rule), not the bottom. Prefer H-rules that bracket the Mo/Di
 * glyph band; fall back to [rule-above-glyphs, rule-at-first-person].
 */
export function headerBandFromLattice(
  hYs: number[],
  firstPersonY: number,
  glyphTop?: number,
  glyphBot?: number
): { top: number; bot: number; mid: number } | null {
  const ys = [...hYs].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (ys.length < 2 || !(firstPersonY > 0)) return null;

  const hasGlyph =
    glyphTop != null && glyphBot != null && glyphBot > glyphTop + 4;
  const glyphMid = hasGlyph ? (glyphTop! + glyphBot!) / 2 : null;

  // Bottom of header ≈ top of first person cell (H at/just above name baseline).
  let bot: number | null = null;
  for (const y of ys) {
    if (y < firstPersonY - 2) continue;
    if (y > firstPersonY + Math.max(12, (firstPersonY - (glyphMid ?? firstPersonY)) * 0.5)) {
      break;
    }
    bot = y;
    break;
  }
  if (bot == null) {
    for (const y of ys) {
      if (y < firstPersonY - 2 && (bot == null || y > bot)) bot = y;
    }
  }
  if (bot == null) return null;

  // Top: last H strictly above glyph mid (or above bot).
  const topCeil = glyphMid != null ? glyphMid : bot;
  let top: number | null = null;
  for (const y of ys) {
    if (y < topCeil - 2 && (top == null || y > top)) top = y;
  }
  if (top == null) {
    top =
      hasGlyph && glyphTop! < bot
        ? glyphTop!
        : bot - Math.max(16, (bot - (ys[0] ?? 0)) * 0.15);
  }

  let y0 = top;
  let y1 = bot;

  if (hasGlyph) {
    // Always cover Mo/Di ink; lattice alone often stops at the rule *above* dates.
    y0 = Math.min(y0, glyphTop!);
    y1 = Math.max(y1, glyphBot!);
    // Do not eat the first person name.
    y1 = Math.min(y1, firstPersonY - 2);
    if (y1 <= y0 + 4) y1 = Math.min(firstPersonY - 2, glyphBot! + 4);
  }

  if (!(y1 > y0 + 4)) return null;
  return { top: y0, bot: y1, mid: (y0 + y1) / 2 };
}

export function headerFrameFromBand(
  band: { top: number; bot: number } | null | undefined
): HeaderFrame | undefined {
  if (!band || !(band.bot > band.top)) return undefined;
  return { y0: band.top, y1: band.bot };
}

export function personFramesFromRows(yBands: Array<{
  yLo?: number;
  yHi?: number;
  bandSource?: 'ruled' | 'soft';
}>): PersonFrame[] {
  return yBands
    .map((r, rowIndex) =>
      r.yLo != null && r.yHi != null && r.yHi > r.yLo
        ? { rowIndex, y0: r.yLo, y1: r.yHi, source: r.bandSource || 'soft' }
        : null
    )
    .filter((r): r is PersonFrame => !!r);
}

/** Column index for x using lattice bounds (true printed day cells). */
export function owningColIndexFromBounds(
  x: number,
  bounds: LatticeColBound[]
): number {
  if (!bounds.length) return -1;
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i]!;
    if (x >= b.x0 && x < b.x1) return i;
  }
  // Nearest center fallback at edges.
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < bounds.length; i++) {
    const d = Math.abs(x - bounds[i]!.cx);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
