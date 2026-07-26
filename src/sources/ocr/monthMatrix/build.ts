/**
 * Reconstruct a month-matrix duty roster from OCR line boxes.
 * Output mimics the wall plan: name | day1 | day2 | … (never a flat word list).
 */
import { focusLinesOnMonthTable } from '../focusTable';
import type { OcrLine } from '../recognize';
import {
  collectDayColumns,
  expandGluedDayHeaderTokens,
  inferNameMaxX,
  mergeSplitDayHeaderTokens,
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
import type { MatrixRow, MonthMatrixGrid } from './types';

/**
 * Build name×day grid from OCR geometry.
 * Row anchors come from the left name column first (avoids shift-cell Y bridging).
 */
export function buildMonthMatrixGrid(lines: OcrLine[], pageWidth: number): MonthMatrixGrid {
  const empty: MonthMatrixGrid = { headers: [], rows: [], ok: false };
  if (!lines.length) return empty;

  const pageH = Math.max(...lines.map((l) => l.boundingBox.y + l.boundingBox.height), 1);
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

  const dayCols = collectDayColumns(merged, w, nameMaxX);
  const colCenters = dayCols.centers;
  const filledHeaders = dayCols.headers;
  if (colCenters.length < 3) {
    return empty;
  }
  const xs = colCenters;
  const gaps: number[] = [];
  for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
  const colGap = Math.max(12, median(gaps) || w / 28);

  const nameTokens = merged.filter((l) => {
    if (xCenter(l) >= nameMaxX && l.boundingBox.x >= nameMaxX * 0.95) return false;
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
  for (let i = 1; i < nameYs.length; i++) nameGaps.push(nameYs[i] - nameYs[i - 1]);
  const medNameGap = median(nameGaps.filter((g) => g > 0 && g < nameMedH * 8));
  const nameRowGap = Math.max(
    nameMedH * 0.85,
    Math.min(medNameGap > 0 ? medNameGap * 0.92 : nameMedH * 1.2, nameMedH * 2.4)
  );
  let nameGroups = clusterSorted(
    nameTokens.map((l) => ({ v: yCenter(l), item: l })),
    nameRowGap
  );
  nameGroups = mergeNameOnlyRowFragments(nameGroups, nameMaxX, nameMedH * 1.35);
  const pairGap = Math.max(nameMedH * 2.25, nameRowGap * 1.2);
  nameGroups = pairLoneNameFragments(nameGroups, pairGap);
  nameGroups = splitTrailingLastNameGroups(nameGroups);
  nameGroups = pairLoneNameFragments(nameGroups, pairGap);

  const rowYPad = Math.max(nameMedH * 2.4, medH * 1.1);
  const rows: MatrixRow[] = [];
  for (const g of nameGroups) {
    const nameParts = g
      .slice()
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x)
      .map((l) => cleanCell(l.text));
    const people = expandNameLabels(nameParts);
    if (!people.length) continue;

    const yMid = g.reduce((s, l) => s + yCenter(l), 0) / g.length;
    const cells = colCenters.map((_cx, colIndex) => {
      const candidates = merged.filter((l) => {
        const xc = xCenter(l);
        if (xc < nameMaxX && l.boundingBox.x < nameMaxX * 0.9) return false;
        if (Math.abs(yCenter(l) - yMid) > rowYPad) return false;
        return owningColIndex(l, colCenters, nameMaxX, w) === colIndex;
      });
      if (!candidates.length) return '';
      const texts = candidates
        .sort((a, b) => a.boundingBox.y - b.boundingBox.y)
        .map((l) => cleanCell(l.text))
        .filter((t) => t && !looksLikeDayHeader(t));
      return formatShiftCell([...new Set(texts)]);
    });

    for (const name of people) {
      rows.push({ name, yCenter: yMid, cells: cells.slice() });
    }
  }

  rows.sort((a, b) => a.yCenter - b.yCenter);

  return {
    headers: filledHeaders,
    rows,
    ok: rows.length >= 2 && filledHeaders.length >= 3,
    colCenters,
    nameMaxX,
    colGap,
    rowYPad,
  };
}
