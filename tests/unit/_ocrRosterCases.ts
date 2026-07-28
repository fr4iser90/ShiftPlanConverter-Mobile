/**
 * Private roster photo expectations under tmp/test-files (gitignored).
 * Never commit real names/photos — local only.
 */
import fs from 'fs';
import path from 'path';

export type CellExpect =
  | string
  | string[]
  | { prefer: string; accept: string[] };

export type RosterCaseExpect = {
  photo: string;
  person: string;
  monthHint?: string;
  note?: string;
  cells: Record<string, CellExpect>;
};

const DEFAULT_DIR = path.join(
  process.cwd(),
  'tmp',
  'test-files'
);

export function rosterCasesDir(): string {
  return process.env.SHIFTPLAN_OCR_CASES || DEFAULT_DIR;
}

export function listRosterCaseFiles(dir = rosterCasesDir()): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !f.endsWith('.regions.json'))
    .filter((f) => f !== 'package.json' && f !== 'README.json')
    .map((f) => path.join(dir, f))
    .filter((p) => {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<RosterCaseExpect>;
        return Boolean(raw.photo && raw.person && raw.cells);
      } catch {
        return false;
      }
    })
    .sort();
}

export function loadRosterCase(filePath: string): RosterCaseExpect {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RosterCaseExpect;
  if (!raw.photo || !raw.person || !raw.cells || typeof raw.cells !== 'object') {
    throw new Error(`Invalid roster case: ${filePath}`);
  }
  return raw;
}

export function loadAllRosterCases(dir = rosterCasesDir()): {
  file: string;
  expect: RosterCaseExpect;
}[] {
  return listRosterCaseFiles(dir).map((file) => ({
    file,
    expect: loadRosterCase(file),
  }));
}

/** Normalize OCR / expected tokens for comparison. */
export function normalizeCellToken(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[·•]/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function acceptList(exp: CellExpect): string[] {
  if (typeof exp === 'string') return exp === '' ? [''] : [exp];
  if (Array.isArray(exp)) return exp;
  return exp.accept?.length ? exp.accept : [exp.prefer];
}

/**
 * True when OCR cell matches ground truth.
 * - "" → empty / placeholder
 * - "/" or "//" → slash/off marks (also empty OCR ok)
 * - multi / accept-list → any listed token may match; multi prefers all present
 */
export function cellMatches(ocrCell: string, exp: CellExpect): boolean {
  const got = normalizeCellToken(ocrCell);
  const accepts = acceptList(exp).map(normalizeCellToken);

  if (accepts.length === 1 && accepts[0] === '') {
    return !got || got === '·' || got === '.' || got === '-';
  }

  if (accepts.every((a) => a === '/' || a === '//')) {
    return !got || got.includes('/') || got === '.' || got === '·' || got === '-';
  }

  for (const alt of accepts) {
    if (!alt) continue;
    if (got === alt) return true;
    if (got.includes(alt)) return true;
  }
  if (accepts.length > 1 && accepts.every((a) => !a || got.includes(a))) {
    return true;
  }
  return false;
}

/** Header key "Di8" / "Mo14" → day number for column match. */
export function dayNumberFromHeaderKey(key: string): number | null {
  const m = String(key).match(/(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 31 ? n : null;
}

export function findHeaderIndex(headers: string[], key: string): number {
  const want = normalizeCellToken(key);
  const exact = headers.findIndex((h) => normalizeCellToken(h) === want);
  if (exact >= 0) return exact;
  const day = dayNumberFromHeaderKey(key);
  if (day == null) return -1;
  return headers.findIndex((h) => {
    const m = String(h).match(/(\d{1,2})$/);
    return m && Number(m[1]) === day;
  });
}
