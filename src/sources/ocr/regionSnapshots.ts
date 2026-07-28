/**
 * Auto-snapshots of OCR regions after a confident grid hit (on-device only).
 * Boxes are normalized to full image width/height (same space as ML Kit boxes).
 */
import type { MonthMatrixGrid } from './monthMatrix/types';

export type OcrRegionSnapshot = {
  kind: 'name-column' | 'day-header';
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
  const next = grid.rows[index + 1];
  if (next) return Math.max(16, Math.abs(next.yCenter - r.yCenter));
  const prev = grid.rows[index - 1];
  if (prev) return Math.max(16, Math.abs(r.yCenter - prev.yCenter));
  return grid.rowYPad ? grid.rowYPad * 2 : 36;
}

/**
 * Estimate name-column / day-header boxes from grid geometry (page = full image px).
 */
export function estimateRegionBoxes(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number
): { name: OcrRegionSnapshot['box']; header: OcrRegionSnapshot['box'] } | null {
  if (!grid.ok || !pageWidth || !pageHeight || !grid.rows.length) return null;
  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.22;
  const rh0 = rowHeightPx(grid, 0);
  const firstTop = grid.rows[0]!.yCenter - rh0 / 2;
  const lastBottom =
    grid.rows[grid.rows.length - 1]!.yCenter + rowHeightPx(grid, grid.rows.length - 1) / 2;

  // Header sits just above the first person row (weekday/day numbers).
  const headerBandPx = Math.min(64, Math.max(22, rh0 * 0.75, (grid.rowYPad || 18) * 1.1));
  const headerBottom = Math.max(headerBandPx, firstTop);
  const headerTop = Math.max(0, headerBottom - headerBandPx);

  const nameBox = {
    x: clamp01(0),
    y: clamp01(headerTop / pageHeight),
    width: clamp01(Math.max(0.14, (nameMaxX + 8) / pageWidth)),
    height: clamp01(Math.min(0.95, (lastBottom - headerTop) / pageHeight)),
  };
  const headerBox = {
    x: clamp01(nameMaxX / pageWidth),
    y: clamp01(headerTop / pageHeight),
    width: clamp01(1 - nameMaxX / pageWidth),
    height: clamp01(Math.max(0.025, (headerBottom - headerTop) / pageHeight)),
  };
  return { name: nameBox, header: headerBox };
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
}): Promise<OcrRegionSnapshot[]> {
  const boxes = estimateRegionBoxes(opts.grid, opts.pageWidth, opts.pageHeight);
  if (!boxes) return [];
  const out: OcrRegionSnapshot[] = [];
  for (const [kind, box] of [
    ['name-column', boxes.name],
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
