import { parseTimeSheet } from './convert';
import { getParser, DEFAULT_PARSER_ID, type PackPdfConfig } from './parsers';
import { resolveShiftMapping } from './shiftMapping';
import type { ConvertResult, PackMapping, ShiftEntry } from './types';
import { getBuiltinMapping } from '../packs';

export type ConvertOptions = {
  preset?: string;
  mapping?: PackMapping;
  userMappings?: Record<string, string>;
  /** PDF engine id — see `src/convert/parsers/engines`. */
  engineId?: string;
  /** Pack `parsers/pdf.json` (match params). */
  pdfConfig?: PackPdfConfig | null;
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

/**
 * Re-resolve already stored entries that still show ⚠️ times
 * (e.g. early leave → same-start code like F).
 */
export function resolveStoredEntries(
  entries: ShiftEntry[],
  options: ConvertOptions = {}
): ShiftEntry[] {
  const preset = options.preset || 'Anästhesie';
  const packMapping = options.mapping || getBuiltinMapping();
  const mapping =
    (packMapping.presets && packMapping.presets[preset]) || {};

  const resolved = entries.map((e) => {
    if (e.allDay || !e.start || !e.end) return e;
    if (!(typeof e.type === 'string' && e.type.startsWith('⚠️'))) return e;
    const hit = resolveShiftMapping(e.start, e.end, mapping);
    if (!hit.code) return e;
    return { ...e, type: hit.code, isValidated: false };
  });
  return options.userMappings
    ? applyUserMappings(resolved, options.userMappings)
    : resolved;
}

/** Convert Zeitprotokoll-style PDF text via pack parser. */
export function convertPdfText(pdfText: string, options: ConvertOptions = {}): ConvertResult {
  return convertRawText(pdfText, options);
}

/** Same as convertPdfText — explicit name for non-PDF text paths. */
export function convertRawText(rawText: string, options: ConvertOptions = {}): ConvertResult {
  const preset = options.preset || 'Anästhesie';
  const mapping = options.mapping || getBuiltinMapping();
  const parser = getParser(options.engineId || DEFAULT_PARSER_ID, options.pdfConfig);
  const result = parseTimeSheet(
    rawText,
    'pflege',
    'op-bereich',
    preset,
    mapping,
    parser
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
