const nativeImagePicker = {
  getCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async (): Promise<{ canceled: boolean; assets: { uri: string }[] }> => ({
    canceled: true,
    assets: [],
  })),
  launchImageLibraryAsync: jest.fn(
    async (): Promise<{ canceled: boolean; assets: { uri: string }[] }> => ({
      canceled: true,
      assets: [],
    })
  ),
  getPendingResultAsync: jest.fn(async () => null),
};

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: jest.fn((name: string) =>
    name === 'ExponentImagePicker' ? nativeImagePicker : null
  ),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri: uri.replace(/\.jpg$/, '.ocr.jpg') })),
  SaveFormat: { JPEG: 'jpeg' },
}));

import {
  defaultRowCrop,
  sanitizeNormalizedCrop,
} from '../../src/sources/ocr/crop';
import { captureOcrImage, normalizeLocalImageUri } from '../../src/sources/ocr/capture';
import { OCR_MAX_LONG_EDGE, prepareImageForOcr } from '../../src/sources/ocr/prepareImage';
import { manipulateAsync } from 'expo-image-manipulator';

describe('OCR crop helpers', () => {
  it('keeps a usable minimum crop size', () => {
    const s = sanitizeNormalizedCrop({ x: 0.9, y: 0.9, width: 0.01, height: 0.01 });
    expect(s.width).toBeGreaterThanOrEqual(0.05);
    expect(s.height).toBeGreaterThanOrEqual(0.05);
    expect(s.x + s.width).toBeLessThanOrEqual(1.0001);
    expect(s.y + s.height).toBeLessThanOrEqual(1.0001);
  });

  it('defaults to a middle row band', () => {
    const d = defaultRowCrop();
    expect(d.width).toBeGreaterThan(0.5);
    expect(d.height).toBeGreaterThan(0.1);
    expect(d.height).toBeLessThan(0.5);
  });
});

describe('OCR capture uri normalize', () => {
  it('prefixes bare absolute paths with file://', () => {
    expect(normalizeLocalImageUri('/data/scan.jpg')).toBe('file:///data/scan.jpg');
    expect(normalizeLocalImageUri('file:///data/scan.jpg')).toBe('file:///data/scan.jpg');
  });
});

describe('OCR gallery capture', () => {
  it('does not pass quality (avoids post-pick re-encode stall)', async () => {
    nativeImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/plan.jpg' }],
    });
    const uri = await captureOcrImage('gallery');
    expect(uri).toBe('file:///tmp/plan.jpg');
    const call = nativeImagePicker.launchImageLibraryAsync.mock.calls.at(0) as
      | [Record<string, unknown>]
      | undefined;
    const opts = call?.[0];
    expect(opts?.quality).toBeUndefined();
    expect(opts?.allowsEditing).toBe(false);
  });
});

describe('prepareImageForOcr', () => {
  it('downscales when longer than OCR_MAX_LONG_EDGE', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native') as {
      Image: { getSize: jest.Mock };
    };
    rn.Image.getSize.mockImplementation((_u: unknown, ok: (w: number, h: number) => void) => {
      ok(4000, 3000);
    });
    const out = await prepareImageForOcr('file:///tmp/huge.jpg');
    expect(out).toContain('.ocr.jpg');
    expect(manipulateAsync).toHaveBeenCalled();
    const actions = (manipulateAsync as jest.Mock).mock.calls.at(-1)?.[1];
    expect(actions[0].resize.width).toBeLessThanOrEqual(OCR_MAX_LONG_EDGE);
    expect(actions[0].resize.height).toBeLessThanOrEqual(OCR_MAX_LONG_EDGE);
  });
});
