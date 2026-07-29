import { mergeOcrPageSizeWithImage } from '../../src/sources/ocr/recognize';
import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import type { MonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';

describe('mergeOcrPageSizeWithImage', () => {
  it('uses full image size when larger than bbox max (fixes overlay/crop drift)', () => {
    const m = mergeOcrPageSizeWithImage(900, 1100, 3000, 4000);
    expect(m.pageWidth).toBe(3000);
    expect(m.pageHeight).toBe(4000);
  });

  it('keeps bbox when image unknown', () => {
    const m = mergeOcrPageSizeWithImage(900, 1100, null, null);
    expect(m.pageWidth).toBe(900);
    expect(m.pageHeight).toBe(1100);
  });
});

describe('overlay coords with full image page', () => {
  const grid: MonthMatrixGrid = {
    ok: true,
    headers: ['1', '2', '3'],
    rows: [
      { name: 'PersonA, Alpha', yCenter: 400, cells: ['F', 'U', 'F'] },
      { name: 'PersonB, Beta', yCenter: 520, cells: ['F', 'M2', 'F'] },
      { name: 'PersonC, Gamma', yCenter: 640, cells: ['U', 'F', 'U'] },
    ],
    nameMaxX: 280,
    rowYPad: 40,
    rowSlope: 0.04,
    colCenters: [400, 700, 1000],
  };

  it('places own-row name strip on matched row y — not neighbor', () => {
    const pageW = 3000;
    const pageH = 4000;
    const boxes = estimateHighlightOverlays(grid, pageW, pageH, 'PersonB, Beta');
    const nameStrip = boxes.filter((b) => b.kind === 'own-row')[0]!;
    const yMid = (nameStrip.box.y + nameStrip.box.height / 2) * pageH;
    expect(yMid).toBeGreaterThan(480);
    expect(yMid).toBeLessThan(560);
  });
});
