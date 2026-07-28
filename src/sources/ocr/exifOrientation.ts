/**
 * Read JPEG EXIF Orientation (tag 0x0112). Returns 1–8; default 1.
 * Used to bake rotation into pixels before ML Kit (which ignores EXIF).
 */
export function jpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;
    const size = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (marker === 0xe1 && offset + 4 + size <= bytes.length) {
      const start = offset + 4;
      // "Exif\0\0"
      if (
        bytes[start] === 0x45 &&
        bytes[start + 1] === 0x78 &&
        bytes[start + 2] === 0x69 &&
        bytes[start + 3] === 0x66
      ) {
        return parseExifOrientation(bytes, start + 6, size - 2);
      }
    }
    if (size < 2) break;
    offset += 2 + size;
    if (marker === 0xda) break; // SOS
  }
  return 1;
}

function parseExifOrientation(bytes: Uint8Array, tiffStart: number, maxLen: number): number {
  if (tiffStart + 8 > bytes.length) return 1;
  const le = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
  const read16 = (o: number) =>
    le ? bytes[o]! | (bytes[o + 1]! << 8) : (bytes[o]! << 8) | bytes[o + 1]!;
  const read32 = (o: number) =>
    le
      ? bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16) | (bytes[o + 3]! << 24)
      : (bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!;

  const ifd0 = tiffStart + read32(tiffStart + 4);
  if (ifd0 < tiffStart || ifd0 + 2 > bytes.length) return 1;
  const entries = read16(ifd0);
  for (let i = 0; i < entries; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > bytes.length) break;
    const tag = read16(e);
    if (tag === 0x0112) {
      const v = read16(e + 8);
      if (v >= 1 && v <= 8) return v;
      return 1;
    }
  }
  void maxLen;
  return 1;
}

/** Degrees to feed expo-image-manipulator so pixels match upright display. */
export function exifOrientationToRotateDegrees(orient: number): number {
  switch (orient) {
    case 3:
      return 180;
    case 6:
      return 90; // CW
    case 8:
      return -90;
    default:
      return 0;
  }
}
