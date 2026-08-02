import {
  colBoundsFromCenters,
  dayFramesFromBounds,
  dayColBoundsFromVerticals,
  glyphInLatticeCell,
  headerBandFromLattice,
  owningColIndexFromBounds,
  scoreLatticeColumns,
  snapDayCentersToLattice,
} from '@/src/sources/ocr/layouts/month-matrix/lattice';

describe('lattice', () => {
  it('builds day cell bounds from vertical rules', () => {
    const bounds = dayColBoundsFromVerticals(
      [50, 120, 200, 280, 360, 440],
      120,
      500
    );
    expect(bounds.length).toBeGreaterThanOrEqual(3);
    expect(bounds[0]!.x0).toBeLessThan(bounds[0]!.x1);
    expect(bounds[0]!.cx).toBeCloseTo((bounds[0]!.x0 + bounds[0]!.x1) / 2);
  });

  it('snaps OCR day centers onto lattice midpoints', () => {
    const vXs = [100, 180, 260, 340, 420];
    const centers = [195, 275, 355]; // slightly off
    const headers = ['Mo1', 'Di2', 'Mi3'];
    const out = snapDayCentersToLattice(centers, headers, vXs, 100, 500);
    // Full lattice strip (not only the 3 OCR hits).
    expect(out.bounds.length).toBeGreaterThanOrEqual(3);
    expect(out.matched).toBe(3);
    expect(out.centers.length).toBe(out.bounds.length);
    // OCR hits land on V-gap midpoints
    expect(out.centers).toContainEqual(expect.closeTo(220, 0));
    expect(out.headers).toContain('Mo1');
  });

  it('header band uses H-line above first person when no glyph band', () => {
    const hb = headerBandFromLattice([40, 80, 200, 300], 220);
    expect(hb).not.toBeNull();
    expect(hb!.bot).toBe(200);
    expect(hb!.top).toBeLessThan(hb!.bot);
  });

  it('header band stays glyph-tight when H-span is fat', () => {
    const hb = headerBandFromLattice([40, 80, 200, 300], 220, 50, 75);
    expect(hb).not.toBeNull();
    expect(hb!.top).toBe(50);
    expect(hb!.bot).toBe(75);
  });

  it('owningColIndexFromBounds uses printed cell intervals', () => {
    const bounds = [
      { x0: 100, x1: 180, cx: 140 },
      { x0: 180, x1: 260, cx: 220 },
      { x0: 260, x1: 340, cx: 300 },
    ];
    expect(owningColIndexFromBounds(150, bounds)).toBe(0);
    expect(owningColIndexFromBounds(200, bounds)).toBe(1);
    expect(owningColIndexFromBounds(300, bounds)).toBe(2);
  });

  it('scores regular lattice columns as usable printed frames', () => {
    const out = scoreLatticeColumns([100, 180, 260, 340, 420], 100, 500, 4);
    expect(out.quality.ok).toBe(true);
    expect(out.quality.inferredCols).toBeGreaterThanOrEqual(4);
    expect(out.quality.dayPitchCv).toBeLessThan(0.22);
  });

  it('flags irregular lattice columns as not reliable for snap', () => {
    const out = scoreLatticeColumns([120, 145, 240, 360, 430], 100, 500, 4);
    expect(out.quality.ok).toBe(false);
    expect(out.quality.reason).toMatch(/irregular-v-pitch|weak-v-count/);
  });

  it('ignores photo-frame V-lines past OCR content right', () => {
    // Real day rules ~100–420; metal frame at 490 near page edge.
    const bounds = dayColBoundsFromVerticals(
      [100, 180, 260, 340, 420, 490],
      100,
      500,
      430 // content ends near last day rule
    );
    expect(bounds.every((b) => b.x1 <= 430 + 8)).toBe(true);
    expect(bounds.some((b) => b.x1 - b.x0 > 100)).toBe(false);
  });

  it('does not invent a page-edge day column', () => {
    const bounds = dayColBoundsFromVerticals([100, 180, 260, 340], 100, 500);
    const last = bounds[bounds.length - 1]!;
    expect(last.x1).toBeLessThan(400);
  });

  it('extends the densest day-V run across the full date strip to the name divider', () => {
    // Phone-like: left margin Vs + name divider far left; early day Vs missing.
    const vXs = [
      16, 59, 521, 655, 692, 728, 749, 798, 838, 885, 928, 971, 1019, 1060, 1103,
      1148, 1199, 1237, 1274, 1327, 1353, 1376,
    ];
    const bounds = dayColBoundsFromVerticals(vXs, 152, 1573, 1573, 54);
    // Date strip must start at the name divider, not mid-month (~521).
    expect(bounds[0]!.x0).toBeLessThanOrEqual(160);
    expect(bounds[0]!.x1 - bounds[0]!.x0).toBeGreaterThan(40);
    expect(bounds.length).toBeGreaterThanOrEqual(28);
    expect(bounds[bounds.length - 1]!.x1).toBeGreaterThan(1300);
    // Day 3 center near printed header (~284 on this photo scale).
    expect(bounds[2]!.cx).toBeGreaterThan(250);
    expect(bounds[2]!.cx).toBeLessThan(320);
    const scored = scoreLatticeColumns(vXs, 152, 1573, 30, 1573, 54);
    expect(scored.quality.inferredCols).toBeGreaterThanOrEqual(28);
  });

  it('glyphInLatticeCell uses person×day rectangle (skew-aware)', () => {
    const row = { yLo: 100, yHi: 140 };
    const col = { x0: 200, x1: 260 };
    expect(glyphInLatticeCell(230, 120, row, col, 0, 80)).toBe(true);
    // Neighbor person (below)
    expect(glyphInLatticeCell(230, 150, row, col, 0, 80)).toBe(false);
    // Neighbor day (right)
    expect(glyphInLatticeCell(270, 120, row, col, 0, 80)).toBe(false);
    // Mild skew: row drops to the right — point at right edge still inside parallelogram
    expect(glyphInLatticeCell(250, 128, row, col, 0.05, 80)).toBe(true);
  });

  it('colBoundsFromCenters builds half-gap cell intervals', () => {
    const bounds = colBoundsFromCenters([140, 220, 300], 400, 80);
    expect(bounds).toHaveLength(3);
    expect(bounds[1]!.x0).toBeCloseTo(180, 0);
    expect(bounds[1]!.x1).toBeCloseTo(260, 0);
  });

  it('derives exact day frames from printed bounds', () => {
    const frames = dayFramesFromBounds(
      [
        { x0: 100, x1: 170, cx: 135 },
        { x0: 170, x1: 260, cx: 215 },
      ],
      ['Mo1', 'Di2']
    );
    expect(frames).toEqual([
      { dayIndex: 0, label: 'Mo1', x0: 100, x1: 170 },
      { dayIndex: 1, label: 'Di2', x0: 170, x1: 260 },
    ]);
  });
});
