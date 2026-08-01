/**
 * Date × duty board overlays: teal = date column, orange = duty headers, blue = matched cells.
 */
import { matchPreferredName, normalizeNameKeyPublic } from '../../names';
import {
  clamp01,
  dayFrameAt,
  type OcrHighlightBox,
} from '../overlayGeom';
import type { MonthMatrixGrid } from '../month-matrix/types';

export function estimateDateDutyHighlightOverlays(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName?: string | null
): OcrHighlightBox[] {
  const dateRows = grid.dateDutyRows || [];
  if (!dateRows.length) return [];

  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.18;
  const tableLeft = Math.max(0, grid.contentLeft ?? 0);
  const centers = grid.colCenters?.length ? grid.colCenters : [];
  const tableRight = Math.min(
    pageWidth,
    grid.contentRight ??
      (centers.length ? Math.max(...centers) + (grid.colGap || 40) : pageWidth * 0.98)
  );
  const out: OcrHighlightBox[] = [];

  const y0 = dateRows[0]!.yLo;
  const y1 = dateRows[dateRows.length - 1]!.yHi;
  out.push({
    kind: 'name-column',
    box: {
      x: clamp01(tableLeft / pageWidth),
      y: clamp01(y0 / pageHeight),
      width: clamp01(Math.max(16, nameMaxX - tableLeft) / pageWidth),
      height: clamp01(Math.max(8, y1 - y0) / pageHeight),
    },
  });

  let hTop =
    grid.headerFrame?.y0 ??
    grid.headerBandTop ??
    (grid.headerBandY != null ? grid.headerBandY - 14 : dateRows[0]!.yLo - 40);
  let hBot =
    grid.headerFrame?.y1 ??
    grid.headerBandBot ??
    (grid.headerBandY != null ? grid.headerBandY + 14 : dateRows[0]!.yLo - 12);
  if (!(hBot > hTop + 4)) hBot = hTop + Math.max(14, pageHeight * 0.02);
  hBot = Math.min(hBot, dateRows[0]!.yLo - 2);

  if (centers.length >= 2) {
    for (let i = 0; i < centers.length; i++) {
      const { x0, x1 } = dayFrameAt(grid, i, pageWidth);
      const hx0 = Math.max(tableLeft, Math.max(nameMaxX, x0));
      const hx1 = Math.min(tableRight, x1);
      if (hx1 <= hx0 + 2) continue;
      out.push({
        kind: 'day-header',
        box: {
          x: clamp01(hx0 / pageWidth),
          y: clamp01(hTop / pageHeight),
          width: clamp01((hx1 - hx0) / pageWidth),
          height: clamp01(Math.max(8, hBot - hTop) / pageHeight),
        },
      });
    }
  } else {
    out.push({
      kind: 'day-header',
      box: {
        x: clamp01(Math.max(tableLeft, nameMaxX) / pageWidth),
        y: clamp01(hTop / pageHeight),
        width: clamp01((tableRight - Math.max(tableLeft, nameMaxX)) / pageWidth),
        height: clamp01(Math.max(8, hBot - hTop) / pageHeight),
      },
    });
  }

  const name = String(matchedName || '').trim();
  if (!name) return out;

  const assignments = grid.dateDutyAssignments || [];
  if (!assignments.length) return out;

  const uniq = new Map<
    string,
    { id: string; label: string; yCenter: number; height: number }
  >();
  for (const a of assignments) {
    const key = normalizeNameKeyPublic(a.personLabel);
    if (!key || uniq.has(key)) continue;
    uniq.set(key, { id: key, label: a.personLabel, yCenter: a.yCenter, height: 0 });
  }
  const hit = matchPreferredName(name, [...uniq.values()]);
  if (!hit || hit.score < 0.8) return out;
  const matchedKey = normalizeNameKeyPublic(hit.candidate.label);

  const rowByDay = new Map(dateRows.map((r) => [r.day, r]));

  for (const a of assignments) {
    if (normalizeNameKeyPublic(a.personLabel) !== matchedKey) continue;
    const band = rowByDay.get(a.day);
    let yLo = band?.yLo ?? a.yCenter - 12;
    let yHi = band?.yHi ?? a.yCenter + 12;
    yLo = Math.max(yLo, a.yCenter - (yHi - yLo) * 0.45);
    yHi = Math.min(yHi, a.yCenter + (yHi - yLo) * 0.45);

    let x0 = a.xCenter - pageWidth * 0.06;
    let x1 = a.xCenter + pageWidth * 0.06;
    if (centers.length >= 2) {
      let bestI = 0;
      let bestDx = Math.abs(a.xCenter - centers[0]!);
      for (let i = 1; i < centers.length; i++) {
        const dx = Math.abs(a.xCenter - centers[i]!);
        if (dx < bestDx) {
          bestDx = dx;
          bestI = i;
        }
      }
      const fr = dayFrameAt(grid, bestI, pageWidth);
      x0 = fr.x0;
      x1 = fr.x1;
    }
    x0 = Math.max(tableLeft, Math.max(nameMaxX, x0));
    x1 = Math.min(tableRight, x1);
    if (x1 <= x0 + 4) continue;
    out.push({
      kind: 'own-row',
      box: {
        x: clamp01(x0 / pageWidth),
        y: clamp01(yLo / pageHeight),
        width: clamp01((x1 - x0) / pageWidth),
        height: clamp01(Math.max(8, yHi - yLo) / pageHeight),
      },
    });
  }

  return out;
}
