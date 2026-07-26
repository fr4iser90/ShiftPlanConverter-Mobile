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

export function privateDumpPath(id: 'crop-1920' | 'hires-3000'): string {
  return path.join(privateOcrRoot(), 'dumps', `${id}.json`);
}

export function hasPrivateDump(id: 'crop-1920' | 'hires-3000'): boolean {
  return fs.existsSync(privateDumpPath(id));
}

/** Load a private geometry dump; throws if missing (caller should skip). */
export function loadMonthMatrixDump(id: 'crop-1920' | 'hires-3000'): MonthMatrixDump {
  const p = privateDumpPath(id);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Private OCR dump missing: ${p} (set SHIFTPLAN_OCR_PRIVATE or copy dumps to /tmp/shiftplan-ocr-private/dumps/)`
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
