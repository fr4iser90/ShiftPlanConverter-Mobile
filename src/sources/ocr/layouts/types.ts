/**
 * Shared OCR layout types. Concrete layouts live in sibling files.
 * `auto` is detection meta, not a layout. Text-only is fallback/debug, not a layout.
 */

export type OcrLayoutStatus = 'stub' | 'experimental' | 'ready';

export type ConcreteOcrLayoutId =
  | 'month-matrix'
  | 'week-strip'
  | 'date-duty'
  | 'list-protocol'
  | 'day-plan'
  | 'single-calendar';

/** User chip selection: concrete layout or auto-detect. */
export type OcrLayoutId = ConcreteOcrLayoutId | 'auto';

/**
 * Run-result / status id when auto cannot pick a structure.
 * Not listed in layouts — fallback/debug (“text only”) only.
 */
export const OCR_TEXT_ONLY_FALLBACK = 'text-only' as const;
export type OcrTextOnlyFallbackId = typeof OCR_TEXT_ONLY_FALLBACK;

export type OcrLayoutProfile = {
  id: OcrLayoutId;
  /** i18n key for chip label */
  labelKey: string;
  /** i18n key for short hint under chips */
  hintKey: string;
  status: OcrLayoutStatus;
  /**
   * Optional light cleanup after OCR (whitespace only for stubs).
   * Real cell/line parsers land here later per layout.
   */
  postprocess?(ocrText: string): string;
};

/** Whitespace-only cleanup shared by stubs and text-only fallback. */
export function trimOcr(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
