import { mergeOcrPageSizeWithImage } from '../../src/sources/ocr/recognize';
import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import { estimateRegionBoxes } from '../../src/sources/ocr/regionSnapshots';
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
      { name: 'Angeli, Elisabeth', yCenter: 400, cells: ['F', 'U', 'F'] },
      { name: 'Böhme, Patrick', yCenter: 520, cells: ['F', 'M2', 'F'] },
      { name: 'Bunk, Jacqueline', yCenter: 640, cells: ['U', 'F', 'U'] },
    ],
    nameMaxX: 280,
    rowYPad: 40,
    rowSlope: 0.04,
    colCenters: [400, 700, 1000],
  };

  it('places own-row name strip on Böhme y — not neighbor', () => {
    const pageW = 3000;
    const pageH = 4000;
    const boxes = estimateHighlightOverlays(grid, pageW, pageH, 'Böhme, Patrick');
    const nameStrip = boxes.filter((b) => b.kind === 'own-row')[0]!;
    const yMid = (nameStrip.box.y + nameStrip.box.height / 2) * pageH;
    expect(yMid).toBeGreaterThan(480);
    expect(yMid).toBeLessThan(560);
    // Wrong if we had used bbox-only pageH≈640: y would map differently on full image.
    const wrongPageH = 700;
    const wrong = estimateHighlightOverlays(grid, pageW, wrongPageH, 'Böhme, Patrick');
    const wrongMid = (wrong[2]!.box.y + wrong[2]!.box.height / 2) * pageH;
    // Same OCR y but wrong page → different place on real image
    expect(Math.abs(wrongMid - yMid)).toBeGreaterThan(50);
  });

  it('day segments follow positive slope (later x → lower y)', () => {
    const boxes = estimateHighlightOverlays(grid, 3000, 4000, 'Böhme, Patrick');
    const segs = boxes.filter((b) => b.kind === 'own-row').slice(1);
    expect(segs.length).toBeGreaterThan(5);
    const first = segs[0]!.box.y;
    const last = segs[segs.length - 1]!.box.y;
    expect(last).toBeGreaterThan(first);
  });

  it('header band stays near first row, not at image top', () => {
    const boxes = estimateRegionBoxes(grid, 3000, 4000);
    expect(boxes!.header.y).toBeGreaterThan(0.05);
    expect(boxes!.header.height).toBeLessThan(0.05);
  });
});
