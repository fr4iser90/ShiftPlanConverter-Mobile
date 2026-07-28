import fs from 'fs';
import path from 'path';
import {
  exifOrientationToRotateDegrees,
  jpegExifOrientation,
} from '../../src/sources/ocr/exifOrientation';
import { jpegSofSize } from '../../src/sources/ocr/prepareImage';

/** First private JPEG under tmp/test-files (gitignored); skip if none. */
function firstPrivateRosterJpeg(): string | null {
  const dir = path.join(__dirname, '../../tmp/test-files');
  if (!fs.existsSync(dir)) return null;
  const hit = fs
    .readdirSync(dir)
    .filter((n) => /\.jpe?g$/i.test(n) && !/_makierung/i.test(n) && !/-overlay/i.test(n))
    .sort()[0];
  return hit ? path.join(dir, hit) : null;
}

describe('jpeg EXIF orientation', () => {
  it('reads Orientation from a private roster JPEG when present', () => {
    const p = firstPrivateRosterJpeg();
    if (!p) return;
    const bytes = new Uint8Array(fs.readFileSync(p));
    const orient = jpegExifOrientation(bytes);
    expect(orient).toBeGreaterThanOrEqual(1);
    expect(orient).toBeLessThanOrEqual(8);
    void exifOrientationToRotateDegrees(orient);
    const sof = jpegSofSize(bytes);
    expect(sof).toBeTruthy();
    expect(Math.max(sof!.width, sof!.height)).toBeGreaterThan(2000);
  });

  it('defaults to 1 for non-jpeg', () => {
    expect(jpegExifOrientation(new Uint8Array([1, 2, 3, 4]))).toBe(1);
  });
});
