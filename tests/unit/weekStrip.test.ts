import {
  buildWeekStripGrid,
  isWeekSizedGrid,
  scoreWeekStrip,
  WEEK_STRIP_LAYOUT,
} from '../../src/sources/ocr/layouts/week-strip';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function L(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

function syntheticWeekBoard(): { pageWidth: number; lines: OcrLine[]; text: string } {
  const pageWidth = 900;
  const headers = ['Mo1', 'Di2', 'Mi3', 'Do4', 'Fr5', 'Sa6', 'So7'];
  const people = [
    ['Nordmann', 'Alice'],
    ['Suedmann', 'Bianca'],
    ['Westmann', 'Clara'],
  ];
  const lines: OcrLine[] = [];
  headers.forEach((h, i) => lines.push(L(h, 180 + i * 90, 18, 40)));
  people.forEach(([last, first], r) => {
    const y = 60 + r * 42;
    lines.push(L(last, 10, y, 70));
    lines.push(L(first, 10, y + 14, 50));
    for (let i = 0; i < 7; i++) {
      lines.push(L(i % 2 ? 'F' : 'U', 180 + i * 90, y + 4, 20));
    }
  });
  const text = lines.map((l) => l.text).join(' ');
  return { pageWidth, lines, text };
}

describe('week-strip layout', () => {
  it('is experimental', () => {
    expect(WEEK_STRIP_LAYOUT.status).toBe('experimental');
  });

  it('builds a week-sized grid from synthetic board', () => {
    const { pageWidth, lines } = syntheticWeekBoard();
    const grid = buildWeekStripGrid(lines, pageWidth);
    expect(grid.ok).toBe(true);
    expect(isWeekSizedGrid(grid)).toBe(true);
    expect(grid.headers.length).toBeGreaterThanOrEqual(5);
    expect(grid.headers.length).toBeLessThanOrEqual(9);
    expect(grid.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects month-wide day counts', () => {
    const pageWidth = 1400;
    const lines: OcrLine[] = [];
    const headers = Array.from({ length: 28 }, (_, i) => {
      const wd = ['Sa', 'So', 'Mo', 'Di', 'Mi', 'Do', 'Fr'][i % 7];
      return `${wd}${i + 1}`;
    });
    headers.forEach((h, i) => lines.push(L(h, 200 + i * 40, 18, 32)));
    const people = [
      ['Nordmann', 'Alice'],
      ['Suedmann', 'Bianca'],
      ['Westmann', 'Clara'],
    ];
    people.forEach(([last, first], r) => {
      const y = 60 + r * 42;
      lines.push(L(last, 10, y, 70));
      lines.push(L(first, 10, y + 14, 50));
      for (let i = 0; i < 28; i++) {
        lines.push(L(i % 2 ? 'F' : 'U', 200 + i * 40, y + 4, 16));
      }
    });
    const grid = buildWeekStripGrid(lines, pageWidth);
    expect(grid.ok).toBe(false);
    expect(grid.reason).toMatch(/week-strip/);
  });

  it('scores higher when week grid succeeds', () => {
    const { pageWidth, lines, text } = syntheticWeekBoard();
    const score = scoreWeekStrip(text, lines, pageWidth);
    expect(score).toBeGreaterThan(0.5);
  });
});
