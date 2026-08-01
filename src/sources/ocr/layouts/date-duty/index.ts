/**
 * Date × duties — dates as rows, duty columns across, names in cells.
 * Pack supplies column vocabulary via `dateDuty`.
 */
import type { PackDateDutyConfig } from '@/src/packs/types';
import type { OcrLine } from '../../recognize';
import type { OcrLayoutProfile } from '../types';
import { trimOcr } from '../types';
import type { MonthMatrixGrid } from '../month-matrix/types';
import {
  buildDateDutyFromLines,
  dateDutyToPersonDayGrid,
  scoreDateDuty,
} from './build';

export const DATE_DUTY_LAYOUT: OcrLayoutProfile = {
  id: 'date-duty',
  labelKey: 'ocrLayoutDateDuty',
  hintKey: 'ocrLayoutDateDutyHint',
  status: 'experimental',
  postprocess: trimOcr,
};

export { scoreDateDuty };
export {
  buildDateDutyFromLines,
  dateDutyToPersonDayGrid,
} from './build';
export { estimateDateDutyHighlightOverlays } from './overlays';
export {
  estimateDateDutyOwnNameBox,
  estimateDateDutyRegionBoxes,
} from './regionBoxes';

export function buildDateDutyGrid(
  lines: OcrLine[],
  pageWidth: number,
  opts?: { pageHeight?: number; dateDuty?: PackDateDutyConfig | null }
): MonthMatrixGrid {
  const built = buildDateDutyFromLines(lines, pageWidth, {
    pageHeight: opts?.pageHeight,
    dateDuty: opts?.dateDuty,
  });
  return dateDutyToPersonDayGrid(built);
}
