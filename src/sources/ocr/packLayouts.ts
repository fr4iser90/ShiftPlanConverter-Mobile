/**
 * Pack OCR layout allow-list helpers.
 */
import type { PackOcrConfig } from '@/src/packs';
import {
  CONCRETE_OCR_LAYOUTS,
  isConcreteOcrLayout,
  listOcrLayouts,
  type ConcreteOcrLayoutId,
  type OcrLayoutId,
  type OcrLayoutProfile,
} from '@/src/sources/ocr/layouts';

/** Concrete layout ids declared by pack (empty → all non-stub concretes + experimental). */
export function packAllowedConcreteLayouts(
  ocr: PackOcrConfig | null | undefined
): ConcreteOcrLayoutId[] {
  const raw = ocr?.layouts?.map((s) => String(s || '').trim()).filter(Boolean) || [];
  const fromPack = raw.filter((id): id is ConcreteOcrLayoutId => isConcreteOcrLayout(id));
  if (fromPack.length) return fromPack;
  return CONCRETE_OCR_LAYOUTS.filter((l) => l.status !== 'stub').map((l) => l.id as ConcreteOcrLayoutId);
}

export function packPreferredLayoutId(
  ocr: PackOcrConfig | null | undefined
): OcrLayoutId | null {
  const pref = ocr?.preferredLayout?.trim();
  if (!pref) return null;
  if (pref === 'auto') return 'auto';
  if (isConcreteOcrLayout(pref)) return pref;
  return null;
}

/**
 * Import chips: hidden when pack prefers auto (unless `showLayoutChips: true`).
 * Settings / uncertainty modal can still pick a concrete layout.
 */
export function packShowsLayoutChips(ocr: PackOcrConfig | null | undefined): boolean {
  if (ocr?.showLayoutChips === true) return true;
  if (ocr?.showLayoutChips === false) return false;
  return packPreferredLayoutId(ocr) !== 'auto';
}

/** Chip list for Fetch: auto + pack-allowed (hide stubs unless selected). */
export function listOcrLayoutsForPack(
  ocr: PackOcrConfig | null | undefined,
  selectedId?: string | null
): OcrLayoutProfile[] {
  const allowed = new Set(packAllowedConcreteLayouts(ocr));
  return listOcrLayouts().filter((l) => {
    if (l.id === 'auto') return true;
    if (l.id === selectedId) return true;
    if (l.status === 'stub') return false;
    return allowed.has(l.id as ConcreteOcrLayoutId);
  });
}
