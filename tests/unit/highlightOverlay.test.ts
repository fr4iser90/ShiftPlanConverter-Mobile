import {
  estimateHighlightOverlays,
  nameColRightAtY,
  headerYAtX,
} from '../../src/sources/ocr/highlightOverlay';
import type { MonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';
import { estimateRegionBoxes } from '../../src/sources/ocr/regionSnapshots';

const baseGrid: MonthMatrixGrid = {
  ok: true,
  headers: ['1', '2', '3', '4', '5', '6', '7'],
  rows: [
    { name: 'Nordmann, Alice', yCenter: 400, cells: ['F', 'U', 'F', 'U', 'F', 'U', 'F'] },
    { name: 'Suedmann, Bianca', yCenter: 520, cells: ['U', 'F', 'U', 'F', 'U', 'F', 'U'] },
    { name: 'Westmann, Clara', yCenter: 640, cells: ['F', 'F', 'U', 'U', 'F', 'F', 'U'] },
  ],
  nameMaxX: 280,
  rowYPad: 40,
  colCenters: [400, 700, 1000, 1300, 1600, 1900, 2200],
  rowSlope: 0.05,
};

describe('skewed name / header overlays', () => {
  it('name column tapers with positive slope (narrower at bottom)', () => {
    const top = nameColRightAtY(280, 400, 400, 0.05);
    const bot = nameColRightAtY(280, 640, 400, 0.05);
    expect(top).toBe(280);
    expect(bot).toBeLessThan(top);
  });

  it('header baseline drops to the right with positive slope', () => {
    const yL = headerYAtX(300, 280, 280, 0.05);
    const yR = headerYAtX(300, 2000, 280, 0.05);
    expect(yR).toBeGreaterThan(yL);
  });

  it('emits many name-column + day-header segments when skewed', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 3000, 4000, null);
    const names = boxes.filter((b) => b.kind === 'name-column');
    const headers = boxes.filter((b) => b.kind === 'day-header');
    expect(names.length).toBeGreaterThan(5);
    expect(headers.length).toBeGreaterThan(5);
    // Bottom name strip narrower than top
    expect(names[names.length - 1]!.box.width).toBeLessThan(names[0]!.box.width);
    // Header y increases across x (schräg)
    expect(headers[headers.length - 1]!.box.y).toBeGreaterThan(headers[0]!.box.y);
  });

  it('own-row still lands on matched name', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 3000, 4000, 'Suedmann, Bianca');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    expect(owns.length).toBeGreaterThan(1);
    const yMid = (owns[0]!.box.y + owns[0]!.box.height / 2) * 4000;
    expect(yMid).toBeGreaterThan(480);
    expect(yMid).toBeLessThan(560);
  });

  it('crop AABB header is near first row, not image top', () => {
    const boxes = estimateRegionBoxes(baseGrid, 3000, 4000);
    expect(boxes!.header.y).toBeGreaterThan(0.05);
  });

  it('own-row height stays between neighbors (no bleed into prev row)', () => {
    const grid = {
      ok: true as const,
      headers: ['1', '2', '3'],
      rows: [
        { name: 'Nordmann, Alice', yCenter: 920, cells: ['U', 'U', 'U'] },
        { name: 'Suedmann, Bianca', yCenter: 1120, cells: ['F', 'F', 'F'] },
        { name: 'Westmann, Clara', yCenter: 1400, cells: ['F', 'F', 'F'] },
      ],
      nameMaxX: 280,
      rowYPad: 40,
      rowSlope: 0.03,
      colCenters: [400, 700, 1000],
    };
    const boxes = estimateHighlightOverlays(grid, 3000, 2250, 'Suedmann, Bianca');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    const top = Math.min(...owns.map((b) => b.box.y)) * 2250;
    const bot = Math.max(...owns.map((b) => b.box.y + b.box.height)) * 2250;
    expect(top).toBeGreaterThan(1000);
    expect(bot).toBeLessThan(1300);
    expect(top).toBeGreaterThan(920 + 40);
  });
});
