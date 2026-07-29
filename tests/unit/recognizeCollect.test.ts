import { asBox, collectLines, unionBoxes } from '../../src/sources/ocr/recognize';

describe('OCR recognize collectLines', () => {
  it('accepts normal x/y/width/height boxes', () => {
    expect(asBox({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(asBox({})).toBeNull();
    expect(asBox({ x: 0, y: 0, width: 0, height: 10 })).toBeNull();
  });

  it('unions element boxes into a line box', () => {
    const u = unionBoxes([
      { x: 10, y: 20, width: 30, height: 10 },
      { x: 50, y: 22, width: 40, height: 12 },
    ]);
    expect(u).toEqual({ x: 10, y: 20, width: 80, height: 14 });
  });

  it('prefers word-level elements when line boundingBox is empty (Android ML Kit)', () => {
    const lines = collectLines({
      text: 'Sa 1 PersonA Alpha',
      blocks: [
        {
          text: 'Sa 1',
          boundingBox: {},
          lines: [
            {
              text: 'Sa 1',
              boundingBox: {},
              elements: [
                { text: 'Sa', boundingBox: { x: 200, y: 20, width: 20, height: 12 } },
                { text: '1', boundingBox: { x: 222, y: 20, width: 10, height: 12 } },
              ],
            },
          ],
        },
        {
          text: 'PersonA Alpha',
          boundingBox: {},
          lines: [
            {
              text: 'PersonA Alpha',
              boundingBox: {},
              elements: [
                { text: 'PersonA', boundingBox: { x: 10, y: 80, width: 50, height: 12 } },
                { text: 'Alpha', boundingBox: { x: 10, y: 95, width: 40, height: 12 } },
              ],
            },
          ],
        },
      ],
    });
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.every((l) => l.boundingBox.width > 0)).toBe(true);
    expect(lines.some((l) => l.text === 'PersonA')).toBe(true);
    expect(lines.some((l) => l.text === 'Sa')).toBe(true);
  });
});
