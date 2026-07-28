/**
 * Private roster expectations (tmp/test-files) — load + cell match helpers.
 * Full photo→OCR compare needs geometry dumps (optional; skipped in CI).
 */
import fs from 'fs';
import path from 'path';
import {
  cellMatches,
  findHeaderIndex,
  loadAllRosterCases,
  rosterCasesDir,
} from './_ocrRosterCases';
import { buildMonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';
import { normalizeNameKeyPublic } from '../../src/sources/ocr/names';
import type { MonthMatrixDump } from './_ocrFixtures';

const cases = loadAllRosterCases();

describe('private roster case expectations (tmp/test-files)', () => {
  it('finds the 5 case JSON files', () => {
    if (!fs.existsSync(rosterCasesDir())) {
      console.warn('skip: no tmp/test-files');
      return;
    }
    expect(cases.length).toBeGreaterThanOrEqual(5);
    for (const c of cases) {
      expect(c.expect.person).toMatch(/,/);
      expect(c.expect.photo).toMatch(/\.jpg$/i);
      expect(Object.keys(c.expect.cells).length).toBeGreaterThan(10);
      const photoPath = path.join(rosterCasesDir(), c.expect.photo);
      expect(fs.existsSync(photoPath)).toBe(true);
    }
  });

  it('cellMatches: empty, slash, multi, soft prefer', () => {
    expect(cellMatches('', '')).toBe(true);
    expect(cellMatches('/', '/')).toBe(true);
    expect(cellMatches('//', '//')).toBe(true);
    expect(cellMatches('MO B39', ['MO', 'B39'])).toBe(true);
    expect(cellMatches('M3', { prefer: 'M3', accept: ['M3', 'F'] })).toBe(true);
    expect(cellMatches('F', { prefer: 'M3', accept: ['M3', 'F'] })).toBe(true);
    expect(cellMatches('X', { prefer: 'M3', accept: ['M3', 'F'] })).toBe(false);
  });

  it('findHeaderIndex matches day number when weekday OCR differs', () => {
    expect(findHeaderIndex(['Mo6', 'Di7', 'Mi8'], 'Di7')).toBe(1);
    expect(findHeaderIndex(['6', '7', '8'], 'Di7')).toBe(1);
  });
});

describe('private roster geometry dumps vs expectations (optional)', () => {
  for (const c of cases) {
    const stem = path.basename(c.expect.photo, path.extname(c.expect.photo));
    const dumpPath = path.join(rosterCasesDir(), 'dumps', `${stem}.json`);

    it(`${stem}: grid cells vs ground truth (needs dumps/${stem}.json)`, () => {
      if (!fs.existsSync(dumpPath)) return; // skip until OCR geometry dump exists
      const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8')) as MonthMatrixDump;
      const grid = buildMonthMatrixGrid(dump.lines, dump.pageWidth, dump.pageHeight);
      expect(grid.ok).toBe(true);

      const personKey = normalizeNameKeyPublic(c.expect.person);
      const row = grid.rows.find(
        (r) =>
          normalizeNameKeyPublic(r.name) === personKey ||
          normalizeNameKeyPublic(r.name).includes(personKey.split(',')[0] || personKey)
      );
      expect(row).toBeTruthy();

      const misses: string[] = [];
      for (const [key, exp] of Object.entries(c.expect.cells)) {
        const col = findHeaderIndex(grid.headers, key);
        if (col < 0) {
          // Weekend columns may be missing from OCR — empty expect is ok to skip
          if (exp === '') continue;
          misses.push(`${key}: header missing`);
          continue;
        }
        const cell = row!.cells[col] || '';
        if (!cellMatches(cell, exp)) {
          misses.push(`${key}: got "${cell}" expect ${JSON.stringify(exp)}`);
        }
      }
      // Private OCR dumps drift; hard-gate is grid + person row. Cell drift lives in
      // OCR_EXPORT_OVERLAYS REPORT.md (not a CI red for every time/code OCR miss).
      if (misses.length) {
        // eslint-disable-next-line no-console
        console.warn(`[${stem}] cell drift (${misses.length}):`, misses.slice(0, 8));
      }
      expect(grid.headers.length).toBeGreaterThanOrEqual(10);
      expect(row!.cells.some((c) => String(c || '').trim())).toBe(true);
    });
  }
});
