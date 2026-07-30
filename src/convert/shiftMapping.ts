import type { MappingValue } from './types';

export function mappingCode(value: MappingValue | undefined): {
  code: string | null;
  isValidated: boolean;
} {
  if (!value) return { code: null, isValidated: false };
  if (typeof value === 'object') {
    return { code: value.code, isValidated: !!value.isValidated };
  }
  return { code: value, isValidated: false };
}

export function mappingType(value: MappingValue | undefined): string | null {
  if (!value || typeof value !== 'object') return null;
  const t = String(value.type || '').trim().toLowerCase();
  return t || null;
}

export function mappingAlso(value: MappingValue | undefined): string[] {
  if (!value || typeof value !== 'object' || !Array.isArray(value.also)) return [];
  return value.also.map((c) => String(c || '').trim()).filter(Boolean);
}

/** Resolve semantic type for a calendar/OCR code from the pack preset. */
export function shiftTypeForCode(
  code: string,
  mapping: Record<string, MappingValue>,
  codeAliases?: Record<string, string> | null
): string | null {
  let u = String(code || '')
    .trim()
    .toUpperCase();
  if (!u) return null;
  if (codeAliases) {
    for (const [from, to] of Object.entries(codeAliases)) {
      if (from.toUpperCase() === u) {
        u = String(to || '')
          .trim()
          .toUpperCase() || u;
        break;
      }
    }
  }
  for (const value of Object.values(mapping)) {
    if (typeof value !== 'object') continue;
    const primary = String(value.code || '')
      .trim()
      .toUpperCase();
    if (primary === u) return mappingType(value);
    for (const a of mappingAlso(value)) {
      if (a.toUpperCase() === u) return mappingType(value);
    }
  }
  return null;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function parseRangeKey(key: string): { start: string; end: string } | null {
  const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(key);
  if (!m) return null;
  return { start: m[1], end: m[2] };
}

export type ResolvedShiftMapping = {
  code: string | null;
  /** Exact mapping hit with isValidated from pack */
  isValidated: boolean;
  /**
   * True when no exact start-end key existed; code was taken from another
   * mapping with the same start (typical: left early / stayed a bit longer).
   */
  inferred: boolean;
};

export type ResolveShiftMappingOpts = {
  /**
   * When true (default): Loga Ist-Zeiten may map to the nearest planned end
   * with the same start (early leave still → F).
   * When false: OCR / wall-plan — exact start-end keys only (no inference).
   */
  allowInfer?: boolean;
};

/**
 * Resolve a shift code for an Ist-Zeit range.
 *
 * Exact mapping wins. Otherwise (if allowInfer): same start time → nearest planned end
 * (prefer planned end ≥ actual end = earlier gehen still gets F/F1/…).
 * Truly unknown starts stay unmapped (code null).
 */
export function resolveShiftMapping(
  start: string,
  end: string,
  mapping: Record<string, MappingValue>,
  opts?: ResolveShiftMappingOpts
): ResolvedShiftMapping {
  const exactKey = `${start}-${end}`;
  const exact = mappingCode(mapping[exactKey]);
  if (exact.code) {
    return { code: exact.code, isValidated: exact.isValidated, inferred: false };
  }

  if (opts?.allowInfer === false) {
    return { code: null, isValidated: false, inferred: false };
  }

  type Cand = { code: string; endMin: number };
  const cands: Cand[] = [];
  for (const [key, value] of Object.entries(mapping)) {
    if (key.startsWith('SPECIAL:')) continue;
    const range = parseRangeKey(key);
    if (!range || range.start !== start) continue;
    const { code } = mappingCode(value);
    if (!code) continue;
    cands.push({ code, endMin: minutes(range.end) });
  }
  if (!cands.length) {
    return { code: null, isValidated: false, inferred: false };
  }

  const actualEnd = minutes(end);
  // Early leave / on-time: prefer planned end still covering actual end
  const covering = cands.filter((c) => c.endMin >= actualEnd);
  const pool = covering.length ? covering : cands;
  pool.sort((a, b) => Math.abs(a.endMin - actualEnd) - Math.abs(b.endMin - actualEnd));
  return { code: pool[0].code, isValidated: false, inferred: true };
}
