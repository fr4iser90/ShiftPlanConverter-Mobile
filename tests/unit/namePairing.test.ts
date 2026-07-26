import { pairLoneNameFragments } from '../../src/sources/ocr/monthMatrix/nameRows';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function line(text: string, x: number, y: number, w = 40, h = 12): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('pairLoneNameFragments', () => {
  it('steals Vorname from a glued First|Last under a lone Nachname', () => {
    // Synthetic only — no workplace roster names in-repo.
    const groups: OcrLine[][] = [
      [line('Nordmann', 293, 297)],
      [line('Alic', 292, 318), line('Suedmann', 294, 334)],
      [line('Bianca', 292, 351)],
    ];
    const paired = pairLoneNameFragments(groups, 27);
    expect(paired.map((g) => g.map((l) => l.text))).toEqual([
      ['Nordmann', 'Alic'],
      ['Suedmann', 'Bianca'],
    ]);
  });
});
