import {
  googleColorIdForShiftType,
  mapHexToGoogleColorId,
  normalizePackHex,
  packHexForShiftType,
} from '../../src/sync/googleEventColor';

describe('googleEventColor', () => {
  it('normalizes hex and rejects hsl', () => {
    expect(normalizePackHex('#22c55e')).toBe('#22c55e');
    expect(normalizePackHex('22C55E')).toBe('#22c55e');
    expect(normalizePackHex('hsl(120 55% 42%)')).toBeNull();
  });

  it('maps pack greens to basil (10)', () => {
    expect(mapHexToGoogleColorId('#22c55e')).toBe('10');
    expect(mapHexToGoogleColorId('#4ade80')).toBe('10');
  });

  it('maps blues to blueberry (9) and reds to tomato (11)', () => {
    expect(mapHexToGoogleColorId('#3b82f6')).toBe('9');
    expect(mapHexToGoogleColorId('#dc2626')).toBe('11');
  });

  it('resolves shift type via pack colors', () => {
    const colors = { F: '#22c55e', M3: '#93c5fd', B39: '#ef4444' };
    expect(googleColorIdForShiftType('F', colors)).toBe('10');
    expect(googleColorIdForShiftType('M3', colors)).toBe('9');
    expect(googleColorIdForShiftType('B39', colors)).toBe('11');
    expect(googleColorIdForShiftType('UNKNOWN', colors)).toBeNull();
    expect(packHexForShiftType('F*', { F: '#22c55e' })).toBe('#22c55e');
  });
});
