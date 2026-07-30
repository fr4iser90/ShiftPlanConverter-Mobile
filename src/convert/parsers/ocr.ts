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

const ENGINES: Record<string, OcrRosterEngine> = {
  [OCR_ROSTER_ENGINE_ID]: ocrRosterEngine,
};

/** Fallback when pack omits `ocr.engine`. */
export const DEFAULT_OCR_ENGINE_ID = OCR_ROSTER_ENGINE_ID;

export function getOcrEngine(engineId: string | null | undefined): OcrRosterEngine {
  const id = (engineId || DEFAULT_OCR_ENGINE_ID).trim();
  const engine = ENGINES[id];
  if (!engine) {
    throw new Error(`Unknown OCR engine: ${id}`);
  }
  return engine;
}

export function listOcrEngineIds(): string[] {
  return Object.keys(ENGINES);
}
