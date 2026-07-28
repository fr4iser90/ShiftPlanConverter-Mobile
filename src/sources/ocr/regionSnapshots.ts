/**
 * Auto-snapshots of OCR regions after a confident grid hit (on-device only).
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

/**
 * Estimate name-column / day-header boxes from grid geometry (page pixel space → normalized).
 */
export function estimateRegionBoxes(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number
): { name: OcrRegionSnapshot['box']; header: OcrRegionSnapshot['box'] } | null {
  if (!grid.ok || !pageWidth || !pageHeight) return null;
  const nameMaxX = grid.nameMaxX ?? pageWidth * 0.22;
  const rowH = (r: { yCenter: number }, i: number) => {
    const next = grid.rows[i + 1];
    if (next) return Math.max(16, Math.abs(next.yCenter - r.yCenter));
    return grid.rowYPad ? grid.rowYPad * 2 : 36;
  };
  const headerY = Math.min(
    ...grid.rows.map((r, i) => r.yCenter - rowH(r, i) / 2),
    40
  );
  const firstRowY = grid.rows[0]?.yCenter ?? headerY + 40;
  const nameBox = {
    x: clamp01(0),
    y: clamp01((headerY - 20) / pageHeight),
    width: clamp01(Math.max(0.12, nameMaxX / pageWidth + 0.02)),
    height: clamp01(Math.min(0.95, (grid.rows[grid.rows.length - 1]?.yCenter || firstRowY) / pageHeight)),
  };
  const headerBox = {
    x: clamp01(nameMaxX / pageWidth),
    y: clamp01(Math.max(0, (headerY - 30) / pageHeight)),
    width: clamp01(1 - nameMaxX / pageWidth),
    height: clamp01(Math.max(0.06, (firstRowY - headerY + 40) / pageHeight)),
  };
  return { name: nameBox, header: headerBox };
}

/** Crop one normalized box from an image URI. Returns null if manipulator unavailable. */
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
            originX: Math.min(originX, imageWidth - 8),
            originY: Math.min(originY, imageHeight - 8),
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
