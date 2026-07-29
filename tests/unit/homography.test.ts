import {
  applyHomography,
  computeHomography,
  homographyResidualRms,
  invertHomography,
  quadQuality,
  roundTripResidualRms,
} from '../../src/sources/ocr/homography';
import {
  buildPerspectiveRectifier,
  estimateTableQuad,
  pitchCv,
  transformLinesByHomography,
} from '../../src/sources/ocr/perspective';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function L(text: string, x: number, y: number, w = 40, h = 14): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('homography utilities', () => {
  it('maps a rectangle by scale+translate', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ] as const;
    const dst = [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 10, y: 40 },
      { x: 30, y: 40 },
    ] as const;

    const H = computeHomography([...src] as any, [...dst] as any);
    const mid = applyHomography({ x: 0.5, y: 0.5 }, H);
    expect(mid.x).toBeCloseTo(20, 8);
    expect(mid.y).toBeCloseTo(30, 8);

    for (let i = 0; i < 4; i++) {
      const got = applyHomography(src[i]!, H);
      expect(got.x).toBeCloseTo(dst[i]!.x, 7);
      expect(got.y).toBeCloseTo(dst[i]!.y, 7);
    }
  });

  it('maps a perspective quad and keeps the 4 correspondences', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ] as const;
    const dst = [
      { x: 0, y: 0 },
      { x: 2, y: 0.2 },
      { x: 0.1, y: 2 },
      { x: 1.8, y: 1.9 },
    ] as const;

    const H = computeHomography([...src] as any, [...dst] as any);
    for (let i = 0; i < 4; i++) {
      const got = applyHomography(src[i]!, H);
      expect(got.x).toBeCloseTo(dst[i]!.x, 6);
      expect(got.y).toBeCloseTo(dst[i]!.y, 6);
    }
  });

  it('inverts and round-trips points', () => {
    const src = [
      { x: 10, y: 20 },
      { x: 210, y: 30 },
      { x: 15, y: 220 },
      { x: 200, y: 210 },
    ] as const;
    const dst = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 200 },
      { x: 200, y: 200 },
    ] as const;
    const H = computeHomography([...src] as any, [...dst] as any);
    const inv = invertHomography(H);
    expect(homographyResidualRms([...src], [...dst], H)).toBeLessThan(0.05);
    expect(roundTripResidualRms([...src], H, inv)).toBeLessThan(0.1);
  });

  it('rejects non-convex / tiny quads', () => {
    expect(
      quadQuality({ x: 0, y: 0 }, { x: 200, y: 10 }, { x: 10, y: 180 }, { x: 190, y: 170 }).ok
    ).toBe(true);
    expect(
      quadQuality({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 10 }, { x: 50, y: -10 }).ok
    ).toBe(false);
  });
});

describe('perspective rectifier hard gates', () => {
  it('computes pitch CV for irregular spacing', () => {
    expect(pitchCv([0, 10, 20, 30, 40])).toBeLessThan(0.05);
    expect(pitchCv([0, 10, 18, 40, 90])).toBeGreaterThan(0.2);
  });

  it('skips nearly frontal boards (no need to warp)', () => {
    const lines: OcrLine[] = [];
    for (let i = 0; i < 10; i++) {
      const wd = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i % 7];
      lines.push(L(`${wd}${i + 1}`, 200 + i * 50, 30, 28));
    }
    lines.push(L('PersonA', 20, 90, 70));
    lines.push(L('Alpha', 20, 105, 40));
    lines.push(L('PersonB', 20, 160, 70));
    lines.push(L('Beta', 20, 175, 40));
    const out = buildPerspectiveRectifier(lines, 1000, 600, null);
    expect(out).toBeNull();
  });

  it('builds a gated rectifier for clear header skew and flattens slope', () => {
    const slope = 0.06;
    const lines: OcrLine[] = [];
    for (let i = 0; i < 12; i++) {
      const x = 180 + i * 55;
      const wd = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i % 7];
      lines.push(L(`${wd}${i + 1}`, x, 40 + x * slope, 30));
    }
    lines.push(L('PersonA', 20, 140, 70));
    lines.push(L('Alpha', 20, 155, 40));
    lines.push(L('F', 220, 150 + 220 * slope, 16));
    lines.push(L('PersonB', 20, 220, 70));
    lines.push(L('Beta', 20, 235, 40));
    lines.push(L('U', 220, 230 + 220 * slope, 16));

    const lattice = {
      hYs: [55, 130, 210, 290],
      vXs: Array.from({ length: 13 }, (_, i) => 160 + i * 55),
    };
    const rectifier = buildPerspectiveRectifier(lines, 1000, 700, lattice);
    expect(rectifier).not.toBeNull();
    expect(rectifier!.quality.ok).toBe(true);
    expect(Math.abs(rectifier!.quality.headerSlopeAfter)).toBeLessThan(
      Math.abs(rectifier!.quality.headerSlopeBefore) * 0.5 + 0.01
    );
    expect(rectifier!.quality.cornerResidual).toBeLessThan(3);
    expect(rectifier!.quality.roundTripResidual).toBeLessThan(4);

    const warped = transformLinesByHomography(lines, rectifier!.forward);
    const headers = warped.filter((l) => /^(Mo|Di|Mi|Do|Fr|Sa|So)\d/i.test(l.text));
    const ys = headers.map((l) => l.boundingBox.y + l.boundingBox.height / 2);
    expect(headers.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(28);
  });

  it('estimates a convex table quad from skewed headers', () => {
    const slope = 0.05;
    const lines: OcrLine[] = [];
    for (let i = 0; i < 10; i++) {
      const x = 200 + i * 60;
      lines.push(L(`Mo${i + 1}`, x, 50 + x * slope, 28));
    }
    lines.push(L('PersonA', 25, 160, 70));
    lines.push(L('Alpha', 25, 175, 40));
    lines.push(L('PersonB', 25, 240, 70));
    lines.push(L('Beta', 25, 255, 40));
    const est = estimateTableQuad(lines, 1000, 700, {
      hYs: [70, 150, 230, 310],
      vXs: [170, 230, 290, 350, 410, 470, 530, 590, 650, 710, 770],
    });
    expect(est).not.toBeNull();
    const [tl, tr, bl, br] = est!.corners;
    expect(quadQuality(tl, tr, bl, br).ok).toBe(true);
    expect(tr.x).toBeGreaterThan(tl.x);
    expect(bl.y).toBeGreaterThan(tl.y);
  });
});
