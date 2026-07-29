import {
  getMappingForScope,
  getPackById,
  listPresetsForScope,
} from '../../src/packs';

describe('st-elisabeth placeholder areas', () => {
  it('registers Station 1–19 and Service with empty Standard preset', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    expect(pack).toBeTruthy();
    const pflege = pack!.groups.find((g) => g.id === 'pflege');
    expect(pflege?.areas.some((a) => a.id === 'op-bereich')).toBe(true);
    for (let i = 1; i <= 19; i++) {
      const id = `station-${i}`;
      expect(pflege?.areas.some((a) => a.id === id && a.supported)).toBe(true);
      const mapping = getMappingForScope('st-elisabeth-leipzig', 'pflege', id);
      expect(mapping).toBeTruthy();
      expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', id)).toEqual(['Standard']);
      expect(Object.keys(mapping!.presets?.Standard || {})).toEqual([]);
    }
    const service = pack!.groups.find((g) => g.id === 'service');
    expect(service?.areas.some((a) => a.id === 'allgemein' && a.supported)).toBe(true);
    expect(getMappingForScope('st-elisabeth-leipzig', 'service', 'allgemein')).toBeTruthy();
  });
});
