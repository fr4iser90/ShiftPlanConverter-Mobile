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
  type RunPdfEngineOpts,
} from './engines';
import { PACK_REGISTRY } from '../../packs/registry.generated';

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

const DEFAULT_GENERIC_PDF: PackPdfConfig =
  (PACK_REGISTRY.find((p) => p.id === 'default-generic')?.pdf as PackPdfConfig) || {
    engine: DEFAULT_PDF_ENGINE_ID,
  };

function fallbackPdfConfig(engineId: string): PackPdfConfig {
  if (engineId === 'pdf-list' || engineId === 'pdf-timesheet') {
    return { ...DEFAULT_GENERIC_PDF, engine: engineId };
  }
  return DEFAULT_GENERIC_PDF;
}

/**
 * Resolve a parser function.
 * Pass `pdfConfig` from pack `parsers/pdf.json` when available.
 */
export function getParser(
  engineId: string | null | undefined,
  pdfConfig?: PackPdfConfig | null,
  engineOpts?: RunPdfEngineOpts
): ParserFn {
  const id = (engineId || DEFAULT_PDF_ENGINE_ID).trim() || DEFAULT_PDF_ENGINE_ID;
  const config = pdfConfig || fallbackPdfConfig(id);
  return (text: string) => runPdfEngine(id, text, config, engineOpts);
}

export function listParserIds(): string[] {
  return listPdfEngineIds();
}
