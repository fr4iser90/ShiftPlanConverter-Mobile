/**
 * Axis-aligned crop boxes for month-matrix snapshot review.
 */
import { normalizeNameKeyPublic } from '../../names';
import { clamp01, rowHeightPx, type OcrNormBox } from '../overlayGeom';
import type { MonthMatrixGrid } from './types';

function findMatchedRowIndex(grid: MonthMatrixGrid, matchedName: string): number {
  const key = normalizeNameKeyPublic(matchedName);
  if (!key) return -1;
  const exact = grid.rows.findIndex((r) => normalizeNameKeyPublic(r.name) === key);
  if (exact >= 0) return exact;
  return grid.rows.findIndex((r) => {
    const rk = normalizeNameKeyPublic(r.name);
    return rk.startsWith(key) || key.startsWith(rk.split(',')[0] || rk);
  });
}

export function estimateMonthMatrixRegionBoxes(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number
): { name: OcrNormBox; header: OcrNormBox } | null {
  if (!grid.ok || !pageWidth || !pageHeight || !grid.rows.length) return null;
  const slope = grid.rowSlope || 0;
  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.22;
  const yFirst = grid.rows[0]!.yCenter;
  const yTop =
    grid.rows[0]!.yLo ??
    grid.rows[0]!.yNameTop ??
    yFirst - rowHeightPx(grid, 0) * 0.55;
  const last = grid.rows.length - 1;
  const yBot =
    grid.rows[last]!.yHi ??
    grid.rows[last]!.yNameBot ??
    grid.rows[last]!.yCenter + rowHeightPx(grid, last) * 0.5;
  const xRightTop = Math.max(nameMaxX, nameMaxX - slope * (yTop - yFirst));
  const xRightBot = Math.max(24, nameMaxX - slope * (yBot - yFirst));
  const nameRight = Math.max(xRightTop, xRightBot) + 8;

  const hTopRaw =
    grid.headerFrame?.y0 ??
    grid.headerBandTop ??
    (grid.headerBandY && grid.headerBandY > 0 ? grid.headerBandY - 14 : yFirst - 48);
  const hBotRaw =
    grid.headerFrame?.y1 ??
    grid.headerBandBot ??
    (grid.headerBandY && grid.headerBandY > 0 ? grid.headerBandY + 14 : yFirst - 20);
  // Pad so the Tagesköpfe crop shows Mo/Di ink, not a 1px rule line.
  const bandH = Math.max(8, hBotRaw - hTopRaw);
  const pad = Math.max(10, bandH * 0.45, pageHeight * 0.012);
  const hTop = Math.max(0, hTopRaw - pad);
  const hBot = Math.min(pageHeight, hBotRaw + pad);
  const yHLeft = hTop;
  const yHRight = hTop + slope * (pageWidth - nameMaxX);
  const headerTop = Math.min(yHLeft, yHRight);
  const headerBottom = Math.max(hBot, hBot + slope * (pageWidth - nameMaxX));

  return {
    name: {
      x: clamp01(0),
      y: clamp01(yTop / pageHeight),
      width: clamp01(Math.max(0.1, nameRight / pageWidth)),
      height: clamp01(Math.min(0.95, (yBot - yTop) / pageHeight)),
    },
    header: {
      x: clamp01(nameMaxX / pageWidth),
      y: clamp01(headerTop / pageHeight),
      width: clamp01(1 - nameMaxX / pageWidth),
      height: clamp01(Math.max(0.028, (headerBottom - headerTop) / pageHeight)),
    },
  };
}

export function estimateMonthMatrixOwnNameBox(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName: string
): OcrNormBox | null {
  if (!grid.ok || !pageWidth || !pageHeight || !matchedName.trim()) return null;
  const idx = findMatchedRowIndex(grid, matchedName);
  if (idx < 0) return null;

  const row = grid.rows[idx]!;
  const slope = grid.rowSlope || 0;
  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.22;
  const y0 =
    row.yNameTop != null
      ? row.yNameTop - 4
      : row.yLo != null
        ? row.yLo
        : row.yCenter - 20;
  const y1 =
    row.yNameBot != null
      ? row.yNameBot + 4
      : row.yHi != null
        ? Math.min(row.yHi, row.yCenter + 28)
        : row.yCenter + 20;
  const yRow = (y0 + y1) / 2;
  const yFirst = grid.rows[0]!.yCenter;
  const nameRight = Math.max(24, nameMaxX - slope * (yRow - yFirst)) + 10;

  return {
    x: clamp01(0),
    y: clamp01(Math.max(0, y0) / pageHeight),
    width: clamp01(Math.max(0.12, Math.min(0.45, (nameRight + 12) / pageWidth))),
    height: clamp01(Math.max(0.02, (y1 - y0) / pageHeight)),
  };
}
