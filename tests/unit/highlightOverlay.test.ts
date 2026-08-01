import {
  estimateHighlightOverlays,
  nameColRightAtY,
  headerYAtX,
} from '../../src/sources/ocr/highlightOverlay';
import type { MonthMatrixGrid } from '../../src/sources/ocr/layouts/month-matrix';
import { estimateRegionBoxes } from '../../src/sources/ocr/regionSnapshots';

const baseGrid: MonthMatrixGrid = {
  ok: true,
  headers: ['1', '2', '3', '4', '5', '6', '7'],
  rows: [
    { name: 'Person-A, One', yCenter: 400, cells: ['F', 'U', 'F', 'U', 'F', 'U', 'F'] },
    { name: 'Person-B, Two', yCenter: 520, cells: ['U', 'F', 'U', 'F', 'U', 'F', 'U'] },
    { name: 'Person-C, Three', yCenter: 640, cells: ['F', 'F', 'U', 'U', 'F', 'F', 'U'] },
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

  it('emits one day-header box per colCenter (not fake equal segments)', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 3000, 4000, null);
    const names = boxes.filter((b) => b.kind === 'name-column');
    const headers = boxes.filter((b) => b.kind === 'day-header');
    expect(names.length).toBeGreaterThanOrEqual(baseGrid.rows.length);
    expect(headers.length).toBe(baseGrid.colCenters!.length);
    // Day boxes sit on real column centers
    // First col spans nameMaxX→mid(c0,c1); mid ≈ (280+550)/2 when clamped.
    const mid0 = (headers[0]!.box.x + headers[0]!.box.width / 2) * 3000;
    expect(mid0).toBeGreaterThan(350);
    expect(mid0).toBeLessThan(600);
    // Bottom name strip narrower than top (positive slope)
    const byY = [...names].sort((a, b) => a.box.y - b.box.y);
    expect(byY[byY.length - 1]!.box.width).toBeLessThan(byY[0]!.box.width);
    // Header y increases across x (schräg)
    expect(headers[headers.length - 1]!.box.y).toBeGreaterThan(headers[0]!.box.y);
  });

  it('own-row day segments match colCenters count', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 3000, 4000, 'Person-B, Two');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    // name gutter segment(s) + ≥1 box per day column
    expect(owns.length).toBeGreaterThanOrEqual(1 + baseGrid.colCenters!.length);
  });

  it('own-row / name strips follow slope across x (not one flat AABB)', () => {
    const boxes = estimateHighlightOverlays(baseGrid, 3000, 4000, 'Person-B, Two');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    const dayish = owns.filter((b) => b.box.x > 0.1);
    expect(dayish.length).toBeGreaterThanOrEqual(2);
    const left = dayish.reduce((a, b) => (a.box.x < b.box.x ? a : b));
    const right = dayish.reduce((a, b) => (a.box.x > b.box.x ? a : b));
    expect(right.box.y).toBeGreaterThan(left.box.y);
  });

  it('uses stored day frames instead of symmetric center widths', () => {
    const grid: MonthMatrixGrid = {
      ...baseGrid,
      dayFrames: [
        { dayIndex: 0, label: '1', x0: 320, x1: 500 },
        { dayIndex: 1, label: '2', x0: 500, x1: 760 },
        { dayIndex: 2, label: '3', x0: 760, x1: 1040 },
        { dayIndex: 3, label: '4', x0: 1040, x1: 1320 },
        { dayIndex: 4, label: '5', x0: 1320, x1: 1610 },
        { dayIndex: 5, label: '6', x0: 1610, x1: 1940 },
        { dayIndex: 6, label: '7', x0: 1940, x1: 2290 },
      ],
    };
    const boxes = estimateHighlightOverlays(grid, 3000, 4000, null);
    const headers = boxes.filter((b) => b.kind === 'day-header');
    expect(headers[0]!.box.x * 3000).toBeCloseTo(320, 0);
    expect((headers[0]!.box.x + headers[0]!.box.width) * 3000).toBeCloseTo(500, 0);
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
        { name: 'Person-A, One', yCenter: 920, cells: ['U', 'U', 'U'] },
        { name: 'Person-B, Two', yCenter: 1120, cells: ['F', 'F', 'F'] },
        { name: 'Person-C, Three', yCenter: 1400, cells: ['F', 'F', 'F'] },
      ],
      nameMaxX: 280,
      rowYPad: 40,
      rowSlope: 0.03,
      colCenters: [400, 700, 1000],
    };
    const boxes = estimateHighlightOverlays(grid, 3000, 2250, 'Person-B, Two');
    const owns = boxes.filter((b) => b.kind === 'own-row');
    const top = Math.min(...owns.map((b) => b.box.y)) * 2250;
    const bot = Math.max(...owns.map((b) => b.box.y + b.box.height)) * 2250;
    // Midpoint band between names (920↔1120↔1400) — must not cover neighbor name anchors.
    expect(top).toBeGreaterThan(920);
    expect(bot).toBeLessThan(1400);
    expect(top).toBeGreaterThan(1000);
  });
});
