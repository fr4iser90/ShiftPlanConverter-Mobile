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
      lines.push(L('PersonA', 200, 84 + d * 28, 80));
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
      lines.push(L('PersonA', 200, 84 + d * 28, 80));
      if (d % 3 === 0) {
        // Fragmented like ML Kit: OA | Dr. | Zeuner
        const y = 84 + d * 28;
        lines.push(L('OA', 400, y, 22));
        lines.push(L('Dr.', 426, y, 20));
        lines.push(L('Zeuner', 450, y, 60));
      }
    }
    const built = buildDateDutyFromLines(lines, 900, {
      dateDuty: packDateDuty,
      pageHeight: 800,
    });
    expect(built.ok).toBe(true);
    expect(built.assignments.some((a) => /zeuner/i.test(a.personLabel))).toBe(true);
    const grid = dateDutyToPersonDayGrid(built);
    expect(grid.ok).toBe(true);
    expect(grid.overlayLayout).toBe('date-duty');
    expect(grid.nameMaxX).toBeGreaterThan(60);
    expect(grid.colCenters?.length).toBe(3);
    expect(grid.colCenters![0]).toBeGreaterThan(150);
    expect(grid.dateDutyRows?.length).toBeGreaterThanOrEqual(5);

    const boxes = estimateHighlightOverlays(grid, 900, 800, 'Zeuner, Thomas');
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
});
