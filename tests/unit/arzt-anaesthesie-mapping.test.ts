import { readFileSync } from 'fs';
import { join } from 'path';

import type { PackComposeRule, PackMapping } from '../../src/convert/types';
import { getMappingForScope, getPackArea } from '../../src/packs';

const PACK = 'st-elisabeth-leipzig';
const MAPPING_PATH = join(
  __dirname,
  '../../src/packs/builtin/st-elisabeth-leipzig/mappings/arzt/op-anaesthesie.json'
);

describe('Arzt Anästhesie pack mapping (Thomas LOGA)', () => {
  const raw = JSON.parse(readFileSync(MAPPING_PATH, 'utf8')) as PackMapping;
  const preset = raw.presets?.Anästhesie || {};

  it('marks op-anaesthesie supported, chirurgie not', () => {
    expect(getPackArea(PACK, 'arzt', 'op-anaesthesie')?.supported).toBe(true);
    expect(getPackArea(PACK, 'arzt', 'op-chirurgie')?.supported).toBe(false);
  });

  it('loads via getMappingForScope with composeRules', () => {
    const m = getMappingForScope(PACK, 'arzt', 'op-anaesthesie');
    expect(m?.presets?.Anästhesie).toBeTruthy();
    expect(m?.composeRules?.length).toBeGreaterThanOrEqual(10);
  });

  it('has atomic codes from LOGA-Dienstmapping', () => {
    const codes = new Set<string>();
    for (const v of Object.values(preset)) {
      if (typeof v === 'string') codes.add(v);
      else {
        codes.add(v.code);
        for (const a of v.also || []) codes.add(a);
      }
    }
    for (const need of [
      'ID1',
      'B5A',
      'ID2',
      'B29',
      'IDT',
      'B19',
      'S16',
      'IDN1',
      'B20',
      'FK51',
      'IDN2',
      'B54',
      'FK74',
      'OPD1',
      'B27',
      'OPTn',
      'OPNn',
      'PD1',
      'SD',
      'ZD',
      'LD',
      'FD',
      'PD',
    ]) {
      expect(codes.has(need)).toBe(true);
    }
  });

  it('composeRules cover Hausdienst and Rufdienst combos', () => {
    const rules = (raw.composeRules || []) as PackComposeRule[];
    const byId = Object.fromEntries(rules.map((r) => [r.id, r]));
    expect(byId['hausdienst-mo-do']?.codes).toEqual(['ID1', 'B5A']);
    expect(byId['hausdienst-nacht-vor-we']?.nextDayCodes).toEqual(['FK51']);
    expect(byId['rufdienst-fr']?.codes).toEqual(['OPD2', 'B44']);
    expect(byId['dritter-dienst-we']?.label).toBe('3. Dienst');
    expect(byId['schmerzdienst-werktag']?.codes).toEqual(['SD']);
  });

  it('preset time keys are unique', () => {
    const keys = Object.keys(preset);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
