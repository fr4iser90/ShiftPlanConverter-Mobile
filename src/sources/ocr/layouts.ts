/**
 * OCR roster layout profiles — structure understanding (not the OCR engine).
 *
 * User picks one concrete layout, or `auto` (detect once from OCR, then that one path).
 * Never silently try multiple parsers on failure (one-path).
 * Add/adjust profiles when real photo samples arrive — see docs/dev/ocr-camera-source.md.
 */

export type OcrLayoutStatus = 'stub' | 'experimental' | 'ready';

export type ConcreteOcrLayoutId =
  | 'raw-review'
  | 'list-protocol'
  | 'month-matrix'
  | 'week-strip';

export type OcrLayoutId = ConcreteOcrLayoutId | 'auto';

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

function trimOcr(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Builtin layouts. New AG forms = new id + postprocess/parser when samples exist.
 * `auto` is meta: detect once, then run the winning concrete layout.
 * Default = auto (detect → process).
 */
export const OCR_LAYOUTS: OcrLayoutProfile[] = [
  {
    id: 'auto',
    labelKey: 'ocrLayoutAuto',
    hintKey: 'ocrLayoutAutoHint',
    status: 'experimental',
    postprocess: trimOcr,
  },
  {
    id: 'month-matrix',
    labelKey: 'ocrLayoutMonth',
    hintKey: 'ocrLayoutMonthHint',
    status: 'experimental',
    postprocess: trimOcr,
  },
  {
    id: 'raw-review',
    labelKey: 'ocrLayoutRaw',
    hintKey: 'ocrLayoutRawHint',
    status: 'ready',
    postprocess: trimOcr,
  },
  {
    id: 'list-protocol',
    labelKey: 'ocrLayoutList',
    hintKey: 'ocrLayoutListHint',
    status: 'stub',
    postprocess: trimOcr,
  },
  {
    id: 'week-strip',
    labelKey: 'ocrLayoutWeek',
    hintKey: 'ocrLayoutWeekHint',
    status: 'stub',
    postprocess: trimOcr,
  },
];

const BY_ID: Record<string, OcrLayoutProfile> = Object.fromEntries(
  OCR_LAYOUTS.map((l) => [l.id, l])
);

export const DEFAULT_OCR_LAYOUT_ID: OcrLayoutId = 'auto';

export function isAutoOcrLayout(id: string | null | undefined): boolean {
  return String(id || '').trim() === 'auto';
}

export function isConcreteOcrLayout(id: string | null | undefined): id is ConcreteOcrLayoutId {
  const v = String(id || '').trim();
  return v === 'raw-review' || v === 'list-protocol' || v === 'month-matrix' || v === 'week-strip';
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
  const concrete = isAutoOcrLayout(layoutId) ? 'raw-review' : layoutId;
  const layout = getOcrLayout(concrete) || requireOcrLayout('raw-review');
  return layout.postprocess ? layout.postprocess(ocrText) : trimOcr(ocrText);
}
