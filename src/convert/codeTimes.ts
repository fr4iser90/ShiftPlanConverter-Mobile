import type { MappingValue, PackComposeRule, PackMapping } from './types';
import { mappingAlso, mappingCode } from './shiftMapping';

export type CodeTimeRange = {
  start: string;
  end: string;
  /** Primary preset code for this window (may differ from printed code when also[]). */
  primaryCode: string;
};

/**
 * Reverse-lookup HH:MM–HH:MM for a printed duty code from the pack preset
 * (matches primary `code` or any `also` entry).
 */
export function timeRangeForCode(
  code: string,
  preset: Record<string, MappingValue> | null | undefined
): CodeTimeRange | null {
  const u = String(code || '')
    .trim()
    .toUpperCase();
  if (!u || !preset) return null;
  for (const [key, value] of Object.entries(preset)) {
    if (key.startsWith('SPECIAL:')) continue;
    const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(key);
    if (!m) continue;
    const { code: primary } = mappingCode(value);
    if (!primary) continue;
    const primaryU = primary.trim().toUpperCase();
    if (primaryU === u) {
      return { start: m[1], end: m[2], primaryCode: primaryU };
    }
    for (const a of mappingAlso(value)) {
      if (a.toUpperCase() === u) {
        return { start: m[1], end: m[2], primaryCode: primaryU };
      }
    }
  }
  return null;
}

export function isSpecialPackCode(
  code: string,
  preset: Record<string, MappingValue> | null | undefined
): boolean {
  const u = String(code || '')
    .trim()
    .toUpperCase();
  if (!u || !preset) return false;
  if (u === '/' || u === '//') return true;
  for (const [key, value] of Object.entries(preset)) {
    if (!key.startsWith('SPECIAL:')) continue;
    const { code: c } = mappingCode(value);
    if (c && c.trim().toUpperCase() === u) return true;
  }
  return false;
}

/** True when `code` is a known preset / SPECIAL / also code. */
export function isKnownPackCode(
  code: string,
  mapping: PackMapping | null | undefined,
  presetName: string
): boolean {
  const u = String(code || '')
    .trim()
    .toUpperCase();
  if (!u || !mapping) return false;
  if (mapping.colors && Object.keys(mapping.colors).some((k) => k.toUpperCase() === u)) {
    return true;
  }
  if (mapping.codeAliases) {
    for (const [from, to] of Object.entries(mapping.codeAliases)) {
      if (from.toUpperCase() === u || String(to || '').toUpperCase() === u) return true;
    }
  }
  const preset = mapping.presets?.[presetName];
  if (!preset) return false;
  if (isSpecialPackCode(u, preset)) return true;
  return timeRangeForCode(u, preset) != null;
}

export function composeRulesForMapping(mapping: PackMapping | null | undefined): PackComposeRule[] {
  return Array.isArray(mapping?.composeRules) ? mapping!.composeRules! : [];
}

/**
 * Same-day overflow cells in multi-person code-grid PDFs (codes printed under
 * the primary cell). Derived from pack `composeRules`: for `codes: [A, B, C]`,
 * B/C may attach to a day that already has A. `nextDayCodes` are not overflow.
 */
export function overflowAttachFromComposeRules(
  rules: PackComposeRule[] | null | undefined
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!rules?.length) return out;
  for (const rule of rules) {
    const codes = (rule.codes || []).map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);
    if (codes.length < 2) continue;
    const head = codes[0];
    const rest = codes.slice(1);
    const prev = out[head] || [];
    out[head] = [...new Set([...prev, ...rest])];
  }
  return out;
}
