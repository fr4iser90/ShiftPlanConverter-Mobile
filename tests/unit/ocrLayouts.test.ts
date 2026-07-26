import {
  applyOcrLayoutPostprocess,
  DEFAULT_OCR_LAYOUT_ID,
  getOcrLayout,
  isAutoOcrLayout,
  listOcrLayouts,
  requireOcrLayout,
} from '../../src/sources/ocr/layouts';
import { detectOcrLayout } from '../../src/sources/ocr/detectLayout';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function L(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

/** Synthetic anonymized wall-plan geometry for layout detection. */
function syntheticWallPlan(): { pageWidth: number; lines: OcrLine[] } {
  const pageWidth = 1400;
  const headers = Array.from({ length: 28 }, (_, i) => {
    const wd = ['Sa', 'So', 'Mo', 'Di', 'Mi', 'Do', 'Fr'][i % 7];
    return `${wd}${i + 1}`;
  });
  const people = [
    ['Nordmann', 'Alice'],
    ['Suedmann', 'Bianca'],
    ['Westmann', 'Clara'],
    ['Ostmann', 'Doris'],
    ['Bergmann', 'Elena'],
    ['Talmann', 'Franz'],
    ['Seemann', 'Greta'],
    ['Waldmann', 'Helena'],
    ['Feldmann', 'Iris'],
    ['Steinmann', 'Jonas'],
  ];
  const lines: OcrLine[] = [];
  headers.forEach((h, i) => lines.push(L(h, 200 + i * 40, 18, 32)));
  people.forEach(([last, first], r) => {
    const y = 60 + r * 42;
    lines.push(L(last, 10, y, 60));
    lines.push(L(first, 10, y + 14, 40));
    for (let i = 0; i < 28; i++) {
      lines.push(L(i % 2 ? 'F' : 'U', 200 + i * 40, y + 4, 16));
    }
  });
  return { pageWidth, lines };
}

describe('OCR layouts', () => {
  it('defaults to auto (detect once, then one path)', () => {
    expect(DEFAULT_OCR_LAYOUT_ID).toBe('auto');
    const ids = listOcrLayouts().map((l) => l.id);
    expect(ids[0]).toBe('auto');
    expect(ids).toEqual([
      'auto',
      'month-matrix',
      'raw-review',
      'list-protocol',
      'week-strip',
    ]);
    expect(isAutoOcrLayout('auto')).toBe(true);
    expect(isAutoOcrLayout('month-matrix')).toBe(false);
  });

  it('marks auto/month experimental; others stub/ready', () => {
    expect(requireOcrLayout('auto').status).toBe('experimental');
    expect(requireOcrLayout('month-matrix').status).toBe('experimental');
    expect(requireOcrLayout('list-protocol').status).toBe('stub');
    expect(requireOcrLayout('week-strip').status).toBe('stub');
    expect(requireOcrLayout('raw-review').status).toBe('ready');
  });

  it('rejects unknown layout ids', () => {
    expect(getOcrLayout('not-a-layout')).toBeNull();
    expect(() => requireOcrLayout('not-a-layout')).toThrow(/Unknown OCR layout/);
  });

  it('postprocess trims whitespace', () => {
    const messy = '  Mo 01 F  \n\n\n  Di 02 S  \r\n';
    expect(applyOcrLayoutPostprocess('list-protocol', messy)).toBe('Mo 01 F\n\nDi 02 S');
  });
});

describe('detectOcrLayout', () => {
  it('picks month-matrix for synthetic wall-plan geometry', () => {
    const board = syntheticWallPlan();
    const text = board.lines.map((l) => l.text).join('\n');
    const det = detectOcrLayout({
      text,
      lines: board.lines,
      pageWidth: board.pageWidth,
    });
    expect(det.layoutId).toBe('month-matrix');
    expect(det.score).toBeGreaterThanOrEqual(0.42);
    expect(det.scores['month-matrix']).toBeGreaterThan(det.scores['list-protocol']);
  });

  it('picks list-protocol for dated protocol lines', () => {
    const text = [
      '01.02.2026 F 07:00-15:30',
      '02.02.2026 S 14:00-22:00',
      '03.02.2026 N 22:00-06:00',
      '04.02.2026 F 07:00-15:30',
      '05.02.2026 U',
    ].join('\n');
    const det = detectOcrLayout({ text, lines: [], pageWidth: 1000 });
    expect(det.layoutId).toBe('list-protocol');
  });

  it('falls back to raw-review when structure is unclear', () => {
    const det = detectOcrLayout({
      text: 'hello world\nnothing useful',
      lines: [],
      pageWidth: 800,
    });
    expect(det.layoutId).toBe('raw-review');
  });
});
