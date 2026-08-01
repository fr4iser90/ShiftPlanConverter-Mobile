import { applyPackMappingToGrid } from '../../src/convert/parsers/ocr/applyPackMapping';
import type { PackDateDutyConfig } from '../../src/packs/types';
import {
  buildDateDutyFromLines,
  classifyDutyHeader,
  dateDutyToPersonDayGrid,
  scoreDateDuty,
} from '../../src/sources/ocr/layouts/date-duty/build';
import { detectOcrLayout } from '../../src/sources/ocr/detectLayout';
import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import type { OcrLine } from '../../src/sources/ocr/recognize';

/** Synthetic names only — never real roster identities. */
const NAME_A = 'Alpha, Beta';
const NAME_B_FRAGMENTS = ['OA', 'Dr.', 'Sample'] as const;
const NAME_B_MATCH = 'Sample, Test';

const packDateDuty: PackDateDutyConfig = {
  boardMarkers: ['Abteilung'],
  columns: [
    {
      id: 'duty-night',
      short: 'DN',
      match: ['duty', 'night'],
      matchAll: true,
    },
    { id: 'duty-a', short: 'A', match: ['duty a', 'dutya'] },
    { id: 'duty-b', short: 'B', match: ['duty b', 'dutyb'] },
  ],
};

function L(text: string, x: number, y: number, w = 50, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('date-duty pack vocabulary', () => {
  it('scores 0 without pack columns', () => {
    expect(scoreDateDuty('Hausdienst Rufdienst 01.09 02.09', [], 1000, null)).toBe(0);
    expect(classifyDutyHeader('Hausdienst', null)).toBeNull();
  });

  it('matches pack columns (order + matchAll)', () => {
    expect(classifyDutyHeader('Duty Night WE', packDateDuty.columns)?.id).toBe('duty-night');
    expect(classifyDutyHeader('Duty A', packDateDuty.columns)?.id).toBe('duty-a');
    expect(classifyDutyHeader('Unknown Col', packDateDuty.columns)).toBeNull();
  });

  it('auto-detect prefers date-duty when pack columns + date rows present', () => {
    const lines: OcrLine[] = [
      L('Abteilung Plan', 40, 10, 200),
      L('Duty A', 200, 40, 60),
      L('Duty B', 400, 40, 60),
      L('Duty Night', 600, 40, 70),
    ];
    for (let d = 1; d <= 20; d++) {
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 20, 80 + d * 28, 70));
      lines.push(L(NAME_A, 200, 84 + d * 28, 90));
    }
    const text = lines.map((l) => l.text).join('\n');
    const det = detectOcrLayout(
      { text, lines, pageWidth: 900 },
      { dateDuty: packDateDuty }
    );
    expect(det.scores['date-duty']).toBeGreaterThanOrEqual(0.42);
    expect(det.layoutId).toBe('date-duty');
  });

  it('stores OCR geometry for overlays (duty xCenters + date bands)', () => {
    const lines: OcrLine[] = [
      L('Abteilung Plan', 40, 10, 200),
      L('Duty A', 200, 40, 60),
      L('Duty B', 400, 40, 60),
      L('Duty Night', 600, 40, 70),
    ];
    for (let d = 1; d <= 20; d++) {
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 20, 80 + d * 28, 70));
      lines.push(L(NAME_A, 200, 84 + d * 28, 90));
      if (d % 3 === 0) {
        // Fragmented like ML Kit: OA | Dr. | Sample
        const y = 84 + d * 28;
        lines.push(L(NAME_B_FRAGMENTS[0], 400, y, 22));
        lines.push(L(NAME_B_FRAGMENTS[1], 426, y, 20));
        lines.push(L(NAME_B_FRAGMENTS[2], 450, y, 60));
      }
    }
    const built = buildDateDutyFromLines(lines, 900, {
      dateDuty: packDateDuty,
      pageHeight: 800,
    });
    expect(built.ok).toBe(true);
    expect(built.assignments.some((a) => /sample/i.test(a.personLabel))).toBe(true);
    const grid = dateDutyToPersonDayGrid(built);
    expect(grid.ok).toBe(true);
    expect(grid.overlayLayout).toBe('date-duty');
    expect(grid.nameMaxX).toBeGreaterThan(60);
    expect(grid.colCenters?.length).toBe(3);
    expect(grid.colCenters![0]).toBeGreaterThan(150);
    expect(grid.dateDutyRows?.length).toBeGreaterThanOrEqual(5);

    const boxes = estimateHighlightOverlays(grid, 900, 800, NAME_B_MATCH);
    const names = boxes.filter((b) => b.kind === 'name-column');
    const headers = boxes.filter((b) => b.kind === 'day-header');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    expect(names.length).toBe(1);
    expect(names[0]!.box.x).toBeLessThan(0.15);
    expect(names[0]!.box.width).toBeGreaterThan(0.08);
    expect(headers.length).toBe(3);
    expect(owns.length).toBeGreaterThanOrEqual(2);
    // Own cells sit in duty columns, not in the date gutter.
    expect(owns.every((b) => b.box.x > 0.15)).toBe(true);
  });

  it('keeps duty shorts in the table (preset mapGrid must not wipe date-duty)', () => {
    const lines: OcrLine[] = [
      L('Abteilung Plan', 40, 10, 200),
      L('Duty A', 200, 40, 60),
      L('Duty B', 400, 40, 60),
      L('Duty Night', 600, 40, 70),
    ];
    for (let d = 1; d <= 20; d++) {
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 20, 80 + d * 28, 70));
      lines.push(L(NAME_A, 200, 84 + d * 28, 90));
    }
    const built = buildDateDutyFromLines(lines, 900, {
      dateDuty: packDateDuty,
      pageHeight: 800,
    });
    const grid = dateDutyToPersonDayGrid(built);
    expect(built.ok).toBe(true);
    expect(grid.ok).toBe(true);
    expect(grid.overlayLayout).toBe('date-duty');
    const filledBefore = grid.rows.reduce(
      (n, r) => n + r.cells.filter((c) => String(c || '').trim()).length,
      0
    );
    expect(filledBefore).toBeGreaterThanOrEqual(10);
    // Preset with only F/U (LOGA-style allow-list) would wipe duty shorts without the guard.
    const wiped = applyPackMappingToGrid(grid, {
      F: { code: 'F', type: 'shift' },
      U: { code: 'U', type: 'shift' },
    });
    const filledAfter = wiped.rows.reduce(
      (n, r) => n + r.cells.filter((c) => String(c || '').trim()).length,
      0
    );
    expect(filledAfter).toBe(filledBefore);
    expect(wiped.rows.some((r) => r.cells.some((c) => /A|B|DN/i.test(c)))).toBe(true);
  });

  it('marks all preferred-name OCR variants as own-row overlays', () => {
    const lines: OcrLine[] = [
      L('Abteilung Plan', 40, 10, 200),
      L('Duty A', 200, 40, 60),
      L('Duty B', 400, 40, 60),
      L('Duty Night', 600, 40, 70),
    ];
    for (let d = 1; d <= 20; d++) {
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 20, 80 + d * 28, 70));
      lines.push(L(NAME_A, 200, 84 + d * 28, 90));
    }
    // Same person, different OCR wall spellings across duties/days.
    lines.push(L('OA Dr. Sample', 400, 84 + 3 * 28, 100));
    lines.push(L('Dr. Sample', 600, 84 + 6 * 28, 80));
    lines.push(L('Sample', 400, 84 + 9 * 28, 70));
    lines.push(L('OA Dr. Sample', 200, 84 + 12 * 28, 100));
    const built = buildDateDutyFromLines(lines, 900, {
      dateDuty: packDateDuty,
      pageHeight: 800,
    });
    expect(built.ok).toBe(true);
    const sampleHits = built.assignments.filter((a) => /sample/i.test(a.personLabel));
    expect(sampleHits.length).toBeGreaterThanOrEqual(3);
    const grid = dateDutyToPersonDayGrid(built);
    const owns = estimateHighlightOverlays(grid, 900, 800, NAME_B_MATCH).filter(
      (b) => b.kind === 'own-row'
    );
    expect(owns.length).toBe(sampleHits.length);
  });

  it('fills missing bottom date rows so the month table is complete', () => {
    const lines: OcrLine[] = [
      L('Abteilung', 40, 10, 100),
      L('Duty A', 200, 40, 60),
      L('Duty B', 400, 40, 60),
    ];
    // Only first half of the month in OCR — bottom dates "missing".
    for (let d = 1; d <= 16; d++) {
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 20, 80 + d * 26, 70));
      lines.push(L(NAME_A, 220, 84 + d * 26, 90));
    }
    // Person on a late day without a date glyph (should still bind after gap-fill).
    lines.push(L('OA Dr. Sample', 220, 80 + 28 * 26, 100));
    const built = buildDateDutyFromLines(lines, 900, {
      dateDuty: packDateDuty,
      pageHeight: 1100,
    });
    expect(built.ok).toBe(true);
    expect(built.dateRows.length).toBeGreaterThanOrEqual(28);
    const grid = dateDutyToPersonDayGrid(built);
    expect(grid.headers.length).toBeGreaterThanOrEqual(28);
    expect(grid.dateDutyRows?.length).toBeGreaterThanOrEqual(28);
  });
});
