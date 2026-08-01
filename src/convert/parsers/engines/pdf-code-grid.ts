/**
 * Generic person×day **code-grid** PDF layout:
 * day columns, `Lastname, Firstname` rows, optional under-cell overflow tokens.
 *
 * All employer / product markers (headers, month names, skip lines) come from
 * pack `parsers/pdf.json` → `codeGrid`. Codes / times / compose → pack mapping.
 */
import {
  composeRulesForMapping,
  isSpecialPackCode,
  overflowAttachFromComposeRules,
  timeRangeForCode,
} from '../../codeTimes';
import { mappingCode, mappingType } from '../../shiftMapping';
import {
  canonicalizePackCode,
  collectPackCodes,
} from '../ocr/applyPackMapping';
import type { MappingValue, PackComposeRule, PackComposeWhen, PackMapping, ShiftEntry } from '../../types';
import { emptyParseResult, finishParseResult, toIsoDate } from './shared';
import type { PackPdfCodeGrid, PackPdfConfig } from './types';

export const PDF_CODE_GRID_ENGINE_ID = 'pdf-code-grid' as const;

function packCodeSet(
  mapping: PackMapping | null | undefined,
  presetName?: string
): Set<string> {
  const preset =
    mapping?.presets?.[presetName || ''] ||
    (mapping?.presets ? mapping.presets[Object.keys(mapping.presets)[0]] : null);
  const codes = collectPackCodes(preset, null, mapping?.codeAliases);
  for (const rule of composeRulesForMapping(mapping)) {
    for (const c of [...(rule.codes || []), ...(rule.nextDayCodes || [])]) {
      const u = String(c || '').trim().toUpperCase();
      if (u) codes.add(u);
    }
  }
  codes.add('/');
  codes.add('//');
  codes.add('-');
  return codes;
}

function holidayCodeSet(preset: Record<string, MappingValue> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!preset) return out;
  for (const [key, value] of Object.entries(preset)) {
    if (!key.startsWith('SPECIAL:')) continue;
    const { code } = mappingCode(value);
    if (!code) continue;
    const t = mappingType(value);
    if (t === 'holiday' || /^feiertag$/i.test(String((value as { label?: string }).label || ''))) {
      out.add(code.trim().toUpperCase());
    }
  }
  return out;
}

function isPackDutyToken(
  raw: string,
  codes: Set<string>,
  codeAliases?: Record<string, string> | null
): boolean {
  const t = String(raw || '').trim();
  if (!t) return false;
  if (t === '-' || t === '/' || t === '//') return true;
  const u = t.toUpperCase();
  if (codes.has(u)) return true;
  return codes.has(canonicalizePackCode(t, codeAliases).toUpperCase());
}

function anyMatch(text: string, patterns: string[] | undefined, flags?: string): boolean {
  if (!patterns?.length) return false;
  const f = flags ?? 'i';
  return patterns.some((p) => {
    try {
      return new RegExp(p, f).test(text);
    } catch {
      return false;
    }
  });
}

function allMatch(text: string, patterns: string[] | undefined, flags?: string): boolean {
  if (!patterns?.length) return true;
  const f = flags ?? 'i';
  return patterns.every((p) => {
    try {
      return new RegExp(p, f).test(text);
    } catch {
      return false;
    }
  });
}

/** True when pack `codeGrid` says this text is a person×day code grid. */
export function looksLikeCodeGrid(
  text: string,
  config?: PackPdfConfig | null,
  mapping?: PackMapping | null,
  preset?: string
): boolean {
  const t = String(text || '');
  if (!t.trim()) return false;
  const cg = config?.codeGrid;
  if (!cg) return false;
  if (anyMatch(t, cg.rejectPatterns, cg.rejectFlags)) return false;
  if (!allMatch(t, cg.requirePatterns, cg.requireFlags)) return false;
  // Person rows: Lastname, …
  if (!/[A-Za-zÄÖÜäöüß]{2,},\s*[A-Za-zÄÖÜäöüß]/.test(t)) return false;
  if (!mapping?.presets) return false;
  const codes = packCodeSet(mapping, preset);
  const aliases = mapping.codeAliases;
  let hits = 0;
  for (const m of t.match(/\b[A-Za-z][A-Za-z0-9]{0,5}\b|\/\/|\//g) || []) {
    if (m === '-') continue;
    if (isPackDutyToken(m, codes, aliases)) hits++;
  }
  return hits >= (cg.minCodeHits ?? 10);
}

function scanMonthYear(
  text: string,
  cg: PackPdfCodeGrid | undefined
): { year: string; month: string } | null {
  const mh = cg?.monthHeader;
  if (!mh?.pattern) return null;
  let re: RegExp;
  try {
    re = new RegExp(mh.pattern, mh.flags ?? 'i');
  } catch {
    return null;
  }
  const m = re.exec(text);
  if (!m) return null;
  const mi = mh.monthGroup ?? 1;
  const yi = mh.yearGroup ?? 2;
  const rawMonth = String(m[mi] || '').trim();
  const year = String(m[yi] || '').trim();
  if (!year) return null;
  if (/^\d{1,2}$/.test(rawMonth)) {
    return { year, month: rawMonth.padStart(2, '0') };
  }
  const map = mh.monthNameMap || {};
  const key = rawMonth.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  const month = map[key] || map[rawMonth.toLowerCase()];
  if (!month) return null;
  return { year, month };
}

function normalizeCode(
  tok: string,
  codeAliases?: Record<string, string> | null
): string | null {
  const t = tok.trim();
  if (!t || t === '-') return null;
  if (t === '/' || t === '//') return t;
  return canonicalizePackCode(t, codeAliases);
}

function tokenizeDutyLine(
  line: string,
  codes: Set<string>,
  codeAliases?: Record<string, string> | null
): string[] {
  const out: string[] = [];
  for (const raw of line.trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw === '-') {
      out.push('-');
      continue;
    }
    if (raw === '//' || raw === '/') {
      out.push(raw);
      continue;
    }
    if (/\/\/$/.test(raw) && raw.length > 2) {
      const head = raw.slice(0, -2);
      if (isPackDutyToken(head, codes, codeAliases)) {
        const n = normalizeCode(head, codeAliases);
        if (n) out.push(n);
      }
      out.push('//');
      continue;
    }
    if (/\/$/.test(raw) && raw.length > 1 && !raw.endsWith('//')) {
      const head = raw.slice(0, -1);
      if (isPackDutyToken(head, codes, codeAliases)) {
        const n = normalizeCode(head, codeAliases);
        if (n) out.push(n);
      }
      out.push('/');
      continue;
    }
    if (isPackDutyToken(raw, codes, codeAliases)) {
      const n = normalizeCode(raw, codeAliases);
      if (n) out.push(n);
    }
  }
  return out;
}

type PersonDay = { name: string; days: Map<number, string[]> };

function shouldSkipLine(line: string, cg: PackPdfCodeGrid | undefined): boolean {
  if (!line.trim()) return true;
  if (/^\s*\d+\s*$/.test(line)) return true;
  return anyMatch(line, cg?.skipLinePatterns, cg?.skipLineFlags);
}

function assignCodes(person: PersonDay, codes: string[], dayCount: number): void {
  let day = 1;
  for (const c of codes) {
    while (day <= dayCount && (person.days.get(day) || []).length > 0) day++;
    if (day > dayCount) break;
    if (c === '-') {
      day++;
      continue;
    }
    const list = person.days.get(day) || [];
    list.push(c);
    person.days.set(day, list);
    day++;
  }
}

function mergeOverflow(
  person: PersonDay,
  codes: string[],
  dayCount: number,
  overflowAttach: Record<string, string[]>
): void {
  const occupied = [...person.days.entries()]
    .filter(([, v]) => v.length > 0)
    .sort((a, b) => a[0] - b[0]);
  if (!occupied.length) {
    assignCodes(person, codes, dayCount);
    return;
  }
  for (const code of codes) {
    if (code === '-') continue;
    const u = code.toUpperCase();
    let placed = false;
    for (const [d, list] of occupied) {
      const head = (list[0] || '').toUpperCase();
      const want = overflowAttach[head];
      if (!want?.includes(u)) continue;
      if (list.some((x) => x.toUpperCase() === u)) continue;
      list.push(code);
      person.days.set(d, list);
      placed = true;
      break;
    }
    if (placed) continue;
    for (let i = occupied.length - 1; i >= 0; i--) {
      const [d, list] = occupied[i];
      if (list.length === 1 && (list[0] === '/' || list[0] === '//')) continue;
      list.push(code);
      person.days.set(d, list);
      placed = true;
      break;
    }
    if (!placed) assignCodes(person, [code], dayCount);
  }
}

/** Layout text: one person per line (+ overflow lines). */
function parsePersonBlocksLayout(
  text: string,
  dayCount: number,
  codes: Set<string>,
  codeAliases: Record<string, string> | null | undefined,
  overflowAttach: Record<string, string[]>,
  cg: PackPdfCodeGrid | undefined
): PersonDay[] {
  const lines = text.split(/\r?\n/);
  const people: PersonDay[] = [];
  let current: PersonDay | null = null;
  let pendingFirst = '';
  const nameStart = /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']+),\s*(.*)$/;

  const flush = () => {
    if (current?.name) people.push(current);
    current = null;
    pendingFirst = '';
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00a0/g, ' ');
    if (shouldSkipLine(line, cg)) continue;

    const nm = nameStart.exec(line.trim());
    if (nm) {
      flush();
      const last = nm[1].trim();
      const rest = nm[2].trim();
      const firstTok = rest.split(/\s+/)[0] || '';
      const looksCode = firstTok && isPackDutyToken(firstTok, codes, codeAliases);
      let first = '';
      let dutyPart = rest;
      if (rest && !looksCode && /^[A-ZÄÖÜa-zäöü]/.test(rest)) {
        const m2 = /^([A-Za-zÄÖÜäöüß\.\-]+)\s+(.*)$/.exec(rest);
        if (m2 && !isPackDutyToken(m2[1], codes, codeAliases)) {
          first = m2[1];
          dutyPart = m2[2];
        } else if (
          !isPackDutyToken(firstTok, codes, codeAliases) &&
          tokenizeDutyLine(rest, codes, codeAliases).length === 0
        ) {
          first = rest;
          dutyPart = '';
        }
      }
      current = { name: first ? `${last}, ${first}` : `${last},`, days: new Map() };
      pendingFirst = first ? '' : 'maybe';
      assignCodes(current, tokenizeDutyLine(dutyPart, codes, codeAliases), dayCount);
      continue;
    }

    if (!current) continue;
    const trimmed = line.trim();
    if (
      pendingFirst === 'maybe' &&
      /^[A-ZÄÖÜ][a-zäöüß\-]+$/.test(trimmed) &&
      !isPackDutyToken(trimmed, codes, codeAliases)
    ) {
      current.name = current.name.replace(/,$/, `, ${trimmed}`);
      pendingFirst = '';
      continue;
    }
    const dutyCodes = tokenizeDutyLine(trimmed, codes, codeAliases);
    if (!dutyCodes.length) continue;
    mergeOverflow(current, dutyCodes, dayCount, overflowAttach);
    pendingFirst = '';
  }
  flush();
  return people;
}

/**
 * Flat Tj extract (mobile pdfText): names and codes in one stream.
 * Split on `Lastname,` then first `dayCount` tokens = main row, rest = overflow.
 */
function parsePersonBlocksFlat(
  text: string,
  dayCount: number,
  codes: Set<string>,
  codeAliases: Record<string, string> | null | undefined,
  overflowAttach: Record<string, string[]>
): PersonDay[] {
  const re = /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']+),\s*/g;
  const starts: { last: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    starts.push({ last: m[1], index: m.index, end: m.index + m[0].length });
  }
  const people: PersonDay[] = [];
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const next = starts[i + 1];
    const slice = text.slice(cur.end, next ? next.index : text.length);
    const tokens = slice.trim().split(/\s+/).filter(Boolean);
    let first = '';
    let dutyStart = 0;
    if (
      tokens[0] &&
      !isPackDutyToken(tokens[0], codes, codeAliases) &&
      /^[A-ZÄÖÜa-zäöü]/.test(tokens[0])
    ) {
      first = tokens[0];
      dutyStart = 1;
    }
    const dutyRaw = tokens.slice(dutyStart).join(' ');
    const duty = tokenizeDutyLine(dutyRaw, codes, codeAliases);
    const person: PersonDay = {
      name: first ? `${cur.last}, ${first}` : `${cur.last},`,
      days: new Map(),
    };
    const main = duty.slice(0, dayCount);
    const overflow = duty.slice(dayCount).filter((c) => c !== '-');
    assignCodes(person, main, dayCount);
    if (overflow.length) mergeOverflow(person, overflow, dayCount, overflowAttach);
    people.push(person);
  }
  return people;
}

function countNameLines(text: string): number {
  return (text.match(/(?:^|\n)[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']+,\s*/g) || []).length;
}

function detectDayCount(text: string, cg: PackPdfCodeGrid | undefined): number {
  const pat = cg?.dayHeaderPattern || '^1\\s+2\\s+3\\s+4\\b';
  let re: RegExp;
  try {
    re = new RegExp(pat, cg?.dayHeaderFlags ?? 'm');
  } catch {
    return 31;
  }
  const header = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => re.test(l.replace(/\s+/g, ' ')) || re.test(l));
  // Flat extract: day run may be inline
  const blob = header || (re.exec(text.replace(/\s+/g, ' ')) ? text : '');
  const nums = [...(blob || text).matchAll(/\b(\d{1,2})\b/g)].map((x) => parseInt(x[1], 10));
  const max = Math.max(...nums.filter((n) => n >= 28 && n <= 31), 0);
  return max || 31;
}

function weekdayMon0(iso: string): number {
  return (new Date(iso + 'T12:00:00').getDay() + 6) % 7;
}

function dayFlags(
  iso: string,
  dayCodes: string[],
  holidays: Set<string>
): {
  weekday: boolean;
  weekend: boolean;
  holiday: boolean;
  friday: boolean;
} {
  const holiday = dayCodes.some((c) => holidays.has(c.toUpperCase()));
  const wd = weekdayMon0(iso);
  const weekend = wd >= 5;
  return {
    weekday: !weekend && !holiday,
    weekend: weekend || holiday,
    holiday,
    friday: wd === 4 && !holiday,
  };
}

function whenMatches(
  when: PackComposeWhen | undefined,
  flags: ReturnType<typeof dayFlags>,
  nextFlags?: ReturnType<typeof dayFlags>
): boolean {
  const w = when || 'any';
  switch (w) {
    case 'any':
      return true;
    case 'weekday':
      return flags.weekday;
    case 'weekday-mon-thu':
      return flags.weekday && !flags.friday;
    case 'friday':
      return flags.friday;
    case 'weekend-or-holiday':
      return flags.weekend;
    case 'next-day-weekend-or-holiday':
      return !!nextFlags?.weekend;
    case 'next-day-weekday':
      return !!nextFlags?.weekday;
    default:
      return true;
  }
}

function tryCompose(
  dayCodes: string[],
  nextCodes: string[],
  rules: PackComposeRule[],
  flags: ReturnType<typeof dayFlags>,
  nextFlags: ReturnType<typeof dayFlags>
): { rule: PackComposeRule; used: Set<string>; usedNext: Set<string> } | null {
  const have = new Set(dayCodes.map((c) => c.toUpperCase()));
  const haveNext = new Set(nextCodes.map((c) => c.toUpperCase()));
  for (const rule of rules) {
    if (!whenMatches(rule.when, flags, nextFlags)) continue;
    const need = rule.codes.map((c) => c.toUpperCase());
    if (!need.every((c) => have.has(c))) continue;
    const needNext = (rule.nextDayCodes || []).map((c) => c.toUpperCase());
    if (needNext.length && !needNext.every((c) => haveNext.has(c))) continue;
    return { rule, used: new Set(need), usedNext: new Set(needNext) };
  }
  return null;
}

function entriesForPerson(
  person: PersonDay,
  year: string,
  month: string,
  dayCount: number,
  mapping: PackMapping,
  presetName: string
): ShiftEntry[] {
  const preset = mapping.presets?.[presetName] || {};
  const rules = composeRulesForMapping(mapping);
  const holidays = holidayCodeSet(preset);
  const out: ShiftEntry[] = [];
  const consumedNext = new Set<string>();

  for (let day = 1; day <= dayCount; day++) {
    const iso = toIsoDate(year, month, String(day));
    const rawDay = person.days.get(day) || [];
    const codes = rawDay.filter((c) => !holidays.has(c.toUpperCase()));
    if (rawDay.length && !codes.length) continue;

    const nextIso = toIsoDate(year, month, String(day + 1));
    const nextCodes = (person.days.get(day + 1) || []).filter(
      (c) => !consumedNext.has(`${day + 1}:${c.toUpperCase()}`)
    );
    const flags = dayFlags(iso, rawDay, holidays);
    const nextFlags =
      day < dayCount
        ? dayFlags(nextIso, person.days.get(day + 1) || [], holidays)
        : dayFlags(iso, [], holidays);

    const remaining = [...codes];
    const composed = tryCompose(remaining, nextCodes, rules, flags, nextFlags);
    if (composed) {
      out.push({
        type: composed.rule.label || composed.rule.id,
        date: iso,
        start: composed.rule.start,
        end: composed.rule.end,
        isValidated: true,
        isWork: true,
      });
      for (const c of composed.used) {
        const i = remaining.findIndex((x) => x.toUpperCase() === c);
        if (i >= 0) remaining.splice(i, 1);
      }
      for (const c of composed.usedNext) consumedNext.add(`${day + 1}:${c}`);
    }

    for (const code of remaining) {
      const u = code.toUpperCase();
      if (consumedNext.has(`${day}:${u}`)) continue;
      if (isSpecialPackCode(code, preset)) {
        if (code === '/' || code === '//') continue;
        out.push({
          type: code,
          date: iso,
          allDay: true,
          isSpecial: true,
          isValidated: true,
        });
        continue;
      }
      const range = timeRangeForCode(code, preset);
      if (!range) {
        out.push({ type: code, date: iso, allDay: true, isValidated: false });
        continue;
      }
      out.push({
        type: code,
        date: iso,
        start: range.start,
        end: range.end,
        isValidated: true,
        isWork: true,
      });
    }
  }
  return out;
}

export type CodeGridParseOpts = {
  mapping?: PackMapping | null;
  preset?: string;
  personFilter?: string | null;
};

export function parsePdfCodeGrid(
  text: string,
  config?: PackPdfConfig | null,
  opts: CodeGridParseOpts = {}
): ReturnType<typeof finishParseResult> {
  const mapping = opts.mapping;
  if (!looksLikeCodeGrid(text, config, mapping, opts.preset)) return emptyParseResult();
  const cg = config?.codeGrid;
  const ym = scanMonthYear(text, cg);
  if (!ym || !mapping?.presets) return emptyParseResult();
  const presetName = opts.preset || Object.keys(mapping.presets)[0];
  if (!presetName) return emptyParseResult();

  const codes = packCodeSet(mapping, presetName);
  const overflowAttach = overflowAttachFromComposeRules(composeRulesForMapping(mapping));
  const dayCount = detectDayCount(text, cg);

  const people =
    countNameLines(text) >= 2
      ? parsePersonBlocksLayout(
          text,
          dayCount,
          codes,
          mapping.codeAliases,
          overflowAttach,
          cg
        )
      : parsePersonBlocksFlat(
          text,
          dayCount,
          codes,
          mapping.codeAliases,
          overflowAttach
        );

  let filtered = people;
  const filter = String(opts.personFilter || '').trim();
  if (filter) {
    const key = filter.toLowerCase();
    const hit = people.filter((p) => {
      const n = p.name.toLowerCase();
      return n.includes(key) || key.includes(n.split(',')[0] || '');
    });
    if (hit.length) filtered = hit;
  }

  const entries: ShiftEntry[] = [];
  for (const p of filtered) {
    entries.push(...entriesForPerson(p, ym.year, ym.month, dayCount, mapping, presetName));
  }
  const result = finishParseResult(entries);
  result.year = ym.year;
  result.month = ym.month;
  return result;
}
