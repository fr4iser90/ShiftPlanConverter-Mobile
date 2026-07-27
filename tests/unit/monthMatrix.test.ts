import {
  buildMonthMatrixGrid,
  formatMonthMatrixTable,
  formatShiftCell,
  splitGluedDayHeaderText,
  expandGluedDayHeaderTokens,
  fillCalendarDayGaps,
  enforceCalendarColumnLabels,
} from '../../src/sources/ocr/monthMatrix';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function L(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('month matrix grid', () => {
  const pageWidth = 1000;

  /** Synthetic anonymized plan — no workplace names. */
  const lines: OcrLine[] = [
    L('Sa1', 200, 20, 30),
    L('So2', 350, 20, 30),
    L('Mo3', 500, 20, 30),
    L('Di4', 650, 20, 30),
    L('Nordmann', 10, 80, 70),
    L('Alice', 10, 95, 50),
    L('U', 200, 88, 20),
    L('F', 500, 88, 20),
    L('07:35-15:50', 500, 102, 70),
    L('Suedmann', 10, 160, 70),
    L('Bianca', 10, 175, 50),
    L('F', 200, 168, 20),
    L('S', 650, 168, 20),
  ];

  it('recovers day columns from bare day-numbers + month/year when weekdays fail OCR', () => {
    // März 2025 starts Saturday → day 1 = Sa, day 3 = Mo
    const sparse: OcrLine[] = [
      L('März', 400, 5, 50),
      L('2025', 460, 5, 40),
      ...Array.from({ length: 14 }, (_, i) => L(String(i + 1), 200 + i * 50, 25, 18)),
      L('Nordmann', 10, 80, 70),
      L('Alice', 10, 95, 50),
      L('F', 300, 88, 20),
      L('Suedmann', 10, 160, 70),
      L('Bianca', 10, 175, 50),
      L('U', 250, 168, 20),
    ];
    const grid = buildMonthMatrixGrid(sparse, pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers.length).toBeGreaterThanOrEqual(10);
    expect(grid.headers[0]).toMatch(/^Sa1$/i);
    expect(grid.headers.some((h) => /^Mo3$/i.test(h))).toBe(true);
    expect(grid.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('formats output as week chunks (aligned columns, all people)', () => {
    const grid = buildMonthMatrixGrid(lines, pageWidth);
    const table = formatMonthMatrixTable(grid, { title: 'Roster (month matrix)' });
    expect(table).toContain('│');
    expect(table).toContain('Nordmann');
    expect(table).toContain('Suedmann');
    expect(table).toMatch(/── .+ … .+ ──|── \w/);
    expect(table.split('\n').filter((l) => l.includes('│')).length).toBeGreaterThanOrEqual(3);
  });

  it('can filter to one person row', () => {
    const grid = buildMonthMatrixGrid(lines, pageWidth);
    const one = formatMonthMatrixTable(grid, { onlyName: 'Nordmann' });
    expect(one).toContain('Nordmann');
    expect(one).not.toContain('Suedmann');
  });

  it('merges a left-only last-name fragment into the next name row', () => {
    const splitName: OcrLine[] = [
      L('Sa1', 200, 20, 30),
      L('So2', 350, 20, 30),
      L('Mo3', 500, 20, 30),
      L('Westmann', 10, 70, 80),
      L('Clara', 10, 88, 50),
      L('B36', 200, 110, 30),
      L('F', 350, 110, 20),
      L('Ostmann', 10, 180, 60),
      L('Doris', 10, 195, 50),
      L('S', 200, 188, 20),
    ];
    const grid = buildMonthMatrixGrid(splitName, pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.rows.some((r) => /Westmann/i.test(r.name) && /Clara/i.test(r.name))).toBe(true);
    expect(grid.rows.every((r) => !/^B36$/i.test(r.name))).toBe(true);
  });

  it('splits glued day-header mega-tokens', () => {
    expect(splitGluedDayHeaderText('MI5Do')).toEqual(['Mi5', 'Do']);
    expect(splitGluedDayHeaderText('24D25M26Do')).toEqual(['24', 'Di25', 'Mi26', 'Do']);
    expect(splitGluedDayHeaderText('20Fr21SoP')).toEqual(['20', 'Fr21', 'So']);
    expect(splitGluedDayHeaderText('13F14')).toEqual(['13', 'Fr14']);
    expect(splitGluedDayHeaderText('Di4')).toEqual([]);
    expect(splitGluedDayHeaderText('2025')).toEqual([]);
  });

  it('fills weekend day gaps between numbered OCR anchors', () => {
    const filled = fillCalendarDayGaps(
      [100, 150, 200, 250],
      ['Fr7', 'So', 'Mo10', 'Di11']
    );
    expect(filled.headers).toEqual(['Fr7', 'Sa8', 'So9', 'Mo10', 'Di11']);
  });

  it('hardens shift cell OCR mash into codes or plausible times', () => {
    expect(formatShiftCell(['U'])).toBe('U');
    expect(formatShiftCell(['URLAUB'])).toBe('URLAUB');
    expect(formatShiftCell(['B38'])).toBe('B38');
    expect(formatShiftCell(['07:35-15:50'])).toBe('07:35-15:50');
    expect(formatShiftCell(['07351550'])).toBe('07:35-15:50');
    expect(formatShiftCell(['99:99-88:88'])).toBe('');
    expect(formatShiftCell(['/'])).toBe('');
  });

  it('recovers columns from glued header OCR on a synthetic strip', () => {
    const glued: OcrLine[] = [
      L('SA', 100, 20, 20),
      L('o2', 140, 20, 20),
      L('Mo', 180, 20, 20),
      L('3', 205, 20, 10),
      L('Di4', 230, 20, 25),
      L('MI5Do', 270, 20, 60),
      L('6', 340, 20, 10),
      L('Nordmann', 10, 80, 70),
      L('Alice', 10, 95, 50),
      L('F', 100, 88, 20),
      L('Suedmann', 10, 160, 70),
      L('Bianca', 10, 175, 50),
      L('U', 140, 168, 20),
    ];
    const expanded = expandGluedDayHeaderTokens(glued);
    expect(expanded.some((l) => l.text === 'So2')).toBe(true);
    expect(expanded.filter((l) => /Mi5|Do/.test(l.text)).length).toBeGreaterThanOrEqual(2);
    const grid = buildMonthMatrixGrid(glued, pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers[0]).toBe('Sa1');
    expect(grid.headers).toContain('So2');
    expect(grid.headers.length).toBeGreaterThanOrEqual(5);
  });

  it('recovers Sa1 when OCR emits SA+11 beside So2', () => {
    const lines: OcrLine[] = [
      L('SA', 100, 20, 20),
      L('11', 122, 20, 12),
      L('o2', 150, 20, 20),
      L('Mo', 190, 20, 20),
      L('3', 215, 20, 10),
      L('Di4', 250, 20, 25),
      L('Mi5', 290, 20, 25),
      L('Do6', 330, 20, 25),
      L('Nordmann', 10, 80, 70),
      L('Alice', 10, 95, 50),
      L('F', 100, 88, 20),
      L('Suedmann', 10, 160, 70),
      L('Bianca', 10, 175, 50),
      L('U', 150, 168, 20),
    ];
    const grid = buildMonthMatrixGrid(lines, pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers[0]).toBe('Sa1');
    expect(grid.headers[1]).toBe('So2');
  });

  it('enforceCalendarColumnLabels fixes Sa11 and dropped tens (Mi2→Mi12)', () => {
    const centers = [100, 140, 180, 220, 260, 300, 340, 380, 420, 460, 500, 540];
    const headers = [
      'Sa11',
      'So2',
      'Mo3',
      'Di4',
      'Mi5',
      'Do6',
      'Fr7',
      'Sa8',
      'So9',
      'Mo10',
      'Di11',
      'Mi2',
    ];
    const fixed = enforceCalendarColumnLabels(centers, headers, {
      year: 2025,
      month: 2,
    });
    expect(fixed.headers[0]).toBe('Sa1');
    expect(fixed.headers[1]).toBe('So2');
    expect(fixed.headers).toContain('Mi12');
    expect(fixed.headers.every((h) => !/^Sa11$/i.test(h))).toBe(true);
    // Weekdays forced from Feb 2025 calendar (Sat=1)
    expect(fixed.headers.find((h) => /^Mo3$/i.test(h))).toBeTruthy();
  });

  it('rebuilds coherent headers from Februar cue when OCR mash shifts days', () => {
    // Mimic phone-crop failure mode: Sa11 + later Mi2, with month/year present.
    const mashed: OcrLine[] = [
      L('Februar', 400, 4, 60),
      L('2025', 470, 4, 40),
      L('Sa11', 100, 22, 36),
      L('So2', 145, 22, 28),
      L('Mo3', 190, 22, 28),
      L('Di4', 235, 22, 28),
      L('Mi5', 280, 22, 28),
      L('Do6', 325, 22, 28),
      L('Fr7', 370, 22, 28),
      L('Sa8', 415, 22, 28),
      L('So9', 460, 22, 28),
      L('Mo10', 505, 22, 32),
      L('Di11', 550, 22, 32),
      L('Mi2', 595, 22, 28),
      L('Do13', 640, 22, 32),
      L('Fr14', 685, 22, 32),
      L('Nordmann', 10, 80, 70),
      L('Alice', 10, 95, 50),
      L('F', 190, 88, 20),
      L('Suedmann', 10, 160, 70),
      L('Bianca', 10, 175, 50),
      L('U', 145, 168, 20),
    ];
    const grid = buildMonthMatrixGrid(mashed, pageWidth);
    expect(grid.ok).toBe(true);
    expect(grid.headers[0]).toBe('Sa1');
    expect(grid.headers).toContain('Mi12');
    expect(grid.headers.some((h) => /^Sa11$/i.test(h))).toBe(false);
  });
});
