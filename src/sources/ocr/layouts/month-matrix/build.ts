/**
 * Reconstruct a month-matrix duty roster from OCR line boxes.
 * Output mimics the wall plan: name | day1 | day2 | … (never a flat word list).
 */
import { focusLinesOnMonthTable } from '../../focusTable';
import type { OcrLine } from '../../recognize';
import {
  collectDayColumns,
  daysInMonth,
  detectMonthYearFromOcr,
  expandGluedDayHeaderTokens,
  inferNameMaxX,
  mergeSplitDayHeaderTokens,
  parseHeaderDay,
} from './dayHeaders';
import { formatShiftCell } from './format';
import {
  cleanCell,
  clusterSorted,
  looksLikeDayHeader,
  looksLikeShiftCell,
  median,
  owningColIndex,
  xCenter,
  yCenter,
} from './geometry';
import {
  expandNameLabels,
  mergeNameOnlyRowFragments,
  pairLoneNameFragments,
  splitTrailingLastNameGroups,
} from './nameRows';
import { estimateRowSlopeFromHeaders, refineRowSlopeNearAnchor } from './skew';
import type { MatrixRow, MonthMatrixGrid } from './types';
import {
  assignPersonBandsFromRuledFrames,
  bandsFromOwnedGlyphs,
  lineBelongsToRow,
  type GlyphExtent,
} from './rowOwnership';
import {
  colBoundsFromCenters,
  dayFramesFromBounds,
  dayFramesFromCenters,
  glyphInLatticeCell,
  headerBandFromLattice,
  headerFrameFromBand,
  owningColIndexFromBounds,
  personFramesFromRows,
  scoreLatticeColumns,
  snapDayCentersToLattice,
  clipLatticeToContent,
  type LatticeColBound,
  type RuledLattice,
} from './lattice';

export type BuildMonthMatrixOpts = {
  /**
   * Printed table lattice in OCR/page coordinates (H + V).
   * Structure first: person bands from H, day cells from V, then OCR into cells.
   */
  lattice?: RuledLattice;
  /** @deprecated Prefer lattice.hYs */
  ruledHorizontalYs?: number[];
};

/**
 * Translate lattice day intervals so calendar-day centers match OCR header X.
 * One global shift from median(ocrX − latticeCx) — keeps pitch, fixes left bias
 * from synthetic name→first-V fill.
 */
function alignDayBoundsToOcrHeaders(
  bounds: LatticeColBound[],
  ocrDays: { x: number; day: number | null }[]
): LatticeColBound[] {
  if (bounds.length < 3) return bounds;
  const medGap =
    median(bounds.slice(1).map((b, i) => b.cx - bounds[i]!.cx).filter((g) => g > 0)) || 40;
  const xLo = bounds[0]!.x0 - medGap * 1.5;
  const xHi = bounds[bounds.length - 1]!.x1 + medGap * 1.5;
  const deltas: number[] = [];
  for (const col of ocrDays) {
    if (col.day == null || col.day < 1 || col.day > bounds.length) continue;
    if (!Number.isFinite(col.x)) continue;
    // Drop calendar-fill / focus ghosts that sit far outside the printed strip.
    if (col.x < xLo || col.x > xHi) continue;
    deltas.push(col.x - bounds[col.day - 1]!.cx);
  }
  if (deltas.length < 2) return bounds;
  const shift = median(deltas);
  if (!Number.isFinite(shift) || Math.abs(shift) < 3) return bounds;
  // Reject absurd pairing (wrong day labels glued to far columns).
  if (Math.abs(shift) > medGap * 2.5) return bounds;
  return bounds.map((b) => ({
    x0: b.x0 + shift,
    x1: b.x1 + shift,
    cx: b.cx + shift,
  }));
}

/**
 * Build name×day grid from OCR geometry.
 * Row anchors come from the left name column first (avoids shift-cell Y bridging).
 * Mild photo skew: cells use yExpected = yName + slope·(x − xAnchor).
 *
 * @param pageHeight Optional image height (OCR page). Prefer this over last-glyph Y
 *   so focusTable does not under-estimate the page and over-clip name rows.
 */
export function buildMonthMatrixGrid(
  lines: OcrLine[],
  pageWidth: number,
  pageHeight?: number,
  opts?: BuildMonthMatrixOpts
): MonthMatrixGrid {
  const empty: MonthMatrixGrid = { headers: [], rows: [], ok: false };
  if (!lines.length) return empty;

  const contentBottom = Math.max(
    ...lines.map((l) => l.boundingBox.y + l.boundingBox.height),
    1
  );
  // Prefer real image height when known. Content-bottom alone underestimates pageH
  // and makes focusTable over-clip bottom glyphs.
  const pageH = Math.max(
    contentBottom,
    pageHeight && pageHeight > 0 ? pageHeight : 0,
    Math.round(pageWidth * 0.72)
  );
  const focused = focusLinesOnMonthTable(lines, pageWidth, pageH);
  const workLines = focused.lines;
  const wHint = focused.pageWidth || pageWidth;

  const expanded = expandGluedDayHeaderTokens(workLines);
  const merged = mergeSplitDayHeaderTokens(expanded);
  const w =
    wHint > 0
      ? wHint
      : Math.max(...merged.map((l) => l.boundingBox.x + l.boundingBox.width), 1);
  const heights = merged.map((l) => l.boundingBox.height).filter((h) => h > 0);
  const medH = Math.max(10, median(heights) || 16);
  const nameMaxX = inferNameMaxX(merged, w);
  const monthYear = detectMonthYearFromOcr(merged);
  const desiredDayCount = monthYear ? daysInMonth(monthYear.year, monthYear.month) : undefined;

  const dayCols = collectDayColumns(merged, w, nameMaxX);
  let colCenters = dayCols.centers;
  let filledHeaders = dayCols.headers;
  let headerBandY = dayCols.bandY;
  let headerBandTop = dayCols.bandTop;
  let headerBandBot = dayCols.bandBot;
  if (colCenters.length < 3) {
    return empty;
  }

  // Ink box from OCR glyphs — photo margins / metal frames sit outside this.
  let inkLeft = Infinity;
  let inkRight = 0;
  let inkTop = Infinity;
  let inkBot = 0;
  for (const l of merged) {
    const b = l.boundingBox;
    inkLeft = Math.min(inkLeft, b.x);
    inkRight = Math.max(inkRight, b.x + b.width);
    inkTop = Math.min(inkTop, b.y);
    inkBot = Math.max(inkBot, b.y + b.height);
  }
  if (!Number.isFinite(inkLeft)) inkLeft = 0;
  if (!Number.isFinite(inkTop)) inkTop = 0;

  // Lattice V-snap is opt-in only when it preserves nearly all day columns.
  // Blind snap can collapse many day centers onto a few vertical peaks.
  let lattice: RuledLattice | undefined =
    opts?.lattice ??
    (opts?.ruledHorizontalYs?.length
      ? { hYs: opts.ruledHorizontalYs, vXs: [] }
      : undefined);
  if (lattice && (lattice.vXs.length || lattice.hYs.length)) {
    lattice = clipLatticeToContent(
      lattice,
      { x0: inkLeft, y0: inkTop, x1: inkRight, y1: inkBot },
      Math.max(16, w * 0.02),
      Math.max(16, pageH * 0.02)
    );
  }
  let colBounds: LatticeColBound[] = [];
  // Pitch from consecutive OCR day centers only when those centers look like a
  // real date strip. Focus+calendar-fill can invent Mi2@1000+ past pageW and
  // a ~43px ghost pitch that skews early columns.
  const ocrPitchSane =
    colCenters.length >= 3 &&
    colCenters[0]! < w * 0.55 &&
    colCenters[colCenters.length - 1]! <= w * 1.05 &&
    colCenters.every((x) => Number.isFinite(x) && x > 0);
  const guidePitch = ocrPitchSane
    ? median(
        colCenters
          .slice(1)
          .map((x, i) => x - colCenters[i]!)
          .filter((g) => g > 8 && g < w * 0.12)
      ) || undefined
    : undefined;
  let latticeQuality =
    lattice != null
      ? scoreLatticeColumns(
          lattice.vXs,
          nameMaxX,
          w,
          desiredDayCount,
          inkRight,
          guidePitch
        ).quality
      : undefined;
  const ocrCentersBackup = colCenters.slice();
  const ocrHeadersBackup = filledHeaders.slice();
  if (lattice && lattice.vXs.length >= 4 && colCenters.length >= 3) {
    const snapped = snapDayCentersToLattice(
      colCenters,
      filledHeaders,
      lattice.vXs,
      nameMaxX,
      w,
      inkRight,
      guidePitch
    );
    const keepRatio = snapped.matched / colCenters.length;
    latticeQuality = {
      ...(latticeQuality || {
        ok: false,
        hLines: lattice.hYs.length,
        vLines: lattice.vXs.length,
      }),
      hLines: lattice.hYs.length,
      vLines: lattice.vXs.length,
      keepRatio,
    };
    if (
      snapped.matched >= 3 &&
      keepRatio >= 0.85 &&
      snapped.bounds.length >= 3
    ) {
      // keepRatio is the snap quality gate — do not require a prior V-score ok
      // (sparse early V peaks can fail score while OCR×lattice snap is solid).
      colCenters = snapped.centers;
      filledHeaders = snapped.headers;
      colBounds = snapped.bounds;
      latticeQuality = {
        ...(latticeQuality || {
          ok: true,
          hLines: lattice.hYs.length,
          vLines: lattice.vXs.length,
        }),
        ok: true,
        reason: undefined,
        keepRatio,
        hLines: lattice.hYs.length,
        vLines: lattice.vXs.length,
        inferredCols: snapped.bounds.length,
      };
    } else if (keepRatio < 0.85) {
      latticeQuality = {
        ...latticeQuality,
        ok: false,
        reason: `weak-v-keep:${keepRatio.toFixed(2)}`,
      };
    }
  }
  // Lattice day frames when snap missed but V-bounds still resolve ≥3 columns.
  if (!colBounds.length && lattice?.vXs.length) {
    const scored = scoreLatticeColumns(
      lattice.vXs,
      nameMaxX,
      w,
      desiredDayCount,
      inkRight,
      guidePitch
    );
    if (scored.bounds.length >= 3) {
      colBounds = scored.bounds;
      // Prefer printed V centers over calendar-fill OCR ghosts (often past pageW).
      colCenters = scored.bounds.map((b) => b.cx);
      filledHeaders = scored.bounds.map((_, i) => String(i + 1));
      latticeQuality = {
        ...scored.quality,
        hLines: lattice.hYs.length,
        vLines: lattice.vXs.length,
      };
    }
  }

  // Real OCR day anchors (before lattice replaced centers). Used to label /
  // nudge the printed strip — never trust calendar-fill ghosts past the page.
  const realOcrDays = ocrCentersBackup.map((x, i) => ({
    x,
    label: ocrHeadersBackup[i] || '',
    ...parseHeaderDay(ocrHeadersBackup[i] || ''),
  }));
  const ocrPitch =
    (ocrPitchSane
      ? median(
          ocrCentersBackup
            .slice(1)
            .map((x, i) => x - ocrCentersBackup[i]!)
            .filter((g) => g > 8 && g < w * 0.12)
        )
      : undefined) ||
    guidePitch ||
    w / 28;
  const needCols =
    desiredDayCount != null
      ? desiredDayCount
      : Math.min(31, Math.max(ocrCentersBackup.length, colCenters.length, 3));
  // Reject a mid-month-only lattice: must start near the name divider and cover
  // most of the calendar month — otherwise keep OCR centers.
  const latticeCoversDateStrip =
    colBounds.length >= 3 &&
    colBounds.length + 2 >= Math.min(needCols, Math.max(colBounds.length, 10)) &&
    colBounds[0]!.x0 <= nameMaxX + ocrPitch * 2.5;

  const frameBounds =
    latticeCoversDateStrip
      ? desiredDayCount != null
        ? colBounds.slice(0, desiredDayCount)
        : colBounds.slice(0, Math.min(colBounds.length, 31))
      : [];
  if (!latticeCoversDateStrip && colBounds.length) {
    latticeQuality = {
      ...(latticeQuality || {
        ok: false,
        hLines: lattice?.hYs.length || 0,
        vLines: lattice?.vXs.length || 0,
      }),
      ok: false,
      reason: `truncated-date-strip:${colBounds.length}<${needCols}`,
      inferredCols: colBounds.length,
    };
    colBounds = [];
    // Snap may have replaced centers with a partial strip — restore OCR.
    colCenters = ocrCentersBackup;
    filledHeaders = ocrHeadersBackup;
  }
  if (frameBounds.length >= 3) {
    const stripLo = frameBounds[0]!.x0 - ocrPitch * 1.5;
    const stripHi = frameBounds[frameBounds.length - 1]!.x1 + ocrPitch * 1.5;
    const ocrOnStrip = realOcrDays.filter(
      (col) => Number.isFinite(col.x) && col.x >= stripLo && col.x <= stripHi
    );
    const reconciledHeaders = new Array(frameBounds.length).fill('').map((_, i) => String(i + 1));
    for (const col of ocrOnStrip) {
      if (
        desiredDayCount != null &&
        col.day != null &&
        col.day >= 1 &&
        col.day <= frameBounds.length
      ) {
        const target = frameBounds[col.day - 1]!;
        // Only trust the day number when X agrees — calendar-fill ghosts reuse
        // early day labels at late-month X.
        if (Math.abs(col.x - target.cx) <= ocrPitch * 1.75) {
          reconciledHeaders[col.day - 1] = col.wd ? `${col.wd}${col.day}` : String(col.day);
          continue;
        }
      }
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < frameBounds.length; i++) {
        const d = Math.abs(frameBounds[i]!.cx - col.x);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD <= ocrPitch * 1.35 && !/\d/.test(reconciledHeaders[best]!)) {
        reconciledHeaders[best] = col.label || reconciledHeaders[best]!;
      }
    }
    // Shift the whole lattice strip so day centers land on OCR header X
    // (synthetic left-fill often sits a few dozen px left of the printed strip).
    const aligned = alignDayBoundsToOcrHeaders(frameBounds, ocrOnStrip);
    filledHeaders = reconciledHeaders.slice(0, aligned.length);
    colCenters = aligned.map((b) => b.cx);
    colBounds = aligned;
  } else if (desiredDayCount != null && colCenters.length > desiredDayCount) {
    colCenters = colCenters.slice(0, desiredDayCount);
    filledHeaders = filledHeaders.slice(0, desiredDayCount);
  }

  const xs = colCenters;
  const gaps: number[] = [];
  for (let i = 1; i < xs.length; i++) gaps.push(xs[i]! - xs[i - 1]!);
  const colGap = Math.max(12, median(gaps) || w / 28);

  // Tiny overlap only: nudge divider to just left of first day when leading
  // gap-fill placed day 1 a few px inside the name cut. Never pull far left
  // (that can drop surnames into the day grid).
  let nameMaxXFinal = nameMaxX;
  if (
    colCenters[0]! < nameMaxX + colGap * 0.25 &&
    colCenters[0]! > nameMaxX - colGap * 0.6
  ) {
    nameMaxXFinal = Math.min(nameMaxX, Math.max(w * 0.08, colCenters[0]! - colGap * 0.45));
  }

  // Prefer printed V-rule between name ink and first day center as the divider.
  if (lattice?.vXs?.length) {
    const firstCx = colCenters[0]!;
    const candidates = lattice.vXs.filter(
      (x) => x > nameMaxXFinal * 0.7 && x < firstCx - 4
    );
    if (candidates.length) {
      const vDiv = candidates.sort((a, b) => a - b)[candidates.length - 1]!;
      // Only snap when close — don't jump to a far title rule.
      if (Math.abs(vDiv - nameMaxXFinal) <= Math.max(colGap * 1.2, w * 0.04)) {
        nameMaxXFinal = vDiv;
      }
    }
  }
  // Day frames must not start left of the name divider.
  if (colBounds.length) {
    colBounds = colBounds.map((b, i) =>
      i === 0 && b.x0 < nameMaxXFinal
        ? { ...b, x0: nameMaxXFinal, cx: (nameMaxXFinal + b.x1) / 2 }
        : b
    );
    if (colBounds[0]) colCenters[0] = colBounds[0].cx;
  } else if (colCenters[0]! < nameMaxXFinal + 4) {
    // Keep centers; dayFramesFromCenters will half-gap — clamp later in frames.
  }

  const pageSlope = estimateRowSlopeFromHeaders(merged, w, nameMaxXFinal);

  // First names often sit slightly past the printed name/day rule. Keep a soft
  // pad so surname + first name stay in one group.
  const nameTokenRight = nameMaxXFinal + Math.max(28, colGap * 0.65);

  const nameTokens = merged.filter((l) => {
    if (l.boundingBox.x >= nameTokenRight) return false;
    const t = cleanCell(l.text);
    if (!t || t.length < 2) return false;
    if (looksLikeDayHeader(t) || looksLikeShiftCell(t)) return false;
    if (/\d/.test(t)) return false;
    if (!/[A-Za-zÄÖÜäöüß]/.test(t)) return false;
    if (t.length <= 2) return false;
    if (l.boundingBox.height > medH * 2.5 && t.length >= 5) return false;
    return true;
  });
  const nameHeights = nameTokens.map((l) => l.boundingBox.height).filter((h) => h > 0);
  const nameMedH = Math.max(8, median(nameHeights) || Math.min(medH, 16));
  const nameYs = nameTokens
    .map((l) => yCenter(l))
    .slice()
    .sort((a, b) => a - b);
  const nameGaps: number[] = [];
  for (let i = 1; i < nameYs.length; i++) nameGaps.push(nameYs[i]! - nameYs[i - 1]!);
  const medNameGap = median(nameGaps.filter((g) => g > 0 && g < nameMedH * 8));
  const nameRowGap = Math.max(
    nameMedH * 0.85,
    Math.min(medNameGap > 0 ? medNameGap * 0.92 : nameMedH * 1.2, nameMedH * 2.4)
  );
  let nameGroups = clusterSorted(
    nameTokens.map((l) => ({ v: yCenter(l), item: l })),
    nameRowGap
  );
  nameGroups = mergeNameOnlyRowFragments(nameGroups, nameMaxXFinal, nameMedH * 1.35);
  const pairGap = Math.max(nameMedH * 2.25, nameRowGap * 1.2);
  nameGroups = pairLoneNameFragments(nameGroups, pairGap);
  nameGroups = splitTrailingLastNameGroups(nameGroups);
  nameGroups = pairLoneNameFragments(nameGroups, pairGap);

  const rowYPad = Math.max(nameMedH * 2.8, medH * 1.35);
  const stubs: {
    people: string[];
    yMid: number;
    xAnchor: number;
    yNameTop: number;
    yNameBot: number;
    slope: number;
  }[] = [];
  for (const g of nameGroups) {
    const nameParts = g
      .slice()
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x)
      .map((l) => cleanCell(l.text));
    const people = expandNameLabels(nameParts);
    if (!people.length) continue;

    const yMid = g.reduce((s, l) => s + yCenter(l), 0) / g.length;
    const xAnchor = g.reduce((s, l) => s + xCenter(l), 0) / g.length;
    const yNameTop = Math.min(...g.map((l) => l.boundingBox.y));
    const yNameBot = Math.max(...g.map((l) => l.boundingBox.y + l.boundingBox.height));
    const slope = refineRowSlopeNearAnchor(
      merged,
      yMid,
      xAnchor,
      nameMaxXFinal,
      rowYPad,
      pageSlope
    );
    stubs.push({ people, yMid, xAnchor, yNameTop, yNameBot, slope });
  }

  stubs.sort((a, b) => a.yMid - b.yMid);
  const medGap =
    stubs.length >= 2
      ? median(
          stubs.slice(1).map((s, i) => s.yMid - stubs[i]!.yMid).filter((g) => g > 0)
        ) || nameMedH * 3
      : nameMedH * 3;
  const pageTop =
    stubs.length > 0
      ? Math.min(stubs[0]!.yNameTop, stubs[0]!.yMid - medGap * 0.45)
      : 0;
  // Allow multi-block duty cells below the last name glyph.
  const pageBot =
    stubs.length > 0
      ? Math.max(
          stubs[stubs.length - 1]!.yNameBot + medGap * 0.55,
          stubs[stubs.length - 1]!.yMid + medGap * 0.55
        )
      : pageH;

  let rows: MatrixRow[] = [];
  for (const s of stubs) {
    for (const name of s.people) {
      rows.push({
        name,
        yCenter: s.yMid,
        cells: [],
        yNameTop: s.yNameTop,
        yNameBot: s.yNameBot,
      });
    }
  }

  // Map stub index → first row index with that yMid (for scoop ownership).
  const stubRowIndex: number[] = [];
  {
    let ri = 0;
    for (const s of stubs) {
      stubRowIndex.push(ri);
      ri += s.people.length;
    }
  }

  // Use ?? not || — legitimate slope 0 (straight photo) must not fall back
  // to a noisy pageSlope from the multi-row cell heuristic.
  const stubSlopeMed = stubs.length > 0 ? median(stubs.map((s) => s.slope)) : null;
  const rowSlope = stubSlopeMed != null ? stubSlopeMed : pageSlope;
  const xAnchorRef = nameMaxXFinal * 0.55;

  // Lattice-first: person yLo/yHi from printed H-lines before scooping.
  const ruledH =
    lattice?.hYs?.filter((y) => Number.isFinite(y)) ??
    opts?.ruledHorizontalYs?.filter((y) => Number.isFinite(y)) ??
    [];
  if (ruledH.length >= 2) {
    const framed = assignPersonBandsFromRuledFrames(
      rows,
      rows.map((r) => ({
        yTop: r.yNameTop ?? r.yCenter,
        yBot: r.yNameBot ?? r.yCenter,
      })),
      ruledH,
      pageTop,
      pageBot,
      headerBandBot > headerBandTop ? headerBandBot : undefined
    );
    if (framed) rows = framed;
  }

  // Header strip from lattice H + Mo/Di glyphs.
  if (ruledH.length >= 2 && stubs.length > 0) {
    const hb = headerBandFromLattice(
      ruledH,
      stubs[0]!.yMid,
      headerBandTop > 0 ? headerBandTop : undefined,
      headerBandBot > headerBandTop ? headerBandBot : undefined
    );
    if (hb) {
      const glyphMid = headerBandY > 0 ? headerBandY : (headerBandTop + headerBandBot) / 2;
      const haveGlyph = headerBandBot > headerBandTop && headerBandTop > 0;
      const agree =
        !haveGlyph || Math.abs(hb.mid - glyphMid) <= Math.max(28, pageH * 0.03);
      if (haveGlyph) {
        // Keep Mo/Di ink height. Lattice H-spans (title rule → first person) are
        // often 2–4× taller and painted fat yellow day headers.
        const room = stubs[0]!.yMid - 2;
        const botRule = hb.bot;
        if (
          agree &&
          botRule > headerBandBot &&
          botRule <= headerBandBot + Math.max(12, pageH * 0.012) &&
          botRule < room &&
          botRule - headerBandTop > 4
        ) {
          headerBandBot = botRule;
          headerBandY = (headerBandTop + headerBandBot) / 2;
        }
      } else if (agree) {
        headerBandTop = hb.top;
        headerBandBot = hb.bot;
        headerBandY = hb.mid;
      }
    }
  }

  // Person bands must start at/below the header bottom (no teal into dates).
  if (headerBandBot > headerBandTop) {
    rows = rows.map((r) => {
      if (r.yLo == null || r.yHi == null) return r;
      if (r.yLo >= headerBandBot - 1) return r;
      const yLo = Math.min(r.yHi - 8, Math.max(r.yLo, headerBandBot));
      return { ...r, yLo };
    });
  }

  const rowAnchors = rows.map((r) => ({
    yCenter: r.yCenter,
    yLo: r.yLo,
    yHi: r.yHi,
  }));

  const extents: GlyphExtent[] = rows.map((r) => ({
    yTop: r.yNameTop ?? r.yCenter,
    yBot: r.yNameBot ?? r.yCenter,
  }));

  const scoopCols: LatticeColBound[] =
    colBounds.length >= 3
      ? colBounds
      : colBoundsFromCenters(colCenters, w, colGap);
  const useLatticeCells =
    scoopCols.length >= 3 &&
    rows.some((r) => r.yLo != null && r.yHi != null && r.yHi > r.yLo);

  const colOf = (l: (typeof merged)[0]): number => {
    if (scoopCols.length >= 3) {
      return owningColIndexFromBounds(xCenter(l), scoopCols);
    }
    return owningColIndex(l, colCenters, nameMaxXFinal, w);
  };

  /** Degraded path only: band / nearest-name when lattice cell rule unavailable. */
  const belongsToStub = (l: (typeof merged)[0], ownerIdx: number, slope: number): boolean => {
    const row = rows[ownerIdx];
    if (row?.yLo != null && row.yHi != null && row.yHi > row.yLo) {
      const y = yCenter(l);
      return y >= row.yLo && y < row.yHi;
    }
    return lineBelongsToRow(l, ownerIdx, rowAnchors, slope, xAnchorRef);
  };

  const yFirst = stubs[0]?.yMid ?? rows[0]?.yCenter ?? 0;

  for (let si = 0; si < stubs.length; si++) {
    const s = stubs[si]!;
    const ownerIdx = stubRowIndex[si]!;
    const row = rows[ownerIdx]!;
    const stubSlope = s.slope ?? rowSlope;
    const inDayBody = (l: (typeof merged)[0]): boolean => {
      const xc = xCenter(l);
      const yMid = yCenter(l);
      // Keep name-column glyphs out of day-cell scoop (skew-aware divider).
      const xRightAtY = Math.max(24, nameMaxXFinal - rowSlope * (yMid - yFirst));
      if (xc < xRightAtY + 6 || l.boundingBox.x < xRightAtY * 0.92) return false;
      const t = cleanCell(l.text);
      if (/^\(?\s*kw/i.test(t)) return false;
      return true;
    };

    const cells = scoopCols.map((col, colIndex) => {
      const candidates = merged.filter((l) => {
        if (!inDayBody(l)) return false;
        if (useLatticeCells && row.yLo != null && row.yHi != null) {
          // Structure first: glyph center ∈ person×day parallelogram.
          return glyphInLatticeCell(
            xCenter(l),
            yCenter(l),
            row,
            col,
            stubSlope,
            xAnchorRef
          );
        }
        return belongsToStub(l, ownerIdx, stubSlope) && colOf(l) === colIndex;
      });
      if (!candidates.length) return '';
      const texts = candidates
        .sort((a, b) => a.boundingBox.y - b.boundingBox.y)
        .map((l) => cleanCell(l.text))
        .filter((t) => t && !looksLikeDayHeader(t));
      return formatShiftCell([...new Set(texts)]);
    });

    for (const l of merged) {
      if (!inDayBody(l)) continue;
      const inside =
        useLatticeCells && row.yLo != null
          ? scoopCols.some((col) =>
              glyphInLatticeCell(xCenter(l), yCenter(l), row, col, stubSlope, xAnchorRef)
            )
          : belongsToStub(l, ownerIdx, stubSlope);
      if (!inside) continue;
      const top = l.boundingBox.y;
      const bot = l.boundingBox.y + l.boundingBox.height;
      for (let p = 0; p < s.people.length; p++) {
        const e = extents[ownerIdx + p]!;
        e.yTop = Math.min(e.yTop, top);
        e.yBot = Math.max(e.yBot, bot);
      }
    }

    for (let p = 0; p < s.people.length; p++) {
      const r = rows[ownerIdx + p]!;
      r.cells = cells.slice();
    }
  }

  // If lattice frames missing, content bbox + hard-disjoint.
  if (rows.some((r) => r.yLo == null || r.yHi == null)) {
    rows = bandsFromOwnedGlyphs(rows, extents, pageTop, pageBot);
  }

  const dayFrames =
    colBounds.length >= 3
      ? dayFramesFromBounds(colBounds, filledHeaders)
      : dayFramesFromCenters(colCenters, filledHeaders, w, colGap);
  const headerFrame = headerFrameFromBand(
    headerBandTop > 0 && headerBandBot > headerBandTop
      ? { top: headerBandTop, bot: headerBandBot }
      : null
  );
  const personFrames = personFramesFromRows(rows);

  return {
    headers: filledHeaders,
    rows,
    ok: rows.length >= 2 && filledHeaders.length >= 3,
    colCenters,
    nameMaxX: nameMaxXFinal,
    colGap,
    rowYPad,
    rowSlope,
    headerBandY: headerBandY > 0 ? headerBandY : undefined,
    headerBandTop: headerBandTop > 0 ? headerBandTop : undefined,
    headerBandBot: headerBandBot > headerBandTop ? headerBandBot : undefined,
    dayFrames,
    personFrames,
    headerFrame,
    contentLeft: inkLeft,
    contentRight: inkRight,
    contentTop: inkTop,
    contentBottom: inkBot,
    rosterMonth: monthYear?.month,
    rosterYear: monthYear?.year,
    latticeQuality:
      latticeQuality != null
        ? {
            ...latticeQuality,
            hLines: lattice?.hYs.length || 0,
            vLines: lattice?.vXs.length || 0,
            inferredCols: dayFrames.length,
          }
        : undefined,
  };
}
