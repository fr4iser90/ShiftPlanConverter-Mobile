import {
  deskewDegreesFromGray,
  deskewDegreesFromOcrLines,
  OCR_DESKEW_MAX_DEG,
} from '../../src/sources/ocr/deskew';
import type { GrayImage } from '../../src/sources/ocr/layouts/imageGrid';
import type { OcrLine } from '../../src/sources/ocr/recognize';
import * as fs from 'fs';
import * as path from 'path';
import { loadGrayImageForLayout } from '../../src/sources/ocr/layouts/detectFromImage';

function L(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

/** Draw dark row lines at slope s (Δy/Δx) into a gray buffer. */
function syntheticSkewedGrid(slope: number, w = 240, h = 160): GrayImage {
  const data = new Uint8Array(w * h);
  data.fill(240);
  const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h) data[yy * w + xx] = 20;
        }
      }
    }
  };
  for (let row = 0; row < 10; row++) {
    const y0 = 18 + row * 13;
    drawLine(8, y0, w - 8, y0 + slope * (w - 16));
  }
  return { width: w, height: h, data };
}

describe('deskewDegreesFromGray', () => {
  it('detects positive row tilt (drops to the right)', () => {
    const slope = 0.2; // ~11°
    const deg = deskewDegreesFromGray(syntheticSkewedGrid(slope));
    expect(deg).toBeGreaterThan(6);
    expect(deg).toBeLessThan(18);
  });

  it('detects negative row tilt', () => {
    const deg = deskewDegreesFromGray(syntheticSkewedGrid(-0.25));
    expect(deg).toBeLessThan(-8);
    expect(deg).toBeGreaterThan(-22);
  });

  it('returns 0 on flat grid', () => {
    expect(Math.abs(deskewDegreesFromGray(syntheticSkewedGrid(0)))).toBeLessThan(1.2);
  });

  it('stays within max gate', () => {
    expect(OCR_DESKEW_MAX_DEG).toBe(25);
    const deg = deskewDegreesFromGray(syntheticSkewedGrid(0.5)); // ~26° clamped by vote window
    expect(Math.abs(deg)).toBeLessThanOrEqual(OCR_DESKEW_MAX_DEG);
  });
});

describe('deskewDegreesFromOcrLines', () => {
  it('returns degrees for clear header skew within gate', () => {
    const lines = [
      L('Mo1', 200, 20),
      L('Di2', 400, 45),
      L('Mi3', 600, 70),
      L('Do4', 800, 95),
      L('Fr5', 1000, 120),
    ];
    const deg = deskewDegreesFromOcrLines(lines, 1200);
    expect(Math.abs(deg)).toBeGreaterThanOrEqual(1.2);
    expect(Math.abs(deg)).toBeLessThanOrEqual(OCR_DESKEW_MAX_DEG);
  });
});

describe('deskewDegreesFromGray (private photo, optional)', () => {
  it('runs on a private roster JPEG when present (edge projection may be flat)', async () => {
    const dir = path.join(__dirname, '../../tmp/test-files');
    if (!fs.existsSync(dir)) return;
    const hit = fs
      .readdirSync(dir)
      .filter((n) => /\.jpe?g$/i.test(n) && !/_makierung/i.test(n) && !/-overlay/i.test(n))
      .sort()[0];
    if (!hit) return;
    const gray = await loadGrayImageForLayout(path.join(dir, hit));
    expect(gray).toBeTruthy();
    const deg = deskewDegreesFromGray(gray!);
    // Real wall photos often have axis-aligned ink noise; |deg| may be 0 here.
    // Header-slope deskew (OCR) covers steep day-label diagonals instead.
    expect(Math.abs(deg)).toBeLessThanOrEqual(OCR_DESKEW_MAX_DEG);
  });
});
