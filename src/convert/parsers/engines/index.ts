import type { PackMapping, ParseResult } from '../../types';
import { parsePdfAuto, PDF_AUTO_ENGINE_ID } from './pdf-auto';
import {
  looksLikeCodeGrid,
  parsePdfCodeGrid,
  PDF_CODE_GRID_ENGINE_ID,
} from './pdf-code-grid';
import { parsePdfList, PDF_LIST_ENGINE_ID } from './pdf-list';
import { parsePdfPayroll, PDF_PAYROLL_ENGINE_ID } from './pdf-payroll';
import { parsePdfTimesheet, PDF_TIMESHEET_ENGINE_ID } from './pdf-timesheet';
import type { PackPdfConfig, PdfEngineId } from './types';

export type { PackPdfConfig, PdfEngineId } from './types';
export {
  PDF_AUTO_ENGINE_ID,
  PDF_LIST_ENGINE_ID,
  PDF_TIMESHEET_ENGINE_ID,
  PDF_PAYROLL_ENGINE_ID,
  PDF_CODE_GRID_ENGINE_ID,
};
export { parsePdfAuto, parsePdfList, parsePdfTimesheet, parsePdfPayroll, parsePdfCodeGrid };
export { looksLikeCodeGrid } from './pdf-code-grid';
export { scoreListLayout } from './pdf-list';
export { scoreTimesheetLayout } from './pdf-timesheet';

export const DEFAULT_PDF_ENGINE_ID: PdfEngineId = PDF_AUTO_ENGINE_ID;

export type RunPdfEngineOpts = {
  mapping?: PackMapping | null;
  preset?: string;
  personFilter?: string | null;
};

export function runPdfEngine(
  engineId: string,
  text: string,
  config?: PackPdfConfig | null,
  opts: RunPdfEngineOpts = {}
): ParseResult {
  const id = (engineId || DEFAULT_PDF_ENGINE_ID).trim() as PdfEngineId;

  // Content fork from pack.codeGrid markers (not a soft retry after payroll fail).
  if (
    (id === PDF_PAYROLL_ENGINE_ID || id === PDF_AUTO_ENGINE_ID || id === PDF_CODE_GRID_ENGINE_ID) &&
    looksLikeCodeGrid(text, config, opts.mapping, opts.preset)
  ) {
    return parsePdfCodeGrid(text, config, {
      mapping: opts.mapping,
      preset: opts.preset,
      personFilter: opts.personFilter,
    });
  }

  switch (id) {
    case PDF_LIST_ENGINE_ID:
      return parsePdfList(text, config);
    case PDF_TIMESHEET_ENGINE_ID:
      return parsePdfTimesheet(text, config);
    case PDF_PAYROLL_ENGINE_ID:
      return parsePdfPayroll(text, config);
    case PDF_CODE_GRID_ENGINE_ID:
      return parsePdfCodeGrid(text, config, {
        mapping: opts.mapping,
        preset: opts.preset,
        personFilter: opts.personFilter,
      });
    case PDF_AUTO_ENGINE_ID:
    default:
      if (id !== PDF_AUTO_ENGINE_ID && id !== DEFAULT_PDF_ENGINE_ID) {
        throw new Error(`Unknown PDF engine: ${id}`);
      }
      return parsePdfAuto(text, config);
  }
}

export function listPdfEngineIds(): string[] {
  return [
    PDF_AUTO_ENGINE_ID,
    PDF_LIST_ENGINE_ID,
    PDF_TIMESHEET_ENGINE_ID,
    PDF_PAYROLL_ENGINE_ID,
    PDF_CODE_GRID_ENGINE_ID,
  ];
}
