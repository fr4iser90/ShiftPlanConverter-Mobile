import {
  formatOcrDutyCell,
  monthMatrixToShiftEntries,
  parseOcrDutyCell,
  patchMonthMatrixCell,
} from '../../src/convert/parsers/ocr/matrixToEntries';
import type { PackDateDutyConfig } from '../../src/packs/types';
import type { MonthMatrixGrid } from '../../src/sources/ocr/layouts/month-matrix';

const dateDuty: PackDateDutyConfig = {
  columns: [
    {
      id: 'hausdienst',
      short: 'HD',
      match: ['hausdienst'],
      times: [{ when: 'weekday', start: '11:30', end: '08:30', endNextDay: true }],
    },
    {
      id: 'langdienst',
      short: 'LD',
      match: ['langdienst'],
      times: [{ when: 'any', start: '11:30', end: '20:00' }],
    },
  ],
};

function grid(): MonthMatrixGrid {
  const headers = Array.from({ length: 10 }, (_, i) => String(i + 1));
  const cells = headers.map(() => '');
  cells[2] = 'HD'; // day 3 = Thu 2026-09-03
  cells[4] = 'LD';
  return {
    ok: true,
    headers,
    rows: [{ name: 'OA Dr. Sample', cells, yCenter: 100 }],
    overlayLayout: 'date-duty',
    rosterMonth: 9,
    rosterYear: 2026,
  };
}

describe('matrixToEntries', () => {
  it('parses duty cell overrides', () => {
    expect(parseOcrDutyCell('HD')).toEqual([{ short: 'HD' }]);
    expect(parseOcrDutyCell('HD@11:30-08:30+1')).toEqual([
      { short: 'HD', start: '11:30', end: '08:30', endNextDay: true },
    ]);
    expect(formatOcrDutyCell([{ short: 'LD', start: '11:30', end: '20:00' }])).toBe(
      'LD@11:30-20:00'
    );
  });

  it('builds overnight HD and same-day LD for matched person', () => {
    const entries = monthMatrixToShiftEntries(grid(), {
      matchedName: 'Sample, Test',
      dateDuty,
    });
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'HD',
          date: '2026-09-03',
          start: '11:30',
          end: '08:30',
        }),
        expect.objectContaining({
          type: 'LD',
          date: '2026-09-05',
          start: '11:30',
          end: '20:00',
        }),
      ])
    );
    expect(entries).toHaveLength(2);
  });

  it('patches a cell for the matched row', () => {
    const next = patchMonthMatrixCell(grid(), 'Sample, Test', '3', '');
    expect(next.rows[0]!.cells[2]).toBe('');
    const withLd = patchMonthMatrixCell(next, 'Sample, Test', '3', 'LD');
    expect(withLd.rows[0]!.cells[2]).toBe('LD');
  });
});
