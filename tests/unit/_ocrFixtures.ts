/**
 * OCR fixtures: synthetic (in-repo) vs private workplace dumps (local /tmp only).
 *
 * Never commit real roster names/photos. Private data lives under:
 *   /tmp/shiftplan-ocr-private/   (or $SHIFTPLAN_OCR_PRIVATE)
 */
import fs from 'fs';
import path from 'path';

export type MonthMatrixDump = {
  pageWidth: number;
  pageHeight?: number;
  lines: {
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
  }[];
  meta?: Record<string, unknown>;
};

export type MonthMatrixExpected = {
  expectedNames: string[];
  nameAliases: Record<string, string>;
  mappedTimeExamples: Record<string, string>;
  knownCodes: string[];
  minPersonRows: number;
  minDayColumns: number;
  preset: string;
};

/** Local-only workplace dumps/photos — never under tests/fixtures in git. */
export function privateOcrRoot(): string {
  return (
    process.env.SHIFTPLAN_OCR_PRIVATE ||
    path.join('/tmp', 'shiftplan-ocr-private')
  );
}

function privateDumpFilename(kind: 'crop' | 'hires'): string | null {
  const envKey =
    kind === 'crop'
      ? 'SHIFTPLAN_OCR_PRIVATE_DUMP_CROP'
      : 'SHIFTPLAN_OCR_PRIVATE_DUMP_HIRES';
  const v = String(process.env[envKey] || '').trim();
  return v || null;
}

export function privateDumpPath(kind: 'crop' | 'hires'): string | null {
  const filename = privateDumpFilename(kind);
  if (!filename) return null;
  return path.join(privateOcrRoot(), 'dumps', `${filename}.json`);
}

export function hasPrivateDump(kind: 'crop' | 'hires'): boolean {
  const p = privateDumpPath(kind);
  if (!p) return false;
  return fs.existsSync(p);
}

/** Load a private geometry dump; throws if missing (caller should skip). */
export function loadMonthMatrixDump(kind: 'crop' | 'hires'): MonthMatrixDump {
  const p = privateDumpPath(kind);
  if (!p) {
    throw new Error(
      `Private OCR dump missing. Set SHIFTPLAN_OCR_PRIVATE_DUMP_${kind.toUpperCase()} and SHIFTPLAN_OCR_PRIVATE (or copy the dump into your private root).`
    );
  }
  if (!fs.existsSync(p)) {
    throw new Error(
      `Private OCR dump missing. Set SHIFTPLAN_OCR_PRIVATE_DUMP_${kind.toUpperCase()} and SHIFTPLAN_OCR_PRIVATE (or copy the dump into your private root).`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as MonthMatrixDump;
}

export function loadPrivateExpected(): MonthMatrixExpected | null {
  const p = path.join(privateOcrRoot(), 'expected.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as MonthMatrixExpected;
}

export function loadPrivateSample(): MonthMatrixDump | null {
  const p = path.join(privateOcrRoot(), 'sample.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as MonthMatrixDump;
}

/** Pack time→code examples only (no roster PII) — safe for git. */
export function loadPublicPackExpected(): {
  mappedTimeExamples: Record<string, string>;
  knownCodes: string[];
  preset: string;
} {
  const p = path.join(__dirname, '../fixtures/ocr/month-matrix/pack-expected.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
