/**
 * OCR roster layout registry — structure understanding (not the OCR engine).
 *
 * User picks one concrete layout, or `auto` (detect once from OCR, then that one path).
 * Never silently try multiple parsers on failure (one-path).
 *
 * - `auto` = detection meta, not a layout
 * - text-only = fallback/debug when structure is unclear — not a layout (see types)
 * Each concrete layout lives in its own file under this folder.
 */
import { DAY_PLAN_LAYOUT } from './day-plan';
import { LIST_PROTOCOL_LAYOUT } from './list-protocol';
import { MONTH_MATRIX_LAYOUT } from './month-matrix';
import { SINGLE_CALENDAR_LAYOUT } from './single-calendar';
import {
  OCR_TEXT_ONLY_FALLBACK,
  trimOcr,
  type ConcreteOcrLayoutId,
  type OcrLayoutId,
  type OcrLayoutProfile,
  type OcrLayoutStatus,
  type OcrTextOnlyFallbackId,
} from './types';
import { WEEK_STRIP_LAYOUT } from './week-strip';

export type {
  ConcreteOcrLayoutId,
  OcrLayoutId,
  OcrLayoutProfile,
  OcrLayoutStatus,
  OcrTextOnlyFallbackId,
};
export { OCR_TEXT_ONLY_FALLBACK, trimOcr };

const AUTO_LAYOUT: OcrLayoutProfile = {
  id: 'auto',
  labelKey: 'ocrLayoutAuto',
  hintKey: 'ocrLayoutAutoHint',
  status: 'experimental',
  postprocess: trimOcr,
};

/** Concrete layouts only (no auto, no text-only). */
export const CONCRETE_OCR_LAYOUTS: OcrLayoutProfile[] = [
  MONTH_MATRIX_LAYOUT,
  WEEK_STRIP_LAYOUT,
  LIST_PROTOCOL_LAYOUT,
  DAY_PLAN_LAYOUT,
  SINGLE_CALENDAR_LAYOUT,
];

/**
 * Builtin chip list: auto first, then concrete layouts.
 * Text-only is not listed — it is fallback/debug only.
 */
export const OCR_LAYOUTS: OcrLayoutProfile[] = [AUTO_LAYOUT, ...CONCRETE_OCR_LAYOUTS];

const BY_ID: Record<string, OcrLayoutProfile> = Object.fromEntries(
  OCR_LAYOUTS.map((l) => [l.id, l])
);

export const DEFAULT_OCR_LAYOUT_ID: OcrLayoutId = 'auto';

export function isAutoOcrLayout(id: string | null | undefined): boolean {
  return String(id || '').trim() === 'auto';
}

export function isConcreteOcrLayout(id: string | null | undefined): id is ConcreteOcrLayoutId {
  const v = String(id || '').trim();
  return CONCRETE_OCR_LAYOUTS.some((l) => l.id === v);
}

export function isOcrTextOnlyFallback(id: string | null | undefined): boolean {
  return String(id || '').trim() === OCR_TEXT_ONLY_FALLBACK;
}

export function listOcrLayouts(): OcrLayoutProfile[] {
  return OCR_LAYOUTS.slice();
}

export function getOcrLayout(id: string | null | undefined): OcrLayoutProfile | null {
  if (!id) return null;
  return BY_ID[id] || null;
}

export function requireOcrLayout(id: string): OcrLayoutProfile {
  const l = getOcrLayout(id);
  if (!l) throw new Error(`Unknown OCR layout: ${id}`);
  return l;
}

/** Apply layout postprocess (stubs = trim only until samples land). */
export function applyOcrLayoutPostprocess(layoutId: string, ocrText: string): string {
  if (isAutoOcrLayout(layoutId) || isOcrTextOnlyFallback(layoutId) || layoutId === 'raw-review') {
    return trimOcr(ocrText);
  }
  const layout = getOcrLayout(layoutId);
  return layout?.postprocess ? layout.postprocess(ocrText) : trimOcr(ocrText);
}
