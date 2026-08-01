import { pairLoneNameFragments } from '../../src/sources/ocr/layouts/month-matrix/nameRows';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function line(text: string, x: number, y: number, w = 40, h = 12): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('pairLoneNameFragments', () => {
  it('steals Vorname from a glued First|Last under a lone Nachname', () => {
    // Synthetic only — no workplace roster names in-repo.
    const groups: OcrLine[][] = [
      [line('PersonA', 293, 297)],
      [line('Alpa', 292, 318), line('PersonB', 294, 334)],
      [line('Beta', 292, 351)],
    ];
    const paired = pairLoneNameFragments(groups, 27);
    expect(paired.map((g) => g.map((l) => l.text))).toEqual([
      ['PersonA', 'Alpa'],
      ['PersonB', 'Beta'],
    ]);
  });
});
