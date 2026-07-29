import {
  applyPackMappingToCell,
  applyPackMappingToGrid,
} from '../../src/convert/parsers/ocr/applyPackMapping';
import {
  buildMonthMatrixGrid,
  matrixRowsAsNameCandidates,
} from '../../src/sources/ocr/monthMatrix';
import { isPlausiblePersonName } from '../../src/sources/ocr/names';
import type { MappingValue } from '../../src/convert/types';
import op from '../../src/packs/builtin/st-elisabeth-leipzig/mappings/pflege/op.json';
import {
  hasPrivateDump,
  loadMonthMatrixDump,
  loadPrivateExpected,
  loadPublicPackExpected,
} from './_ocrFixtures';

const packExpected = loadPublicPackExpected();
const anaesthesie = (op as { presets: Record<string, Record<string, MappingValue>> }).presets
  .Anästhesie;
const colors = (op as { colors: Record<string, string> }).colors;

function normalizeToken(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameHit(
  ocrLabel: string,
  expectedName: string,
  aliases: Record<string, string>
): boolean {
  const [expLast, expFirst] = expectedName.split(',').map((x) => x.trim());
  const ocr = normalizeToken(ocrLabel);
  const last = normalizeToken(expLast);
  const first = normalizeToken(expFirst);
  const aliasLast = Object.entries(aliases).find(([, v]) => normalizeToken(v) === last)?.[0];
  const aliasFirst = Object.entries(aliases).find(([, v]) => normalizeToken(v) === first)?.[0];
  const lastOk =
    ocr.includes(last) ||
    (aliasLast ? ocr.includes(normalizeToken(aliasLast)) : false) ||
    (last.length >= 4 && ocr.split(' ').some((t) => t.startsWith(last.slice(0, 4))));
  const firstOk =
    ocr.includes(first) ||
    (aliasFirst ? ocr.includes(normalizeToken(aliasFirst)) : false) ||
    (first.length >= 3 && ocr.split(' ').some((t) => t.startsWith(first.slice(0, 3))));
  return lastOk && firstOk;
}

describe('month-matrix pack + private dump contracts', () => {
  it('maps Anästhesie pack times to codes (one path, no PII)', () => {
    for (const [range, code] of Object.entries(packExpected.mappedTimeExamples)) {
      expect(applyPackMappingToCell(range, anaesthesie)).toBe(code);
    }
  });

  it('private crop dump: calendar gaps fill to ~28 day columns', () => {
    if (!hasPrivateDump('crop')) return;
    const fixture = loadMonthMatrixDump('crop');
    const grid = buildMonthMatrixGrid(fixture.lines, fixture.pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers.length).toBeGreaterThanOrEqual(26);
    expect(grid.headers.length).toBeLessThanOrEqual(28);
    expect(grid.headers).toContain('Sa8');
    expect(grid.headers).toContain('So9');
  });

  it('private crop dump: matrix ok + pack codes', () => {
    if (!hasPrivateDump('crop')) return;
    const fixture = loadMonthMatrixDump('crop');
    const grid = buildMonthMatrixGrid(fixture.lines, fixture.pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.rows.length).toBeGreaterThanOrEqual(8);
    expect(grid.rows.every((r) => isPlausiblePersonName(r.name))).toBe(true);

    const mapped = applyPackMappingToGrid(grid, anaesthesie, colors);
    const cellValues = mapped.rows.flatMap((r) => r.cells).filter(Boolean);
    expect(
      cellValues.some((c) => packExpected.knownCodes.includes(String(c).toUpperCase()))
    ).toBe(true);

    const privateExpected = loadPrivateExpected();
    if (privateExpected?.expectedNames?.length) {
      const labels = matrixRowsAsNameCandidates(grid).map((n) => n.label);
      const hits = privateExpected.expectedNames.filter((want) =>
        labels.some((got) => nameHit(got, want, privateExpected.nameAliases || {}))
      );
      expect(hits.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('private hires dump: ≥14 rows and ≥14 day columns', () => {
    if (!hasPrivateDump('hires')) return;
    const fixture = loadMonthMatrixDump('hires');
    const grid = buildMonthMatrixGrid(fixture.lines, fixture.pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.rows.length).toBeGreaterThanOrEqual(14);
    expect(grid.headers.length).toBeGreaterThanOrEqual(14);
  });
});
