import {
  getMappingForScope,
  getPackById,
  isPresetReady,
  listPresetsForScope,
} from '../../src/packs';

describe('st-elisabeth pack honesty', () => {
  it('only OP · ATA is supported under Pflege; OTA/roles/stations are placeholders', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    expect(pack).toBeTruthy();
    const pflege = pack!.groups.find((g) => g.id === 'pflege');
    expect(pflege?.areas.find((a) => a.id === 'op-ata')?.supported).toBe(true);
    expect(pflege?.areas.find((a) => a.id === 'op-ota')?.supported).toBe(false);
    expect(pflege?.areas.find((a) => a.id === 'stationsleitung')?.supported).toBe(false);
    expect(pflege?.areas.find((a) => a.id === 'wundmanagement')?.supported).toBe(false);
    for (let i = 1; i <= 19; i++) {
      const id = `station-${i}`;
      expect(pflege?.areas.some((a) => a.id === id && !a.supported)).toBe(true);
      const mapping = getMappingForScope('st-elisabeth-leipzig', 'pflege', id);
      expect(mapping).toBeTruthy();
      expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', id)).toEqual(['Standard']);
      expect(Object.keys(mapping!.presets?.Standard || {})).toEqual([]);
    }
    expect(pflege?.areas.find((a) => a.id === 'station-16')?.label).toBe('Station 16 (ITS)');
    expect(pflege?.areas.find((a) => a.id === 'station-16')?.mapping).toBe(
      'mappings/pflege/station-16.json'
    );
    expect(pflege?.areas.find((a) => a.id === 'station-1')?.mapping).toBe(
      'mappings/pflege/station-standard.json'
    );
  });

  it('OP · ATA ready; OP · OTA placeholder', () => {
    expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', 'op-ata')).toEqual([
      'Anästhesie',
    ]);
    expect(isPresetReady('st-elisabeth-leipzig', 'pflege', 'op-ata', 'Anästhesie')).toBe(true);
    expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', 'op-ota')).toEqual(['OTA']);
    expect(isPresetReady('st-elisabeth-leipzig', 'pflege', 'op-ota', 'OTA')).toBe(false);
  });

  it('default-generic Standard is ready even with an empty mapping table', () => {
    expect(isPresetReady('default-generic', 'generic', 'import', 'Standard')).toBe(true);
  });

  it('Service and Ärzte are visible but not supported yet', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    const service = pack!.groups.find((g) => g.id === 'service');
    expect(service?.areas.some((a) => a.id === 'op' && !a.supported)).toBe(true);
    expect(service?.areas.some((a) => a.id === 'station-16' && !a.supported)).toBe(true);
    expect(getMappingForScope('st-elisabeth-leipzig', 'service', 'op')).toBeTruthy();
    const arzt = pack!.groups.find((g) => g.id === 'arzt');
    expect(arzt?.label).toBe('Ärzte');
    expect(arzt?.areas.some((a) => a.id === 'op-anaesthesie' && !a.supported)).toBe(true);
    expect(getMappingForScope('st-elisabeth-leipzig', 'arzt', 'op-anaesthesie')).toBeTruthy();
  });
});
