/**
 * Shared OCR roster engine — pack JSON only selects this engine + mapping.
 * Match targets / codes come from pack mapping JSON, not from this module.
 */
import type { MappingValue } from '@/src/convert/types';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix/types';
import type { OcrLine } from '@/src/sources/ocr/recognize';
import {
  applyPackMappingToCell,
  applyPackMappingToGrid,
  canonicalizePackCode,
  collectPackCodes,
  listPackFingerprints,
  refineAllPersonRowsFromOcr,
  refinePersonRowFromOcr,
  type CellInkHint,
  type PackFingerprint,
} from './applyPackMapping';

/** Stable engine id referenced by pack `parsers/ocr.json` → `engine`. */
export const OCR_ROSTER_ENGINE_ID = 'ocr-roster';

export type OcrRosterEngine = {
  id: typeof OCR_ROSTER_ENGINE_ID;
  mapCell: (
    raw: string,
    presetMapping: Record<string, MappingValue> | null | undefined,
    knownCodes?: Set<string>,
    codeAliases?: Record<string, string> | null
  ) => string;
  mapGrid: (
    grid: MonthMatrixGrid,
    presetMapping: Record<string, MappingValue> | null | undefined,
    colors?: Record<string, string> | null,
    codeAliases?: Record<string, string> | null
  ) => MonthMatrixGrid;
  collectPackCodes: (
    presetMapping: Record<string, MappingValue> | null | undefined,
    colors?: Record<string, string> | null,
    codeAliases?: Record<string, string> | null
  ) => Set<string>;
  canonicalizePackCode: (code: string, codeAliases?: Record<string, string> | null) => string;
  listPackFingerprints: (
    presetMapping: Record<string, MappingValue> | null | undefined
  ) => PackFingerprint[];
  refinePersonRowFromOcr: (
    grid: MonthMatrixGrid,
    personName: string,
    lines: OcrLine[],
    presetMapping: Record<string, MappingValue> | null | undefined,
    colors?: Record<string, string> | null,
    codeAliases?: Record<string, string> | null
  ) => MonthMatrixGrid;
  refineAllPersonRowsFromOcr: (
    grid: MonthMatrixGrid,
    lines: OcrLine[],
    presetMapping: Record<string, MappingValue> | null | undefined,
    colors?: Record<string, string> | null,
    inkHints?: CellInkHint[][] | null,
    codeAliases?: Record<string, string> | null
  ) => MonthMatrixGrid;
};

export const ocrRosterEngine: OcrRosterEngine = {
  id: OCR_ROSTER_ENGINE_ID,
  mapCell: applyPackMappingToCell,
  mapGrid: applyPackMappingToGrid,
  collectPackCodes,
  canonicalizePackCode,
  listPackFingerprints,
  refinePersonRowFromOcr,
  refineAllPersonRowsFromOcr,
};
