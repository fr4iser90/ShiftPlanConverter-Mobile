import {
  applyPackMappingToCell,
  applyPackMappingToGrid,
  collectPackCodes,
  matchDigitsToPackCode,
  refinePersonRowFromOcr,
} from '../../src/convert/parsers/ocr/applyPackMapping';
import type { MappingValue } from '../../src/convert/types';
import type { MonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';
import type { OcrLine } from '../../src/sources/ocr/recognize';

const anaesthesie: Record<string, MappingValue> = {
  '07:35-15:50': { code: 'F', type: 'work', isValidated: true },
  '08:30-16:45': { code: 'F1', type: 'work', isValidated: true },
  '13:15-21:30': { code: 'S', type: 'work', isValidated: true },
  '07:35-19:35': { code: 'B36', type: 'long', isValidated: true },
  '11:35-19:50': { code: 'M3', type: 'work', isValidated: true },
};

const colors = {
  F: '#22c55e',
  B36: '#f87171',
  URLAUB: '#a78bfa',
  MO: '#8b5cf6',
};

describe('applyPackMapping', () => {
  it('maps exact time ranges to pack codes', () => {
    expect(applyPackMappingToCell('07:35-15:50', anaesthesie)).toBe('F');
    expect(applyPackMappingToCell('07:35-19:35', anaesthesie)).toBe('B36');
  });

  it('normalizes known pack codes (Kürzel-only cells)', () => {
    const codes = collectPackCodes(anaesthesie, colors);
    expect(applyPackMappingToCell('urlauB', anaesthesie, codes)).toBe('URLAUB');
    expect(applyPackMappingToCell('b36', anaesthesie, codes)).toBe('B36');
    expect(applyPackMappingToCell('U', anaesthesie, codes)).toBe('U');
    expect(applyPackMappingToCell('MO', anaesthesie, codes)).toBe('MO');
    expect(applyPackMappingToCell('XYZ99', anaesthesie, codes)).toBe('XYZ99');
    expect(applyPackMappingToCell('06:00-14:00', anaesthesie, codes)).toBe('06:00-14:00');
  });

  it('maps mashed OCR times via pack fingerprints (Zeit-only cells)', () => {
    expect(applyPackMappingToCell('07351550', anaesthesie)).toBe('F');
    expect(applyPackMappingToCell('o7.35-15:50', anaesthesie)).toBe('F');
    expect(applyPackMappingToCell('11351950', anaesthesie)).toBe('M3');
    expect(applyPackMappingToCell('13152130', anaesthesie)).toBe('S');
  });

  it('tolerates one-digit OCR typos and reversed ranges via pack oracle', () => {
    expect(applyPackMappingToCell('18152130', anaesthesie)).toBe('S');
    expect(applyPackMappingToCell('15:50-07:35', anaesthesie)).toBe('F');
  });

  it('matchDigitsToPackCode prefers unique pack fingerprints', () => {
    const fps = [
      { digits: '07351550', start: '07:35', end: '15:50', code: 'F', dutyType: 'work' },
      { digits: '07351935', start: '07:35', end: '19:35', code: 'B36', dutyType: 'long' },
    ];
    expect(matchDigitsToPackCode('07351550', fps)).toBe('F');
    expect(matchDigitsToPackCode('xx07351935yy', fps)).toBe('B36');
    expect(matchDigitsToPackCode('17351935', fps)).toBe('B36'); // one digit off
  });

  it('maps start-only / end-only / mm+end OCR crumbs via pack fingerprints', () => {
    // Start repeated, no end → prefer shorter pack "work" over "long" sharing the start.
    expect(applyPackMappingToCell('0735-0735-07:35', anaesthesie)).toBe('F');
    expect(applyPackMappingToCell('7.35', anaesthesie)).toBe('F');
    // End repeated / end-only.
    expect(applyPackMappingToCell('15:501550', anaesthesie)).toBe('F');
    expect(applyPackMappingToCell('15501550', anaesthesie)).toBe('F');
    // Split start-minutes + end (+ trailing OCR junk).
    expect(applyPackMappingToCell('351550', anaesthesie)).toBe('F');
    expect(applyPackMappingToCell('351550166015', anaesthesie)).toBe('F');
    expect(applyPackMappingToCell('08301645', anaesthesie)).toBe('F1');
    expect(applyPackMappingToCell('2130', anaesthesie)).toBe('S');
  });

  it('canonicalizes pack code aliases (B41→B36, URLAUB→U)', () => {
    const aliases = { B41: 'B36', URLAUB: 'U' };
    const codes = collectPackCodes(anaesthesie, { ...colors, B41: '#b91c1c', U: '#a78bfa' }, aliases);
    expect(applyPackMappingToCell('B41', anaesthesie, codes, aliases)).toBe('B36');
    expect(applyPackMappingToCell('urlauB', anaesthesie, codes, aliases)).toBe('U');
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Sa1'],
      rows: [{ name: 'Nordmann, Alice', yCenter: 10, cells: ['B41', 'URLAUB'] }],
    };
    const out = applyPackMappingToGrid(grid, anaesthesie, colors, aliases);
    expect(out.rows[0].cells).toEqual(['B36', 'U']);
  });

  it('does not invent a duty from digit mash with no pack fingerprint', () => {
    const codes = collectPackCodes(anaesthesie, colors);
    // OCR garbage like hyphenated digit mush — not a pack time.
    expect(applyPackMappingToCell('07-36-07', anaesthesie, codes)).not.toBe('B36');
    expect(applyPackMappingToCell('07-36-07', anaesthesie, codes)).not.toBe('F');
    const mapped = applyPackMappingToCell('07-36-07', anaesthesie, codes);
    expect(codes.has(mapped)).toBe(false);
  });

  it('maps every cell in a grid without touching names', () => {
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Sa1', 'So2'],
      rows: [
        {
          name: 'Nordmann, Alice',
          yCenter: 10,
          cells: ['07:35-15:50', 'URLAUB', ''],
        },
      ],
    };
    const out = applyPackMappingToGrid(grid, anaesthesie, colors);
    expect(out.rows[0].name).toBe('Nordmann, Alice');
    expect(out.rows[0].cells).toEqual(['F', 'URLAUB', '']);
  });

  it('refines the known person row from OCR geometry (Kürzel or Zeit)', () => {
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Mo3', 'Di4'],
      colCenters: [200, 350],
      nameMaxX: 80,
      colGap: 40,
      rowYPad: 20,
      rows: [
        {
          name: 'Nordmann, Alice',
          yCenter: 100,
          cells: ['', 'garbage'],
        },
      ],
    };
    const lines: OcrLine[] = [
      { text: 'F', boundingBox: { x: 190, y: 95, width: 14, height: 12 } },
      { text: 'o735', boundingBox: { x: 340, y: 92, width: 30, height: 12 } },
      { text: '1550', boundingBox: { x: 345, y: 108, width: 30, height: 12 } },
    ];
    const out = refinePersonRowFromOcr(grid, 'Nordmann, Alice', lines, anaesthesie, colors);
    expect(out.rows[0].cells[0]).toBe('F');
    expect(out.rows[0].cells[1]).toBe('F');
  });

  it('bare end-minutes do not invent overnight from start-minutes alone', () => {
    const mapping: Record<string, MappingValue> = {
      ...anaesthesie,
      '19:50-07:35': { code: 'B38', type: 'night', isValidated: true },
      '13:15-21:30': { code: 'S', type: 'work', isValidated: true },
    };
    expect(applyPackMappingToCell('50', mapping)).toBe('F');
    expect(applyPackMappingToCell('50', mapping)).not.toBe('B38');
  });

  it('printed on-call code wins over shared-start day digits (MO vs M3)', () => {
    const mapping: Record<string, MappingValue> = {
      ...anaesthesie,
      '11:35-19:50': { code: 'M3', type: 'work', isValidated: true },
      '11:35-07:35': { code: 'MO', type: 'oncall', isValidated: true },
    };
    const colors = { F: '#22c55e', M3: '#93c5fd', MO: '#8b5cf6', B36: '#f87171' };
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Mi5'],
      colCenters: [500],
      nameMaxX: 80,
      colGap: 40,
      rowYPad: 20,
      rows: [{ name: 'Nordmann, Alice', yCenter: 300, cells: [''] }],
    };
    const lines: OcrLine[] = [
      { text: 'MO', boundingBox: { x: 490, y: 285, width: 20, height: 12 } },
      { text: '1135', boundingBox: { x: 495, y: 300, width: 30, height: 12 } },
      { text: '19:50', boundingBox: { x: 495, y: 315, width: 30, height: 12 } },
    ];
    const out = refinePersonRowFromOcr(grid, 'Nordmann, Alice', lines, mapping, colors);
    expect(out.rows[0].cells[0]).toBe('MO');
  });

  it('refine clears unmapped garbage instead of keeping it', () => {
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Mo3'],
      colCenters: [200],
      nameMaxX: 80,
      colGap: 40,
      rowYPad: 20,
      rows: [{ name: 'Nordmann, Alice', yCenter: 100, cells: ['15:50-16:45'] }],
    };
    const out = refinePersonRowFromOcr(grid, 'Nordmann, Alice', [], anaesthesie, colors);
    expect(out.rows[0].cells[0]).toBe('');
  });

  it('refine does not paint unmapped neighbor-row time mush into empty cells', () => {
    const grid: MonthMatrixGrid = {
      ok: true,
      headers: ['Mo3'],
      colCenters: [200],
      nameMaxX: 80,
      colGap: 40,
      rowYPad: 28,
      rows: [{ name: 'Nordmann, Alice', yCenter: 100, cells: [''] }],
    };
    const lines: OcrLine[] = [
      // Not a unique pack start/end — must stay empty
      { text: '12:00', boundingBox: { x: 190, y: 70, width: 40, height: 12 } },
      { text: '99:99-88:88', boundingBox: { x: 188, y: 105, width: 50, height: 12 } },
    ];
    const out = refinePersonRowFromOcr(grid, 'Nordmann, Alice', lines, anaesthesie, colors);
    expect(out.rows[0].cells[0]).toBe('');
  });
});
