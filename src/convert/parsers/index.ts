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

/** @deprecated use DEFAULT_PDF_ENGINE_ID (`pdf-auto`) */
export const DEFAULT_PARSER_ID = DEFAULT_PDF_ENGINE_ID;

/**
 * Legacy parserId aliases → engine id (tests / older call sites).
 * Prefer pack `parsers/pdf.json` → `engine`.
 */
const LEGACY_PARSER_TO_ENGINE: Record<string, string> = {
  'default-pdf-auto': 'pdf-auto',
  'default-pdf-list': 'pdf-list',
  'default-pdf-timesheet': 'pdf-timesheet',
  'st-elisabeth-zeitprotokoll-pdf': 'pdf-payroll',
};

const LEGACY_CONFIG: Record<string, PackPdfConfig> = {
  'pdf-auto': defaultGenericPdf as PackPdfConfig,
  'pdf-list': { ...(defaultGenericPdf as PackPdfConfig), engine: 'pdf-list' },
  'pdf-timesheet': { ...(defaultGenericPdf as PackPdfConfig), engine: 'pdf-timesheet' },
  'pdf-payroll': stElisabethPdf as PackPdfConfig,
};

function resolveEngineId(parserId: string | null | undefined): string {
  const raw = (parserId || DEFAULT_PDF_ENGINE_ID).trim();
  return LEGACY_PARSER_TO_ENGINE[raw] || raw;
}

/**
 * Resolve a parser function.
 * Pass `pdfConfig` from pack `parsers/pdf.json` when available.
 */
export function getParser(
  parserId: string | null | undefined,
  pdfConfig?: PackPdfConfig | null
): ParserFn {
  const engineId = resolveEngineId(parserId);
  const config =
    pdfConfig ||
    LEGACY_CONFIG[engineId] ||
    (engineId === 'pdf-payroll' ? (stElisabethPdf as PackPdfConfig) : (defaultGenericPdf as PackPdfConfig));
  return (text: string) => runPdfEngine(engineId, text, config);
}

export function listParserIds(): string[] {
  return [...listPdfEngineIds(), ...Object.keys(LEGACY_PARSER_TO_ENGINE)];
}

/** @deprecated engines are fixed — no runtime registration */
export function registerParser(_id: string, _fn: ParserFn): void {
  throw new Error('registerParser removed — use pack parsers/pdf.json + convert engines');
}
