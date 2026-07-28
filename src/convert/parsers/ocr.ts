/**
 * OCR engine registry: pack `ocr.engine` → shared implementation.
 * Packs declare engine + options in JSON only (`parsers/ocr.json`).
 */
import {
  OCR_ROSTER_ENGINE_ID,
  ocrRosterEngine,
  type OcrRosterEngine,
} from './ocr/rosterEngine';

export { OCR_ROSTER_ENGINE_ID };
export type { OcrRosterEngine };
export type { CellInkHint, PackFingerprint } from './ocr/applyPackMapping';

/** @deprecated alias — use OcrRosterEngine */
export type OcrRosterParser = OcrRosterEngine;

const ENGINES: Record<string, OcrRosterEngine> = {
  [OCR_ROSTER_ENGINE_ID]: ocrRosterEngine,
};

/** Fallback when pack omits `ocr.engine`. */
export const DEFAULT_OCR_ENGINE_ID = OCR_ROSTER_ENGINE_ID;

/** @deprecated use DEFAULT_OCR_ENGINE_ID */
export const DEFAULT_OCR_PARSER_ID = DEFAULT_OCR_ENGINE_ID;

export function getOcrEngine(engineId: string | null | undefined): OcrRosterEngine {
  const id = (engineId || DEFAULT_OCR_ENGINE_ID).trim();
  const engine = ENGINES[id];
  if (!engine) {
    throw new Error(`Unknown OCR engine: ${id}`);
  }
  return engine;
}

/** @deprecated use getOcrEngine */
export function getOcrParser(parserId: string | null | undefined): OcrRosterEngine {
  return getOcrEngine(parserId);
}

export function listOcrEngineIds(): string[] {
  return Object.keys(ENGINES);
}

/** @deprecated use listOcrEngineIds */
export function listOcrParserIds(): string[] {
  return listOcrEngineIds();
}
