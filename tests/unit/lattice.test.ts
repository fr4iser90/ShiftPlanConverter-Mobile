import {
  dayFramesFromBounds,
  dayColBoundsFromVerticals,
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
    expect(out.centers.length).toBe(3);
    expect(out.headers).toEqual(headers);
    // Centers should sit on V-gap midpoints
    expect(out.centers[0]).toBeCloseTo(220, 0);
  });

  it('header band uses H-line above first person', () => {
    const hb = headerBandFromLattice([40, 80, 200, 300], 220, 50, 75);
    expect(hb).not.toBeNull();
    expect(hb!.bot).toBe(200);
    expect(hb!.top).toBeLessThan(hb!.bot);
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
