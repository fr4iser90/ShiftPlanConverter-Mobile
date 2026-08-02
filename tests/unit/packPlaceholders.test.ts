import {
  getMappingForScope,
  getPackById,
  isPresetReady,
  listPresetsForScope,
} from '../../src/packs';
import { resolveDutyCodes } from '../../src/convert/types';

describe('st-elisabeth pack honesty', () => {
  it('only OP · ATA is supported under Pflege; OTA/roles/stations are placeholders', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    expect(pack).toBeTruthy();
    const pflege = pack!.groups.find((g) => g.id === 'pflege');
    const ata = pflege?.areas.find((a) => a.id === 'op-ata');
    expect(ata?.supported).toBe(true);
    expect(ata?.department).toBe('OP');
    expect(ata?.role).toBe('ATA');
    expect(pflege?.areas.find((a) => a.id === 'op-ota')?.supported).toBe(false);
    expect(pflege?.areas.find((a) => a.id === 'stationsleitung')?.supported).toBe(false);
    expect(pflege?.areas.find((a) => a.id === 'wundmanagement')?.supported).toBe(false);
    for (let i = 1; i <= 19; i++) {
      const id = `station-${i}`;
      expect(pflege?.areas.some((a) => a.id === id && !a.supported)).toBe(true);
      const mapping = getMappingForScope('st-elisabeth-leipzig', 'pflege', id);
      expect(mapping).toBeTruthy();
      expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', id)).toEqual(['default']);
      expect(Object.keys(resolveDutyCodes(mapping))).toEqual([]);
    }
    expect(pflege?.areas.find((a) => a.id === 'station-16')?.label).toBe('Station 16 (ITS)');
    expect(pflege?.areas.find((a) => a.id === 'station-16')?.mapping).toBe(
      'mappings/pflege/station-16.json'
    );
    expect(pflege?.areas.find((a) => a.id === 'station-1')?.mapping).toBe(
      'mappings/pflege/station-standard.json'
    );
  });

  it('OP · ATA ready via flat dutyCodes; OP · OTA placeholder', () => {
    expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', 'op-ata')).toEqual([
      'default',
    ]);
    expect(isPresetReady('st-elisabeth-leipzig', 'pflege', 'op-ata', 'default')).toBe(true);
    expect(listPresetsForScope('st-elisabeth-leipzig', 'pflege', 'op-ota')).toEqual([
      'default',
    ]);
    expect(isPresetReady('st-elisabeth-leipzig', 'pflege', 'op-ota', 'default')).toBe(false);
  });

  it('default-generic empty dutyCodes is ready', () => {
    expect(isPresetReady('default-generic', 'generic', 'import', 'default')).toBe(true);
  });

  it('Service placeholders; Ärzte OP · Anästhesist/in supported', () => {
    const pack = getPackById('st-elisabeth-leipzig');
    const service = pack!.groups.find((g) => g.id === 'service');
    expect(service?.areas.some((a) => a.id === 'op' && !a.supported)).toBe(true);
    expect(service?.areas.some((a) => a.id === 'station-16' && !a.supported)).toBe(true);
    expect(getMappingForScope('st-elisabeth-leipzig', 'service', 'op')).toBeTruthy();
    const arzt = pack!.groups.find((g) => g.id === 'arzt');
    expect(arzt?.label).toBe('Ärzte');
    const ana = arzt?.areas.find((a) => a.id === 'op-anaesthesie');
    expect(ana?.supported).toBe(true);
    expect(ana?.department).toBe('OP');
    expect(ana?.role).toBe('Anästhesist/in');
    expect(ana?.ocr?.profile).toBe('mappings/arzt/op-anaesthesie.ocr.json');
    expect(arzt?.areas.some((a) => a.id === 'op-chirurgie' && !a.supported)).toBe(true);
    expect(getMappingForScope('st-elisabeth-leipzig', 'arzt', 'op-anaesthesie')).toBeTruthy();
    expect(getMappingForScope('st-elisabeth-leipzig', 'service', 'op')).toBeTruthy();
  });
});
