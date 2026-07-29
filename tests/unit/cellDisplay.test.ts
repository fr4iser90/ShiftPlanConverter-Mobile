import {
  formatOcrCellForDisplay,
  packTimeForCode,
} from '../../src/sources/ocr/cellDisplay';
import type { MappingValue } from '../../src/convert/types';

const preset: Record<string, MappingValue> = {
  '07:35-15:50': { code: 'F', type: 'work', isValidated: true },
  '13:15-21:30': { code: 'S', type: 'work', isValidated: true },
};

describe('formatOcrCellForDisplay', () => {
  it('shows codes, times, or both from pack', () => {
    expect(formatOcrCellForDisplay('F', 'codes', preset)).toBe('F');
    expect(formatOcrCellForDisplay('07:35-15:50', 'codes', preset)).toBe('F');
    expect(formatOcrCellForDisplay('F', 'times', preset)).toBe('07:35-15:50');
    expect(formatOcrCellForDisplay('07:35-15:50', 'times', preset)).toBe('07:35-15:50');
    expect(formatOcrCellForDisplay('F', 'both', preset)).toBe('F·07:35-15:50');
    expect(formatOcrCellForDisplay('15:50-16:45', 'codes', preset)).toBe('');
    expect(formatOcrCellForDisplay('15:50-16:45', 'times', preset)).toBe('15:50-16:45');
    expect(formatOcrCellForDisplay('', 'both', preset)).toBe('');
  });

  it('resolves pack time for a code', () => {
    expect(packTimeForCode('S', preset)).toBe('13:15-21:30');
    expect(packTimeForCode('ZZ', preset)).toBeNull();
  });
});
