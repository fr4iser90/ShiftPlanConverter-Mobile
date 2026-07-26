import {
  applyPackMappingToCell,
  applyPackMappingToGrid,
  collectPackCodes,
  matchDigitsToPackCode,
  refinePersonRowFromOcr,
} from '../../src/sources/ocr/applyPackMapping';
import type { MappingValue } from '../../src/convert/types';
import type { MonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';
import type { OcrLine } from '../../src/sources/ocr/recognize';

const anaesthesie: Record<string, MappingValue> = {
  '07:35-15:50': { code: 'F', type: 'work', isValidated: true },
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
      { digits: '07351550', start: '07:35', end: '15:50', code: 'F' },
      { digits: '07351935', start: '07:35', end: '19:35', code: 'B36' },
    ];
    expect(matchDigitsToPackCode('07351550', fps)).toBe('F');
    expect(matchDigitsToPackCode('xx07351935yy', fps)).toBe('B36');
    expect(matchDigitsToPackCode('17351935', fps)).toBe('B36'); // one digit off
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
