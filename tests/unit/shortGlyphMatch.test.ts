import { matchShortGlyphFromLuma } from '@/src/sources/ocr/shortGlyphMatch';

describe('shortGlyphMatch', () => {
  function makeU(cw = 20, ch = 24): Float32Array {
    const L = new Float32Array(cw * ch);
    // blue-ish dark bg
    for (let i = 0; i < L.length; i++) L[i] = 50;
    // pale U stems + bottom
    for (let y = 4; y < 16; y++) {
      L[y * cw + 4] = 140;
      L[y * cw + 5] = 140;
      L[y * cw + 14] = 140;
      L[y * cw + 15] = 140;
    }
    for (let x = 4; x <= 15; x++) {
      L[18 * cw + x] = 140;
      L[19 * cw + x] = 140;
    }
    return L;
  }

  function makeSlash(cw = 20, ch = 24): Float32Array {
    const L = new Float32Array(cw * ch);
    for (let i = 0; i < L.length; i++) L[i] = 92; // gray weekend
    for (let t = 0; t < 16; t++) {
      const x = 15 - Math.floor(t * 0.9);
      const y = 3 + t;
      if (x >= 1 && x < cw - 1 && y < ch) {
        L[y * cw + x] = 35;
        L[y * cw + x - 1] = 40;
        L[y * cw + x + 1] = 45;
      }
    }
    return L;
  }

  it('detects a cup-shaped U on dark fill', () => {
    const L = makeU();
    const m = matchShortGlyphFromLuma(L, 20, 24, { meanBlueMinusRed: 100 });
    expect(m.glyph).toBe('U');
  });

  it('detects slash on gray weekend fill', () => {
    const L = makeSlash();
    const m = matchShortGlyphFromLuma(L, 20, 24, { meanBlueMinusRed: 0 });
    expect(m.glyph).toBe('/');
  });

  it('does not invent U on empty blue cell', () => {
    const L = new Float32Array(20 * 24);
    L.fill(50);
    const m = matchShortGlyphFromLuma(L, 20, 24, { meanBlueMinusRed: 100 });
    expect(m.glyph).toBeNull();
  });

  it('does not invent U on flat blue fill with tiny noise', () => {
    const L = new Float32Array(20 * 24);
    L.fill(50);
    // low-contrast speckles (span ~8)
    for (let i = 0; i < L.length; i += 17) L[i] = 58;
    const m = matchShortGlyphFromLuma(L, 20, 24, { meanBlueMinusRed: 100 });
    expect(m.glyph).toBeNull();
  });
});
