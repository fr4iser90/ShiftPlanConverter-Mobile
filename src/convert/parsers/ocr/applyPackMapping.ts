/**
 * Apply pack shift mapping to OCR matrix cells.
 * Duty codes and times come from pack presets (+ also / aliases). Colors are display/export only.
 * This module never hard-codes employer-specific codes or clock ranges.
 */
import { mappingCode, resolveShiftMapping } from '../../shiftMapping';
import type { MappingValue } from '@/src/convert/types';
import { formatShiftCell } from '@/src/sources/ocr/layouts/month-matrix/format';
import {
  cleanCell,
  looksLikeDayHeader,
  owningColIndex,
  xCenter,
  yCenter,
} from '@/src/sources/ocr/layouts/month-matrix/geometry';
import { lineBelongsToRow } from '@/src/sources/ocr/layouts/month-matrix/rowOwnership';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix/types';
import type { OcrLine } from '@/src/sources/ocr/recognize';

const OCR_RESOLVE = { allowInfer: false as const };
const TIME_RANGE_RE = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

/** Same marker PDF convert uses so Preview `findMissingTimeKeys` can prompt. */
export function unmappedTimeMarker(start: string, end: string): string {
  return `⚠️ ${start}-${end}`;
}

export function isUnmappedTimeMarker(value: string): boolean {
  return typeof value === 'string' && value.startsWith('⚠️');
}

function isValidClockPair(start: string, end: string): boolean {
  const m = `${start}-${end}`.match(TIME_RANGE_RE);
  if (!m) return false;
  const hh = [Number(m[1]), Number(m[3])];
  const mm = [Number(m[2]), Number(m[4])];
  return hh.every((h) => h >= 0 && h <= 23) && mm.every((n) => n >= 0 && n <= 59);
}

export type CellInkHint = { dark: number; slash: number };
export type PackFingerprint = {
  digits: string;
  start: string;
  end: string;
  code: string;
  /** Pack mapping `type` (work / long / night / …) — used only for ambiguous OCR ties. */
  dutyType: string;
};

/** Codes from pack presets (`code` + `also`) and alias keys — not from `colors`. */
export function collectPackCodes(
  presetMapping: Record<string, MappingValue> | null | undefined,
  /** @deprecated Ignored. Colors are UI/export only; kept for call-site compat. */
  _colors?: Record<string, string> | null,
  codeAliases?: Record<string, string> | null
): Set<string> {
  const codes = new Set<string>();
  if (presetMapping) {
    for (const v of Object.values(presetMapping)) {
      const { code } = mappingCode(v);
      if (code) codes.add(code.trim().toUpperCase());
      if (typeof v === 'object' && Array.isArray(v.also)) {
        for (const a of v.also) {
          const c = String(a || '')
            .trim()
            .toUpperCase();
          if (c) codes.add(c);
        }
      }
    }
  }
  if (codeAliases) {
    for (const [from, to] of Object.entries(codeAliases)) {
      const a = from.trim().toUpperCase();
      const b = String(to || '')
        .trim()
        .toUpperCase();
      if (a) codes.add(a);
      if (b) codes.add(b);
    }
  }
  return codes;
}

/** Resolve pack code aliases to the canonical code. */
export function canonicalizePackCode(
  code: string,
  codeAliases?: Record<string, string> | null
): string {
  const u = String(code || '')
    .trim()
    .toUpperCase();
  if (!u || u === '/' || u === '//') return u;
  // Alias keys are matched case-insensitively (stored upper in maps).
  let hit: string | undefined;
  if (codeAliases) {
    hit = codeAliases[u];
    if (!hit) {
      for (const [from, to] of Object.entries(codeAliases)) {
        if (from.toUpperCase() === u) {
          hit = to;
          break;
        }
      }
    }
  }
  if (!hit) return u;
  const out = String(hit).trim();
  if (out === '/' || out === '//') return out;
  // Preserve intentional mixed case in pack (OPTn / OPNn); else uppercase.
  const ou = out.toUpperCase();
  if (ou === 'OPTN') return 'OPTn';
  if (ou === 'OPNN') return 'OPNn';
  return ou || u;
}

/** Time-key fingerprints from the pack preset (HHMMHHMM → code). */
export function listPackFingerprints(
  presetMapping: Record<string, MappingValue> | null | undefined
): PackFingerprint[] {
  if (!presetMapping) return [];
  const out: PackFingerprint[] = [];
  for (const [key, value] of Object.entries(presetMapping)) {
    if (key.startsWith('SPECIAL:')) continue;
    const m = key.match(TIME_RANGE_RE);
    if (!m) continue;
    const { code } = mappingCode(value);
    if (!code) continue;
    const dutyType =
      typeof value === 'object' && value && 'type' in value ? String(value.type || 'work') : 'work';
    out.push({
      digits: `${m[1]}${m[2]}${m[3]}${m[4]}`,
      start: `${m[1]}:${m[2]}`,
      end: `${m[3]}:${m[4]}`,
      code: code.trim().toUpperCase(),
      dutyType: dutyType || 'work',
    });
  }
  return out;
}

/** Pack codes with type "special" (or SPECIAL: keys). */
export function specialExpandCodesFromPack(
  presetMapping: Record<string, MappingValue> | null | undefined
): string[] {
  if (!presetMapping) return [];
  const out = new Set<string>();
  for (const [key, value] of Object.entries(presetMapping)) {
    const { code } = mappingCode(value);
    if (!code) continue;
    const type = typeof value === 'object' && value && 'type' in value ? String(value.type || '') : '';
    if (key.startsWith('SPECIAL:') || type === 'special') {
      out.add(code.trim().toUpperCase());
    }
  }
  return [...out];
}

function fpStart(f: PackFingerprint): string {
  return f.digits.slice(0, 4);
}
function fpEnd(f: PackFingerprint): string {
  return f.digits.slice(4, 8);
}
function fpStartHour(f: PackFingerprint): number {
  return Number(fpStart(f).slice(0, 2));
}
function fpEndHour(f: PackFingerprint): number {
  return Number(fpEnd(f).slice(0, 2));
}
function isOvernightFp(f: PackFingerprint): boolean {
  const sh = fpStartHour(f);
  const eh = fpEndHour(f);
  return Number.isFinite(sh) && Number.isFinite(eh) && eh < sh;
}
function isTimedPackCode(code: string, fps: PackFingerprint[]): boolean {
  return !!code && fps.some((f) => f.code === code);
}
function letterOnlyPackCodes(codes: Set<string>, fps: PackFingerprint[]): string[] {
  return [...codes].filter((c) => c && !fps.some((f) => f.code === c));
}
function primaryVacationCode(codes: Set<string>, fps: PackFingerprint[]): string | null {
  const letterOnly = letterOnlyPackCodes(codes, fps);
  const single = letterOnly.filter((c) => c.length === 1).sort((a, b) => a.localeCompare(b));
  if (single.length) return single[0];
  const long = letterOnly.filter((c) => c.length > 1).sort((a, b) => a.length - b.length || a.localeCompare(b));
  return long[0] || null;
}

function hamming4(a: string, b: string): number {
  if (a.length !== 4 || b.length !== 4) return 99;
  let d = 0;
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) d++;
  return d;
}
function hamming8(a: string, b: string): number {
  if (a.length !== 8 || b.length !== 8) return 99;
  let d = 0;
  for (let i = 0; i < 8; i++) if (a[i] !== b[i]) d++;
  return d;
}
function uniqueCode(hits: PackFingerprint[]): string | null {
  const codes = [...new Set(hits.map((h) => h.code))];
  return codes.length === 1 ? codes[0] : null;
}

function digsLookLikeStart(digs: string, start: string): boolean {
  if (!digs || !start || start.length < 4) return false;
  if (digs.includes(start)) return true;
  if (start.endsWith('00') && digs.includes(start.slice(0, 2))) return true;
  if (start.startsWith('0') && (digs.includes(start.slice(1)) || digs === start.slice(1))) return true;
  // Bare start-minutes only as the entire crumb (split OCR "HH"|"mm").
  // Do NOT use startsWith(mm) — that false-matches start-minutes embedded inside any pack end HHMM.
  const mm = start.slice(2);
  if (mm.length === 2 && digs === mm) return true;
  const hh = start.slice(0, 2);
  if (digs === hh) return true;
  return false;
}

/** True when digs is only one HHMM clock (possibly repeated / leading-zero-stripped). */
function soupIsOnlyRepeatedClock(digs: string, clock4: string): boolean {
  if (!digs || !clock4 || clock4.length !== 4) return false;
  let rest = digs;
  let saw = false;
  const bare = clock4.startsWith('0') ? clock4.slice(1) : '';
  while (rest.length) {
    if (rest.startsWith(clock4)) {
      rest = rest.slice(4);
      saw = true;
      continue;
    }
    if (bare && rest.startsWith(bare)) {
      rest = rest.slice(bare.length);
      saw = true;
      continue;
    }
    return false;
  }
  return saw;
}

function fingerprintDurationMinutes(f: PackFingerprint): number {
  const sh = fpStartHour(f);
  const sm = Number(fpStart(f).slice(2));
  const eh = fpEndHour(f);
  const em = Number(fpEnd(f).slice(2));
  if (![sh, sm, eh, em].every(Number.isFinite)) return 9999;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

/** Break ties when several pack fingerprints share a start/end crumb. */
function preferAmbiguousFingerprint(hits: PackFingerprint[]): string | null {
  if (!hits.length) return null;
  const u = uniqueCode(hits);
  if (u) return u;
  // Geometry only: prefer same-day spans, then shorter duration, then earlier start.
  // No pack type labels (work/long/oncall/…) — those belong in pack JSON, not here.
  const day = hits.filter((f) => !isOvernightFp(f));
  const use = day.length ? day : hits;
  const sorted = use.slice().sort((a, b) => {
    const dur = fingerprintDurationMinutes(a) - fingerprintDurationMinutes(b);
    if (dur) return dur;
    return fpStartHour(a) - fpStartHour(b) || a.code.localeCompare(b.code);
  });
  return sorted[0]?.code || null;
}

/** End-only OCR (repeated / lone pack end HHMM) → unique / tie-broken pack day duty. */
function uniqueByEndOnly(digs: string, fingerprints: PackFingerprint[]): string | null {
  if (!digs || digs.length < 2) return null;
  const day = fingerprints.filter((f) => !isOvernightFp(f));
  const exact = day.filter((f) => soupIsOnlyRepeatedClock(digs, fpEnd(f)));
  if (exact.length) {
    // Lone HHMM that is also some pack start (day or night) is ambiguous.
    if (
      digs.length === 4 &&
      fingerprints.some((f) => fpStart(f) === digs) &&
      fingerprints.some((f) => fpEnd(f) === digs)
    ) {
      return null;
    }
    return preferAmbiguousFingerprint(exact);
  }
  // Exact HHMM end embedded once, no foreign pack start.
  const embedded = day.filter((f) => digs.includes(fpEnd(f)));
  if (embedded.length) {
    if (
      digs.length === 4 &&
      fingerprints.some((f) => fpStart(f) === digs) &&
      fingerprints.some((f) => fpEnd(f) === digs)
    ) {
      return null;
    }
    const foreignStart = fingerprints.some(
      (f) => !embedded.some((e) => e.code === f.code) && digs.includes(fpStart(f))
    );
    if (!foreignStart) return preferAmbiguousFingerprint(embedded);
  }
  return null;
}

/** Start-only OCR (repeated / lone pack start HHMM) → unique / tie-broken pack day duty. */
function uniqueByStartOnly(digs: string, fingerprints: PackFingerprint[]): string | null {
  if (!digs || digs.length < 2) return null;
  const hasEnd = fingerprints.some((f) => digs.includes(fpEnd(f)));
  const allHits =
    digs.length === 2
      ? fingerprints.filter((f) => {
          // Bare HH/mm must not invent overnight/on-call from start-minutes alone.
          if (isOvernightFp(f)) return false;
          const s = fpStart(f);
          return s.slice(2) === digs || s.startsWith(digs);
        })
      : fingerprints.filter((f) => {
          if (soupIsOnlyRepeatedClock(digs, fpStart(f))) return true;
          if (hasEnd) return false;
          if (digs.includes(fpStart(f))) return true;
          if (fpStart(f).startsWith('0') && digs.includes(fpStart(f).slice(1))) return true;
          if (digs.startsWith(fpStart(f)) && digs.length <= 7) return true;
          return false;
        });
  if (!allHits.length) return null;
  if (
    digs.length === 4 &&
    fingerprints.some((f) => fpStart(f) === digs) &&
    fingerprints.some((f) => fpEnd(f) === digs)
  ) {
    return null;
  }
  const dayHits = allHits.filter((f) => !isOvernightFp(f));
  const nightHits = allHits.filter((f) => isOvernightFp(f));
  if (dayHits.length && nightHits.length) return null;
  return preferAmbiguousFingerprint(dayHits.length ? dayHits : allHits);
}

/**
 * Leading start-minutes + exact pack end, optional trailing OCR junk
 * (split OCR: start-mm + end-HHMM + noise).
 */
function uniqueByStartMinutesPlusEnd(digs: string, fingerprints: PackFingerprint[]): string | null {
  if (!digs || digs.length < 6) return null;
  const day = fingerprints.filter((f) => !isOvernightFp(f));
  const hits = day.filter((f) => {
    const end = fpEnd(f);
    if (!digs.includes(end)) return false;
    const mm = fpStart(f).slice(2);
    const at = digs.indexOf(end);
    const prefix = digs.slice(0, at);
    return (
      prefix === mm ||
      prefix === fpStart(f) ||
      prefix === fpStart(f).slice(1) ||
      digs.startsWith(mm + end) ||
      digs.startsWith(fpStart(f) + end)
    );
  });
  return preferAmbiguousFingerprint(hits);
}

function digsLookLikeEnd(digs: string, end: string): boolean {
  if (!digs || !end || end.length < 4) return false;
  if (digs.includes(end) || digs.endsWith(end) || end.endsWith(digs)) return true;
  if (digs === end.slice(1) || digs === end.slice(2)) return true;
  for (let i = 0; i + 4 <= digs.length; i++) {
    if (hamming4(digs.slice(i, i + 4), end) <= 1) return true;
  }
  // Generic OCR digit confusions (1↔5, 5↔6, …) — variants derived from the pack end only.
  for (const v of ocrDigitVariants(end)) {
    if (v !== end && digs.includes(v)) return true;
  }
  return false;
}

/** Single/double substitutions from common OCR digit confusions. */
function ocrDigitVariants(hhmm: string): string[] {
  if (hhmm.length !== 4) return [hhmm];
  const pairs: [string, string][] = [
    ['1', '5'],
    ['5', '6'],
    ['0', '8'],
    ['3', '8'],
    ['4', '9'],
    ['7', '1'],
  ];
  const out = new Set<string>([hhmm]);
  const swap = (s: string, i: number, a: string, b: string) => {
    if (s[i] === a) return s.slice(0, i) + b + s.slice(i + 1);
    if (s[i] === b) return s.slice(0, i) + a + s.slice(i + 1);
    return null;
  };
  for (const [a, b] of pairs) {
    for (let i = 0; i < 4; i++) {
      const one = swap(hhmm, i, a, b);
      if (!one) continue;
      out.add(one);
      for (const [a2, b2] of pairs) {
        for (let j = 0; j < 4; j++) {
          if (j === i) continue;
          const two = swap(one, j, a2, b2);
          if (two) out.add(two);
        }
      }
    }
  }
  return [...out];
}

function isEndOnlyPackSoup(digs: string, fingerprints: PackFingerprint[]): boolean {
  if (!digs || digs.length < 2 || !fingerprints.length) return false;
  if (fingerprints.some((f) => digsLookLikeStart(digs, fpStart(f)))) return false;
  return fingerprints.some((f) => digsLookLikeEnd(digs, fpEnd(f)));
}

function uniqueByEndCrumb(digs: string, fingerprints: PackFingerprint[]): string | null {
  if (!digs || digs.length < 2) return null;
  return preferAmbiguousFingerprint(
    fingerprints.filter((f) => {
      if (isOvernightFp(f)) return false;
      if (digs.length === 2) {
        // Bare end-minutes must not equal this duty's start-minutes (e.g. long duties).
        return fpEnd(f).endsWith(digs) && fpStart(f).slice(2) !== digs;
      }
      return digsLookLikeEnd(digs, fpEnd(f));
    })
  );
}

function isWeekendHeader(h: string): boolean {
  return /^(Sa|So)\d*/i.test(String(h || '').trim());
}

function isPackCode(v: string, codes: Set<string>): boolean {
  return !!v && codes.has(v.trim().toUpperCase());
}

function looksLikePrintedCode(tok: string, codes: Set<string>): boolean {
  const u = String(tok || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!u) return false;
  if (codes.has(u)) return true;
  if (looksLikeDigitOrClockToken(tok)) return false;
  const confused = resolveOcrConfusedPackCode(u, codes);
  return !!(confused && codes.has(confused));
}

function looksLikeHeaderPollution(tok: string, codes?: Set<string> | null): boolean {
  const t = cleanCell(tok);
  if (!t) return true;
  // Title-case weekday stubs (Mo, Di, Mo17) — always calendar noise.
  // Must run before pack exemption: on-call label MO collides with Monday "Mo".
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d{0,2}$/.test(t)) return true;
  const u = t.toUpperCase().replace(/\s+/g, '');
  // All-caps exact pack code (MO, ST, …) is a duty label, not a weekday stub.
  if (codes?.has(u) && t === u) return false;
  if (looksLikeDayHeader(t)) return true;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d{0,2}$/i.test(t)) return true;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\d{1,2}[A-Za-z]/i.test(t)) return true;
  if (/^\d{1,2}(Do|Fr|So|Mo|Di|Mi)/i.test(t)) return true;
  if (/\d{1,2}D\d{1,2}M\d{1,2}/i.test(t)) return true;
  if ((t.match(/Mo|Di|Mi|Do|Fr|Sa|So/gi) || []).length >= 2 && t.length >= 6) return true;
  if (/^[DM]([12]\d|3[01])$/i.test(t)) return true;
  if (/^[1-9]\d?$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 31) return true;
  }
  return false;
}

function looksLikeWeekdayAbbrevPollution(tok: string, _codes?: Set<string> | null): boolean {
  const t = cleanCell(tok);
  // Title-case weekday only (Mo ≠ all-caps pack MO).
  return /^(Mo|Di|Mi|Do|Fr|Sa|So)$/.test(t);
}

function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, ' ')
    .trim();
}

/** Letter→digit OCR only — never invent HHMM from pack knowledge. */
export function cellDigits(raw: string): string {
  return String(raw || '')
    .replace(/[dD](?=\d)/g, '0')
    .replace(/[oO]/g, '0')
    .replace(/[zZ]/g, '2')
    .replace(/[yY]/g, '7')
    .replace(/[^\d]/g, '');
}

/**
 * Pack-aware digit cleanup: pad missing leading zero on pack starts only.
 * Do not rewrite arbitrary 4-digit windows (corrupts "mm"+end soups).
 */
function normalizeDigitsAgainstPack(digits: string, fingerprints: PackFingerprint[]): string {
  if (!digits || !fingerprints.length) return digits;
  let d = digits;
  for (const f of fingerprints) {
    const s = fpStart(f);
    if (!s.startsWith('0') || s.length !== 4) continue;
    const bare = s.slice(1);
    if (d === bare || d === bare + bare) {
      d = s;
      break;
    }
    if (d.startsWith(bare) && !d.startsWith(s)) {
      const rest = d.slice(bare.length);
      if (!rest || digsLookLikeEnd(rest, fpEnd(f)) || /^\d{2,4}/.test(rest)) {
        d = s + rest;
        break;
      }
    }
  }
  return d;
}

function overnightWindowOk(window8: string, f: PackFingerprint): boolean {
  if (!isOvernightFp(f)) return true;
  const startH = Number(window8.slice(0, 2));
  const want = fpStartHour(f);
  if (!Number.isFinite(startH) || !Number.isFinite(want)) return false;
  return Math.abs(startH - want) <= 2;
}

function preferDayDutyFromEnd(
  digCode: string | null,
  digs: string,
  fingerprints: PackFingerprint[]
): string | null {
  if (!digCode || !digs) return digCode;
  const dayFull = fingerprints.filter(
    (f) => !isOvernightFp(f) && digs.includes(fpStart(f)) && digs.includes(fpEnd(f))
  );
  if (dayFull.length === 1) return dayFull[0].code;
  const nightFull = fingerprints.filter(
    (f) => isOvernightFp(f) && digs.includes(fpStart(f)) && digs.includes(fpEnd(f))
  );
  if (nightFull.length === 1 && !dayFull.length) return nightFull[0].code;

  const overnight = fingerprints.some((f) => f.code === digCode && isOvernightFp(f));
  if (!overnight) return digCode;
  const dayHits = fingerprints.filter((f) => !isOvernightFp(f) && digsLookLikeEnd(digs, fpEnd(f)));
  const u = uniqueCode(dayHits);
  if (!u) return digCode;
  const own = fingerprints.filter((f) => f.code === digCode);
  if (own.some((f) => digs.includes(fpStart(f)) && digs.includes(fpEnd(f)))) return digCode;
  return u;
}

/** Map OCR-garbled token to a pack code via digit↔letter confusions only. */
/**
 * Map OCR-garbled letter tokens to an exact pack code.
 * Only universal glyph noise (not employer-/area-specific duty knowledge):
 * leading stroke, O/0·I/1, strip punctuation. No Hamming invent-a-code.
 */
function resolveOcrConfusedPackCode(upper: string, codes: Set<string>): string | null {
  if (!upper || !codes.size) return null;
  if (codes.has(upper)) return upper;
  // Pure clocks/digits → fingerprints, not letter codes.
  const digOnly = upper.replace(/[^0-9]/g, '');
  if (digOnly.length >= 2 && digOnly.length >= upper.replace(/[^A-Z0-9]/gi, '').length) {
    return null;
  }
  // One leading OCR stroke glued onto an exact pack code.
  if (upper.length >= 2 && /^[IL1|]$/.test(upper[0])) {
    const rest = upper.slice(1);
    if (codes.has(rest)) return rest;
  }
  const variants = new Set<string>();
  const add = (s: string) => {
    const t = String(s || '')
      .replace(/[./]/g, '')
      .trim();
    if (t && t.length <= 8) variants.add(t);
  };
  add(upper);
  // Universal printed-glyph confusions only (not pack-tuned 5↔S / 8↔B).
  for (const v of [...variants]) {
    add(v.replace(/0/g, 'O').replace(/1/g, 'I'));
    add(v.replace(/O/g, '0').replace(/I/g, '1'));
  }
  const hits = [...variants].filter((v) => codes.has(v));
  const uniq = [...new Set(hits)];
  return uniq.length === 1 ? uniq[0] : null;
}

function looksLikeDigitOrClockToken(t: string): boolean {
  const s = String(t || '').trim();
  if (!s) return false;
  if (/^\d{1,2}([:.]?\d{2})?(-\d{1,2}([:.]?\d{2})?)?$/.test(s)) return true;
  if (/^[oO]?\d{1,4}-?$/.test(s)) return true;
  const digs = cellDigits(s);
  return digs.length >= 2 && digs.length >= s.replace(/[^A-Za-z0-9]/g, '').length;
}

function findKnownCodeInText(
  t: string,
  codes: Set<string>,
  fingerprints?: PackFingerprint[]
): string | null {
  const upper = t.toUpperCase().replace(/\s+/g, '');
  if (codes.has(upper)) return upper;
  // Substring search only for timed pack duties — letter-only labels must be exact tokens.
  const timed = fingerprints?.length
    ? new Set(fingerprints.map((f) => f.code))
    : codes;
  const sorted = [...codes].filter((c) => timed.has(c)).sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (c.length < 1) continue;
    const re = new RegExp(`(^|[^A-Z0-9])${c}([^A-Z0-9]|$)`);
    if (re.test(upper)) return c;
  }
  return null;
}

/**
 * Match mashed digit soup against pack time fingerprints only.
 */
export function matchDigitsToPackCode(
  digits: string,
  fingerprints: PackFingerprint[]
): string | null {
  if (!digits || digits.length < 3 || !fingerprints.length) return null;
  const digs = normalizeDigitsAgainstPack(digits, fingerprints);

  const startOnly = uniqueByStartOnly(digs, fingerprints);
  if (startOnly && digs.length >= 3) {
    // Prefer start-only only when no pack end is present (avoid stealing full pairs).
    const hasAnyEnd = fingerprints.some((f) => digs.includes(fpEnd(f)));
    if (!hasAnyEnd) return startOnly;
  }

  const endOnly = uniqueByEndOnly(digs, fingerprints);
  if (endOnly) {
    const hasForeignStart = fingerprints.some(
      (f) => f.code !== endOnly && digs.includes(fpStart(f))
    );
    if (!hasForeignStart && !fingerprints.some((f) => digs.includes(fpStart(f)))) {
      return endOnly;
    }
  }

  const mmEnd = uniqueByStartMinutesPlusEnd(digs, fingerprints);
  if (mmEnd) return mmEnd;

  if (digs.length < 4) {
    return uniqueByEndCrumb(digs, fingerprints) || uniqueByStartOnly(digs, fingerprints);
  }

  // Exact pack start+end both present as HHMM (before fuzzy pair / windows).
  {
    const exactPairs = fingerprints.filter(
      (f) => digs.includes(fpStart(f)) && digs.includes(fpEnd(f))
    );
    if (exactPairs.length === 1) return exactPairs[0].code;
    if (exactPairs.length > 1) {
      const night = exactPairs.filter((f) => isOvernightFp(f));
      const day = exactPairs.filter((f) => !isOvernightFp(f));
      if (day.length === 1) return day[0].code;
      if (night.length === 1 && !day.length) return night[0].code;
      const u = preferAmbiguousFingerprint(day.length ? day : exactPairs);
      if (u) return u;
    }
  }

  const exact = fingerprints.filter((f) => {
    if (digs.length >= 8 && (digs.includes(f.digits) || f.digits.includes(digs))) return true;
    if (digs.length === 8 && f.digits === digs) return true;
    return false;
  });
  if (exact.length === 1) return exact[0].code;
  if (exact.length > 1) {
    const full = exact.filter((f) => digs.includes(f.digits));
    const u = uniqueCode(full);
    if (u) return u;
  }

  {
    const pairHits = fingerprints.filter(
      (f) => f.digits.length >= 8 && digsLookLikeStart(digs, fpStart(f)) && digsLookLikeEnd(digs, fpEnd(f))
    );
    if (pairHits.length === 1) return pairHits[0].code;
    if (pairHits.length > 1) {
      const exactBoth = pairHits.filter(
        (f) => digs.includes(fpStart(f)) && digs.includes(fpEnd(f))
      );
      const fullStart = exactBoth.length
        ? exactBoth
        : pairHits.filter((f) => digs.includes(fpStart(f)));
      const dayOnly = (fullStart.length ? fullStart : pairHits).filter((f) => !isOvernightFp(f));
      const u = preferAmbiguousFingerprint(dayOnly.length ? dayOnly : fullStart.length ? fullStart : pairHits);
      if (u) return u;
    }
  }

  if (digs.length >= 8) {
    const windows: string[] = [];
    for (let i = 0; i + 8 <= digs.length; i++) windows.push(digs.slice(i, i + 8));
    const windowHits = fingerprints.filter((f) => windows.includes(f.digits));
    const u = uniqueCode(windowHits);
    if (u) return u;

    const fuzzy: PackFingerprint[] = [];
    for (const w of windows) {
      for (const f of fingerprints) {
        if (hamming8(w, f.digits) > 1) continue;
        if (!overnightWindowOk(w, f)) continue;
        fuzzy.push(f);
      }
    }
    const uf = uniqueCode(fuzzy);
    if (uf) return uf;

    const halfFuzzy: PackFingerprint[] = [];
    for (const w of windows) {
      for (const f of fingerprints) {
        if (
          hamming4(w.slice(0, 4), fpStart(f)) <= 1 &&
          hamming4(w.slice(4, 8), fpEnd(f)) <= 1 &&
          overnightWindowOk(w, f)
        ) {
          halfFuzzy.push(f);
        }
      }
    }
    const uh = uniqueCode(halfFuzzy);
    if (uh) return uh;
  }

  const clocks: { hhmm: string; at: number }[] = [];
  for (let i = 0; i + 4 <= digs.length; i++) {
    const hh = Number(digs.slice(i, i + 2));
    const mm = Number(digs.slice(i + 2, i + 4));
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      clocks.push({ hhmm: digs.slice(i, i + 4), at: i });
    }
  }
  if (clocks.length >= 2) {
    const pairHits: PackFingerprint[] = [];
    for (let i = 0; i < clocks.length; i++) {
      for (let j = 0; j < clocks.length; j++) {
        if (clocks[j].at < clocks[i].at + 4) continue;
        const startH = Number(clocks[i].hhmm.slice(0, 2));
        const endH = Number(clocks[j].hhmm.slice(0, 2));
        const overnight = startH >= 18 || (startH >= 11 && startH <= 12 && endH <= 9);
        if (!overnight && startH >= 14 && endH <= 10) continue;
        if (!overnight && startH > endH) continue;
        for (const f of fingerprints) {
          if (
            hamming4(clocks[i].hhmm, fpStart(f)) <= 1 &&
            hamming4(clocks[j].hhmm, fpEnd(f)) <= 1
          ) {
            pairHits.push(f);
          }
        }
      }
    }
    const up = preferAmbiguousFingerprint(pairHits);
    if (up) return up;
  }

  if (digs.length >= 7) {
    const startHits = fingerprints.filter((f) => digs.startsWith(fpStart(f)) || digs.includes(fpStart(f)));
    const us = uniqueCode(startHits.filter((f) => digsLookLikeEnd(digs, fpEnd(f))));
    if (us) return us;
  }

  return (
    uniqueByEndOnly(digs, fingerprints) ||
    uniqueByStartOnly(digs, fingerprints) ||
    null
  );
}

/** Partial digit soups — unique pack fingerprint only. */
export function matchPartialDigitsToPackCode(
  digits: string,
  fingerprints: PackFingerprint[]
): string | null {
  if (!digits || !fingerprints.length) return null;
  let d = normalizeDigitsAgainstPack(digits, fingerprints);

  const mmEndEarly = uniqueByStartMinutesPlusEnd(d, fingerprints);
  if (mmEndEarly) return mmEndEarly;

  const endOnly = uniqueByEndOnly(d, fingerprints);
  if (endOnly) return endOnly;

  const startOnly = uniqueByStartOnly(d, fingerprints);
  if (startOnly) return startOnly;

  if (d.length <= 3) {
    return uniqueByEndCrumb(d, fingerprints) || uniqueByStartOnly(d, fingerprints);
  }
  if (d.length < 4) return null;

  {
    const pairHits = fingerprints.filter(
      (f) => f.digits.length >= 8 && digsLookLikeStart(d, fpStart(f)) && digsLookLikeEnd(d, fpEnd(f))
    );
    if (pairHits.length === 1) return pairHits[0].code;
    if (pairHits.length > 1) {
      const fullStart = pairHits.filter((f) => d.includes(fpStart(f)));
      const u = preferAmbiguousFingerprint(fullStart.length ? fullStart : pairHits);
      if (u) return u;
    }
  }

  for (const f of fingerprints) {
    const s = fpStart(f);
    if (!s.startsWith('0')) continue;
    const bare = s.slice(1);
    if (d === bare + s || d === s + s) {
      d = s;
      break;
    }
    if (d.startsWith(bare + s) && d.length > bare.length + s.length) {
      d = s + d.slice(bare.length + s.length);
      break;
    }
  }

  if (d.length === 4) {
    const asEnd = fingerprints.filter((f) => fpEnd(f) === d);
    const asStart = fingerprints.filter((f) => fpStart(f) === d);
    if (asEnd.length && !asStart.length) return preferAmbiguousFingerprint(asEnd);
    if (asStart.length && !asEnd.length) {
      const dayHits = asStart.filter((f) => !isOvernightFp(f));
      const nightHits = asStart.filter((f) => isOvernightFp(f));
      if (dayHits.length && nightHits.length) return null;
      return preferAmbiguousFingerprint(dayHits.length ? dayHits : asStart);
    }
    return null;
  }

  if (d.length === 6) {
    const hh = d.slice(0, 2);
    const end4 = d.slice(2);
    const byEnd = fingerprints.filter((f) => fpStart(f).startsWith(hh) && fpEnd(f) === end4);
    const u1 = uniqueCode(byEnd);
    if (u1) return u1;
    const start4 = d.slice(0, 4);
    const endHh = d.slice(4);
    const hits = fingerprints.filter((f) => {
      if (hamming4(start4, fpStart(f)) > 1) return false;
      const end = fpEnd(f);
      return end.endsWith(endHh) || end.slice(2) === endHh || hamming4(end4, end) <= 1;
    });
    const u3 = uniqueCode(hits);
    if (u3) return u3;
    // "mm" + full end HHMM — fall through to end-crumb logic below.
  }

  if (d.length >= 5 && d.length <= 7) {
    const asEnd = fingerprints.filter((f) => d.endsWith(fpEnd(f)));
    const ue = uniqueCode(asEnd);
    if (ue) return ue;
    const ue2 = uniqueByEndCrumb(d, fingerprints);
    if (ue2 && !fingerprints.some((f) => digsLookLikeStart(d, fpStart(f)))) return ue2;
  }

  // Unique pack end + soup starts with that duty's start-minutes (split OCR "mm"+"HHMM").
  {
    const byEnd = fingerprints.filter((f) => d.includes(fpEnd(f)));
    const u = uniqueCode(byEnd);
    if (u) {
      const mine = fingerprints.filter((f) => f.code === u);
      if (
        mine.some((f) => {
          const mm = fpStart(f).slice(2);
          return d.startsWith(mm) || digsLookLikeStart(d, fpStart(f));
        })
      ) {
        const foreign = fingerprints.some((f) => f.code !== u && d.includes(fpStart(f)));
        if (!foreign) return u;
      }
    }
  }

  if (d.length >= 6 && d.length < 8) {
    const hits = fingerprints.filter((f) => f.digits.startsWith(d) || f.digits.endsWith(d));
    const u = preferAmbiguousFingerprint(hits);
    if (!u) return null;
    const overnight = fingerprints.some((f) => f.code === u && isOvernightFp(f));
    if (overnight) {
      const ok = fingerprints.some((f) => f.code === u && d.includes(fpStart(f)) && d.includes(fpEnd(f)));
      if (!ok) return null;
    }
    return u;
  }
  return null;
}

export function extractHhmmCandidates(raw: string): string[] {
  const t = String(raw || '')
    .replace(/[oO]/g, '0')
    .replace(/,/g, '.');
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (hh: number, mm: number) => {
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return;
    const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  for (const m of t.matchAll(/(\d{1,2})[:.](\d{2})/g)) {
    push(Number(m[1]), Number(m[2]));
  }
  const digits = t.replace(/[^\d]/g, '');
  for (let i = 0; i + 4 <= digits.length; i++) {
    push(Number(digits.slice(i, i + 2)), Number(digits.slice(i + 2, i + 4)));
  }
  return out;
}

export function matchTimePairsToPackCode(
  raw: string,
  presetMapping: Record<string, MappingValue> | null | undefined
): string | null {
  if (!presetMapping || !Object.keys(presetMapping).length) return null;
  const times = extractHhmmCandidates(raw);
  if (times.length < 2) return null;
  const hits: string[] = [];
  for (let i = 0; i < times.length; i++) {
    for (let j = 0; j < times.length; j++) {
      if (i === j) continue;
      const hit = resolveShiftMapping(times[i], times[j], presetMapping, OCR_RESOLVE);
      if (hit.code) hits.push(hit.code.trim().toUpperCase());
    }
  }
  const uniq = [...new Set(hits)];
  return uniq.length === 1 ? uniq[0] : null;
}

/**
 * Map one OCR cell through the pack. Empty → empty.
 */
export function applyPackMappingToCell(
  raw: string,
  presetMapping: Record<string, MappingValue> | null | undefined,
  knownCodes?: Set<string>,
  codeAliases?: Record<string, string> | null
): string {
  const t = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';

  const codes = knownCodes ?? collectPackCodes(presetMapping, null, codeAliases);
  const map = presetMapping || {};
  const fps = listPackFingerprints(map);
  const canon = (c: string) => canonicalizePackCode(c, codeAliases);

  const upperExact = t.toUpperCase().replace(/\s+/g, '');
  if (codes.has(upperExact)) return canon(upperExact);

  // Letter-first only for short alphabetic tokens (OCR stroke noise on a pack code).
  // Must run before digit soup: cellDigits maps O→0 and would invent end-crumbs.
  if (
    !looksLikeDigitOrClockToken(t) &&
    /^[A-Za-zÄÖÜäöüß|]+$/i.test(t) &&
    t.length <= 6
  ) {
    const confusedEarly = resolveOcrConfusedPackCode(upperExact, codes);
    if (confusedEarly) return canon(confusedEarly);
    const asCodeEarly = findKnownCodeInText(t, codes, fps);
    if (asCodeEarly) return canon(asCodeEarly);
  }

  const range = t.match(TIME_RANGE_RE);
  if (range) {
    const start = `${range[1]}:${range[2]}`;
    const end = `${range[3]}:${range[4]}`;
    if (Object.keys(map).length) {
      const hit = resolveShiftMapping(start, end, map, OCR_RESOLVE);
      if (hit.code) return canon(hit.code);
      const rev = resolveShiftMapping(end, start, map, OCR_RESOLVE);
      if (rev.code) return canon(rev.code);
    }
    // Full HH:MM-HH:MM without a pack hit → same Preview missing path as PDF.
    return unmappedTimeMarker(start, end);
  }

  const digits = cellDigits(t);
  const fromDigits = matchDigitsToPackCode(digits, fps);
  if (fromDigits) return canon(preferDayDutyFromEnd(fromDigits, digits, fps) || fromDigits);

  const fromPartialEarly = matchPartialDigitsToPackCode(digits, fps);
  if (fromPartialEarly) {
    return canon(preferDayDutyFromEnd(fromPartialEarly, digits, fps) || fromPartialEarly);
  }

  // Digits glued to a letter-only pack label: resolve the clock, not the letter.
  if (digits.length >= 2) {
    const upperGlued = t.toUpperCase().replace(/\s+/g, '');
    for (const v of letterOnlyPackCodes(codes, fps)) {
      if (!v || !upperGlued.includes(v)) continue;
      const stripped = upperGlued.split(v).join('');
      if (cellDigits(stripped) !== digits) continue;
      const fromGlued =
        matchDigitsToPackCode(digits, fps) || matchPartialDigitsToPackCode(digits, fps);
      if (fromGlued) return canon(preferDayDutyFromEnd(fromGlued, digits, fps) || fromGlued);
    }
  }

  const fromPairs = matchTimePairsToPackCode(t, map);
  if (fromPairs) {
    return canon(preferDayDutyFromEnd(fromPairs, digits, fps) || fromPairs);
  }

  const asCode = findKnownCodeInText(t, codes, fps);
  const vacSet = new Set(letterOnlyPackCodes(codes, fps));
  // Digits + glued vacation/label letter → never keep the letter as the cell duty.
  if (asCode && vacSet.has(asCode) && digits.length >= 2) {
    return '';
  }
  if (asCode && isTimedPackCode(asCode, fps)) return canon(asCode);
  if (asCode && !looksLikeDigitOrClockToken(t) && digits.length < 2) return canon(asCode);
  if (asCode && digits.length < 2) return canon(asCode);

  const upper = t.toUpperCase().replace(/\s+/g, '');
  if (!looksLikeDigitOrClockToken(t) && digits.length < 2) {
    const confused = resolveOcrConfusedPackCode(upper, codes);
    if (confused) return canon(confused);
  }

  if (digits.length >= 8) {
    const start = `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    const end = `${digits.slice(4, 6)}:${digits.slice(6, 8)}`;
    if (isValidClockPair(start, end)) {
      if (Object.keys(map).length) {
        const hit = resolveShiftMapping(start, end, map, OCR_RESOLVE);
        if (hit.code) return canon(hit.code);
        const rev = resolveShiftMapping(end, start, map, OCR_RESOLVE);
        if (rev.code) return canon(rev.code);
      }
      // Exact 8-digit clocks with no pack fingerprint → ask user in Preview.
      if (digits.length === 8) return unmappedTimeMarker(start, end);
    }
  }

  const fromPartial = matchPartialDigitsToPackCode(digits, fps);
  if (fromPartial) return canon(fromPartial);

  return t;
}

/**
 * Printed free-day mark on month matrices (slash in the cell).
 * Pack-agnostic layout glyph — not a duty code and not employer-specific.
 */
export const MATRIX_FREE_DAY = '/';

/** Keep pack codes (+ free-day mark); drop unrecognized OCR leftovers. */
export function applyPackMappingToGrid(
  grid: MonthMatrixGrid,
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null,
  codeAliases?: Record<string, string> | null
): MonthMatrixGrid {
  // Date×duty cells hold OCR duty shorts from `dateDuty.columns` (e.g. HD, RDN).
  // Preset mapping is LOGA/time→code (ID1, B5A, …) — different vocabulary; sanitize would clear cells.
  if (grid.overlayLayout === 'date-duty') return grid;
  const codes = collectPackCodes(presetMapping, colors, codeAliases);
  const rows = grid.rows.map((row) => ({
    ...row,
    cells: row.cells.map((c) => {
      const mapped = applyPackMappingToCell(c, presetMapping, codes, codeAliases);
      // Free-day slash is matrix geometry, not time→code mapping — still must survive sanitize.
      if (mapped === MATRIX_FREE_DAY) return MATRIX_FREE_DAY;
      // Unmapped full ranges stay visible so Preview / later ingest can prompt.
      if (isUnmappedTimeMarker(mapped)) return mapped;
      const canon = canonicalizePackCode(mapped, codeAliases);
      return isPackCode(canon, codes) ? canon : '';
    }),
  }));
  return { ...grid, rows };
}

export function expandSpecialRuns(
  grid: MonthMatrixGrid,
  code: string,
  lines?: OcrLine[] | null,
  presetMapping?: Record<string, MappingValue> | null
): MonthMatrixGrid {
  const centers = grid.colCenters;
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.0;
  const target = code.toUpperCase();
  const ownFp = listPackFingerprints(presetMapping).filter((f) => f.code === target);
  const ownStarts = new Set(ownFp.map((f) => fpStart(f)));
  const ownEnds = new Set(ownFp.map((f) => fpEnd(f)));
  const otherStarts = new Set(
    listPackFingerprints(presetMapping)
      .filter((f) => f.code !== target)
      .map((f) => fpStart(f))
  );

  const hasOcrGlyph = (rowY: number, colIndex: number): boolean => {
    if (!lines?.length || !centers?.length) return false;
    return lines.some((l) => {
      const tok = cleanCell(l.text);
      if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
      if (Math.abs(yCenter(l) - rowY) > rowYPad) return false;
      if (owningColIndex(l, centers, nameMaxX) !== colIndex) return false;
      if (!tok || looksLikeDayHeader(tok) || looksLikeHeaderPollution(tok)) return false;
      if (tok === '/' || tok === '\\') return false;
      const dig = cellDigits(tok);
      if (dig && ownFp.length) {
        const looksOwn =
          [...ownStarts].some((s) => dig.includes(s) || dig.includes(s.slice(0, 2))) ||
          [...ownEnds].some((e) => dig.includes(e) || dig.endsWith(e.slice(2)));
        const looksOther = [...otherStarts].some((s) => dig.includes(s));
        if (looksOwn && !looksOther) return false;
      }
      return /[A-Za-zÄÖÜäöüß0-9]/.test(tok);
    });
  };

  const rows = grid.rows.map((row) => {
    const cells = row.cells.map((c) => (c || '').trim());
    const isEmpty = (v: string) => !v || v === '/';
    const seeds: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].toUpperCase() === target) seeds.push(i);
    }
    for (const s of seeds) {
      for (let j = s + 1; j < cells.length; j++) {
        if (!isEmpty(cells[j])) break;
        if (isWeekendHeader(grid.headers[j] || '')) break;
        if (hasOcrGlyph(row.yCenter, j)) break;
        cells[j] = target;
      }
      for (let j = s - 1; j >= 0; j--) {
        if (!isEmpty(cells[j])) break;
        if (isWeekendHeader(grid.headers[j] || '')) break;
        if (hasOcrGlyph(row.yCenter, j)) break;
        cells[j] = target;
      }
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function expandVacationRuns(
  grid: MonthMatrixGrid,
  lines?: OcrLine[] | null,
  vacationCode?: string | null
): MonthMatrixGrid {
  const vac = (vacationCode || '').toUpperCase();
  if (!vac) return grid;
  const centers = grid.colCenters;
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.0;

  const hasOcrGlyph = (rowY: number, colIndex: number): boolean => {
    if (!lines?.length || !centers?.length) return false;
    return lines.some((l) => {
      const tok = cleanCell(l.text);
      if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
      if (Math.abs(yCenter(l) - rowY) > rowYPad) return false;
      if (owningColIndex(l, centers, nameMaxX) !== colIndex) return false;
      if (!tok || looksLikeDayHeader(tok) || looksLikeHeaderPollution(tok)) return false;
      if (tok === '/' || tok === '\\') return false;
      return /[A-Za-zÄÖÜäöüß0-9]/.test(tok);
    });
  };

  const rows = grid.rows.map((row) => {
    const cells = row.cells.map((c) => (c || '').trim());
    const isEmpty = (v: string) => !v || v === '/';
    const seeds: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].toUpperCase() === vac) seeds.push(i);
    }
    for (const s of seeds) {
      for (let j = s + 1; j < cells.length; j++) {
        if (!isEmpty(cells[j])) break;
        if (isWeekendHeader(grid.headers[j] || '')) break;
        if (hasOcrGlyph(row.yCenter, j)) break;
        cells[j] = vac;
      }
      for (let j = s - 1; j >= 0; j--) {
        if (!isEmpty(cells[j])) break;
        if (isWeekendHeader(grid.headers[j] || '')) break;
        if (hasOcrGlyph(row.yCenter, j)) break;
        cells[j] = vac;
      }
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function seedGluedVacationU(
  grid: MonthMatrixGrid,
  lines: OcrLine[],
  vacationCodes: string[]
): MonthMatrixGrid {
  const centers = grid.colCenters;
  if (!centers?.length || !lines.length || !vacationCodes.length) return grid;
  const vacSet = new Set(vacationCodes.map((c) => c.toUpperCase()));
  const primary = vacationCodes[0].toUpperCase();
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.05;

  const rows = grid.rows.map((row) => {
    const cells = row.cells.slice();
    for (const l of lines) {
      const tok = cleanCell(l.text).toUpperCase().replace(/\s+/g, '');
      if (!tok) continue;
      let vacHit: string | null = null;
      for (const v of vacSet) {
        if (tok === v) {
          vacHit = v;
          break;
        }
        if (tok.endsWith(v) && /\d/.test(tok.slice(0, -v.length))) {
          vacHit = v;
          break;
        }
      }
      if (!vacHit) continue;
      if (Math.abs(yCenter(l) - row.yCenter) > rowYPad) continue;
      if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) continue;
      let col = owningColIndex(l, centers, nameMaxX);
      if (col < 0) continue;
      const glued = vacHit !== tok;
      if (glued && col + 1 < centers.length) col += 1;
      const cur = (cells[col] || '').trim().toUpperCase();
      if (!cur || cur === '/') cells[col] = primary;
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function inferVacationFromEmptyRuns(
  grid: MonthMatrixGrid,
  lines?: OcrLine[] | null,
  vacationCode?: string | null
): MonthMatrixGrid {
  const vac = (vacationCode || '').toUpperCase();
  if (!vac) return grid;
  const centers = grid.colCenters;
  if (!centers?.length) return grid;
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.0;

  const hasOcrGlyph = (rowY: number, colIndex: number): boolean => {
    if (!lines?.length) return false;
    return lines.some((l) => {
      const tok = cleanCell(l.text);
      if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
      if (Math.abs(yCenter(l) - rowY) > rowYPad) return false;
      if (owningColIndex(l, centers, nameMaxX) !== colIndex) return false;
      if (!tok || looksLikeDayHeader(tok) || looksLikeHeaderPollution(tok)) return false;
      if (tok === '/' || tok === '\\') return false;
      return /[A-Za-zÄÖÜäöüß0-9]/.test(tok);
    });
  };

  const rows = grid.rows.map((row) => {
    const cells = row.cells.map((c) => (c || '').trim());
    const emptyAt = (i: number) => {
      const v = cells[i];
      if (v && v !== '/') return false;
      return !hasOcrGlyph(row.yCenter, i);
    };
    let i = 0;
    while (i < cells.length) {
      if (!emptyAt(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j < cells.length && emptyAt(j)) j++;
      const runLen = j - i;
      const startsWeekend = /^(Sa|So)/i.test(String(grid.headers[i] || ''));
      if (runLen >= 7 && startsWeekend) {
        for (let k = i; k < j; k++) cells[k] = vac;
      }
      i = j;
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function seedVacationFromInkDensity(
  grid: MonthMatrixGrid,
  hints: CellInkHint[][],
  vacationCode?: string | null
): MonthMatrixGrid {
  const vac = (vacationCode || '').toUpperCase();
  if (!vac || !hints?.length || hints.length !== grid.rows.length) return grid;
  const rows = grid.rows.map((row, ri) => {
    const rowHints = hints[ri] || [];
    const cells = row.cells.map((c, ci) => {
      const cur = (c || '').trim();
      const h = rowHints[ci];
      if (!h) return cur;
      if (isWeekendHeader(grid.headers[ci] || '')) return cur;
      if (h.dark >= 0.7 && (!cur || cur === '/')) return vac;
      return cur;
    });
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function clearFalseVacationWithSlashInk(
  grid: MonthMatrixGrid,
  hints: CellInkHint[][],
  vacationCode?: string | null
): MonthMatrixGrid {
  const vac = (vacationCode || '').toUpperCase();
  if (!vac || !hints?.length || hints.length !== grid.rows.length) return grid;
  const rows = grid.rows.map((row, ri) => {
    const rowHints = hints[ri] || [];
    const cells = row.cells.map((c, ci) => {
      const cur = (c || '').trim().toUpperCase();
      if (cur !== vac) return c;
      if (isWeekendHeader(grid.headers[ci] || '')) return c;
      const h = rowHints[ci];
      if (!h) return c;
      if (h.slash >= 0.35 && h.slash > h.dark + 0.08 && h.dark < 0.30) return '/';
      return c;
    });
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function fillWeekdaySlashGaps(
  grid: MonthMatrixGrid,
  lines?: OcrLine[] | null,
  inkHints?: CellInkHint[][] | null,
  presetMapping?: Record<string, MappingValue> | null
): MonthMatrixGrid {
  const centers = grid.colCenters;
  if (!centers?.length || !grid.headers.length) return grid;
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.0;
  const fps = listPackFingerprints(presetMapping);

  const hasOcrGlyph = (rowY: number, colIndex: number): boolean => {
    if (!lines?.length) return false;
    return lines.some((l) => {
      const tok = cleanCell(l.text);
      if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
      if (Math.abs(yCenter(l) - rowY) > rowYPad) return false;
      if (owningColIndex(l, centers, nameMaxX) !== colIndex) return false;
      if (!tok || looksLikeDayHeader(tok) || looksLikeHeaderPollution(tok)) return false;
      const dig = cellDigits(tok);
      if (dig && isEndOnlyPackSoup(dig, fps)) return false;
      return /[A-Za-zÄÖÜäöüß0-9]/.test(tok);
    });
  };

  const colDigs = (rowY: number, colIndex: number): string => {
    if (!lines?.length) return '';
    return cellDigits(
      lines
        .filter((l) => {
          if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
          if (Math.abs(yCenter(l) - rowY) > rowYPad) return false;
          if (owningColIndex(l, centers, nameMaxX) !== colIndex) return false;
          const tok = cleanCell(l.text);
          return !!(tok && !looksLikeDayHeader(tok) && !looksLikeHeaderPollution(tok));
        })
        .map((l) => cleanCell(l.text))
        .join('')
    );
  };

  const rows = grid.rows.map((row, ri) => {
    const rowInk = inkHints?.[ri] || [];
    const cells = row.cells.map((c, i) => {
      const cur = (c || '').trim();
      if (cur) return cur;
      if (isWeekendHeader(grid.headers[i] || '')) return cur;
      const digs = colDigs(row.yCenter, i);
      if (digs && isEndOnlyPackSoup(digs, fps)) {
        const left = i > 0 ? String(row.cells[i - 1] || '').trim().toUpperCase() : '';
        const leftWeekend = i > 0 && isWeekendHeader(grid.headers[i - 1] || '');
        const byEnd = uniqueByEndOnly(digs, fps) || uniqueByEndCrumb(digs, fps);
        if (!leftWeekend && byEnd && left === byEnd) return byEnd;
        if (leftWeekend) {
          const h = rowInk[i];
          if (h && h.slash >= 0.28 && h.dark < 0.25) return '/';
          return byEnd || '/';
        }
        // Ambiguous end crumb: keep empty for stitch — do not invent a free-day slash.
        return cur;
      }
      if (digs) {
        const startHit = uniqueByStartOnly(digs, fps);
        if (startHit) return startHit;
        if (fps.some((f) => digsLookLikeStart(digs, fpStart(f)))) return cur;
        // Digit mash with no pack match is not a free-day slash.
        if (digs.length >= 4) return cur;
      }
      if (hasOcrGlyph(row.yCenter, i)) return cur;
      return '/';
    });
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function stitchAdjacentTimeFragments(
  grid: MonthMatrixGrid,
  lines: OcrLine[],
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null
): MonthMatrixGrid {
  const centers = grid.colCenters;
  if (!centers?.length || !lines.length) return grid;
  const codes = collectPackCodes(presetMapping, colors);
  const fps = listPackFingerprints(presetMapping);
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.15;

  const digsFor = (rowY: number, colIndex: number): string => {
    return cellDigits(
      lines
        .filter((l) => {
          if (Math.abs(yCenter(l) - rowY) > rowYPad) return false;
          if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
          if (owningColIndex(l, centers, nameMaxX) !== colIndex) return false;
          const tok = cleanCell(l.text);
          return !!(tok && !looksLikeDayHeader(tok) && !looksLikeHeaderPollution(tok));
        })
        .map((l) => cleanCell(l.text))
        .join('')
    );
  };

  const rows = grid.rows.map((row) => {
    const cells = row.cells.slice();
    for (let i = 0; i < centers.length - 1; i++) {
      if (isWeekendHeader(grid.headers[i] || '') || isWeekendHeader(grid.headers[i + 1] || '')) {
        continue;
      }
      const left = (cells[i] || '').trim();
      const right = (cells[i + 1] || '').trim();
      const leftCode = isPackCode(left, codes);
      const rightCode = isPackCode(right, codes);
      if (leftCode && rightCode) continue;

      const dL = digsFor(row.yCenter, i);
      const dR = digsFor(row.yCenter, i + 1);
      if (dL.length < 2 && dR.length < 2) continue;
      if (dL.length >= 2) {
        const hh = Number(dL.slice(0, 2));
        if (Number.isFinite(hh) && (hh < 6 || hh > 14)) continue;
      }
      const soupLR = dL + dR;
      {
        const startJoined = uniqueByStartOnly(soupLR, fps);
        if (
          startJoined &&
          isTimedPackCode(startJoined, fps) &&
          !fps.some((f) => soupLR.includes(fpEnd(f)))
        ) {
          if (!leftCode && (!left || left === '/') && dL.length >= 2) cells[i] = startJoined;
        }
      }
      // Short start crumb | end crumb across adjacent columns.
      {
        const crossShort = fps.filter(
          (f) =>
            !isOvernightFp(f) &&
            digsLookLikeStart(dL, fpStart(f)) &&
            digsLookLikeEnd(dR, fpEnd(f))
        );
        const codeShort = preferAmbiguousFingerprint(crossShort);
        if (codeShort && isTimedPackCode(codeShort, fps) && dL.length + dR.length < 8) {
          if (!leftCode && (!left || left === '/') && dL.length >= 2) cells[i] = codeShort;
          if (codeShort) continue;
        }
      }
      const soup = soupLR;
      if (soup.length < 6) continue;
      let code =
        matchDigitsToPackCode(soup, fps) || matchPartialDigitsToPackCode(soup, fps);
      if (!code || !isPackCode(code, codes) || !isTimedPackCode(code, fps)) {
        const cross = fps.filter(
          (f) =>
            !isOvernightFp(f) &&
            digsLookLikeStart(dL, fpStart(f)) &&
            digsLookLikeEnd(dR, fpEnd(f))
        );
        code = preferAmbiguousFingerprint(cross);
      }
      if (!code || !isTimedPackCode(code, fps)) continue;
      const fpHit = fps.find((f) => f.code === code);
      if (fpHit && isOvernightFp(fpHit)) continue;
      if (!leftCode && (!left || left === '/') && dL.length >= 2) cells[i] = code;
    }
    // Same-week continuation from pack end crumbs (also reclaim false slash).
    for (let i = 1; i < centers.length; i++) {
      const cur = (cells[i] || '').trim();
      if (cur && cur !== '/') continue;
      if (isWeekendHeader(grid.headers[i - 1] || '') || isWeekendHeader(grid.headers[i] || '')) {
        continue;
      }
      const prev = (cells[i - 1] || '').trim().toUpperCase();
      if (!prev || !isPackCode(prev, codes)) continue;
      const prevFp = fps.filter((f) => f.code === prev && !isOvernightFp(f));
      if (!prevFp.length) continue;
      const d = digsFor(row.yCenter, i);
      if (!d) continue;
      if (fps.some((f) => f.code !== prev && digsLookLikeStart(d, fpStart(f)))) continue;
      if (isEndOnlyPackSoup(d, prevFp) || uniqueByEndCrumb(d, prevFp) === prev) {
        cells[i] = prev;
      }
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function fillEmptyFromRowDigitStream(
  grid: MonthMatrixGrid,
  lines: OcrLine[],
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null
): MonthMatrixGrid {
  const centers = grid.colCenters;
  if (!centers?.length || !lines.length) return grid;
  const codes = collectPackCodes(presetMapping, colors);
  const fps = listPackFingerprints(presetMapping);
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.2;

  const rows = grid.rows.map((row) => {
    const cells = row.cells.slice();
    const toks = lines
      .filter((l) => {
        if (Math.abs(yCenter(l) - row.yCenter) > rowYPad) return false;
        if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
        const tok = cleanCell(l.text);
        return !!(tok && !looksLikeDayHeader(tok) && !looksLikeHeaderPollution(tok));
      })
      .map((l) => ({ dig: cellDigits(cleanCell(l.text)), x: xCenter(l) }))
      .filter((t) => t.dig.length)
      .sort((a, b) => a.x - b.x);

    let soup = '';
    const anchors: number[] = [];
    for (const t of toks) {
      for (let k = 0; k < t.dig.length; k++) {
        soup += t.dig[k];
        anchors.push(t.x);
      }
    }
    for (let i = 0; i + 8 <= soup.length; i++) {
      const w = soup.slice(i, i + 8);
      const code = matchDigitsToPackCode(w, fps);
      if (!code || !isPackCode(code, codes) || !isTimedPackCode(code, fps)) continue;
      const fpHit = fps.find((f) => f.code === code);
      if (fpHit && isOvernightFp(fpHit)) continue;
      if (fpHit && fpStartHour(fpHit) >= 10) continue;
      if (fpHit && !w.startsWith(fpStart(fpHit).slice(0, 2))) continue;
      let best = 0;
      let bestD = Math.abs(anchors[i] - centers[0]);
      for (let c = 1; c < centers.length; c++) {
        const d = Math.abs(anchors[i] - centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (isWeekendHeader(grid.headers[best] || '')) continue;
      const cur = (cells[best] || '').trim();
      if (!cur || cur === '/') cells[best] = code;
    }
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function clearFalseDutiesWithSlashInk(
  grid: MonthMatrixGrid,
  hints: CellInkHint[][],
  lines?: OcrLine[] | null,
  presetMapping?: Record<string, MappingValue> | null
): MonthMatrixGrid {
  if (!hints?.length || hints.length !== grid.rows.length) return grid;
  const fps = listPackFingerprints(presetMapping);
  const clearable = new Set(fps.filter((f) => !isOvernightFp(f)).map((f) => f.code));
  const centers = grid.colCenters;
  const nameMaxX = grid.nameMaxX ?? 0;
  const rowYPad = (grid.rowYPad ?? 28) * 1.0;

  const colDigs = (rowY: number, colIndex: number): string => {
    if (!lines?.length || !centers?.length) return '';
    return cellDigits(
      lines
        .filter((l) => {
          if (nameMaxX > 0 && xCenter(l) < nameMaxX * 0.85) return false;
          if (Math.abs(yCenter(l) - rowY) > rowYPad) return false;
          if (owningColIndex(l, centers, nameMaxX) !== colIndex) return false;
          const tok = cleanCell(l.text);
          return !!(tok && !looksLikeDayHeader(tok) && !looksLikeHeaderPollution(tok));
        })
        .map((l) => cleanCell(l.text))
        .join('')
    );
  };

  const rows = grid.rows.map((row, ri) => {
    const rowHints = hints[ri] || [];
    const cells = row.cells.map((c, ci) => {
      const cur = (c || '').trim().toUpperCase();
      if (!cur) return c;
      if (isWeekendHeader(grid.headers[ci] || '')) {
        if (clearable.has(cur)) return '';
        return c;
      }
      if (!clearable.has(cur)) return c;
      const h = rowHints[ci];
      if (!h) return c;
      if (h.slash >= 0.28 && h.slash > h.dark * 0.95 && h.dark < 0.34) {
        const digs = colDigs(row.yCenter, ci);
        const mine = fps.filter((f) => f.code === cur);
        const hasStart = mine.some(
          (f) => digs.includes(fpStart(f)) || digsLookLikeStart(digs, fpStart(f))
        );
        const hasEnd = mine.some(
          (f) => digs.includes(fpEnd(f)) || digsLookLikeEnd(digs, fpEnd(f))
        );
        const supported = hasStart || hasEnd;
        if (supported) return c;
        if (uniqueByStartOnly(digs, fps) === cur || uniqueByEndOnly(digs, fps) === cur) {
          return c;
        }
        // No OCR digits at all: only clear on strong slash signal.
        if (!digs && !(h.slash >= 0.4 && h.slash > h.dark + 0.12)) return c;
        return MATRIX_FREE_DAY;
      }
      return c;
    });
    return { ...row, cells };
  });
  return { ...grid, rows };
}

export function applyInkCellHints(
  grid: MonthMatrixGrid,
  hints: CellInkHint[][] | null | undefined,
  lines?: OcrLine[] | null,
  presetMapping?: Record<string, MappingValue> | null,
  colors?: Record<string, string> | null
): MonthMatrixGrid {
  if (!hints?.length) return grid;
  const codes = collectPackCodes(presetMapping, colors);
  const fps = listPackFingerprints(presetMapping);
  const vac = primaryVacationCode(codes, fps);
  let out = seedVacationFromInkDensity(grid, hints, vac);
  out = expandVacationRuns(out, lines ?? null, vac);
  out = clearFalseVacationWithSlashInk(out, hints, vac);
  out = fillWeekdaySlashGaps(out, lines, hints, presetMapping);
  out = clearFalseDutiesWithSlashInk(out, hints, lines, presetMapping);
  return out;
}

/**
 * Re-scoop one person row with the pack oracle.
 */
export function refinePersonRowFromOcr(
  grid: MonthMatrixGrid,
  personName: string,
  lines: OcrLine[],
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null,
  codeAliases?: Record<string, string> | null
): MonthMatrixGrid {
  // Person×day scoop assumes month-matrix geometry (name row × day columns).
  if (grid.overlayLayout === 'date-duty') return grid;
  const centers = grid.colCenters;
  if (!centers?.length || !personName) return grid;

  const key = nameKey(personName);
  const rowIdx = grid.rows.findIndex(
    (r) => nameKey(r.name) === key || nameKey(r.name).includes(key) || key.includes(nameKey(r.name))
  );
  if (rowIdx < 0) return grid;

  const row = grid.rows[rowIdx];
  const codes = collectPackCodes(presetMapping, colors, codeAliases);
  const fps = listPackFingerprints(presetMapping);
  const vacSet = new Set(letterOnlyPackCodes(codes, fps));
  const nameMaxX = grid.nameMaxX ?? 0;
  const slope = grid.rowSlope || 0;
  const xAnchor = nameMaxX > 0 ? nameMaxX * 0.55 : 40;
  const rowAnchors = grid.rows.map((r) => ({
    yCenter: r.yCenter,
    yLo: r.yLo,
    yHi: r.yHi,
  }));

  const nextCells: string[] = [];
  for (let colIndex = 0; colIndex < centers.length; colIndex++) {
    const prev = row.cells[colIndex] || '';
    const prevMapped = applyPackMappingToCell(prev, presetMapping, codes, codeAliases);

    if (!lines.length) {
      const raw = (prev || '').trim().toUpperCase();
      if (codes.has(raw)) {
        nextCells.push(canonicalizePackCode(raw, codeAliases));
      } else if (isUnmappedTimeMarker(prevMapped)) {
        nextCells.push(prevMapped);
      } else {
        nextCells.push('');
      }
      continue;
    }

    const candidates = lines
      .filter((l) => {
        const xc = xCenter(l);
        if (nameMaxX > 0 && xc < nameMaxX && l.boundingBox.x < nameMaxX * 0.9) return false;
        // Nearest person row owns the glyph, so multi-line duties stay in one frame.
        if (!lineBelongsToRow(l, rowIdx, rowAnchors, slope, xAnchor)) return false;
        return owningColIndex(l, centers, nameMaxX) === colIndex;
      })
      .map((l) => ({ l, dy: Math.abs(yCenter(l) - row.yCenter) }))
      .sort((a, b) => a.dy - b.dy || a.l.boundingBox.y - b.l.boundingBox.y);

    if (!candidates.length) {
      nextCells.push(
        isPackCode(prevMapped, codes)
          ? prevMapped
          : prevMapped === '/'
            ? '/'
            : isUnmappedTimeMarker(prevMapped)
              ? prevMapped
              : ''
      );
      continue;
    }

    const cellDigs = cellDigits(
      candidates
        .slice()
        .sort((a, b) => a.l.boundingBox.x - b.l.boundingBox.x)
        .map((c) => cleanCell(c.l.text))
        .filter((t) => {
          if (!t || looksLikeDayHeader(t) || looksLikeHeaderPollution(t, codes)) return false;
          // Calendar day numbers in the cell are not duty clocks.
          if (/^[1-9]\d?$/.test(t) && Number(t) >= 1 && Number(t) <= 31) return false;
          // Printed pack codes are letters — do not let O/I become fake clocks in the soup.
          if (looksLikePrintedCode(t, codes)) return false;
          return true;
        })
        .join('')
    );
    let digCode =
      matchDigitsToPackCode(cellDigs, fps) || matchPartialDigitsToPackCode(cellDigs, fps);
    digCode = preferDayDutyFromEnd(digCode, cellDigs, fps);

    const digHasClocks =
      !!digCode &&
      isTimedPackCode(digCode, fps) &&
      fps.some(
        (f) =>
          f.code === digCode &&
          (digsLookLikeStart(cellDigs, fpStart(f)) || digsLookLikeEnd(cellDigs, fpEnd(f)))
      );

    const ranked = candidates.slice().sort((a, b) => {
      const ac = looksLikePrintedCode(cleanCell(a.l.text), codes) ? 0 : 1;
      const bc = looksLikePrintedCode(cleanCell(b.l.text), codes) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.dy - b.dy;
    });

    let decided: string | null = null;
    for (const { l } of ranked) {
      const tok = cleanCell(l.text);
      if (!tok || looksLikeDayHeader(tok) || looksLikeHeaderPollution(tok, codes)) continue;
      const hasDayNum = candidates.some((c) => {
        const t2 = cleanCell(c.l.text);
        return /^[1-9]\d?$/.test(t2) && Number(t2) >= 1 && Number(t2) <= 31;
      });
      if (hasDayNum && looksLikeWeekdayAbbrevPollution(tok, codes)) continue;

      const mappedTok = applyPackMappingToCell(tok, presetMapping, codes, codeAliases);
      if (!isPackCode(mappedTok, codes)) continue;
      // Digit oracle with matching clocks beats a printed letter that has no clocks here.
      if (
        digHasClocks &&
        digCode &&
        digCode !== mappedTok &&
        looksLikePrintedCode(tok, codes)
      ) {
        const letterFp = fps.filter((f) => f.code === mappedTok);
        const digFp = fps.filter((f) => f.code === digCode);
        const letterHasStart = letterFp.some((f) => digsLookLikeStart(cellDigs, fpStart(f)));
        const letterHasEnd = letterFp.some((f) => digsLookLikeEnd(cellDigs, fpEnd(f)));
        const digHasStart = digFp.some((f) => digsLookLikeStart(cellDigs, fpStart(f)));
        const letterOvernight = letterFp.some((f) => isOvernightFp(f));
        // Overnight/on-call labels: require their start in-cell, or no competing day-start.
        // Morning end alone is shared with day duties and must not steal a Früh slot.
        if (letterOvernight) {
          if (letterHasStart) {
            decided = mappedTok;
            break;
          }
          if (digHasStart) continue;
          decided = mappedTok;
          break;
        }
        if (!letterHasStart && !letterHasEnd) continue;
      }
      if (
        digCode &&
        digCode !== mappedTok &&
        isTimedPackCode(digCode, fps) &&
        !looksLikePrintedCode(tok, codes)
      ) {
        continue;
      }
      if (looksLikePrintedCode(tok, codes)) {
        const letterFp = fps.filter((f) => f.code === mappedTok);
        const letterOvernight = letterFp.some((f) => isOvernightFp(f));
        const letterHasStart = letterFp.some((f) => digsLookLikeStart(cellDigs, fpStart(f)));
        // Overnight/on-call Kürzel without its start, but a day-duty start is in-cell → bleed.
        if (letterOvernight && !letterHasStart) {
          const foreignDayStart = fps.some(
            (f) => !isOvernightFp(f) && digsLookLikeStart(cellDigs, fpStart(f))
          );
          if (foreignDayStart) continue;
        }
        decided = mappedTok;
        break;
      }
      decided = mappedTok;
      break;
    }

    if (!decided && digCode && isPackCode(digCode, codes) && isTimedPackCode(digCode, fps)) {
      decided = digCode;
    }

    // Prefer digit oracle over vacation-letter glue when clocks identify a timed duty.
    if (
      digCode &&
      isPackCode(digCode, codes) &&
      isTimedPackCode(digCode, fps) &&
      digHasClocks &&
      decided &&
      vacSet.has(decided)
    ) {
      decided = digCode;
    }

    if (!decided) {
      const texts = candidates
        .slice()
        .sort((a, b) => a.l.boundingBox.x - b.l.boundingBox.x)
        .map(({ l }) => cleanCell(l.text))
        .filter((t) => t && !looksLikeDayHeader(t) && !looksLikeHeaderPollution(t, codes));
      const joined = formatShiftCell([...new Set(texts)]);
      const mapped = applyPackMappingToCell(
        joined || texts.join(' '),
        presetMapping,
        codes,
        codeAliases
      );
      if (isPackCode(mapped, codes)) decided = mapped;
      else if (isUnmappedTimeMarker(mapped)) decided = mapped;
    }

    if (decided && isPackCode(decided, codes)) {
      nextCells.push(canonicalizePackCode(decided, codeAliases));
    } else if (decided && isUnmappedTimeMarker(decided)) {
      nextCells.push(decided);
    } else {
      nextCells.push('');
    }
  }

  const rows = grid.rows.slice();
  rows[rowIdx] = { ...row, cells: nextCells };
  return { ...grid, rows };
}

/** Re-scoop every person row with the pack oracle. */
export function refineAllPersonRowsFromOcr(
  grid: MonthMatrixGrid,
  lines: OcrLine[],
  presetMapping: Record<string, MappingValue> | null | undefined,
  colors?: Record<string, string> | null,
  inkHints?: CellInkHint[][] | null,
  codeAliases?: Record<string, string> | null
): MonthMatrixGrid {
  if (grid.overlayLayout === 'date-duty') return grid;
  const codes = collectPackCodes(presetMapping, colors, codeAliases);
  const fps = listPackFingerprints(presetMapping);
  const vac = primaryVacationCode(codes, fps);
  const vacCodes = letterOnlyPackCodes(codes, fps);

  let out = grid;
  for (const row of grid.rows) {
    out = refinePersonRowFromOcr(out, row.name, lines, presetMapping, colors, codeAliases);
  }
  out = stitchAdjacentTimeFragments(out, lines, presetMapping, colors);
  out = fillEmptyFromRowDigitStream(out, lines, presetMapping, colors);
  for (const code of specialExpandCodesFromPack(presetMapping)) {
    out = expandSpecialRuns(out, code, lines, presetMapping);
  }
  out = seedGluedVacationU(out, lines, vacCodes);
  out = expandVacationRuns(out, lines, vac);
  out = inferVacationFromEmptyRuns(out, lines, vac);
  out = expandVacationRuns(out, lines, vac);
  if (inkHints?.length) {
    out = seedVacationFromInkDensity(out, inkHints, vac);
    out = expandVacationRuns(out, lines, vac);
    out = clearFalseVacationWithSlashInk(out, inkHints, vac);
  }
  out = fillWeekdaySlashGaps(out, lines, inkHints, presetMapping);
  out = stitchAdjacentTimeFragments(out, lines, presetMapping, colors);
  if (inkHints?.length) {
    out = clearFalseDutiesWithSlashInk(out, inkHints, lines, presetMapping);
  }
  return out;
}
