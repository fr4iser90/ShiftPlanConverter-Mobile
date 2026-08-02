/**
 * Printed table lattice → cells = H×V intersections.
 * Professional path: structure first, then drop OCR glyphs into cells.
 */
import type { RuledLattice } from '../imageGrid';
import { median } from './geometry';
import { expectedYAtX } from './skew';
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
/**
 * Longest run of body V-lines with day-like pitch. Skipping a single oversized
 * gap used to strand the cursor on an early outlier V (e.g. name/week rule) and
 * drop every later day rule — prefer the densest regular stretch instead.
 * One missing intermediate V (~2× pitch) is filled with a midpoint.
 */
function longestRegularVRun(body: number[], medGap: number): number[] {
  const maxGap = Math.max(medGap * 2.4, 48);
  // ~2× pitch with some jitter (photo lattice often misses one day rule).
  const fillGap = Math.max(medGap * 3.6, maxGap + medGap * 0.5);
  let best: number[] = [];

  for (let start = 0; start < body.length; start++) {
    const run: number[] = [body[start]!];
    for (let i = start + 1; i < body.length; i++) {
      const prev = run[run.length - 1]!;
      const x = body[i]!;
      const gap = x - prev;
      if (gap < 8) continue;
      if (gap <= maxGap) {
        run.push(x);
        continue;
      }
      // Exactly one missing day rule between prev and x.
      if (gap <= fillGap && gap >= medGap * 1.55) {
        run.push((prev + x) / 2, x);
        continue;
      }
      break;
    }
    if (run.length > best.length) best = run;
  }

  // Grow left: densest stretch may start after a single missing V (e.g. 521→655).
  if (best.length >= 3) {
    const first = best[0]!;
    const idx = body.indexOf(first);
    for (let i = idx - 1; i >= 0; i--) {
      const x = body[i]!;
      const gap = best[0]! - x;
      if (gap < 8) continue;
      if (gap <= maxGap) {
        best = [x, ...best];
        continue;
      }
      if (gap <= fillGap && gap >= medGap * 1.55) {
        best = [x, (x + best[0]!) / 2, ...best];
        continue;
      }
      break;
    }
  }
  return best;
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
  contentRight?: number,
  guidePitch?: number
): LatticeColBound[] {
  const xs = [...vXs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const rightLimit =
    contentRight != null && contentRight > nameMaxX
      ? Math.min(pageWidth, contentRight + 8)
      : pageWidth * 0.995;
  // Body verticals: start at/after name divider; drop frame edges past content.
  const body = xs.filter((x) => x >= nameMaxX * 0.85 && x <= rightLimit);
  if (body.length < 3) return [];

  // Day pitch from consecutive body V gaps — ignore the widest outliers so a
  // missing early column (or divider→body jump) does not inflate maxGap.
  const bodyGaps = body.slice(1).map((x, i) => x - body[i]!).filter((g) => g > 8);
  const sortedGaps = [...bodyGaps].sort((a, b) => a - b);
  const coreGaps =
    sortedGaps.length >= 5
      ? sortedGaps.slice(0, Math.max(3, Math.ceil(sortedGaps.length * 0.75)))
      : sortedGaps;
  const medGap = median(coreGaps.length ? coreGaps : bodyGaps) || pageWidth / 30;
  const maxGap = Math.max(medGap * 2.4, 48);

  let filtered = longestRegularVRun(body, medGap);
  // Prepend name divider only when the first body V is a normal day-pitch away.
  if (
    filtered.length >= 3 &&
    filtered[0]! > nameMaxX + 8 &&
    filtered[0]! - nameMaxX <= maxGap
  ) {
    filtered = [nameMaxX, ...filtered];
  }
  // Peak detection often misses early/late day rules (empty cols vs mid-month ink).
  // Bridge the name divider → first dense V at day pitch so the date strip starts
  // at day 1 — only when there is a multi-day hole (not every short irregular set).
  // Extend right only when OCR contentRight is known (avoid inventing columns out
  // to the photo edge).
  const leftHole = filtered.length >= 3 ? filtered[0]! - nameMaxX : 0;
  if (filtered.length >= 3 && medGap >= 8 && leftHole > medGap * 2.5) {
    // Sparse early V peaks under-estimate pitch; prefer OCR day-header pitch when
    // bridging a multi-day hole so early columns match printed Mo/Di spacing.
    const fillPitch =
      guidePitch != null &&
      guidePitch >= 12 &&
      guidePitch <= Math.max(medGap * 2.2, pageWidth * 0.08)
        ? guidePitch
        : medGap;
    filtered = extendDayVsAcrossDateStrip(filtered, nameMaxX, rightLimit, fillPitch, {
      extendRight: contentRight != null && contentRight > nameMaxX,
    });
    filtered = coalesceDayVs(filtered, fillPitch);
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
 * Fill missing day V-lines left of the densest run (back to the name divider)
 * and right up to the OCR content edge, using the observed day pitch.
 */
function extendDayVsAcrossDateStrip(
  run: number[],
  nameMaxX: number,
  rightLimit: number,
  medGap: number,
  opts?: { extendRight?: boolean }
): number[] {
  let xs = run.slice();
  // Left: walk back from first V to the name divider at day pitch.
  if (xs[0]! > nameMaxX + medGap * 0.7) {
    const left: number[] = [];
    let x = xs[0]!;
    // Cap: a month has ≤31 day cells → ≤32 verticals from the name edge.
    for (let n = 0; n < 32 && x - medGap >= nameMaxX - medGap * 0.15; n++) {
      x -= medGap;
      if (x < nameMaxX - 1) {
        left.push(nameMaxX);
        break;
      }
      left.push(x);
    }
    left.reverse();
    if (!left.length || left[0]! > nameMaxX + 8) {
      left.unshift(nameMaxX);
    }
    // Drop a synthetic that lands too close to the first real V.
    while (left.length && xs[0]! - left[left.length - 1]! < medGap * 0.45) {
      left.pop();
    }
    xs = [...left, ...xs];
  } else if (xs[0]! > nameMaxX + 8) {
    xs = [nameMaxX, ...xs];
  }

  // Right: walk forward while we stay inside the OCR content box.
  if (opts?.extendRight) {
    let last = xs[xs.length - 1]!;
    for (let n = 0; n < 32; n++) {
      const next = last + medGap;
      if (next > rightLimit - 4) break;
      if (rightLimit - next < medGap * 0.35) break;
      xs.push(next);
      last = next;
    }
  }
  return xs;
}

/** Drop near-duplicate Vs; keep ~one rule per day pitch. */
function coalesceDayVs(xs: number[], medGap: number): number[] {
  if (xs.length < 2 || !(medGap > 0)) return xs;
  const minSep = Math.max(8, medGap * 0.55);
  const out: number[] = [xs[0]!];
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i]!;
    const prev = out[out.length - 1]!;
    if (x - prev < minSep) continue;
    out.push(x);
  }
  // If name divider → first V is a stub cell, re-seat the next V at one pitch.
  if (out.length >= 3 && out[1]! - out[0]! < medGap * 0.7) {
    const seated = out[0]! + medGap;
    if (out[2]! - seated >= minSep) {
      out[1] = seated;
    } else {
      out.splice(1, 1);
    }
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
 * Returns the **full** lattice date strip (not only OCR-matched columns) so
 * missing early/mid days stay as empty printed cells. Header labels attach to
 * the matched lattice index when OCR sees that day.
 */
export function snapDayCentersToLattice(
  centers: number[],
  headers: string[],
  vXs: number[],
  nameMaxX: number,
  pageWidth: number,
  contentRight?: number,
  guidePitch?: number
): { centers: number[]; headers: string[]; bounds: LatticeColBound[]; matched: number } {
  const bounds = dayColBoundsFromVerticals(
    vXs,
    nameMaxX,
    pageWidth,
    contentRight,
    guidePitch
  );
  if (bounds.length < 3 || centers.length < 3) {
    return { centers, headers, bounds: [], matched: 0 };
  }

  // Map each OCR center to nearest lattice col (unique, left-to-right).
  const used = new Set<number>();
  const matchedHeaders = new Array(bounds.length).fill('');
  let matched = 0;
  const medGap =
    median(bounds.slice(1).map((b, j) => b.cx - bounds[j]!.cx).filter((g) => g > 0)) ||
    pageWidth / 30;
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
    if (bestD > medGap * 1.35) continue;
    used.add(best);
    matched += 1;
    matchedHeaders[best] = headers[i] || String(best + 1);
  }

  if (matched < 3) {
    return { centers, headers, bounds, matched };
  }
  return {
    centers: bounds.map((b) => b.cx),
    headers: matchedHeaders.map((h, i) => h || String(i + 1)),
    bounds,
    matched,
  };
}

export function scoreLatticeColumns(
  vXs: number[],
  nameMaxX: number,
  pageWidth: number,
  expectedCols?: number,
  contentRight?: number,
  guidePitch?: number
): { quality: LatticeQuality; bounds: LatticeColBound[] } {
  const bounds = dayColBoundsFromVerticals(
    vXs,
    nameMaxX,
    pageWidth,
    contentRight,
    guidePitch
  );
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
    // Prefer ink height when H-rules span title→first-person (fat yellow overlays).
    const glyphH = glyphBot! - glyphTop!;
    if (y1 - y0 > glyphH * 2.5) {
      y0 = glyphTop!;
      y1 = glyphBot!;
    }
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

/**
 * Half-gap day bounds from centers when V-lattice snap was not accepted.
 * Still forms explicit cell X intervals for glyph-in-cell scoop.
 */
export function colBoundsFromCenters(
  centers: number[],
  pageWidth: number,
  colGap?: number
): LatticeColBound[] {
  if (centers.length < 1) return [];
  const fallback = (colGap && colGap > 0 ? colGap : 40) * 0.5;
  return centers.map((cx, i) => {
    const prev = centers[i - 1];
    const next = centers[i + 1];
    const gapL = prev != null ? (cx - prev) / 2 : null;
    const gapR = next != null ? (next - cx) / 2 : null;
    const halfL = gapL ?? gapR ?? fallback;
    const halfR = gapR ?? gapL ?? fallback;
    const x0 = Math.max(0, cx - halfL);
    const x1 = Math.min(pageWidth * 0.995, cx + halfR);
    return { x0, x1: Math.max(x0 + 6, x1), cx };
  });
}

/**
 * True when glyph center lies in the printed person×day cell (skew-aware Y).
 * This is the single ownership rule when row yLo/yHi and column bounds exist.
 */
export function glyphInLatticeCell(
  x: number,
  y: number,
  row: { yLo?: number; yHi?: number },
  col: { x0: number; x1: number },
  slope: number,
  xRef: number
): boolean {
  if (row.yLo == null || row.yHi == null || !(row.yHi > row.yLo)) return false;
  if (!(col.x1 > col.x0 + 1)) return false;
  if (x < col.x0 || x >= col.x1) return false;
  const yLo = expectedYAtX(row.yLo, xRef, x, slope);
  const yHi = expectedYAtX(row.yHi, xRef, x, slope);
  const top = Math.min(yLo, yHi);
  const bot = Math.max(yLo, yHi);
  return y >= top && y < bot;
}
