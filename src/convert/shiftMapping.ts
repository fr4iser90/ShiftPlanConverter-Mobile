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

/**
 * Resolve a shift code for an Ist-Zeit range.
 *
 * Exact mapping wins. Otherwise: same start time → nearest planned end
 * (prefer planned end ≥ actual end = earlier gehen still gets F/F1/…).
 * Truly unknown starts stay unmapped (code null).
 */
export function resolveShiftMapping(
  start: string,
  end: string,
  mapping: Record<string, MappingValue>
): ResolvedShiftMapping {
  const exactKey = `${start}-${end}`;
  const exact = mappingCode(mapping[exactKey]);
  if (exact.code) {
    return { code: exact.code, isValidated: exact.isValidated, inferred: false };
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
