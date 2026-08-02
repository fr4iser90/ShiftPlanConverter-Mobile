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

  it('keeps Prämedikation / Schmerz1+2 / ZD2 as distinct header columns', () => {
    const pageW = 1800;
    const pageH = 1250;
    const lines: OcrLine[] = [
      L('Abteilung Anästhesie', 40, 20, 200),
      L('Hausdienst', 200, 200, 90),
      L('HD', 330, 200, 24),
      L('Nacht', 360, 200, 50),
      L('Rufdienst', 520, 200, 80),
      L('RD', 650, 200, 24),
      L('Nacht', 680, 200, 50),
      L('Prämedikation', 820, 200, 120),
      L('1Zwischendienst', 1100, 200, 130),
      L('2', 1260, 200, 16),
      L('Langdienst', 1290, 200, 90),
      L('Schmerz1', 1470, 200, 80),
      L('Schmerz2', 1620, 200, 80),
    ];
    for (let d = 1; d <= 20; d++) {
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 40, 250 + d * 35, 80));
      lines.push(L(NAME_A, 220, 254 + d * 35, 90));
    }
    // Neighboring tokens that used to glue onto Prämedikation
    lines.push(L('Zwischendienst', 960, 200, 120));
    const built = buildDateDutyFromLines(lines, pageW, {
      dateDuty: {
        boardMarkers: ['Abteilung'],
        columns: [
          { id: 'hausdienst-nacht', short: 'HDN', match: ['hd', 'nacht'], matchAll: true },
          { id: 'rufdienst-nacht', short: 'RDN', match: ['rd', 'nacht'], matchAll: true },
          { id: 'hausdienst', short: 'HD', match: ['hausdienst'] },
          { id: 'rufdienst', short: 'RD', match: ['rufdienst'] },
          {
            id: 'praemedikation',
            short: 'PD',
            match: ['praemedikation', 'praemed', 'pramed'],
          },
          {
            id: 'zwischendienst-1',
            short: 'ZD1',
            match: ['1zwischendienst', 'zwischendienst 1', 'zd 1'],
          },
          {
            id: 'zwischendienst-2',
            short: 'ZD2',
            match: ['zwischendienst 2', 'zd 2', '2'],
          },
          { id: 'langdienst', short: 'LD', match: ['langdienst'] },
          { id: 'schmerz-1', short: 'SD1', match: ['schmerz1', 'schmerz 1'] },
          { id: 'schmerz-2', short: 'SD2', match: ['schmerz2', 'schmerz 2'] },
        ],
      },
      pageHeight: pageH,
    });
    const byId = Object.fromEntries(built.duties.map((d) => [d.id, d]));
    expect(byId['praemedikation']).toBeTruthy();
    expect(byId['praemedikation']!.xCenter).toBeLessThan(950);
    expect(byId['praemedikation']!.xCenter).toBeGreaterThan(800);
    expect(byId['zwischendienst-1']).toBeTruthy();
    expect(byId['zwischendienst-2']).toBeTruthy();
    expect(byId['schmerz-1']).toBeTruthy();
    expect(byId['schmerz-2']).toBeTruthy();
    expect(byId['schmerz-2']!.xCenter).toBeGreaterThan(byId['schmerz-1']!.xCenter);
    // Lone "2" must not steal Schmerz2
    expect(classifyDutyHeader('Schmerz2', [
      { id: 'zwischendienst-2', short: 'ZD2', match: ['2', 'zd 2'] },
      { id: 'schmerz-2', short: 'SD2', match: ['schmerz2'] },
    ])?.id).toBe('schmerz-2');
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

  it('does not drop HD names when weekday glyphs sit between date and title', () => {
    // High-res board: separate boxes Do | OA | Dr. | Sample next to the date gutter.
    const pageW = 3000;
    const pageH = 2100;
    const lines: OcrLine[] = [
      L('Abteilung Plan', 40, 10, 200),
      L('Duty A', 400, 40, 80),
      L('Duty B', 900, 40, 80),
      L('Duty Night', 1400, 40, 90),
    ];
    for (let d = 1; d <= 20; d++) {
      const y = 200 + d * 40;
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 80, y, 90, 18));
      lines.push(L(NAME_A, 1400, y + 2, 100, 18));
    }
    // Day 3 — weekday between date and title (must not glue into the person phrase).
    lines.push(L('Do', 200, 200 + 3 * 40, 36, 18));
    lines.push(L('OA', 270, 200 + 3 * 40, 30, 18));
    lines.push(L('Dr.', 318, 200 + 3 * 40, 28, 18));
    lines.push(L('Sample', 358, 200 + 3 * 40, 80, 18));
    // Day 7 — OCR pipe / accent junk on title
    lines.push(L('|OA', 520, 200 + 7 * 40, 34, 18));
    lines.push(L('Dr.', 570, 200 + 7 * 40, 28, 18));
    lines.push(L('Sample', 616, 200 + 7 * 40, 80, 18));
    const built = buildDateDutyFromLines(lines, pageW, {
      dateDuty: { ...packDateDuty, roleSuffixes: ['OA', 'OÄ'] },
      pageHeight: pageH,
    });
    expect(built.ok).toBe(true);
    const samples = built.assignments.filter((a) => /sample/i.test(a.personLabel));
    expect(samples.length).toBeGreaterThanOrEqual(2);
    expect(samples.some((a) => a.day === 3)).toBe(true);
    expect(samples.some((a) => a.day === 7)).toBe(true);
    expect(samples.every((a) => !/^(Do|Sa|Mo)\b/i.test(a.personLabel))).toBe(true);
  });

  it('keeps OÄ-titled wall names as assignments', () => {
    const lines: OcrLine[] = [
      L('Abteilung Plan', 40, 10, 200),
      L('Duty A', 200, 40, 60),
      L('Duty B', 400, 40, 60),
      L('Duty Night', 600, 40, 70),
    ];
    for (let d = 1; d <= 16; d++) {
      lines.push(L(`${String(d).padStart(2, '0')}.09.`, 20, 80 + d * 28, 70));
      lines.push(L(NAME_A, 600, 84 + d * 28, 90));
    }
    // Fragmented like board OCR: OÄ | Dr. | Sample
    lines.push(L('OÄ', 200, 84 + 3 * 28, 22));
    lines.push(L('Dr.', 226, 84 + 3 * 28, 20));
    lines.push(L('Sample', 250, 84 + 3 * 28, 70));
    lines.push(L('Hr.', 400, 84 + 6 * 28, 22));
    lines.push(L('Sample', 426, 84 + 6 * 28, 70));
    const built = buildDateDutyFromLines(lines, 900, {
      dateDuty: { ...packDateDuty, roleSuffixes: ['OA', 'OÄ'] },
      pageHeight: 800,
    });
    expect(built.ok).toBe(true);
    const samples = built.assignments.filter((a) => /sample/i.test(a.personLabel));
    expect(samples.length).toBeGreaterThanOrEqual(2);
    expect(samples.some((a) => /OÄ/i.test(a.personLabel))).toBe(true);
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
