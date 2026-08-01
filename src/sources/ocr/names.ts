/**
 * Detect roster names (left column / line prefix) and extract one person's row.
 * User picks a name (or we auto-match a saved preference) — no silent multi-layout try.
 */
import type { OcrLine } from './recognize';

export type OcrNameCandidate = {
  id: string;
  /** Display label as seen on the plan */
  label: string;
  /** y-center of the name line (image coords); 0 when geometry unknown */
  yCenter: number;
  /** name line height; 0 when geometry unknown */
  height: number;
  /** Optional: full OCR line that begins with this name (dense matrix rows). */
  sourceLineText?: string;
};

/** Last name, first name — optional Dr. kept in the label */
const NAME_CORE =
  '([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\\-\']{1,40}),\\s*((?:Dr\\.?\\s*)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\\-\']{1,40}(?:\\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\\-\']{1,40})?)';

const NAME_ONLY_RE = new RegExp(`^${NAME_CORE}$`);
const NAME_PREFIX_RE = new RegExp(`^${NAME_CORE}\\b`);

function normalizeNameKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatName(last: string, first: string): string {
  return `${last.trim()}, ${first.trim().replace(/\s+/g, ' ')}`;
}

/**
 * Reject day strips, times, codes, and mashed OCR blobs that are not person labels.
 * Used for picker candidates and matrix row names.
 */
export function isPlausiblePersonName(label: string): boolean {
  const t = String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length < 3 || t.length > 48) return false;
  if ((t.match(/,/g) || []).length >= 2) return false;
  if (/\d{1,2}[:.]\d{2}/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  const digitRatio = (t.replace(/\D/g, '').length || 0) / t.length;
  if (digitRatio > 0.25) return false;
  // Day header strip / weekday mash ("SA 1 So 2 Mo 3 …")
  if (/(Mo|Di|Mi|Do|Fr|Sa|So)\s*\d{1,2}/i.test(t) && t.length > 12) return false;
  if (/^(Mo|Di|Mi|Do|Fr|Sa|So)[\s\d]*$/i.test(t)) return false;
  // Prefer "Last, First" or two capitalized name tokens
  if (NAME_ONLY_RE.test(t)) return true;
  if (
    /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{1,30},\s*(?:Dr\.?\s*)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-'\s]{1,40}$/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{2,30}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{2,30}$/.test(t)
  ) {
    return true;
  }
  // Abbreviated last name with period before comma
  if (/^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{1,20}\.,\s*[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{2,30}$/.test(t)) {
    return true;
  }
  // Wall plans: "Dr. Muster", "OA Dr. Muster", "Frau Muster"
  if (
    /^(?:(?:OA|FA|CA|Prof\.?|Dr\.?|Frau|Herr|Hr\.?|Fr\.?)\s+)+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{2,40}$/.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function pushCandidate(
  out: OcrNameCandidate[],
  seen: Set<string>,
  label: string,
  yCenter: number,
  height: number,
  sourceLineText?: string
): void {
  if (!isPlausiblePersonName(label)) return;
  const key = normalizeNameKey(label);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push({
    id: key,
    label,
    yCenter,
    height: Math.max(0, height),
    sourceLineText,
  });
}

/**
 * Left-column / row-prefix name candidates for month-matrix style plans.
 * Handles short name-only lines AND dense rows where name + cells share one OCR line.
 */
export function detectRosterNames(
  lines: OcrLine[],
  pageWidth: number
): OcrNameCandidate[] {
  if (!lines.length) return [];
  const w =
    pageWidth > 0
      ? pageWidth
      : Math.max(...lines.map((l) => l.boundingBox.x + l.boundingBox.width), 1);
  const leftMax = w * 0.34;
  const out: OcrNameCandidate[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const box = line.boundingBox;
    const cleaned = line.text.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    // 1) Whole line is just a name (classic left column cell).
    if (box.x <= leftMax && cleaned.length <= 56) {
      const only = cleaned.match(NAME_ONLY_RE);
      if (only) {
        pushCandidate(
          out,
          seen,
          formatName(only[1], only[2]),
          box.y + box.height / 2,
          box.height
        );
        continue;
      }
    }

    // 2) Dense matrix: name prefix then shift tokens on one OCR line.
    const prefix = cleaned.match(NAME_PREFIX_RE);
    if (prefix) {
      const label = formatName(prefix[1], prefix[2]);
      // Prefer leftish rows; still accept if name is clearly the line start.
      if (box.x <= leftMax || box.x / w < 0.45) {
        pushCandidate(
          out,
          seen,
          label,
          box.y + box.height / 2,
          Math.max(8, box.height),
          cleaned
        );
      }
    }
  }

  return out.sort((a, b) => a.yCenter - b.yCenter || a.label.localeCompare(b.label));
}

/**
 * Fallback when ML Kit returns flat text without usable line boxes.
 * Splits on newlines and pulls name prefixes — no geometry / weaker row cut.
 */
export function detectRosterNamesFromPlainText(text: string): OcrNameCandidate[] {
  const out: OcrNameCandidate[] = [];
  const seen = new Set<string>();
  const rawLines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  let y = 0;
  for (const cleaned of rawLines) {
    y += 1;
    const only = cleaned.match(NAME_ONLY_RE);
    if (only && cleaned.length <= 56) {
      pushCandidate(out, seen, formatName(only[1], only[2]), y, 1, cleaned);
      continue;
    }
    const prefix = cleaned.match(NAME_PREFIX_RE);
    if (prefix) {
      pushCandidate(out, seen, formatName(prefix[1], prefix[2]), y, 1, cleaned);
    }
  }
  return out;
}

export type NameMatch = {
  candidate: OcrNameCandidate;
  score: number;
};

/** DE/medical honorifics — strip before surname / match (OA Dr. Zeuner ↔ Zeuner, Thomas). */
const NAME_TITLE_TOKENS = new Set([
  'dr',
  'med',
  'oa',
  'fa',
  'ca',
  'prof',
  'frau',
  'herr',
  'hr',
  'fr',
  'dipl',
  'ing',
  'phd',
  'mr',
  'mrs',
  'ms',
  'doktor',
  'dent',
]);

function stripTitleTokens(normalized: string): string {
  const keepComma = normalized.includes(',');
  const parts = normalized
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t && !NAME_TITLE_TOKENS.has(t));
  if (!parts.length) return '';
  if (keepComma && normalized.includes(',')) {
    // Rebuild "surname, given…" from original sides minus titles.
    const left = normalized
      .split(',')[0]!
      .split(/\s+/)
      .filter((t) => t && !NAME_TITLE_TOKENS.has(t));
    const right = normalized
      .split(',')
      .slice(1)
      .join(' ')
      .split(/\s+/)
      .filter((t) => t && !NAME_TITLE_TOKENS.has(t));
    if (left.length && right.length) return `${left.join(' ')}, ${right.join(' ')}`;
    return [...left, ...right].join(' ');
  }
  return parts.join(' ');
}

/**
 * Surname + given after dropping titles.
 * Comma form: "zeuner, thomas". Title-only wall labels: "oa dr zeuner" → surname zeuner.
 * Western order without comma: last token = surname ("thomas zeuner").
 */
function nameCore(normalized: string): { surname: string; given: string[] } {
  const core = stripTitleTokens(normalized);
  if (!core) return { surname: '', given: [] };
  if (core.includes(',')) {
    const before = core.split(',')[0]?.trim() || '';
    const after = core.split(',').slice(1).join(' ').trim();
    const sur = before.split(/\s+/).filter(Boolean)[0] || '';
    return { surname: sur, given: after.split(/\s+/).filter(Boolean) };
  }
  const parts = core.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { surname: parts[0]!, given: [] };
  return { surname: parts[parts.length - 1]!, given: parts.slice(0, -1) };
}

/** Last-name token (before comma / after titles), normalized. */
function surnameToken(normalized: string): string {
  return nameCore(normalized).surname;
}

function givenTokens(normalized: string): string[] {
  return nameCore(normalized).given;
}

/**
 * Stable person identity after dropping titles.
 * Collapses OCR wall variants ("OA Dr. X" / "Dr. X" / "X") to one person for
 * unique-surname checks — counting raw labels would false-dampen matching.
 */
function personIdentityKey(normalized: string): string {
  const { surname, given } = nameCore(normalized);
  if (!surname) return '';
  return given.length ? `${surname}|${given.join(' ')}` : surname;
}

/** Distinct people sharing a surname (title variants count once). */
function surnamePersonCounts(candidates: OcrNameCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = normalizeNameKey(c.label);
    const ident = personIdentityKey(key);
    if (!ident || seen.has(ident)) continue;
    seen.add(ident);
    const sur = surnameToken(key);
    if (!sur) continue;
    counts.set(sur, (counts.get(sur) || 0) + 1);
  }
  return counts;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = b.length + 1;
  let prev = Array.from({ length: rows }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + cost));
    }
    prev = cur;
  }
  return prev[b.length] ?? 99;
}

/** 1 = identical, 0 = unrelated (small OCR typos stay high). */
export function tokenSimilarity(a: string, b: string): number {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d = editDistance(x, y);
  return Math.max(0, 1 - d / Math.max(x.length, y.length, 1));
}

export function normalizeNameKeyPublic(s: string): string {
  return normalizeNameKey(s);
}

/**
 * Fuzzy match preferred name → candidates (1.0 = exact normalized).
 * Tolerates OCR typos (e.g. last-token / given-token variations) via edit distance.
 * Optional aliases: previous OCR spellings → your corrected name.
 */
function scorePreferredCandidate(
  pref: string,
  prefSur: string,
  prefGiven: string[],
  candidate: OcrNameCandidate,
  aliasMap: Record<string, string>,
  surnamePeople: Map<string, number>
): number {
  const key = normalizeNameKey(candidate.label);
  const aliasTarget = aliasMap[key];
  const aliasHitsPreferred =
    !!aliasTarget && normalizeNameKey(aliasTarget) === pref;

  if (aliasHitsPreferred || key === pref || stripTitleTokens(key) === pref) {
    return 1;
  }

  const candSur = surnameToken(key);
  const candGiven = givenTokens(key);
  const surSim = tokenSimilarity(prefSur, candSur);
  const givenSim =
    prefGiven.length && candGiven.length
      ? Math.max(
          ...prefGiven.map((p) =>
            Math.max(...candGiven.map((g) => tokenSimilarity(p, g)))
          )
        )
      : 0;

  if (surSim >= 0.85 && givenSim >= 0.75) return 0.95;
  if (surSim >= 0.8 && givenSim >= 0.65) return 0.9;
  if (surSim >= 0.9 && givenSim >= 0.5) return 0.88;
  if (
    prefSur &&
    candSur &&
    prefSur === candSur &&
    (key.includes(pref) || pref.includes(key))
  ) {
    return 0.9;
  }
  if (
    prefSur &&
    candSur &&
    (prefSur === candSur || surSim >= 0.92) &&
    (!prefGiven.length || !candGiven.length) &&
    (surnamePeople.get(candSur) || 0) === 1
  ) {
    // Unique person with that surname on plan (wall: "OA Dr. X").
    return 0.9;
  }
  if (prefSur && candSur && prefSur === candSur) {
    const pt = new Set(
      stripTitleTokens(pref)
        .split(/[,\s]+/)
        .filter(Boolean)
    );
    const ct = stripTitleTokens(key)
      .split(/[,\s]+/)
      .filter(Boolean);
    const hit = ct.filter((t) => pt.has(t)).length;
    return hit >= 2 ? 0.85 : 0.65;
  }
  if (surSim >= 0.75 && givenSim >= 0.55) return 0.8;
  const pt = new Set(
    stripTitleTokens(pref)
      .split(/[,\s]+/)
      .filter(Boolean)
  );
  const ct = stripTitleTokens(key)
    .split(/[,\s]+/)
    .filter(Boolean);
  const hit = ct.filter((t) => pt.has(t)).length;
  if (hit >= 2) return 0.5;
  if (hit === 1) return 0.35;
  return 0;
}

export function matchPreferredName(
  preferred: string | null | undefined,
  candidates: OcrNameCandidate[],
  aliases?: Record<string, string> | null
): NameMatch | null {
  const prefRaw = String(preferred || '').replace(/\s+/g, ' ').trim();
  const pref = normalizeNameKey(prefRaw);
  if (!pref || !candidates.length) return null;

  const prefSur = surnameToken(pref);
  const prefGiven = givenTokens(pref);
  const aliasMap = aliases || {};
  const surnamePeople = surnamePersonCounts(candidates);

  let best: NameMatch | null = null;
  for (const c of candidates) {
    const score = scorePreferredCandidate(
      pref,
      prefSur,
      prefGiven,
      c,
      aliasMap,
      surnamePeople
    );
    if (!best || score > best.score) best = { candidate: c, score };
  }
  return best && best.score >= 0.65 ? best : null;
}

/**
 * All candidates that match the preferred name at/above `minScore`.
 * Used for date×duty overlays where OCR label variants must all mark.
 */
export function filterPreferredNameMatches(
  preferred: string | null | undefined,
  candidates: OcrNameCandidate[],
  aliases?: Record<string, string> | null,
  minScore = 0.8
): OcrNameCandidate[] {
  const prefRaw = String(preferred || '').replace(/\s+/g, ' ').trim();
  const pref = normalizeNameKey(prefRaw);
  if (!pref || !candidates.length) return [];

  const prefSur = surnameToken(pref);
  const prefGiven = givenTokens(pref);
  const aliasMap = aliases || {};
  const surnamePeople = surnamePersonCounts(candidates);

  return candidates.filter(
    (c) =>
      scorePreferredCandidate(
        pref,
        prefSur,
        prefGiven,
        c,
        aliasMap,
        surnamePeople
      ) >= minScore
  );
}

/**
 * Rewrite OCR labels to saved spelling (aliases + preferred fuzzy hit).
 * Keeps candidate.id as the OCR key so the matrix row can still be found.
 */
export function applySavedNameSpellings(
  candidates: OcrNameCandidate[],
  preferred: string | null | undefined,
  aliases?: Record<string, string> | null
): OcrNameCandidate[] {
  const pref = String(preferred || '').replace(/\s+/g, ' ').trim();
  const map = aliases || {};
  return candidates.map((c) => {
    const key = normalizeNameKey(c.label);
    if (map[key]) return { ...c, label: map[key] };
    if (!pref) return c;
    const hit = matchPreferredName(pref, [c], map);
    if (hit && hit.score >= 0.8) return { ...c, label: pref };
    return c;
  });
}

/**
 * Apply aliases + preferred spelling onto every matrix row name (display only).
 */
export function applyKnownSpellingsToGridRows<T extends { name: string }>(
  rows: T[],
  preferred: string | null | undefined,
  aliases?: Record<string, string> | null
): T[] {
  if (!rows.length) return rows;
  const asCandidates: OcrNameCandidate[] = rows.map((r, i) => ({
    id: normalizeNameKey(r.name) || `row-${i}`,
    label: r.name,
    yCenter: 0,
    height: 0,
  }));
  const fixed = applySavedNameSpellings(asCandidates, preferred, aliases);
  return rows.map((r, i) => ({ ...r, name: fixed[i]?.label || r.name }));
}

/** Strong enough to skip the name picker when Settings name fuzzy-matches OCR. */
export const OCR_AUTO_NAME_MIN_SCORE = 0.88;

/**
 * Confirming a roster row only picks *which* line is yours.
 * If Settings already has Mein Name, keep that spelling — never replace it with
 * OCR garbage just because the user tapped a misread row.
 * Pencil-edit to a *new* spelling (≠ OCR, ≠ preferred) is an intentional rename.
 */
export function resolveConfirmedRosterLabel(opts: {
  preferred: string | null | undefined;
  ocrLabel: string;
  pickedLabel: string;
}): string {
  const preferred = String(opts.preferred || '')
    .replace(/\s+/g, ' ')
    .trim();
  const ocr = String(opts.ocrLabel || '')
    .replace(/\s+/g, ' ')
    .trim();
  const picked = String(opts.pickedLabel || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (preferred) {
    const pickedKey = normalizeNameKey(picked);
    const ocrKey = normalizeNameKey(ocr);
    const prefKey = normalizeNameKey(preferred);
    const intentionalRename =
      !!pickedKey && pickedKey !== ocrKey && pickedKey !== prefKey;
    if (intentionalRename) return picked;
    return preferred;
  }
  return picked || ocr;
}

/**
 * Keep date header band + the selected person's horizontal row strip.
 * If the name came from a dense OCR line, that line is the row.
 */
export function extractPersonRowText(
  lines: OcrLine[],
  person: OcrNameCandidate,
  pageHeight: number
): string {
  if (person.sourceLineText) {
    const header = extractHeaderBand(lines, pageHeight);
    return [header, person.sourceLineText].filter(Boolean).join('\n');
  }

  if (!lines.length) return person.label;
  const h =
    pageHeight > 0
      ? pageHeight
      : Math.max(...lines.map((l) => l.boundingBox.y + l.boundingBox.height), 1);
  const rowPad = Math.max(person.height * 1.15, h * 0.018, 14);
  const y0 = person.yCenter - rowPad;
  const y1 = person.yCenter + rowPad;

  const header = extractHeaderBand(lines, h);
  const row = lines
    .filter((l) => {
      const cy = l.boundingBox.y + l.boundingBox.height / 2;
      return cy >= y0 && cy <= y1;
    })
    .sort((a, b) => a.boundingBox.x - b.boundingBox.x);

  const rowText = row.map((l) => l.text.trim()).filter(Boolean).join(' | ') || person.label;
  return [header, rowText].filter(Boolean).join('\n');
}

function extractHeaderBand(lines: OcrLine[], pageHeight: number): string {
  if (!lines.length || pageHeight <= 0) return '';
  const headerMax = pageHeight * 0.2;
  const header = lines
    .filter((l) => {
      const cy = l.boundingBox.y + l.boundingBox.height / 2;
      if (cy > headerMax) return false;
      return /\b(Mo|Di|Mi|Do|Fr|Sa|So|\d{1,2})\b/i.test(l.text);
    })
    .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
  return header.map((l) => l.text.trim()).join(' · ');
}

/** Plain-text row: lines that start with the chosen name (or equal). */
export function extractPersonRowFromPlainText(text: string, personLabel: string): string {
  const key = normalizeNameKey(personLabel);
  const rawLines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const hit = rawLines.filter((l) => {
    const m = l.match(NAME_PREFIX_RE) || l.match(NAME_ONLY_RE);
    if (!m) return false;
    return normalizeNameKey(formatName(m[1], m[2])) === key;
  });
  if (hit.length) return hit.join('\n');
  return personLabel;
}

/** Clear block for the Fetch preview after a person was chosen. */
export function formatSelectedPersonOutput(
  personLabel: string,
  rowBody: string,
  headingPrefix: string
): string {
  const body = String(rowBody || '').trim() || personLabel;
  return `${headingPrefix}${personLabel}\n\n${body}`;
}

/**
 * Best-effort “who owns what” preview when the user has not picked a row yet
 * (or detection only works on flat text). One block per detected name.
 */
export function formatGroupedRosterPreview(
  candidates: OcrNameCandidate[],
  lines: OcrLine[],
  pageHeight: number,
  plainText: string,
  usedPlainFallback: boolean
): string {
  if (!candidates.length) return String(plainText || '').trim();
  return candidates
    .map((c) => {
      const body = usedPlainFallback
        ? extractPersonRowFromPlainText(plainText, c.label)
        : extractPersonRowText(lines, c, pageHeight);
      return `── ${c.label} ──\n${body}`;
    })
    .join('\n\n');
}
