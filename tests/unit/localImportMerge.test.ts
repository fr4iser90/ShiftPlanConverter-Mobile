import {
  canonicalizeSourceId,
  collapseSourceIdsForChips,
  isLocalImportSourceId,
} from '../../src/sources/ids';
import {
  getBuiltinPackConfig,
  getSupportedSourceIds,
  isSourceSupportedByPack,
} from '../../src/packs';

describe('local import merge', () => {
  it('canonicalizes camera-ocr to local-files', () => {
    expect(canonicalizeSourceId('camera-ocr')).toBe('local-files');
    expect(canonicalizeSourceId('local-files')).toBe('local-files');
    expect(isLocalImportSourceId('camera-ocr')).toBe(true);
    expect(isLocalImportSourceId('local-files')).toBe(true);
    expect(isLocalImportSourceId('loga3-webview')).toBe(false);
  });

  it('collapses file+photo to one chip id', () => {
    expect(
      collapseSourceIdsForChips(['local-files', 'camera-ocr', 'loga3-webview'])
    ).toEqual(['local-files', 'loga3-webview']);
    expect(collapseSourceIdsForChips(['camera-ocr', 'loga3-webview'])).toEqual([
      'local-files',
      'loga3-webview',
    ]);
  });

  it('St. Elisabeth pack lists local-files once; camera-ocr still supported', () => {
    const pack = getBuiltinPackConfig();
    expect(getSupportedSourceIds(pack)).toEqual(['local-files', 'loga3-webview']);
    expect(collapseSourceIdsForChips(getSupportedSourceIds(pack))).toEqual([
      'local-files',
      'loga3-webview',
    ]);
    expect(isSourceSupportedByPack(pack, 'camera-ocr')).toBe(true);
  });
});
