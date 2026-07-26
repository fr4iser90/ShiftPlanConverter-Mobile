import { OCR_MAX_LONG_EDGE, ocrTargetSize } from '../../src/sources/ocr/prepareImage';

describe('ocrTargetSize (one-pass preprocess)', () => {
  it('downscales huge wall photos to OCR_MAX_LONG_EDGE', () => {
    const t = ocrTargetSize(3456, 4608);
    expect(t.changed).toBe(true);
    expect(Math.max(t.width, t.height)).toBe(OCR_MAX_LONG_EDGE);
  });

  it('mildly upscales soft / chat-downscaled crops', () => {
    const t = ocrTargetSize(1024, 517);
    expect(t.changed).toBe(true);
    // Cap 1.5× — 1024 → 1536 (toward MIN_LONG_EDGE without inventing pixels).
    expect(Math.max(t.width, t.height)).toBe(Math.round(1024 * 1.5));
  });

  it('leaves mid-band photos unchanged', () => {
    const t = ocrTargetSize(1920, 970);
    expect(t.changed).toBe(false);
    expect(t.width).toBe(1920);
    expect(t.height).toBe(970);
  });
});
