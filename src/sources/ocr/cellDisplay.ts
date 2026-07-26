/**
 * How OCR matrix cells are shown in the Foto↔OCR compare table.
 * Mapping still uses the pack; this only controls display.
 */
import { mappingCode } from '../../convert/shiftMapping';
import type { MappingValue } from '../../convert/types';
import {
  applyPackMappingToCell,
  collectPackCodes,
} from './applyPackMapping';

export type OcrCellDisplayMode = 'codes' | 'times' | 'both';

const TIME_RANGE_RE = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

/** First pack time key for a code (Anzeige „Zeiten“). */
export function packTimeForCode(
  code: string,
  presetMapping: Record<string, MappingValue> | null | undefined
): string | null {
  if (!presetMapping || !code) return null;
  const want = code.trim().toUpperCase();
  for (const [key, value] of Object.entries(presetMapping)) {
    if (key.startsWith('SPECIAL:')) continue;
    if (!TIME_RANGE_RE.test(key)) continue;
    const { code: c } = mappingCode(value);
    if (c && c.trim().toUpperCase() === want) return key;
  }
  return null;
}

export function formatOcrCellForDisplay(
  raw: string,
  mode: OcrCellDisplayMode,
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null
): string {
  const t = String(raw || '').trim();
  if (!t) return '';

  const codes = collectPackCodes(presetMapping, colors);
  const mapped = applyPackMappingToCell(t, presetMapping, codes);
  const asCode = mapped && codes.has(mapped.toUpperCase()) ? mapped.toUpperCase() : null;
  const asTime = TIME_RANGE_RE.test(t)
    ? t
    : asCode
      ? packTimeForCode(asCode, presetMapping)
      : TIME_RANGE_RE.test(mapped)
        ? mapped
        : null;

  if (mode === 'codes') return asCode || '';
  if (mode === 'times') return asTime || '';
  // both: prefer "F" or "F·07:35-15:50" when pack knows the time
  if (asCode && asTime) return `${asCode}·${asTime}`;
  return asCode || asTime || '';
}
