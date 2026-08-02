import { enhanceLightGlyphRaster } from '@/src/sources/ocr/invertOcrEnhance';
import {
  isInvertMergeCandidate,
  mergeInvertOcrLines,
  scaleInvertLinesToPrimary,
} from '@/src/sources/ocr/invertOcrMerge';
import type { OcrLine } from '@/src/sources/ocr/recognize';

function L(text: string, x: number, y: number, w = 12, h = 10): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('invertOcrPass merge', () => {
  it('accepts short light-on-dark cell glyphs', () => {
    expect(isInvertMergeCandidate('U')).toBe(true);
    expect(isInvertMergeCandidate('/')).toBe(true);
    expect(isInvertMergeCandidate('F')).toBe(true);
    expect(isInvertMergeCandidate('F3')).toBe(true);
    expect(isInvertMergeCandidate('07:35-15:50')).toBe(false);
    expect(isInvertMergeCandidate('37435')).toBe(false);
    expect(isInvertMergeCandidate('Böhme, Patrick')).toBe(false);
  });

  it('merges inverted U where primary OCR had nothing nearby', () => {
    const primary = [L('Patrick', 95, 614, 40, 12), L('37435', 159, 597, 30, 12)];
    const inverted = [
      L('U', 170, 620, 10, 10),
      L('U', 220, 620, 10, 10),
      L('U', 270, 620, 10, 10),
      L('U', 320, 620, 10, 10),
      L('07:35', 500, 620, 40, 12), // rejected — clock
    ];
    const merged = mergeInvertOcrLines(primary, inverted);
    const us = merged.filter((l) => cleanU(l.text));
    expect(us.length).toBe(4);
    expect(merged.some((l) => l.text.includes('07:35'))).toBe(false);
  });

  it('does not duplicate an already-read U', () => {
    const primary = [L('U', 170, 620, 10, 10)];
    const inverted = [L('U', 172, 621, 10, 10)];
    const merged = mergeInvertOcrLines(primary, inverted);
    expect(merged.filter((l) => cleanU(l.text)).length).toBe(1);
  });

  it('scales inverted boxes into primary page space', () => {
    const scaled = scaleInvertLinesToPrimary(
      [L('U', 340, 1240, 20, 20)],
      { pageWidth: 2048, pageHeight: 1536 },
      { pageWidth: 1024, pageHeight: 768 }
    );
    expect(scaled[0]!.boundingBox.x).toBeCloseTo(170);
    expect(scaled[0]!.boundingBox.y).toBeCloseTo(620);
    expect(scaled[0]!.boundingBox.width).toBeCloseTo(10);
  });

  it('extracts pale-on-blue glyphs as darker than cell fill', () => {
    const w = 48;
    const h = 48;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      data[o] = 240;
      data[o + 1] = 240;
      data[o + 2] = 240;
      data[o + 3] = 255;
    }
    for (let y = 8; y < 40; y++) {
      for (let x = 8; x < 40; x++) {
        const o = (y * w + x) * 4;
        data[o] = 10;
        data[o + 1] = 60;
        data[o + 2] = 110;
      }
    }
    for (let y = 18; y < 30; y++) {
      for (let x = 18; x < 30; x++) {
        if (x === 18 || x === 29 || y === 29) {
          const o = (y * w + x) * 4;
          data[o] = 145;
          data[o + 1] = 150;
          data[o + 2] = 155;
        }
      }
    }
    const out = enhanceLightGlyphRaster(data, w, h, { upscale: 1, dilate: 0 });
    const glyph = out.data[(24 * 48 + 18) * 4]!;
    const fill = out.data[(24 * 48 + 24) * 4]!;
    const paper = out.data[0]!;
    expect(paper).toBeGreaterThan(200);
    expect(fill).toBeGreaterThan(180);
    expect(glyph).toBeLessThan(fill - 40);
  });
});

function cleanU(t: string): boolean {
  return String(t || '').trim().toUpperCase() === 'U';
}
