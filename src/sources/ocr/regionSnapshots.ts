/**
 * Auto-snapshots of OCR regions after a confident grid hit (on-device only).
 * Boxes are normalized to full image width/height (same space as ML Kit boxes).
 *
 * Layout-specific crop geometry lives under `layouts/<id>/regionBoxes.ts`.
 */
import {
  estimateDateDutyOwnNameBox,
  estimateDateDutyRegionBoxes,
} from './layouts/date-duty';
import {
  estimateMonthMatrixOwnNameBox,
  estimateMonthMatrixRegionBoxes,
} from './layouts/month-matrix';
import type { OcrNormBox } from './layouts/overlayGeom';
import type { MonthMatrixGrid } from './layouts/month-matrix/types';

export type OcrRegionSnapshotKind = 'name-column' | 'day-header' | 'own-name';

export type OcrRegionSnapshot = {
  kind: OcrRegionSnapshotKind;
  /** Cropped image URI (file://) when capture succeeded. */
  uri: string | null;
  /** Normalized crop box on the source image (0..1). */
  box: OcrNormBox;
};

/**
 * Axis-aligned crop boxes (snapshots). Slightly padded union of skewed regions.
 */
export function estimateRegionBoxes(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number
): { name: OcrNormBox; header: OcrNormBox } | null {
  if (!grid.ok || !pageWidth || !pageHeight) return null;
  if (grid.overlayLayout === 'date-duty') {
    return estimateDateDutyRegionBoxes(grid, pageWidth, pageHeight);
  }
  return estimateMonthMatrixRegionBoxes(grid, pageWidth, pageHeight);
}

/**
 * Tight crop around the selected person's name cell (readable in the thumb).
 */
export function estimateOwnNameBox(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName: string
): OcrNormBox | null {
  if (!grid.ok || !pageWidth || !pageHeight || !matchedName.trim()) return null;
  if (grid.overlayLayout === 'date-duty') {
    return estimateDateDutyOwnNameBox(grid, pageWidth, pageHeight, matchedName);
  }
  return estimateMonthMatrixOwnNameBox(grid, pageWidth, pageHeight, matchedName);
}

/** Crop one normalized box from an image URI. imageWidth/Height must be real pixels. */
export async function cropRegionSnapshot(
  imageUri: string,
  box: OcrNormBox,
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

  const nameEntry: { kind: OcrRegionSnapshotKind; box: OcrNormBox } = own
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
