import type { ParseResult } from '../../types';
import type { PackPdfConfig } from './types';
import { parsePdfList, scoreListLayout } from './pdf-list';
import { parsePdfTimesheet, scoreTimesheetLayout } from './pdf-timesheet';

export const PDF_AUTO_ENGINE_ID = 'pdf-auto' as const;

/**
 * Pick one conservative generic PDF profile — no retry chain.
 */
export function parsePdfAuto(text: string, config?: PackPdfConfig | null): ParseResult {
  const listScore = scoreListLayout(text, config);
  const tsScore = scoreTimesheetLayout(text, config);
  if (tsScore >= 5 && tsScore > listScore) {
    const ts = parsePdfTimesheet(text, config);
    if (ts.mainEntries.length) return ts;
  }
  const list = parsePdfList(text, config);
  if (list.mainEntries.length) return list;
  if (tsScore >= 3) {
    const ts = parsePdfTimesheet(text, config);
    if (ts.mainEntries.length) return ts;
  }
  return list;
}
