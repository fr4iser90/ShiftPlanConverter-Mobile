/**
 * Axis-aligned crop boxes for date × duty snapshot review.
 */
import { filterPreferredNameMatches, normalizeNameKeyPublic } from '../../names';
import { clamp01, type OcrNormBox } from '../overlayGeom';
import type { MonthMatrixGrid } from '../month-matrix/types';

export function estimateDateDutyRegionBoxes(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number
): { name: OcrNormBox; header: OcrNormBox } | null {
  const dateRows = grid.dateDutyRows || [];
  if (!dateRows.length) return null;
  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.18;
  const tableLeft = Math.max(0, grid.contentLeft ?? 0);
  const tableRight = Math.min(pageWidth, grid.contentRight ?? pageWidth * 0.98);
  const yTop = dateRows[0]!.yLo;
  const yBot = dateRows[dateRows.length - 1]!.yHi;
  const hTop =
    grid.headerFrame?.y0 ??
    grid.headerBandTop ??
    (grid.headerBandY != null ? grid.headerBandY - 14 : yTop - 40);
  const hBot = Math.min(
    yTop - 2,
    grid.headerFrame?.y1 ??
      grid.headerBandBot ??
      (grid.headerBandY != null ? grid.headerBandY + 14 : yTop - 12)
  );
  return {
    name: {
      x: clamp01(tableLeft / pageWidth),
      y: clamp01(yTop / pageHeight),
      width: clamp01(Math.max(0.08, (nameMaxX - tableLeft) / pageWidth)),
      height: clamp01(Math.max(0.05, (yBot - yTop) / pageHeight)),
    },
    header: {
      x: clamp01(Math.max(tableLeft, nameMaxX) / pageWidth),
      y: clamp01(Math.min(hTop, hBot) / pageHeight),
      width: clamp01((tableRight - Math.max(tableLeft, nameMaxX)) / pageWidth),
      height: clamp01(Math.max(0.015, Math.abs(hBot - hTop) / pageHeight)),
    },
  };
}

export function estimateDateDutyOwnNameBox(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName: string
): OcrNormBox | null {
  const assignments = grid.dateDutyAssignments || [];
  if (!assignments.length) return null;
  const uniq = new Map<
    string,
    { id: string; label: string; yCenter: number; height: number }
  >();
  for (const a of assignments) {
    const key = normalizeNameKeyPublic(a.personLabel);
    if (!key || uniq.has(key)) continue;
    uniq.set(key, {
      id: key,
      label: a.personLabel,
      yCenter: a.yCenter,
      height: 0,
    });
  }
  const matchedKeys = new Set(
    filterPreferredNameMatches(matchedName, [...uniq.values()], null, 0.8).map((c) =>
      normalizeNameKeyPublic(c.label)
    )
  );
  if (!matchedKeys.size) return null;
  const cells = assignments.filter((a) =>
    matchedKeys.has(normalizeNameKeyPublic(a.personLabel))
  );
  if (!cells.length) return null;
  const padX = pageWidth * 0.04;
  const padY = pageHeight * 0.012;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.xCenter - padX);
    x1 = Math.max(x1, c.xCenter + padX);
    y0 = Math.min(y0, c.yCenter - padY);
    y1 = Math.max(y1, c.yCenter + padY);
  }
  if (cells.length > 2) {
    const top = [...cells].sort((a, b) => a.yCenter - b.yCenter)[0]!;
    x0 = top.xCenter - padX * 1.4;
    x1 = top.xCenter + padX * 1.4;
    y0 = top.yCenter - padY * 1.2;
    y1 = top.yCenter + padY * 1.2;
  }
  return {
    x: clamp01(Math.max(0, x0) / pageWidth),
    y: clamp01(Math.max(0, y0) / pageHeight),
    width: clamp01(Math.max(0.08, (x1 - x0) / pageWidth)),
    height: clamp01(Math.max(0.02, (y1 - y0) / pageHeight)),
  };
}
