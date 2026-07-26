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

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///tmp/',
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('../../src/sources/ocr/recognize', () => ({
  isOcrNativeAvailable: jest.fn(() => true),
  recognizeImageText: jest.fn(async () => ({
    text: 'Sa1 So2 Mo3\nNordmann Alice U F\nSuedmann Bianca F S',
    lineCount: 10,
    lines: [
      { text: 'Sa1', boundingBox: { x: 200, y: 20, width: 30, height: 14 } },
      { text: 'So2', boundingBox: { x: 350, y: 20, width: 30, height: 14 } },
      { text: 'Mo3', boundingBox: { x: 500, y: 20, width: 30, height: 14 } },
      { text: 'Nordmann', boundingBox: { x: 10, y: 80, width: 70, height: 14 } },
      { text: 'Alice', boundingBox: { x: 10, y: 95, width: 50, height: 14 } },
      { text: 'U', boundingBox: { x: 200, y: 88, width: 20, height: 14 } },
      { text: 'F', boundingBox: { x: 500, y: 88, width: 20, height: 14 } },
      { text: 'Suedmann', boundingBox: { x: 10, y: 160, width: 70, height: 14 } },
      { text: 'Bianca', boundingBox: { x: 10, y: 175, width: 50, height: 14 } },
      { text: 'F', boundingBox: { x: 200, y: 168, width: 20, height: 14 } },
    ],
    pageWidth: 1000,
    pageHeight: 400,
  })),
}));

jest.mock('../../src/state/ocrPreferredName', () => ({
  loadOcrPreferredName: jest.fn(async () => null),
  saveOcrPreferredName: jest.fn(async () => undefined),
  clearOcrPreferredName: jest.fn(async () => undefined),
}));

import { cameraOcrSource, runCameraOcr } from '../../src/sources/cameraOcr';
import { isOcrNativeAvailable, recognizeImageText } from '../../src/sources/ocr/recognize';
import { loadOcrPreferredName, saveOcrPreferredName } from '../../src/state/ocrPreferredName';

describe('camera-ocr source', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isOcrNativeAvailable as jest.Mock).mockReturnValue(true);
    (loadOcrPreferredName as jest.Mock).mockResolvedValue(null);
    nativeImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
  });

  it('exposes a local source without credentials or WebView', () => {
    expect(cameraOcrSource.id).toBe('camera-ocr');
    expect(cameraOcrSource.kind).toBe('local');
  });

  it('returns empty artifacts when the user cancels the picker', async () => {
    const result = await runCameraOcr({ pickMode: 'gallery', layoutId: 'month-matrix' });
    expect(result.artifacts).toEqual([]);
    expect(nativeImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
  });

  it('outputs a full month-matrix table, not a flat OCR list', async () => {
    nativeImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/plan.jpg' }],
    });
    const pickRosterName = jest.fn(async (req: { candidates: { id: string; label: string }[] }) => {
      expect(req.candidates.every((c) => /Nordmann|Suedmann/i.test(c.label))).toBe(true);
      expect(req.candidates.some((c) => /Sa|Mo\d|11502/i.test(c.label))).toBe(false);
      const c = req.candidates[0];
      return c ? { id: c.id, label: c.label } : null;
    });
    const result = await runCameraOcr({
      captureMode: 'gallery',
      layoutId: 'month-matrix',
      pickRosterName,
    });
    const text = String((result.artifacts[0] as { text: string })?.text || '');
    expect(text).toContain('│');
    expect(text).toMatch(/month matrix|Monatsmatrix/i);
    expect(text).toMatch(/Nordmann|Suedmann/);
    expect(text).toMatch(/>/);
    expect(saveOcrPreferredName).toHaveBeenCalled();
    expect(result.selectedName).toBeTruthy();
    expect(result.matrix?.ok).toBe(true);
    expect(result.matrix?.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.matrix?.headers.length).toBeGreaterThanOrEqual(1);
  });

  it('does not overwrite Mein Name with OCR junk when confirming a misread row', async () => {
    (loadOcrPreferredName as jest.Mock).mockResolvedValue('Nordmann, Alice');
    nativeImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/plan.jpg' }],
    });
    const pickRosterName = jest.fn(async (req: { candidates: { id: string; label: string }[] }) => {
      const c = req.candidates[0];
      // Simulate tapping OCR garbage without pencil-edit
      return c ? { id: c.id, label: c.label } : null;
    });
    const result = await runCameraOcr({
      captureMode: 'gallery',
      layoutId: 'month-matrix',
      pickRosterName,
    });
    expect(result.selectedName).toBe('Nordmann, Alice');
    expect(saveOcrPreferredName).toHaveBeenCalledWith('Nordmann, Alice');
    expect(saveOcrPreferredName).not.toHaveBeenCalledWith(expect.stringMatching(/Suedmann/i));
  });

  it('does not open a junk name picker when the month-matrix grid fails', async () => {
    nativeImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/bad.jpg' }],
    });
    (recognizeImageText as jest.Mock).mockResolvedValueOnce({
      text: 'SA 11502Mo 3 DI4\nn 1n 6 60\nmashed noise',
      lineCount: 3,
      lines: [
        { text: 'SA 11502Mo 3 DI4 Mi5', boundingBox: { x: 10, y: 10, width: 400, height: 20 } },
        { text: 'n 1n 6 60', boundingBox: { x: 10, y: 40, width: 80, height: 14 } },
      ],
      pageWidth: 500,
      pageHeight: 200,
    });
    const pickRosterName = jest.fn();
    const result = await runCameraOcr({
      captureMode: 'gallery',
      layoutId: 'month-matrix',
      pickRosterName,
    });
    expect(pickRosterName).not.toHaveBeenCalled();
    const text = String((result.artifacts[0] as { text: string })?.text || '');
    expect(text).toMatch(/Table not recognized|Tabelle nicht erkannt/i);
    expect(text).not.toMatch(/SA 11502/);
    expect(result.matrix).toBeNull();
  });
});
