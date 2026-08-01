/**
 * Normalized highlight boxes for OCR photo overlay (snapshot review).
 * pageWidth/pageHeight must be the **full image** size (same space as ML Kit boxes).
 *
 * Layout-specific geometry lives under `layouts/<id>/overlays.ts`.
 */
import { estimateDateDutyHighlightOverlays } from './layouts/date-duty';
import { estimateMonthMatrixHighlightOverlays } from './layouts/month-matrix';
import type { MonthMatrixGrid } from './layouts/month-matrix/types';
import type { OcrHighlightBox } from './layouts/overlayGeom';

export type {
  OcrHighlightBox,
  OcrHighlightKind,
  OcrNormBox,
} from './layouts/overlayGeom';
export {
  bandEdgeAtX,
  headerYAtX,
  nameColRightAtY,
  rowHeightPx,
} from './layouts/overlayGeom';

/**
 * Build all overlay boxes. Crops still use estimateRegionBoxes AABB separately.
 */
export function estimateHighlightOverlays(
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  matchedName?: string | null
): OcrHighlightBox[] {
  if (!grid.ok || !pageWidth || !pageHeight) return [];
  if (grid.overlayLayout === 'date-duty') {
    return estimateDateDutyHighlightOverlays(grid, pageWidth, pageHeight, matchedName);
  }
  return estimateMonthMatrixHighlightOverlays(grid, pageWidth, pageHeight, matchedName);
}
