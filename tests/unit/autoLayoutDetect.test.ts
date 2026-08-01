/**
 * Auto-detect gate: date×duty vs month-matrix must not confuse each other.
 */
import type { PackDateDutyConfig } from '../../src/packs/types';
import {
  detectOcrLayout,
  mergeLayoutDetections,
  OCR_LAYOUT_AUTO_MIN_SCORE,
} from '../../src/sources/ocr/detectLayout';
import { detectLayoutFromGray } from '../../src/sources/ocr/layouts/detectFromImage';
import { grayFromRgba } from '../../src/sources/ocr/layouts/imageGrid';
import { packShowsLayoutChips } from '../../src/sources/ocr/packLayouts';
import type { OcrLine } from '../../src/sources/ocr/recognize';

const packDateDuty: PackDateDutyConfig = {
  boardMarkers: ['Abteilung', 'Anästhesie'],
  columns: [
    { id: 'hd', short: 'HD', match: ['hausdienst'] },
    { id: 'rd', short: 'RD', match: ['rufdienst'] },
    { id: 'ld', short: 'LD', match: ['langdienst'] },
    {
      id: 'hdn',
      short: 'HDN',
      match: ['hd', 'nacht'],
      matchAll: true,
    },
  ],
};

function L(text: string, x: number, y: number, w = 50, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

function syntheticDateDutyBoard(): { lines: OcrLine[]; pageWidth: number; pageHeight: number } {
  const pageWidth = 1000;
  const pageHeight = 900;
  const lines: OcrLine[] = [
    L('Abteilung Anästhesie Dienstplan', 40, 8, 320, 16),
    L('Hausdienst', 220, 40, 80),
    L('Rufdienst', 420, 40, 80),
    L('Langdienst', 620, 40, 80),
    L('HD Nacht', 820, 40, 70),
  ];
  for (let d = 1; d <= 28; d++) {
    const y = 90 + d * 24;
    lines.push(L(`${String(d).padStart(2, '0')}.09.2026`, 18, y, 90));
    lines.push(L('PersonA', 230, y + 2, 70));
    if (d % 2 === 0) lines.push(L('PersonB', 430, y + 2, 70));
  }
  return { lines, pageWidth, pageHeight };
}

function syntheticMonthMatrixBoard(): { lines: OcrLine[]; pageWidth: number } {
  const pageWidth = 1400;
  const lines: OcrLine[] = [];
  for (let i = 0; i < 28; i++) {
    const wd = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i % 7];
    lines.push(L(`${wd}${i + 1}`, 200 + i * 40, 24, 32));
  }
  const people = [
    'Alpha, A',
    'Beta, B',
    'Gamma, C',
    'Delta, D',
    'Epsilon, E',
    'Zeta, F',
    'Eta, G',
    'Theta, H',
  ];
  people.forEach((name, r) => {
    lines.push(L(name, 12, 70 + r * 36, 100));
    for (let i = 0; i < 28; i++) {
      lines.push(L(i % 2 ? 'F' : 'U', 200 + i * 40, 74 + r * 36, 12));
    }
  });
  return { lines, pageWidth };
}

/** Dense H/V ruled table (image path → month-matrix). */
function syntheticMonthGridGray(): ReturnType<typeof grayFromRgba> {
  const w = 400;
  const h = 280;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 245;
    rgba[i * 4 + 1] = 245;
    rgba[i * 4 + 2] = 245;
    rgba[i * 4 + 3] = 255;
  }
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = (y * w + x) * 4;
        rgba[p] = rgba[p + 1] = rgba[p + 2] = 20;
      }
    }
  };
  for (let r = 0; r < 16; r++) {
    const y = 20 + r * 16;
    paint(10, y, w - 10, y + 1);
  }
  for (let c = 0; c < 28; c++) {
    const x = 40 + c * 12;
    paint(x, 10, x + 1, h - 10);
  }
  return grayFromRgba(w, h, rgba, 4);
}

describe('auto layout detect (chip-free gate)', () => {
  it('picks date-duty for Anästhesie-style board + pack vocabulary', () => {
    const board = syntheticDateDutyBoard();
    const text = board.lines.map((l) => l.text).join('\n');
    const det = detectOcrLayout(
      {
        text,
        lines: board.lines,
        pageWidth: board.pageWidth,
        pageHeight: board.pageHeight,
      },
      { dateDuty: packDateDuty, layoutPriors: { 'date-duty': 0.1 } }
    );
    expect(det.scores['date-duty']).toBeGreaterThanOrEqual(OCR_LAYOUT_AUTO_MIN_SCORE);
    expect(det.scores['date-duty']).toBeGreaterThan(det.scores['month-matrix']);
    expect(det.layoutId).toBe('date-duty');
  });

  it('picks month-matrix for classic person×day wall plan', () => {
    const board = syntheticMonthMatrixBoard();
    const text = board.lines.map((l) => l.text).join('\n');
    const det = detectOcrLayout(
      { text, lines: board.lines, pageWidth: board.pageWidth },
      { dateDuty: packDateDuty }
    );
    expect(det.layoutId).toBe('month-matrix');
    expect(det.scores['month-matrix']).toBeGreaterThan(det.scores['date-duty']);
  });

  it('does not let image month-matrix override OCR date-duty', () => {
    const board = syntheticDateDutyBoard();
    const text = board.lines.map((l) => l.text).join('\n');
    const ocrText = detectOcrLayout(
      {
        text,
        lines: board.lines,
        pageWidth: board.pageWidth,
        pageHeight: board.pageHeight,
      },
      { dateDuty: packDateDuty, layoutPriors: { 'date-duty': 0.1 } }
    );
    expect(ocrText.layoutId).toBe('date-duty');

    const image = detectLayoutFromGray(syntheticMonthGridGray());
    expect(image.layoutId).toBe('month-matrix');
    expect(image.score).toBeGreaterThanOrEqual(0.42);

    const merged = mergeLayoutDetections(image, ocrText);
    expect(merged.layoutId).toBe('date-duty');
    expect(merged.scores['date-duty']).toBeGreaterThan(merged.scores['month-matrix']);
  });

  it('still lets image win when OCR has no structure', () => {
    const image = detectLayoutFromGray(syntheticMonthGridGray());
    const ocrText = detectOcrLayout({
      text: 'zzzz nonsense',
      lines: [],
      pageWidth: 800,
    });
    const merged = mergeLayoutDetections(image, ocrText);
    expect(merged.layoutId).toBe('month-matrix');
    expect(merged.source).toBe('image');
  });

  it('hides import chips when preferredLayout is auto', () => {
    expect(
      packShowsLayoutChips({ engine: 'ocr-roster', preferredLayout: 'auto' })
    ).toBe(false);
    expect(
      packShowsLayoutChips({
        engine: 'ocr-roster',
        preferredLayout: 'auto',
        showLayoutChips: true,
      })
    ).toBe(true);
    expect(
      packShowsLayoutChips({ engine: 'ocr-roster', preferredLayout: 'month-matrix' })
    ).toBe(true);
  });
});
