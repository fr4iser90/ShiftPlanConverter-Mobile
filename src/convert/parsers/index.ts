import type { ParseResult } from '../types';
import {
  DEFAULT_PDF_ENGINE_ID,
  listPdfEngineIds,
  parsePdfAuto,
  parsePdfList,
  parsePdfPayroll,
  parsePdfTimesheet,
  runPdfEngine,
  type PackPdfConfig,
} from './engines';
import defaultGenericPdf from '../../packs/builtin/default-generic/parsers/pdf.json';
import stElisabethPdf from '../../packs/builtin/st-elisabeth-leipzig/parsers/pdf.json';

export type ParserFn = (text: string) => ParseResult;

export type { PackPdfConfig };
export {
  DEFAULT_PDF_ENGINE_ID,
  listPdfEngineIds,
  parsePdfAuto,
  parsePdfList,
  parsePdfPayroll,
  parsePdfTimesheet,
  runPdfEngine,
};

/** Default when pack has no `parsers/pdf.json` engine. */
export const DEFAULT_PARSER_ID = DEFAULT_PDF_ENGINE_ID;

function builtinConfigForEngine(engineId: string): PackPdfConfig {
  if (engineId === 'pdf-payroll') return stElisabethPdf as PackPdfConfig;
  if (engineId === 'pdf-list') {
    return { ...(defaultGenericPdf as PackPdfConfig), engine: 'pdf-list' };
  }
  if (engineId === 'pdf-timesheet') {
    return { ...(defaultGenericPdf as PackPdfConfig), engine: 'pdf-timesheet' };
  }
  return defaultGenericPdf as PackPdfConfig;
}

/**
 * Resolve a parser function.
 * Pass `pdfConfig` from pack `parsers/pdf.json` when available.
 */
export function getParser(
  engineId: string | null | undefined,
  pdfConfig?: PackPdfConfig | null
): ParserFn {
  const id = (engineId || DEFAULT_PDF_ENGINE_ID).trim() || DEFAULT_PDF_ENGINE_ID;
  const config = pdfConfig || builtinConfigForEngine(id);
  return (text: string) => runPdfEngine(id, text, config);
}

export function listParserIds(): string[] {
  return listPdfEngineIds();
}
