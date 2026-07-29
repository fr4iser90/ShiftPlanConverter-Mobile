/**
 * One-path perspective rectification for month-matrix OCR.
 * Estimate a table quad → warp OCR+lattice into a near-frontal frame →
 * build grid there → map frames back to page space.
 *
 * Hard gate: if quality checks fail, return null (caller keeps page coords).
 * No retry / second attempt.
 */
import type { OcrLine } from './recognize';
import {
  applyHomography,
  applyHomographyToBox,
  computeHomography,
  homographyResidualRms,
  invertHomography,
  quadQuality,
  roundTripResidualRms,
  type Homography,
  type Pt,
} from './homography';
import { detectRosterNames } from './names';
import { inferNameMaxX } from './monthMatrix/dayHeaders';
import { cleanCell, looksLikeDayHeader, looksLikeDayNumber, looksLikeShiftCell, median, xCenter, yCenter } from './monthMatrix/geometry';
import { estimateRowSlopeFromHeaders, fitSlope } from './monthMatrix/skew';
import type { MonthMatrixGrid } from './monthMatrix/types';

export type PerspectiveRectifier = {
  forward: Homography;
  inverse: Homography;
  left: number;
  right: number;
  top: number;
  bottom: number;
  rowSlope: number;
  nameMaxX: number;
  /** Diagnostics for logs / tests (no PII). */
  quality: {
    ok: true;
    pitchCvBefore: number;
    pitchCvAfter: number;
    headerSlopeBefore: number;
    headerSlopeAfter: number;
    cornerResidual: number;
    roundTripResidual: number;
    source: 'lattice' | 'ocr-slope';
  };
};

export type RuledLatticeLike = { hYs: number[]; vXs: number[] };

type Line2 = { a: number; b: number; c: number }; // ax + by + c = 0

function lineFromPoints(p0: Pt, p1: Pt): Line2 | null {
  const a = p0.y - p1.y;
  const b = p1.x - p0.x;
  const c = -(a * p0.x + b * p0.y);
  if (Math.abs(a) + Math.abs(b) < 1e-12) return null;
  return { a, b, c };
}

function intersect(l0: Line2, l1: Line2): Pt | null {
  // a x + b y + c = 0
  const det = l0.a * l1.b - l1.a * l0.b;
  if (Math.abs(det) < 1e-12) return null;
  return {
    x: (l0.b * l1.c - l1.b * l0.c) / det,
    y: (l1.a * l0.c - l0.a * l1.c) / det,
  };
}

/** Coefficient of variation of consecutive positive gaps. */
export function pitchCv(values: number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length < 3) return 0;
  const gaps = sorted.slice(1).map((v, i) => v - sorted[i]!).filter((g) => g > 0);
  if (gaps.length < 2) return 0;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (!(mean > 0)) return 0;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(Math.max(0, variance)) / mean;
}

function headerPoints(lines: OcrLine[], pageWidth: number, nameMaxX: number): Pt[] {
  const left = Math.max(0, nameMaxX * 0.55);
  return lines
    .filter((l) => {
      const t = String(l.text || '').replace(/\s+/g, '').trim();
      if (!(looksLikeDayHeader(t) || looksLikeDayNumber(t) || /^(Mo|Di|Mi|Do|Fr|Sa|So)/i.test(t))) {
        return false;
      }
      return xCenter(l) >= left;
    })
    .map((l) => ({ x: xCenter(l), y: yCenter(l) }));
}

function fitEdgeFromXsYs(xs: number[], ys: number[]): { yAt: (x: number) => number; slope: number } | null {
  if (xs.length < 3) return null;
  const slope = fitSlope(xs, ys);
  const x0 = median(xs);
  const y0 = median(ys);
  if (!(Number.isFinite(x0) && Number.isFinite(y0))) return null;
  return {
    slope,
    yAt: (x: number) => y0 + slope * (x - x0),
  };
}

/**
 * Prefer lattice outer H/V for corners; else OCR header slope + name divider.
 * Returns ordered TL, TR, BL, BR in page pixels.
 */
export function estimateTableQuad(
  lines: OcrLine[],
  pageWidth: number,
  pageHeight: number,
  lattice?: RuledLatticeLike | null
): {
  corners: [Pt, Pt, Pt, Pt];
  nameMaxX: number;
  rowSlope: number;
  source: 'lattice' | 'ocr-slope';
} | null {
  if (!(pageWidth > 0) || !(pageHeight > 0)) return null;
  const nameMaxX = inferNameMaxX(lines, pageWidth);
  const rowSlope = estimateRowSlopeFromHeaders(lines, pageWidth, nameMaxX);

  // Prefer full "Last, First" candidates; else left-column surname/given tokens.
  const roster = detectRosterNames(lines, pageWidth);
  let nameYs = roster.map((n) => n.yCenter).sort((a, b) => a - b);
  if (nameYs.length < 2) {
    const leftTok = lines.filter((l) => {
      if (l.boundingBox.x > nameMaxX + 24) return false;
      const t = cleanCell(l.text);
      if (!t || t.length < 3) return false;
      if (looksLikeDayHeader(t) || looksLikeShiftCell(t) || looksLikeDayNumber(t)) return false;
      if (/\d/.test(t)) return false;
      return /[A-Za-zÄÖÜäöüß]/.test(t);
    });
    nameYs = leftTok.map((l) => yCenter(l)).sort((a, b) => a - b);
  }
  if (nameYs.length < 2) return null;

  const hdr = headerPoints(lines, pageWidth, nameMaxX).filter(
    (p) => p.y < pageHeight * 0.4 && p.x > nameMaxX * 0.5
  );
  if (hdr.length < 3) return null;

  const topEdge = fitEdgeFromXsYs(
    hdr.map((p) => p.x),
    hdr.map((p) => p.y)
  );
  if (!topEdge) return null;

  const gaps = nameYs.slice(1).map((y, i) => y - nameYs[i]!);
  const medGap =
    gaps.length > 0 ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 36 : 36;
  const bottomY =
    Math.min(pageHeight * 0.98, nameYs[nameYs.length - 1]! + Math.max(medGap * 0.7, 24));

  // Bottom edge: prefer last H-rule under last person; else parallel to top (same slope).
  let bottomEdge: { yAt: (x: number) => number; slope: number } | null = null;
  const hYs = (lattice?.hYs || []).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (hYs.length >= 2) {
    let botRule: number | null = null;
    for (const y of hYs) {
      if (y >= nameYs[nameYs.length - 1]! - 4 && y <= bottomY + medGap) {
        if (botRule == null || y > botRule) botRule = y;
      }
    }
    if (botRule == null) {
      for (const y of hYs) {
        if (y < bottomY && (botRule == null || y > botRule)) botRule = y;
      }
    }
    if (botRule != null) {
      const slopeBot = topEdge.slope * 0.85;
      bottomEdge = {
        slope: slopeBot,
        yAt: (x: number) => botRule! + slopeBot * (x - nameMaxX),
      };
    }
  }
  if (!bottomEdge) {
    bottomEdge = {
      slope: topEdge.slope,
      yAt: (x: number) => bottomY + topEdge.slope * (x - nameMaxX),
    };
  }

  // Left edge: name divider — may taper with slope (x decreases down when slope>0).
  const leftTop = Math.max(12, Math.min(pageWidth * 0.45, nameMaxX));
  const leftBot = Math.max(12, leftTop - topEdge.slope * (bottomY - topEdge.yAt(leftTop)) * 0.15);
  // Prefer leftmost strong V near name divider when lattice is present.
  const vXs = (lattice?.vXs || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  let leftXTop = leftTop;
  let leftXBot = leftBot;
  let rightXTop = pageWidth * 0.98;
  let rightXBot = pageWidth * 0.98;
  if (vXs.length >= 3) {
    const nearDivider = vXs.filter((x) => x >= nameMaxX * 0.7 && x <= nameMaxX * 1.25);
    const leftV = nearDivider.length ? nearDivider[0]! : vXs.find((x) => x >= nameMaxX * 0.75);
    if (leftV != null) {
      leftXTop = leftV;
      leftXBot = leftV;
    }
    const body = vXs.filter((x) => x >= (leftV ?? nameMaxX));
    if (body.length) {
      rightXTop = body[body.length - 1]!;
      rightXBot = rightXTop;
    }
  } else {
    const rightHdr = Math.max(...hdr.map((p) => p.x));
    rightXTop = Math.max(leftXTop + 80, Math.min(pageWidth * 0.99, rightHdr + pageWidth * 0.03));
    rightXBot = rightXTop;
  }

  const topYLeft = topEdge.yAt(leftXTop);
  const topYRight = topEdge.yAt(rightXTop);
  const botYLeft = bottomEdge.yAt(leftXBot);
  const botYRight = bottomEdge.yAt(rightXBot);

  // True corner intersections of the four edge lines (handles non-axis edges).
  const topL = lineFromPoints({ x: leftXTop, y: topYLeft }, { x: rightXTop, y: topYRight });
  const botL = lineFromPoints({ x: leftXBot, y: botYLeft }, { x: rightXBot, y: botYRight });
  const leftL = lineFromPoints({ x: leftXTop, y: topYLeft }, { x: leftXBot, y: botYLeft });
  const rightL = lineFromPoints({ x: rightXTop, y: topYRight }, { x: rightXBot, y: botYRight });
  if (!topL || !botL || !leftL || !rightL) return null;

  const tl = intersect(topL, leftL);
  const tr = intersect(topL, rightL);
  const bl = intersect(botL, leftL);
  const br = intersect(botL, rightL);
  if (!tl || !tr || !bl || !br) return null;

  const q = quadQuality(tl, tr, bl, br);
  if (!q.ok) return null;

  const source: 'lattice' | 'ocr-slope' = vXs.length >= 3 && hYs.length >= 2 ? 'lattice' : 'ocr-slope';
  return {
    corners: [tl, tr, bl, br],
    nameMaxX,
    rowSlope: topEdge.slope || rowSlope,
    source,
  };
}

function axisAlignedDst(src: [Pt, Pt, Pt, Pt]): [Pt, Pt, Pt, Pt] {
  const [tl, tr, bl, br] = src;
  const left = (tl.x + bl.x) / 2;
  const right = (tr.x + br.x) / 2;
  const top = (tl.y + tr.y) / 2;
  const bottom = (bl.y + br.y) / 2;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
  ];
}

function transformVerticalXs(vXs: number[], top: number, bottom: number, H: Homography): number[] {
  return vXs
    .map((x) => {
      const p0 = applyHomography({ x, y: top }, H);
      const p1 = applyHomography({ x, y: bottom }, H);
      return Number.isFinite(p0.x) && Number.isFinite(p1.x) ? (p0.x + p1.x) / 2 : NaN;
    })
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
}

function transformHorizontalYs(hYs: number[], left: number, right: number, H: Homography): number[] {
  return hYs
    .map((y) => {
      const p0 = applyHomography({ x: left, y }, H);
      const p1 = applyHomography({ x: right, y }, H);
      return Number.isFinite(p0.y) && Number.isFinite(p1.y) ? (p0.y + p1.y) / 2 : NaN;
    })
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
}

function projectXThroughBand(x: number, y0: number, y1: number, H: Homography): number {
  const p0 = applyHomography({ x, y: y0 }, H);
  const p1 = applyHomography({ x, y: y1 }, H);
  if (Number.isFinite(p0.x) && Number.isFinite(p1.x)) return (p0.x + p1.x) / 2;
  if (Number.isFinite(p0.x)) return p0.x;
  if (Number.isFinite(p1.x)) return p1.x;
  return x;
}

function projectYAcrossSpan(y: number, x0: number, x1: number, H: Homography): number {
  const p0 = applyHomography({ x: x0, y }, H);
  const p1 = applyHomography({ x: x1, y }, H);
  if (Number.isFinite(p0.y) && Number.isFinite(p1.y)) return (p0.y + p1.y) / 2;
  if (Number.isFinite(p0.y)) return p0.y;
  if (Number.isFinite(p1.y)) return p1.y;
  return y;
}

/**
 * Build a rectifier only when perspective/skew is material AND quality gates pass.
 * Otherwise return null — caller must keep the single unrectified path.
 */
export function buildPerspectiveRectifier(
  lines: OcrLine[],
  pageWidth: number,
  pageHeight: number,
  lattice?: RuledLatticeLike | null
): PerspectiveRectifier | null {
  const est = estimateTableQuad(lines, pageWidth, pageHeight, lattice);
  if (!est) return null;

  const { corners: src, nameMaxX, rowSlope, source } = est;
  const absSlope = Math.abs(rowSlope);
  const vBefore = (lattice?.vXs || []).filter((x) => x >= nameMaxX * 0.85);
  const cvBefore = pitchCv(vBefore.length >= 3 ? vBefore : headerPoints(lines, pageWidth, nameMaxX).map((p) => p.x));

  // Need either clear skew or clear perspective taper.
  if (absSlope < 0.02 && cvBefore < 0.12) return null;

  const q = quadQuality(src[0], src[1], src[2], src[3]);
  // estimateTableQuad already checks, but keep gate explicit.
  if (!q.ok) return null;

  const dst = axisAlignedDst(src);
  let forward: Homography;
  let inverse: Homography;
  try {
    forward = computeHomography(src, dst);
    inverse = invertHomography(forward);
  } catch {
    return null;
  }

  const cornerResidual = homographyResidualRms(src, dst, forward);
  const samplePts: Pt[] = [
    ...src,
    ...headerPoints(lines, pageWidth, nameMaxX).slice(0, 12),
  ];
  // Include a few left-column anchors for round-trip stability.
  for (const l of lines) {
    if (samplePts.length >= 28) break;
    if (l.boundingBox.x > nameMaxX + 24) continue;
    const t = cleanCell(l.text);
    if (t.length >= 3 && /[A-Za-zÄÖÜäöüß]/.test(t) && !/\d/.test(t)) {
      samplePts.push({ x: xCenter(l), y: yCenter(l) });
    }
  }
  const rt = roundTripResidualRms(samplePts, forward, inverse);
  const pageDiag = Math.hypot(pageWidth, pageHeight);
  const maxCorner = Math.max(2.5, pageDiag * 0.004);
  const maxRt = Math.max(3.5, pageDiag * 0.006);
  if (!(cornerResidual <= maxCorner) || !(rt <= maxRt)) return null;

  // Post-warp: header slope and pitch CV must improve or already be healthy.
  const warpedHeaders = headerPoints(lines, pageWidth, nameMaxX).map((p) => applyHomography(p, forward));
  const goodHdr = warpedHeaders.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const slopeAfter =
    goodHdr.length >= 4
      ? fitSlope(
          goodHdr.map((p) => p.x),
          goodHdr.map((p) => p.y)
        )
      : 0;
  const vAfter =
    vBefore.length >= 3
      ? transformVerticalXs(vBefore, dst[0]!.y, dst[2]!.y, forward)
      : goodHdr.map((p) => p.x);
  const cvAfter = pitchCv(vAfter);

  const slopeImproved = Math.abs(slopeAfter) <= Math.max(0.015, absSlope * 0.45);
  const cvImproved = cvAfter <= cvBefore * 0.92 + 0.02 || cvAfter <= 0.14;
  if (absSlope >= 0.02 && !slopeImproved) return null;
  if (cvBefore >= 0.12 && !cvImproved) return null;

  return {
    forward,
    inverse,
    left: dst[0]!.x,
    right: dst[1]!.x,
    top: dst[0]!.y,
    bottom: dst[2]!.y,
    rowSlope,
    nameMaxX,
    quality: {
      ok: true,
      pitchCvBefore: cvBefore,
      pitchCvAfter: cvAfter,
      headerSlopeBefore: rowSlope,
      headerSlopeAfter: slopeAfter,
      cornerResidual,
      roundTripResidual: rt,
      source,
    },
  };
}

export function transformLinesByHomography(lines: OcrLine[], H: Homography): OcrLine[] {
  return lines.map((line) => ({
    ...line,
    boundingBox: applyHomographyToBox(line.boundingBox, H),
  }));
}

export function transformLatticeByHomography(
  lattice: RuledLatticeLike,
  rectifier: PerspectiveRectifier
): RuledLatticeLike {
  return {
    hYs: transformHorizontalYs(
      lattice.hYs || [],
      rectifier.left,
      rectifier.right,
      rectifier.forward
    ),
    vXs: transformVerticalXs(
      lattice.vXs || [],
      rectifier.top,
      rectifier.bottom,
      rectifier.forward
    ),
  };
}

export function projectGridFromRectified(
  grid: MonthMatrixGrid,
  rectifier: PerspectiveRectifier
): MonthMatrixGrid {
  const H = rectifier.inverse;
  const nameSpanRight = grid.nameMaxX ?? rectifier.nameMaxX;
  const headerTop = grid.headerFrame?.y0 ?? grid.headerBandTop ?? rectifier.top;
  const headerBot =
    grid.headerFrame?.y1 ?? grid.headerBandBot ?? Math.max(headerTop + 12, rectifier.top + 12);

  return {
    ...grid,
    nameMaxX: projectXThroughBand(
      grid.nameMaxX ?? rectifier.nameMaxX,
      rectifier.top,
      rectifier.bottom,
      H
    ),
    colCenters: grid.colCenters?.map((cx) =>
      projectXThroughBand(cx, rectifier.top, rectifier.bottom, H)
    ),
    headerBandTop: projectYAcrossSpan(headerTop, rectifier.left, rectifier.right, H),
    headerBandBot: projectYAcrossSpan(headerBot, rectifier.left, rectifier.right, H),
    headerBandY: projectYAcrossSpan(
      grid.headerBandY ?? (headerTop + headerBot) / 2,
      rectifier.left,
      rectifier.right,
      H
    ),
    headerFrame: grid.headerFrame
      ? {
          y0: projectYAcrossSpan(grid.headerFrame.y0, rectifier.left, rectifier.right, H),
          y1: projectYAcrossSpan(grid.headerFrame.y1, rectifier.left, rectifier.right, H),
        }
      : grid.headerFrame,
    dayFrames: grid.dayFrames?.map((f) => ({
      ...f,
      x0: projectXThroughBand(f.x0, headerTop, headerBot, H),
      x1: projectXThroughBand(f.x1, headerTop, headerBot, H),
    })),
    personFrames: grid.personFrames?.map((f) => ({
      ...f,
      y0: projectYAcrossSpan(f.y0, 0, nameSpanRight, H),
      y1: projectYAcrossSpan(f.y1, 0, nameSpanRight, H),
    })),
    rowSlope: rectifier.rowSlope,
    rows: grid.rows.map((r) => ({
      ...r,
      yCenter: projectYAcrossSpan(r.yCenter, 0, nameSpanRight, H),
      yNameTop:
        r.yNameTop != null ? projectYAcrossSpan(r.yNameTop, 0, nameSpanRight, H) : r.yNameTop,
      yNameBot:
        r.yNameBot != null ? projectYAcrossSpan(r.yNameBot, 0, nameSpanRight, H) : r.yNameBot,
      yLo: r.yLo != null ? projectYAcrossSpan(r.yLo, 0, nameSpanRight, H) : r.yLo,
      yHi: r.yHi != null ? projectYAcrossSpan(r.yHi, 0, nameSpanRight, H) : r.yHi,
    })),
  };
}
