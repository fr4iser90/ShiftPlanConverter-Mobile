import {
  dayColBoundsFromVerticals,
  scoreLatticeColumns,
  snapDayCentersToLattice,
} from '@/src/sources/ocr/layouts/month-matrix/lattice';

const vXs = [
  15.7, 59.0, 521.1, 654.8, 692.1, 727.5, 749.1, 798.3, 837.6, 884.8, 928.1, 971.3,
  1018.5, 1059.8, 1103.1, 1148.3, 1199.4, 1236.8, 1274.1, 1327.2, 1352.8, 1376.4,
];

it('builds day bounds when first body V is far from name divider', () => {
  const b = dayColBoundsFromVerticals(vXs, 152, 1573, 1573);
  expect(b.length).toBeGreaterThanOrEqual(8);
  expect(b[0]!.x0).toBeGreaterThan(400);
  expect(b[0]!.x0).toBeLessThan(700);
  const s = scoreLatticeColumns(vXs, 152, 1573, 30, 1573);
  expect(s.quality.inferredCols).toBeGreaterThanOrEqual(8);
});
