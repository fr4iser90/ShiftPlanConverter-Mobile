import { parseTimeSheet } from './convert';
import { parseStElisabeth } from './parser-st-elisabeth';
import type { ConvertResult, HospitalMapping, ShiftEntry } from './types';
import { getBuiltinMapping } from '../packs';

export type ConvertOptions = {
  preset?: string;
  mapping?: HospitalMapping;
  userMappings?: Record<string, string>;
};

/**
 * Apply user overrides for missing time keys (⚠️ HH:MM-HH:MM → code).
 */
export function applyUserMappings(
  entries: ShiftEntry[],
  userMappings: Record<string, string>
): ShiftEntry[] {
  if (!userMappings || !Object.keys(userMappings).length) return entries;
  return entries.map((e) => {
    if (e.allDay || !e.start || !e.end) return e;
    const key = `${e.start}-${e.end}`;
    const code = userMappings[key];
    if (!code) return e;
    if (e.type.startsWith('⚠️') || e.type.includes(key)) {
      return { ...e, type: code, isValidated: false };
    }
    return e;
  });
}

export function convertPdfText(pdfText: string, options: ConvertOptions = {}): ConvertResult {
  const preset = options.preset || 'Anästhesie';
  const mapping = options.mapping || getBuiltinMapping();
  const result = parseTimeSheet(
    pdfText,
    'pflege',
    'op-bereich',
    preset,
    mapping,
    parseStElisabeth
  );
  if (options.userMappings) {
    result.entries = applyUserMappings(result.entries, options.userMappings);
  }
  return result;
}

export function findMissingTimeKeys(entries: ShiftEntry[]): string[] {
  const keys = new Set<string>();
  for (const e of entries) {
    if (e.allDay) continue;
    if (typeof e.type === 'string' && e.type.startsWith('⚠️') && e.start && e.end) {
      keys.add(`${e.start}-${e.end}`);
    }
  }
  return [...keys].sort();
}
