/**
 * Date × duties — generic structure; pack supplies column vocabulary.
 */
import type { PackDateDutyConfig } from '@/src/packs/types';
import {
  buildDateDutyFromLines,
  dateDutyToPersonDayGrid,
  scoreDateDuty,
} from '../dateDuty/build';
import type { MonthMatrixGrid } from '../monthMatrix/types';
import type { OcrLine } from '../recognize';
import type { OcrLayoutProfile } from './types';
import { trimOcr } from './types';

export const DATE_DUTY_LAYOUT: OcrLayoutProfile = {
  id: 'date-duty',
  labelKey: 'ocrLayoutDateDuty',
  hintKey: 'ocrLayoutDateDutyHint',
  status: 'experimental',
  postprocess: trimOcr,
};

export { scoreDateDuty };

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
