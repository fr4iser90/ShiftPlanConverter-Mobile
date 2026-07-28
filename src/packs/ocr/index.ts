/**
 * Re-export shared OCR mapping engine (lives under convert/parsers/ocr/).
 * Packs select the engine via `parsers/ocr.json` — no pack-local OCR TypeScript.
 */
export {
  applyPackMappingToCell,
  applyPackMappingToGrid,
  canonicalizePackCode,
  collectPackCodes,
  listPackFingerprints,
  refineAllPersonRowsFromOcr,
  refinePersonRowFromOcr,
  type CellInkHint,
  type PackFingerprint,
} from '@/src/convert/parsers/ocr/applyPackMapping';
