/**
 * Auto-snapshots of OCR regions after a confident grid hit (on-device only).
 * Boxes are normalized to full image width/height (same space as ML Kit boxes).
 */
import { normalizeNameKeyPublic } from './names';
import type { MonthMatrixGrid } from './monthMatrix/types';

export type OcrRegionSnapshotKind = 'name-column' | 'day-header' | 'own-name';

export type OcrRegionSnapshot = {
  kind: OcrRegionSnapshotKind;
  /** Cropped image URI (file://) when capture succeeded. */
  uri: string | null;
  /** Normalized crop box on the source image (0..1). */
  box: { x: number; y: number; width: number; height: number };
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function rowHeightPx(grid: MonthMatrixGrid, index: number): number {
  const r = grid.rows[index];
  if (!r) return 36;
  if (
    r.yNameTop != null &&
    r.yNameBot != null &&
    r.yNameBot > r.yNameTop &&
    r.yNameBot - r.yNameTop >= 10
  ) {
    const glyphH = r.yNameBot - r.yNameTop;
    const next = grid.rows[index + 1];
    const prev = grid.rows[index - 1];
    const gaps: number[] = [];
    if (next) gaps.push(Math.abs(next.yCenter - r.yCenter));
    if (prev) gaps.push(Math.abs(r.yCenter - prev.yCenter));
    if (gaps.length) {
      return Math.max(glyphH * 1.05, Math.min(...gaps) * 0.72);
    }
    return Math.max(16, glyphH * 1.15);
  }
  const next = grid.rows[index + 1];
  const prev = grid.rows[index - 1];
  const gaps: number[] = [];
  if (next) gaps.push(Math.abs(next.yCenter - r.yCenter));
  if (prev) gaps.push(Math.abs(r.yCenter - prev.yCenter));
  if (gaps.length) return Math.max(16, Math.min(...gaps) * 0.78);
  return grid.rowYPad ? grid.rowYPad * 1.6 : 36;
}

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

/**
 * Axis-aligned crop boxes (snapshots). Slightly padded union of skewed regions.
 */
export function estimateRegionBoxes(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number
): { name: OcrRegionSnapshot['box']; header: OcrRegionSnapshot['box'] } | null {
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

  const hTop =
    grid.headerBandTop ??
    (grid.headerBandY && grid.headerBandY > 0 ? grid.headerBandY - 14 : yFirst - 48);
  const hBot =
    grid.headerBandBot ??
    (grid.headerBandY && grid.headerBandY > 0 ? grid.headerBandY + 14 : yFirst - 20);
  const yHLeft = hTop;
  const yHRight = hTop + slope * (pageWidth - nameMaxX);
  const headerTop = Math.min(yHLeft, yHRight);
  const headerBottom = Math.max(hBot, hBot + slope * (pageWidth - nameMaxX));

  const nameBox = {
    x: clamp01(0),
    y: clamp01(yTop / pageHeight),
    width: clamp01(Math.max(0.1, nameRight / pageWidth)),
    height: clamp01(Math.min(0.95, (yBot - yTop) / pageHeight)),
  };
  const headerBox = {
    x: clamp01(nameMaxX / pageWidth),
    y: clamp01(headerTop / pageHeight),
    width: clamp01(1 - nameMaxX / pageWidth),
    height: clamp01(Math.max(0.015, (headerBottom - headerTop) / pageHeight)),
  };
  return { name: nameBox, header: headerBox };
}

/**
 * Tight crop around the selected person's name cell (readable in the thumb).
 */
export function estimateOwnNameBox(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName: string
): OcrRegionSnapshot['box'] | null {
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

/** Crop one normalized box from an image URI. imageWidth/Height must be real pixels. */
export async function cropRegionSnapshot(
  imageUri: string,
  box: OcrRegionSnapshot['box'],
  imageWidth: number,
  imageHeight: number
): Promise<string | null> {
  try {
    const manip = require('expo-image-manipulator') as {
      manipulateAsync: (
        uri: string,
        actions: { crop: { originX: number; originY: number; width: number; height: number } }[],
        opts: { compress: number; format: unknown }
      ) => Promise<{ uri: string }>;
      SaveFormat: { JPEG: unknown };
    };
    const originX = Math.floor(box.x * imageWidth);
    const originY = Math.floor(box.y * imageHeight);
    const width = Math.max(8, Math.floor(box.width * imageWidth));
    const height = Math.max(8, Math.floor(box.height * imageHeight));
    const out = await manip.manipulateAsync(
      imageUri,
      [
        {
          crop: {
            originX: Math.min(originX, Math.max(0, imageWidth - 8)),
            originY: Math.min(originY, Math.max(0, imageHeight - 8)),
            width: Math.min(width, imageWidth - originX),
            height: Math.min(height, imageHeight - originY),
          },
        },
      ],
      { compress: 0.85, format: manip.SaveFormat.JPEG }
    );
    return out.uri || null;
  } catch {
    return null;
  }
}

export async function captureAutoSnapshots(opts: {
  imageUri: string;
  grid: MonthMatrixGrid;
  pageWidth: number;
  pageHeight: number;
  /** When set, prefer a tight crop of this person's name over the full column. */
  matchedName?: string | null;
}): Promise<OcrRegionSnapshot[]> {
  const boxes = estimateRegionBoxes(opts.grid, opts.pageWidth, opts.pageHeight);
  if (!boxes) return [];
  const out: OcrRegionSnapshot[] = [];

  const own =
    opts.matchedName && opts.matchedName.trim()
      ? estimateOwnNameBox(
          opts.grid,
          opts.pageWidth,
          opts.pageHeight,
          opts.matchedName
        )
      : null;

  const nameEntry: { kind: OcrRegionSnapshotKind; box: OcrRegionSnapshot['box'] } = own
    ? { kind: 'own-name', box: own }
    : { kind: 'name-column', box: boxes.name };

  for (const [kind, box] of [
    [nameEntry.kind, nameEntry.box],
    ['day-header', boxes.header],
  ] as const) {
    const uri = await cropRegionSnapshot(
      opts.imageUri,
      box,
      opts.pageWidth,
      opts.pageHeight
    );
    out.push({ kind, uri, box });
  }
  return out;
}
