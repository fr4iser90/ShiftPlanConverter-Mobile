import {
  detectLayoutFromGray,
  detectLayoutFromImageUri,
} from '../../src/sources/ocr/layouts/detectFromImage';
import { grayFromRgba, measureImageGrid, rotateGrayCw90, uprightRotateDegreesFromGray } from '../../src/sources/ocr/layouts/imageGrid';
import { detectOcrLayout, mergeLayoutDetections } from '../../src/sources/ocr/detectLayout';
import { OCR_TEXT_ONLY_FALLBACK } from '../../src/sources/ocr/layouts';

/** Synthetic ruled table: dark H/V lines on white. */
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
  // ~16 horizontal + ~28 vertical
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

/** Date×duty-like: many day rows, few duty columns (landscape). */
function syntheticDateDutyGray(): ReturnType<typeof grayFromRgba> {
  const w = 480;
  const h = 320;
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
  // ~30 horizontal day rows + ~10 vertical duty cols
  for (let r = 0; r < 30; r++) {
    const y = 12 + r * 10;
    paint(10, y, w - 10, y + 1);
  }
  for (let c = 0; c < 10; c++) {
    const x = 50 + c * 40;
    paint(x, 8, x + 1, h - 8);
  }
  return grayFromRgba(w, h, rgba, 4);
}

describe('image-first layout (pixels)', () => {
  it('does not tip an upright date×duty lattice just to raise month-matrix score', () => {
    const gray = syntheticDateDutyGray();
    const base = measureImageGrid(gray);
    expect(base.hLines).toBeGreaterThanOrEqual(6);
    expect(base.vLines).toBeGreaterThanOrEqual(4);
    // Wrong CW tip often invents a stronger fake month-matrix — must still stay 0.
    const tipped = measureImageGrid(rotateGrayCw90(gray));
    expect(tipped.monthMatrixScore).toBeGreaterThanOrEqual(base.monthMatrixScore - 0.05);
    expect(uprightRotateDegreesFromGray(gray)).toBe(0);
  });

  it('scores a synthetic ruled month grid as month-matrix', () => {
    const gray = syntheticMonthGridGray();
    const m = measureImageGrid(gray);
    expect(m.vLines).toBeGreaterThanOrEqual(10);
    expect(m.hLines).toBeGreaterThanOrEqual(7);
    expect(m.monthMatrixScore).toBeGreaterThanOrEqual(0.42);
    const det = detectLayoutFromGray(gray);
    expect(det.layoutId).toBe('month-matrix');
  });

  it('image lattice beats garbage OCR text when merged', () => {
    const gray = syntheticMonthGridGray();
    const image = detectLayoutFromGray(gray);
    const ocrText = detectOcrLayout({
      text: 'Aloxand rfle Yblron mmmm',
      lines: [],
      pageWidth: 800,
    });
    expect(ocrText.layoutId).toBe(OCR_TEXT_ONLY_FALLBACK);
    const merged = mergeLayoutDetections(image, ocrText);
    expect(merged.layoutId).toBe('month-matrix');
    expect(merged.source).toBe('image');
  });

  it('detects month-matrix from the real March wallplan JPEG', async () => {
    const uri = '/home/fr4iser/Downloads/IMG_20250123_133450607_HDR.jpg';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    if (!fs.existsSync(uri)) return; // skip when private photo absent
    const det = await detectLayoutFromImageUri(uri);
    expect(det).not.toBeNull();
    expect(det!.scores['month-matrix']).toBeGreaterThanOrEqual(0.42);
    expect(det!.layoutId).toBe('month-matrix');
  });

  it('detects month-matrix from the Feb wallplan JPEG', async () => {
    const uri = '/tmp/shiftplan-ocr-private/photos/month-matrix-feb-wallplan.jpg';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    if (!fs.existsSync(uri)) return;
    const det = await detectLayoutFromImageUri(uri);
    expect(det).not.toBeNull();
    expect(det!.layoutId).toBe('month-matrix');
  });
});
