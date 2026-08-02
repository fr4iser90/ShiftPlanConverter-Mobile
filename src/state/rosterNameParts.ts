/**
 * Split / compose the preferred roster name.
 * Stored form: `Last, First` (no personal title — wall roles like OA/Dr. stay OCR-side).
 */

export type RosterNameParts = {
  last: string;
  first: string;
};

/** Leading honorifics on legacy saved strings — strip when parsing into fields. */
const TITLE_PREFIX_RE =
  /^(Dr\.?|Prof\.?|Med\.?|Dipl\.?-?(?:Ing\.?|Med\.?)?|Frau|Herr|Hr\.?|Fr\.?)\s+/i;

export function emptyRosterNameParts(): RosterNameParts {
  return { last: '', first: '' };
}

/**
 * Parse saved / legacy string into fields.
 * Supports `Last, First`, legacy `Dr. Last, First`, and loose `First Last`.
 */
export function parseRosterNameParts(raw: string | null | undefined): RosterNameParts {
  let s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return emptyRosterNameParts();

  const tm = TITLE_PREFIX_RE.exec(s);
  if (tm) s = s.slice(tm[0].length).trim();

  if (s.includes(',')) {
    const comma = s.indexOf(',');
    return {
      last: s.slice(0, comma).trim(),
      first: s.slice(comma + 1).trim(),
    };
  }

  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      last: parts[parts.length - 1]!,
      first: parts.slice(0, -1).join(' '),
    };
  }
  return { last: s, first: '' };
}

/** Compose for AsyncStorage / OCR preferred match. Empty if no last name. */
export function composeRosterNameParts(parts: RosterNameParts): string {
  const last = String(parts.last || '')
    .replace(/\s+/g, ' ')
    .trim();
  const first = String(parts.first || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!last) return '';
  return first ? `${last}, ${first}` : last;
}
