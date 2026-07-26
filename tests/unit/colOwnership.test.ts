import { nearestColIndex } from '../../src/sources/ocr/monthMatrix/geometry';
import { applyPackMappingToCell } from '../../src/sources/ocr/applyPackMapping';
import type { MappingValue } from '../../src/convert/types';

describe('nearestColIndex', () => {
  it('assigns a token to the closest day column only', () => {
    const centers = [100, 150, 200, 250];
    expect(nearestColIndex(155, centers)).toBe(1);
    expect(nearestColIndex(148, centers)).toBe(1);
    expect(nearestColIndex(175, centers)).toBe(2);
  });
});

describe('lone clock fragments vs printed codes', () => {
  const preset: Record<string, MappingValue> = {
    '11:35-07:35': { code: 'MO', type: 'long', isValidated: true },
    '19:50-07:35': { code: 'B38', type: 'long', isValidated: true },
    '11:35-19:50': { code: 'M3', type: 'work', isValidated: true },
    '07:35-15:50': { code: 'F', type: 'work', isValidated: true },
  };

  it('does not map a lone HH:MM to a pack code (too ambiguous)', () => {
    expect(applyPackMappingToCell('19:50', preset)).toBe('19:50');
    expect(applyPackMappingToCell('11:35', preset)).toBe('11:35');
    expect(applyPackMappingToCell('1550', preset)).toBe('1550');
  });

  it('still maps full fingerprints and printed codes', () => {
    expect(applyPackMappingToCell('MO', preset)).toBe('MO');
    expect(applyPackMappingToCell('11350735', preset)).toBe('MO');
    expect(applyPackMappingToCell('07351550', preset)).toBe('F');
  });
});
