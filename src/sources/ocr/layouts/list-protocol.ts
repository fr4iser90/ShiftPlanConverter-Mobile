/**
 * List / protocol — line-based Zeitprotokoll (date · code · start–end).
 */
import type { OcrLayoutProfile } from './types';
import { trimOcr } from './types';

const DATE_LINE =
  /\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b.*(?:\b\d{1,2}:\d{2}\b|\b[A-ZÄÖÜ]{1,5}\b)/i;

export const LIST_PROTOCOL_LAYOUT: OcrLayoutProfile = {
  id: 'list-protocol',
  labelKey: 'ocrLayoutList',
  hintKey: 'ocrLayoutListHint',
  status: 'stub',
  postprocess: trimOcr,
};

export function scoreListProtocol(text: string): number {
  const lines = String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return 0;
  let hits = 0;
  for (const line of lines) {
    if (DATE_LINE.test(line)) hits += 1;
  }
  if (hits < 2) return hits === 1 ? 0.2 : 0;
  return Math.min(1, 0.35 + hits / 12);
}
