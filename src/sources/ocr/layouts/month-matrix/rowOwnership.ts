/**
 * Hard row separation for month-matrix OCR.
 *
 * Ownership = nearest name baseline (skew-aware). Overlay bands = content bbox of
 * that row's name + owned cells, then hard-cut so bands NEVER overlap neighbors.
 */
import { expectedYAtX } from './skew';
import { yCenter, xCenter } from './geometry';
import type { OcrLine } from '../../recognize';
import type { MatrixRow } from './types';

export type RowYAnchor = {
  yCenter: number;
  yLo?: number;
  yHi?: number;
};

/**
 * Midpoint between neighboring name anchors — only used as a hard cut when
 * content bands would otherwise overlap. Not used as the primary band.
 */
export function rowMidBand(
  rows: RowYAnchor[],
  index: number,
  pageTop = -Infinity,
  pageBot = Infinity
): { yLo: number; yHi: number } {
  const y = rows[index]?.yCenter;
  if (y == null || !Number.isFinite(y)) return { yLo: pageTop, yHi: pageBot };
  const prev = rows[index - 1]?.yCenter;
  const next = rows[index + 1]?.yCenter;
  const yLo = prev != null && Number.isFinite(prev) ? (prev + y) / 2 : pageTop;
  const yHi = next != null && Number.isFinite(next) ? (y + next) / 2 : pageBot;
  return { yLo, yHi };
}

/**
 * Enforce adjacent bands are disjoint: if they overlap, cut at the midpoint
 * between name centers. Guarantees no shared interior (never overlap).
 */
export function enforceDisjointBands(rows: MatrixRow[]): MatrixRow[] {
  const out = rows.map((r) => ({ ...r }));
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]!;
    const b = out[i + 1]!;
    if (a.yLo == null || a.yHi == null || b.yLo == null || b.yHi == null) continue;
    if (a.yHi <= b.yLo) continue;
    const split = (a.yCenter + b.yCenter) / 2;
    a.yHi = Math.min(a.yHi, split);
    b.yLo = Math.max(b.yLo, split);
    if (a.yHi > b.yLo) {
      a.yHi = split;
      b.yLo = split;
    }
  }
  for (const r of out) {
    if (r.yLo != null && r.yHi != null && r.yHi < r.yLo + 4) {
      r.yHi = r.yLo + 4;
    }
  }
  return out;
}

export type GlyphExtent = { yTop: number; yBot: number };

/**
 * Build yLo/yHi from name glyphs + owned duty glyphs, then hard-disjoint neighbors.
 * Fallback when printed ruled frames are unavailable.
 */
export function bandsFromOwnedGlyphs(
  rows: MatrixRow[],
  extents: Array<GlyphExtent | null | undefined>,
  pageTop: number,
  pageBot: number
): MatrixRow[] {
  const withBands = rows.map((r, i) => {
    const e = extents[i];
    const nameTop = r.yNameTop ?? r.yCenter - 8;
    const nameBot = r.yNameBot ?? r.yCenter + 8;
    let yLo = Math.min(nameTop, e?.yTop ?? nameTop);
    let yHi = Math.max(nameBot, e?.yBot ?? nameBot);
    // Tiny pad so the strip is visible; not a neighbor-sized pad.
    yLo = Math.max(pageTop, yLo - 3);
    yHi = Math.min(pageBot, yHi + 3);
    return { ...r, yLo, yHi, bandSource: 'soft' as const };
  });
  return enforceDisjointBands(withBands);
}

/** Largest ruled Y strictly below `y` (above on the page). */
function ruleAbove(ruledYs: number[], y: number): number | null {
  let best: number | null = null;
  for (const ry of ruledYs) {
    if (ry < y - 0.5 && (best == null || ry > best)) best = ry;
  }
  return best;
}

/** Smallest ruled Y strictly above `y` (below on the page). */
function ruleBelow(ruledYs: number[], y: number): number | null {
  let best: number | null = null;
  for (const ry of ruledYs) {
    if (ry > y + 0.5 && (best == null || ry < best)) best = ry;
  }
  return best;
}

/**
 * Keep horizontal rules that separate people: above first name, in each
 * name-to-name gap (outer border near the lower name), and below last name.
 *
 * Inner duty sub-row H-peaks (near either name center) are ignored — only the
 * thick person-cell border in the lower part of the gap counts.
 * Gaps without a printed rule get a midpoint (soft).
 */
export function personSeparatorYs(ruledYs: number[], nameYs: number[]): number[] {
  if (nameYs.length < 1) return [];
  const ys = [...ruledYs].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  const names = [...nameYs].sort((a, b) => a - b);
  const out: number[] = [];

  const rawGaps =
    names.length >= 2
      ? names.slice(1).map((y, i) => y - names[i]!).filter((g) => g > 0)
      : [];
  const sortedGaps = rawGaps.slice().sort((a, b) => a - b);
  // Robust pitch: ignore double-row outliers that inflate the median and then
  // exclude the real H-line just above the next name from the search window.
  let medGap = 40;
  if (sortedGaps.length) {
    // Lower median so double-height gaps don't dominate pitch.
    const prelim = sortedGaps[Math.floor((sortedGaps.length - 1) / 2)]!;
    const tight = sortedGaps.filter((g) => g <= prelim * 1.55);
    const use = tight.length >= Math.min(2, sortedGaps.length) ? tight : sortedGaps;
    medGap = use[Math.floor((use.length - 1) / 2)] || prelim;
  }
  // Duty sub-rows sit close to a name; person borders sit farther into the gap.
  const innerPad = Math.max(10, Math.min(medGap * 0.28, 48));

  const top = ys.length ? ruleAbove(ys, names[0]! - innerPad * 0.25) : null;
  // Prefer the rule immediately above the first name (outer top of person cell).
  let topSep = top;
  if (ys.length) {
    const nearTop = ys.filter((y) => y < names[0]! - 2 && y >= names[0]! - medGap * 0.85);
    if (nearTop.length) topSep = nearTop[nearTop.length - 1]!;
  }
  out.push(topSep ?? names[0]! - Math.max(20, (names[1]! - names[0]!) * 0.45 || 40));

  for (let i = 0; i < names.length - 1; i++) {
    const a = names[i]!;
    const b = names[i + 1]!;
    const gap = b - a;
    // Outer person border: prefer the lower part of the gap, but keep the
    // window open enough that a rule just above `b` is never clipped out.
    const searchLo = a + Math.max(innerPad, gap * 0.35);
    const searchHi = b - Math.max(2, Math.min(innerPad * 0.35, gap * 0.08));
    let best: number | null = null;
    let bestD = Infinity;
    const target = b - Math.max(4, Math.min(12, gap * 0.08)); // just above next person
    for (const y of ys) {
      if (y <= searchLo || y >= searchHi) continue;
      // Skip duty peaks glued into the upper name; allow rules close above `b`
      // (printed top of next person cell often sits ~0.1–0.25× pitch above the name).
      if (Math.abs(y - a) < innerPad) continue;
      if (y > b - Math.max(5, medGap * 0.08)) continue;
      const d = Math.abs(y - target);
      if (d < bestD) {
        bestD = d;
        best = y;
      }
    }
    if (best != null) out.push(best);
    else out.push((a + b) / 2);
  }

  const bot = ys.length ? ruleBelow(ys, names[names.length - 1]! + innerPad * 0.25) : null;
  let botSep = bot;
  if (ys.length) {
    const last = names[names.length - 1]!;
    const nearBot = ys.filter((y) => y > last + 2 && y <= last + medGap * 0.85);
    if (nearBot.length) botSep = nearBot[0]!;
  }
  const lastGap =
    names.length >= 2 ? names[names.length - 1]! - names[names.length - 2]! : 40;
  out.push(botSep ?? names[names.length - 1]! + Math.max(20, lastGap * 0.45));

  return [...new Set(out.map((y) => Math.round(y * 10) / 10))].sort((a, b) => a - b);
}

/**
 * Person bands from printed horizontal cell frames.
 *
 * Each person snaps to the ruled separator immediately above and below their
 * yCenter — the printed cell rectangle (covers 1–3 duty sub-rows). Returns null
 * if frames cannot be resolved without two people sharing the same interval,
 * or when H-line density is too weak to trust (caller uses soft glyph bands).
 */
export function assignPersonBandsFromRuledFrames(
  rows: MatrixRow[],
  _extents: Array<GlyphExtent | null | undefined>,
  ruledYs: number[],
  pageTop: number,
  pageBot: number,
  headerBandBot?: number
): MatrixRow[] | null {
  if (rows.length < 1 || ruledYs.length < 2) return null;

  // Collapse multi-name stubs that share the same yCenter into one frame.
  type Group = { indices: number[]; yCenter: number; yNameTop?: number; yNameBot?: number };
  const groups: Group[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.yCenter - r.yCenter) < 1.5) {
      last.indices.push(i);
      if (r.yNameTop != null) {
        last.yNameTop =
          last.yNameTop == null ? r.yNameTop : Math.min(last.yNameTop, r.yNameTop);
      }
      if (r.yNameBot != null) {
        last.yNameBot =
          last.yNameBot == null ? r.yNameBot : Math.max(last.yNameBot, r.yNameBot);
      }
    } else {
      groups.push({
        indices: [i],
        yCenter: r.yCenter,
        yNameTop: r.yNameTop,
        yNameBot: r.yNameBot,
      });
    }
  }

  const separators = personSeparatorYs(
    ruledYs,
    groups.map((g) => g.yCenter)
  );
  // Always prefer gap separators (real rule or soft midpoint) — never raw peaks.
  const ys = separators.length >= 2 ? separators : [...ruledYs].sort((a, b) => a - b);
  if (ys.length < 2) return null;

  const nameGaps = groups
    .slice(1)
    .map((g, i) => g.yCenter - groups[i]!.yCenter)
    .filter((g) => g > 0);
  const medGap =
    nameGaps.length > 0
      ? nameGaps.slice().sort((a, b) => a - b)[Math.floor(nameGaps.length / 2)]!
      : 48;
  // One printed person cell ≈ name pitch; beyond ~1.7× we swallowed a neighbor
  // or snapped to page-edge H-lines.
  const maxBandH = Math.max(40, medGap * 1.7);

  const frames: { yLo: number; yHi: number; source: 'ruled' | 'soft' }[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    let yLo = ruleAbove(ys, g.yCenter);
    let yHi = ruleBelow(ys, g.yCenter);
    if (yLo == null) {
      yLo =
        headerBandBot != null && headerBandBot < g.yCenter
          ? headerBandBot
          : pageTop;
    }
    if (yHi == null) yHi = pageBot;
    if (!(yHi > yLo + 4)) return null;

    let source: 'ruled' | 'soft' = 'ruled';
    const h = yHi - yLo;
    if (h > maxBandH) {
      // Ruled interval swallowed a neighbor / page edge — fall back to
      // neighbor midpoints (person pitch), not name-glyph hug.
      const prev = groups[gi - 1];
      const next = groups[gi + 1];
      yLo = Math.max(
        pageTop,
        prev ? (prev.yCenter + g.yCenter) / 2 : g.yCenter - medGap * 0.5
      );
      yHi = Math.min(
        pageBot,
        next ? (g.yCenter + next.yCenter) / 2 : g.yCenter + medGap * 0.5
      );
      if (!(yHi > yLo + 4)) return null;
      source = 'soft';
    }
    frames.push({ yLo, yHi, source });
  }

  // If two people landed in the same printed interval (missing H-line), split
  // at the midpoint between their names — keep other frames on real rules.
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]!;
    const b = frames[i + 1]!;
    if (Math.abs(a.yLo - b.yLo) < 1 && Math.abs(a.yHi - b.yHi) < 1) {
      const split = (groups[i]!.yCenter + groups[i + 1]!.yCenter) / 2;
      a.yHi = split;
      b.yLo = split;
      a.source = 'soft';
      b.source = 'soft';
    }
  }

  const out = rows.map((r) => ({ ...r }));
  for (let gi = 0; gi < groups.length; gi++) {
    const { yLo, yHi, source } = frames[gi]!;
    for (const ri of groups[gi]!.indices) {
      out[ri]!.yLo = yLo;
      out[ri]!.yHi = yHi;
      out[ri]!.bandSource = source;
    }
  }
  return enforceDisjointBands(out);
}

/** @deprecated Prefer bandsFromOwnedGlyphs — midpoint bands steal neighbor blocks. */
export function assignRowBands(
  rows: MatrixRow[],
  pageTop: number,
  pageBot: number
): MatrixRow[] {
  // Seed from name glyphs only, then disjoint — not center midpoints.
  const extents = rows.map((r) =>
    r.yNameTop != null && r.yNameBot != null
      ? { yTop: r.yNameTop, yBot: r.yNameBot }
      : { yTop: r.yCenter - 10, yBot: r.yCenter + 10 }
  );
  return bandsFromOwnedGlyphs(rows, extents, pageTop, pageBot);
}

/**
 * Index of the person row whose skewed baseline is closest to (x,y).
 * Ties break upward (smaller index).
 */
export function nearestRowIndexAt(
  y: number,
  x: number,
  rows: RowYAnchor[],
  slope: number,
  xAnchor: number
): number {
  if (!rows.length) return -1;
  let best = 0;
  let bestDy = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const yExp = expectedYAtX(rows[i]!.yCenter, xAnchor, x, slope);
    const dy = Math.abs(y - yExp);
    if (dy < bestDy - 0.5) {
      bestDy = dy;
      best = i;
    }
  }
  return best;
}

/** Skewed row band at column x (yLo/yHi defined at name-column xAnchor). */
export function rowBandAtX(
  row: RowYAnchor,
  x: number,
  slope: number,
  xAnchor: number
): { yLo: number; yHi: number } | null {
  if (row.yLo == null || row.yHi == null || !(row.yHi > row.yLo)) return null;
  return {
    yLo: expectedYAtX(row.yLo, xAnchor, x, slope),
    yHi: expectedYAtX(row.yHi, xAnchor, x, slope),
  };
}

/**
 * Glyph ownership for scooping: nearest name only.
 * Bands are applied after content extents are known (overlay / refine display).
 */
export function lineBelongsToRow(
  line: OcrLine,
  rowIndex: number,
  rows: RowYAnchor[],
  slope: number,
  xAnchor: number
): boolean {
  if (rowIndex < 0 || rowIndex >= rows.length) return false;
  return nearestRowIndexAt(yCenter(line), xCenter(line), rows, slope, xAnchor) === rowIndex;
}

/** True when bands are pairwise non-overlapping (yHi[i] <= yLo[i+1]). */
export function bandsAreDisjoint(rows: RowYAnchor[]): boolean {
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (a.yHi == null || b.yLo == null) return false;
    if (a.yHi > b.yLo + 1e-6) return false;
  }
  return true;
}
