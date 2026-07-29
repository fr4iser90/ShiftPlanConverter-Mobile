import {
  estimateOwnNameBox,
  estimateRegionBoxes,
} from '@/src/sources/ocr/regionSnapshots';
import { paintDragToNormBox } from '@/src/ui/OcrRegionAssistModal';
import type { MonthMatrixGrid } from '@/src/sources/ocr/monthMatrix/types';

describe('estimateOwnNameBox', () => {
  const grid: MonthMatrixGrid = {
    ok: true,
    headers: ['Mo1', 'Di2', 'Mi3'],
    nameMaxX: 200,
    rowSlope: 0,
    rows: [
      { name: 'PersonA, Alpha', yCenter: 100, cells: ['F', '/', 'M'], yNameTop: 90, yNameBot: 110 },
      { name: 'PersonB, Beta', yCenter: 200, cells: ['U', 'U', 'F'], yNameTop: 190, yNameBot: 210 },
      { name: 'PersonC, Gamma', yCenter: 300, cells: ['/', 'F', '/'], yNameTop: 290, yNameBot: 310 },
    ],
  };

  it('crops a tight band around the matched name', () => {
    const box = estimateOwnNameBox(grid, 1000, 800, 'PersonB, Beta');
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThan(0.15);
    expect(box!.y).toBeLessThan(0.35);
    expect(box!.height).toBeLessThan(0.2);
    expect(box!.width).toBeLessThan(0.45);
  });

  it('falls back to full name column when no match needed', () => {
    const boxes = estimateRegionBoxes(grid, 1000, 800);
    expect(boxes).not.toBeNull();
    expect(boxes!.name.height).toBeGreaterThan(0.2);
  });
});

describe('paintDragToNormBox', () => {
  const c = { x: 10, y: 20, w: 200, h: 300 };

  it('caps name-column width', () => {
    const box = paintDragToNormBox(10, 20, 210, 280, c, 'name-column');
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(0.28 + 1e-6);
  });

  it('clamps finger outside content', () => {
    const box = paintDragToNormBox(10, 20, 999, 999, c, 'own-row');
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1 + 1e-6);
    expect(box!.y + box!.height).toBeLessThanOrEqual(1 + 1e-6);
    expect(box!.height).toBeLessThanOrEqual(0.1 + 1e-6);
  });
});
