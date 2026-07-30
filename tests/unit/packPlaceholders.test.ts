import {
  getMappingForScope,
  getPackById,
  isPresetReady,
  listPresetsForScope,
} from '../../src/packs';

describe('st-elisabeth pack honesty', () => {
  it('only OP is supported under Pflege; stations are placeholders', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    expect(pack).toBeTruthy();
    const pflege = pack!.groups.find((g) => g.id === 'pflege');
    expect(pflege?.areas.find((a) => a.id === 'op-bereich')?.supported).toBe(true);
    for (let i = 1; i <= 19; i++) {
      const id = `station-${i}`;
      expect(pflege?.areas.some((a) => a.id === id && !a.supported)).toBe(true);
      const mapping = getMappingForScope('st-elisabeth-leipzig', 'pflege', id);
      expect(mapping).toBeTruthy();
      expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', id)).toEqual(['Standard']);
      expect(Object.keys(mapping!.presets?.Standard || {})).toEqual([]);
    }
  });

  it('OP roles: Anästhesie ready; OP-Pflege and Schmerzdienst placeholders', () => {
    expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', 'op-bereich')).toEqual([
      'Anästhesie',
      'OP-Pflege',
      'Schmerzdienst',
    ]);
    expect(isPresetReady('st-elisabeth-leipzig', 'pflege', 'op-bereich', 'Anästhesie')).toBe(
      true
    );
    expect(isPresetReady('st-elisabeth-leipzig', 'pflege', 'op-bereich', 'OP-Pflege')).toBe(
      false
    );
    expect(isPresetReady('st-elisabeth-leipzig', 'pflege', 'op-bereich', 'Schmerzdienst')).toBe(
      false
    );
  });

  it('default-generic Standard is ready even with an empty mapping table', () => {
    expect(isPresetReady('default-generic', 'generic', 'import', 'Standard')).toBe(true);
  });

  it('Service and Ärzte are visible but not supported yet', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    const service = pack!.groups.find((g) => g.id === 'service');
    expect(service?.areas.some((a) => a.id === 'allgemein' && !a.supported)).toBe(true);
    const arzt = pack!.groups.find((g) => g.id === 'arzt');
    expect(arzt?.label).toBe('Ärzte');
    expect(arzt?.areas.some((a) => a.id === 'op' && !a.supported)).toBe(true);
    expect(getMappingForScope('st-elisabeth-leipzig', 'arzt', 'op')).toBeTruthy();
  });
});
