/**
 * Apply user-painted assist regions (name / day header / own-row) to OCR lines
 * and build a single-row grid when only the own row is marked.
 */
import type { OcrPaintedRegion, OcrNormBox } from '@/src/ui/OcrRegionAssistModal';
import type { OcrLine } from './recognize';
import { formatShiftCell } from './layouts/month-matrix/format';
import { cleanCell, clusterSorted, looksLikeDayHeader, median, xCenter, yCenter } from './layouts/month-matrix/geometry';
import type { MonthMatrixGrid } from './layouts/month-matrix/types';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

function germanWd(year: number, month: number, day: number): string {
  return WD[new Date(year, month - 1, day).getDay()];
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function boxPx(box: OcrNormBox, pageW: number, pageH: number) {
  return {
    x: box.x * pageW,
    y: box.y * pageH,
    w: box.width * pageW,
    h: box.height * pageH,
  };
}

function centerInBox(ln: OcrLine, box: OcrNormBox, pageW: number, pageH: number): boolean {
  const b = boxPx(box, pageW, pageH);
  const cx = xCenter(ln);
  const cy = yCenter(ln);
  return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
}

function expandBox(box: OcrNormBox, padX: number, padY: number): OcrNormBox {
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  const right = Math.min(1, box.x + box.width + padX);
  const bot = Math.min(1, box.y + box.height + padY);
  return { x, y, width: Math.max(0.01, right - x), height: Math.max(0.01, bot - y) };
}

/**
 * Keep lines that support matrix rebuild from painted name / header / own-row.
 * Body cells are kept when name+header are painted (table rectangle under the header).
 */
export function biasLinesByPaintedRegions(
  lines: OcrLine[],
  regions: OcrPaintedRegion[],
  pageW: number,
  pageH: number
): OcrLine[] {
  if (!lines.length || !regions.length || pageW <= 0 || pageH <= 0) return lines;

  const name = regions.find((r) => r.kind === 'name-column')?.box;
  const header = regions.find((r) => r.kind === 'day-header')?.box;
  const own = regions.find((r) => r.kind === 'own-row')?.box;

  const nameE = name ? expandBox(name, 0.02, 0.04) : null;
  const headerE = header ? expandBox(header, 0.02, 0.03) : null;
  const ownE = own ? expandBox(own, 0.02, 0.02) : null;

  // Table body under header, right of name column.
  let body: OcrNormBox | null = null;
  if (name && header) {
    const left = Math.min(name.x, header.x);
    const top = header.y + header.height * 0.5;
    const right = Math.max(name.x + name.width, header.x + header.width);
    body = {
      x: left,
      y: top,
      width: Math.max(0.05, right - left),
      height: Math.max(0.05, 1 - top),
    };
  }

  return lines.filter((ln) => {
    if (nameE && centerInBox(ln, nameE, pageW, pageH)) return true;
    if (headerE && centerInBox(ln, headerE, pageW, pageH)) return true;
    if (ownE && centerInBox(ln, ownE, pageW, pageH)) return true;
    if (body && centerInBox(ln, body, pageW, pageH)) return true;
    return false;
  });
}

/**
 * Own-row Schnellmodus: map painted row cells left→right to consecutive calendar days.
 */
export function buildOwnRowAssistGrid(opts: {
  lines: OcrLine[];
  pageWidth: number;
  pageHeight: number;
  ownRow: OcrNormBox;
  nameColumn?: OcrNormBox | null;
  monthYear: { year: number; month: number };
  preferredName?: string | null;
}): MonthMatrixGrid {
  const empty: MonthMatrixGrid = { headers: [], rows: [], ok: false, reason: 'own-row-assist-empty' };
  const { pageWidth: pageW, pageHeight: pageH, monthYear } = opts;
  if (pageW <= 0 || pageH <= 0) return empty;

  const ownE = expandBox(opts.ownRow, 0.01, 0.015);
  const inOwn = opts.lines.filter((ln) => centerInBox(ln, ownE, pageW, pageH));
  if (!inOwn.length) return empty;

  const nameMaxFrac = opts.nameColumn
    ? opts.nameColumn.x + opts.nameColumn.width
    : Math.min(0.28, opts.ownRow.x + Math.max(0.12, opts.ownRow.width * 0.22));
  const nameMaxX = nameMaxFrac * pageW;

  const nameToks = inOwn
    .filter((ln) => xCenter(ln) < nameMaxX)
    .sort((a, b) => a.boundingBox.x - b.boundingBox.x);
  const cellToks = inOwn
    .filter((ln) => xCenter(ln) >= nameMaxX * 0.92)
    .filter((ln) => {
      const t = cleanCell(ln.text);
      return t && !looksLikeDayHeader(t);
    })
    .sort((a, b) => a.boundingBox.x - b.boundingBox.x);

  let name =
    (opts.preferredName && opts.preferredName.trim()) ||
    nameToks.map((l) => cleanCell(l.text)).filter(Boolean).join(' ').trim() ||
    'Ich';

  const xs = cellToks.map((l) => xCenter(l));
  const gaps: number[] = [];
  for (let i = 1; i < xs.length; i++) gaps.push(xs[i]! - xs[i - 1]!);
  const medGap = median(gaps.filter((g) => g > 4)) || pageW / 32;
  const groups = clusterSorted(
    cellToks.map((l) => ({ v: xCenter(l), item: l })),
    Math.max(8, medGap * 0.55)
  );

  const maxDay = daysInMonth(monthYear.year, monthYear.month);
  const nCols = Math.min(Math.max(groups.length, 1), maxDay);
  const headers: string[] = [];
  const colCenters: number[] = [];
  const cells: string[] = [];

  for (let d = 1; d <= nCols; d++) {
    const wd = germanWd(monthYear.year, monthYear.month, d);
    headers.push(`${wd}${d}`);
    const g = groups[d - 1];
    if (g?.length) {
      colCenters.push(g.reduce((s, l) => s + xCenter(l), 0) / g.length);
      const texts = g.map((l) => cleanCell(l.text)).filter(Boolean);
      cells.push(formatShiftCell([...new Set(texts)]));
    } else {
      colCenters.push(nameMaxX + ((pageW - nameMaxX) * d) / (nCols + 1));
      cells.push('');
    }
  }

  const yMid = inOwn.reduce((s, l) => s + yCenter(l), 0) / inOwn.length;
  const yNameTop = Math.min(...inOwn.map((l) => l.boundingBox.y));
  const yNameBot = Math.max(...inOwn.map((l) => l.boundingBox.y + l.boundingBox.height));

  return {
    headers,
    rows: [{ name, yCenter: yMid, cells, yNameTop, yNameBot }],
    ok: headers.length >= 3,
    colCenters,
    nameMaxX,
    colGap: medGap,
    rowYPad: Math.max(12, (yNameBot - yNameTop) * 1.2),
    headerBandY: Math.max(0, yMid - pageH * 0.08),
  };
}

/** Assist grids may be a single person row — still usable. */
export function relaxAssistGridOk(grid: MonthMatrixGrid): MonthMatrixGrid {
  if (grid.ok) return grid;
  if (grid.rows.length >= 1 && grid.headers.length >= 3) {
    return { ...grid, ok: true, reason: undefined };
  }
  return grid;
}
