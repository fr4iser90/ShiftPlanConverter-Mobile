import { isPlausiblePersonName } from '../names';
import type { OcrLine } from '../recognize';
import {
  cleanCell,
  looksLikeDayHeader,
  looksLikeShiftCell,
  xCenter,
  yCenter,
} from './geometry';

function looksLikeLastNameToken(t: string): boolean {
  return /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{3,24}$/.test(t);
}

function looksLikeFirstNameToken(t: string): boolean {
  return /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']{2,14}$/.test(t) && t.length <= 14;
}

/** Fold left-column-only fragments into the next row (split last / first name). */
export function mergeNameOnlyRowFragments(
  groups: OcrLine[][],
  nameMaxX: number,
  maxYGap: number
): OcrLine[][] {
  const out: OcrLine[][] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const onlyLeft = g.every((l) => xCenter(l) < nameMaxX);
    const next = groups[i + 1];
    const probe = joinNameParts(g.map((l) => cleanCell(l.text)));
    const incomplete = !probe || !isPlausiblePersonName(probe);
    if (onlyLeft && incomplete && next && next.length) {
      const ya = g.reduce((s, l) => s + yCenter(l), 0) / g.length;
      const yb = next.reduce((s, l) => s + yCenter(l), 0) / next.length;
      if (yb - ya <= maxYGap) {
        groups[i + 1] = g.concat(next);
        continue;
      }
    }
    out.push(g);
  }
  return out;
}

/** Shape token for Last/First heuristics (OCR often lowercases the first letter). */
function shapeToken(raw: string): string {
  const t = cleanCell(raw).replace(/,+$/g, '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Pair a lone Nachname with the following Vorname.
 * Gap is measured to the *next token*, not the next group's centroid — otherwise a
 * wrongly glued First|Last below pulls the centroid too far and the real Vorname
 * never attaches to the lone Nachname above.
 *
 * If next is already [First, Last], steal only the First (leave the following Last alone).
 */
export function pairLoneNameFragments(groups: OcrLine[][], maxYGap: number): OcrLine[][] {
  const out: OcrLine[][] = [];
  const work = groups.map((g) => g.slice());
  for (let i = 0; i < work.length; i++) {
    const g = work[i];
    const next = work[i + 1];
    if (g.length === 1 && next && next.length >= 1) {
      const ya = yCenter(g[0]);
      const yb = yCenter(next[0]);
      if (yb - ya <= maxYGap) {
        const last = shapeToken(g[0].text);
        const first = shapeToken(next[0].text);
        // Lone Last + [First, Last] glued by OCR → (Last, First) + lone Last
        if (
          next.length === 2 &&
          looksLikeLastNameToken(last) &&
          looksLikeFirstNameToken(first) &&
          looksLikeLastNameToken(shapeToken(next[1].text))
        ) {
          out.push([g[0], next[0]]);
          work[i + 1] = [next[1]];
          continue;
        }
        if (next.length <= 2) {
          out.push(g.concat(next));
          i++;
          continue;
        }
      }
    }
    out.push(g);
  }
  return out;
}

export function joinNameParts(parts: string[]): string {
  const p = parts
    .map(cleanCell)
    .map((x) => x.replace(/,+$/g, '').trim())
    .map((x) =>
      x.replace(/(^|[\s\-])([a-zäöü])/g, (_, a: string, c: string) => a + c.toUpperCase())
    )
    .filter(Boolean)
    .filter((x) => !looksLikeDayHeader(x) && !looksLikeShiftCell(x));
  if (!p.length) return '';
  if (p.length === 1) {
    const m = p[0].match(
      /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']+)\s+((?:Dr\.?\s*)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-']+)$/
    );
    if (m) return `${m[1]}, ${m[2]}`;
    return p[0];
  }
  if (p.length === 2) return `${p[0]}, ${p[1]}`;
  if (p.length >= 3 && p[1].length <= 3) {
    return `${p[0]}, ${p.slice(2).join(' ')}`;
  }
  return `${p[0]}, ${p.slice(1).join(' ')}`;
}

/**
 * One Y-band may contain one person or two people OCR glued together.
 * Emit plausible "Last, First" labels only — no second layout path.
 */
export function expandNameLabels(rawParts: string[]): string[] {
  const p = normalizeNameTokens(rawParts);
  if (!p.length) return [];

  const asPairs = (tokens: string[]): string[] => {
    const out: string[] = [];
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const label = `${tokens[i]}, ${tokens[i + 1]}`;
      if (isPlausiblePersonName(label)) out.push(label);
    }
    return out;
  };

  if (p.length <= 2) {
    const n = joinNameParts(p);
    return n && isPlausiblePersonName(n) ? [n] : [];
  }

  if (p.length >= 4 && p.length % 2 === 0) {
    const paired = asPairs(p);
    if (paired.length) return paired;
  }

  if (
    p.length === 3 &&
    looksLikeLastNameToken(p[0]) &&
    looksLikeFirstNameToken(p[1]) &&
    looksLikeLastNameToken(p[2])
  ) {
    const head = `${p[0]}, ${p[1]}`;
    return isPlausiblePersonName(head) ? [head] : [];
  }

  if (p.length === 3) {
    const head = `${p[0]}, ${p[1]}`;
    const tail = `${p[1]}, ${p[2]}`;
    if (
      p[0].length <= 4 &&
      p[1].length >= 7 &&
      looksLikeFirstNameToken(p[2]) &&
      isPlausiblePersonName(tail)
    ) {
      return [tail];
    }
    if (isPlausiblePersonName(head)) return [head];
    if (isPlausiblePersonName(tail)) return [tail];
  }

  const n = joinNameParts(p);
  return n && isPlausiblePersonName(n) ? [n] : [];
}

export function normalizeNameTokens(rawParts: string[]): string[] {
  return rawParts
    .map(cleanCell)
    .map((x) => x.replace(/,+$/g, '').trim())
    .map((x) =>
      x.replace(/(^|[\s\-])([a-zäöü])/g, (_, a: string, c: string) => a + c.toUpperCase())
    )
    .filter(Boolean)
    .filter((x) => !looksLikeDayHeader(x) && !looksLikeShiftCell(x));
}

/** Split Y-groups that glued person N's first name with person N+1's last name. */
export function splitTrailingLastNameGroups(groups: OcrLine[][]): OcrLine[][] {
  const out: OcrLine[][] = [];
  for (const g of groups) {
    if (g.length !== 3) {
      out.push(g);
      continue;
    }
    const p = normalizeNameTokens(g.map((l) => l.text));
    if (
      p.length === 3 &&
      looksLikeLastNameToken(p[0]) &&
      looksLikeFirstNameToken(p[1]) &&
      looksLikeLastNameToken(p[2])
    ) {
      out.push([g[0], g[1]]);
      out.push([g[2]]);
      continue;
    }
    out.push(g);
  }
  return out;
}
