/**
 * Person × day wall-plan highlight overlays (skewed name strips + day headers).
 */
import { normalizeNameKeyPublic } from '../../names';
import {
  clamp01,
  dayFrameAt,
  headerYAtX,
  nameColRightAtY,
  pushSkewedBandSegments,
  rowBandY,
  type OcrHighlightBox,
} from '../overlayGeom';
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

export function estimateMonthMatrixHighlightOverlays(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName?: string | null
): OcrHighlightBox[] {
  if (!grid.ok || !pageWidth || !pageHeight || !grid.rows.length) return [];

  const slope = grid.rowSlope || 0;
  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.22;
  const yFirst = grid.rows[0]!.yCenter;
  const xRef = nameMaxX;
  const centers = grid.colCenters?.length ? grid.colCenters : [];
  const out: OcrHighlightBox[] = [];
  const tableLeft = Math.max(0, grid.contentLeft ?? 0);
  const tableRight = Math.min(
    pageWidth,
    grid.contentRight ??
      (centers.length ? Math.max(...centers) + (grid.colGap || 40) : pageWidth * 0.98)
  );
  const firstDayLeft =
    grid.dayFrames?.[0]?.x0 ??
    (centers[0] != null ? centers[0]! - (grid.colGap || 40) * 0.5 : nameMaxX);
  const nameRightCap = Math.min(nameMaxX + 2, firstDayLeft - 1, tableRight);
  const headerBotY =
    grid.headerFrame?.y1 ??
    grid.headerBandBot ??
    (grid.headerBandY != null ? grid.headerBandY + 14 : null);

  for (let i = 0; i < grid.rows.length; i++) {
    const band = rowBandY(grid, i);
    let y0 = band.yLo;
    let y1 = band.yHi;
    if (headerBotY != null && y0 < headerBotY) {
      y0 = Math.min(y1 - 6, headerBotY);
    }
    if (!(y1 > y0 + 4)) continue;
    const yMid = (y0 + y1) / 2;
    const xRight = Math.min(
      nameRightCap,
      nameColRightAtY(nameMaxX, yMid, yFirst, slope) + 2
    );
    pushSkewedBandSegments(
      out,
      'name-column',
      y0,
      y1,
      tableLeft,
      Math.max(tableLeft + 16, xRight),
      xRef,
      slope,
      pageWidth,
      pageHeight,
      { maxSegs: 8 }
    );
  }

  let hTop =
    grid.headerFrame != null
      ? grid.headerFrame.y0
      : grid.headerBandTop != null && grid.headerBandBot != null
        ? grid.headerBandTop
        : (grid.headerBandY || yFirst - 40) - 12;
  let hBot =
    grid.headerFrame != null
      ? grid.headerFrame.y1
      : grid.headerBandTop != null && grid.headerBandBot != null
        ? grid.headerBandBot
        : (grid.headerBandY || yFirst - 40) + 12;
  const glyphH = Math.max(10, hBot - hTop);
  const pad = Math.min(Math.max(glyphH * 0.55, pageHeight * 0.01), pageHeight * 0.02);
  hTop = Math.max(0, hTop - pad);
  hBot = hBot + pad;
  if (grid.rows[0]?.yLo != null) {
    hBot = Math.min(hBot, grid.rows[0]!.yLo! - 1);
  }
  if (!(hBot > hTop + 4)) {
    hBot = hTop + Math.max(18, glyphH);
  }
  // Prefer readable day-header chips; do not collapse to a hairline.
  const headerBand = Math.max(hBot - hTop, Math.max(18, pageHeight * 0.028));
  const yHeaderAtRef =
    grid.headerBandY && grid.headerBandY > 0
      ? Math.min(Math.max(grid.headerBandY, hTop + 2), hBot - 2)
      : (hTop + hBot) / 2;

  if (centers.length >= 3) {
    for (let i = 0; i < centers.length; i++) {
      const { x0, x1, cx } = dayFrameAt(grid, i, pageWidth);
      const yMid = headerYAtX(yHeaderAtRef, cx, xRef, slope);
      const hx0 = Math.max(tableLeft, x0);
      const hx1 = Math.min(tableRight, x1);
      if (hx1 <= hx0 + 2) continue;
      out.push({
        kind: 'day-header',
        box: {
          x: clamp01(hx0 / pageWidth),
          y: clamp01((yMid - headerBand / 2) / pageHeight),
          width: clamp01((hx1 - hx0) / pageWidth),
          height: clamp01(headerBand / pageHeight),
        },
      });
    }
  } else {
    out.push({
      kind: 'day-header',
      box: {
        x: clamp01(Math.max(tableLeft, nameMaxX) / pageWidth),
        y: clamp01((yHeaderAtRef - headerBand / 2) / pageHeight),
        width: clamp01((tableRight - Math.max(tableLeft, nameMaxX)) / pageWidth),
        height: clamp01(headerBand / pageHeight),
      },
    });
  }

  const name = String(matchedName || '').trim();
  if (!name) return out;

  const idx = findMatchedRowIndex(grid, name);
  if (idx < 0) return out;

  const band = rowBandY(grid, idx);
  const yRow = (band.yLo + band.yHi) / 2;
  // Same right edge as teal name strips — never let skew widen the own-row
  // name gutter into day columns (looked like "Namensspalte viel zu breit").
  const nameRight = Math.min(
    nameRightCap,
    nameColRightAtY(nameMaxX, yRow, yFirst, slope)
  );

  pushSkewedBandSegments(
    out,
    'own-row',
    band.yLo,
    band.yHi,
    tableLeft,
    Math.max(tableLeft + 24, nameRight),
    xRef,
    slope,
    pageWidth,
    pageHeight,
    { maxSegs: 8 }
  );

  if (centers.length >= 3) {
    for (let i = 0; i < centers.length; i++) {
      const { x0, x1 } = dayFrameAt(grid, i, pageWidth);
      const ox0 = Math.max(tableLeft, x0);
      const ox1 = Math.min(tableRight, x1);
      if (ox1 <= ox0 + 2) continue;
      pushSkewedBandSegments(
        out,
        'own-row',
        band.yLo,
        band.yHi,
        ox0,
        ox1,
        xRef,
        slope,
        pageWidth,
        pageHeight,
        { maxSegs: 4 }
      );
    }
  } else {
    pushSkewedBandSegments(
      out,
      'own-row',
      band.yLo,
      band.yHi,
      nameRight,
      tableRight,
      xRef,
      slope,
      pageWidth,
      pageHeight,
      { maxSegs: 28 }
    );
  }

  return out;
}
