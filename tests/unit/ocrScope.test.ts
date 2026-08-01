import {
  getOcrConfigForPack,
  getOcrConfigForScope,
  getPackById,
} from '../../src/packs';
import { packAllowedConcreteLayouts } from '../../src/sources/ocr/packLayouts';

describe('OCR config by area profile (Pflege vs Arzt)', () => {
  const st = () => getPackById('st-elisabeth-leipzig');

  it('pack parsers/ocr.json is shared baseline only', () => {
    const ocr = getOcrConfigForPack(st());
    expect(ocr.engine).toBe('ocr-roster');
    expect(ocr.preferredLayout).toBe('auto');
    expect(ocr.layouts).toEqual(['month-matrix', 'week-strip']);
    expect(ocr.dateDuty).toBeUndefined();
    expect(packAllowedConcreteLayouts(ocr)).not.toContain('date-duty');
  });

  it('pflege area: month-matrix only, no Anästhesie dateDuty', () => {
    const ocr = getOcrConfigForScope(st(), 'pflege', 'op-ata');
    expect(ocr.layouts).toEqual(['month-matrix', 'week-strip']);
    expect(ocr.dateDuty).toBeUndefined();
    expect(packAllowedConcreteLayouts(ocr)).toEqual(['month-matrix', 'week-strip']);
  });

  it('arzt op-anaesthesie: loads mappings/arzt/*.ocr.json', () => {
    const ocr = getOcrConfigForScope(st(), 'arzt', 'op-anaesthesie');
    expect(ocr.layouts).toEqual(
      expect.arrayContaining(['month-matrix', 'week-strip', 'date-duty'])
    );
    expect(ocr.dateDuty?.columns?.length).toBeGreaterThan(3);
    expect(ocr.dateDuty?.columns?.some((c) => c.id === 'hausdienst')).toBe(true);
    expect(packAllowedConcreteLayouts(ocr)).toContain('date-duty');
  });

  it('service area without ocr.profile stays on pack baseline', () => {
    const ocr = getOcrConfigForScope(st(), 'service', 'op');
    expect(ocr.dateDuty).toBeUndefined();
    expect(ocr.layouts).toEqual(['month-matrix', 'week-strip']);
  });

  it('default-generic stays flat', () => {
    const ocr = getOcrConfigForScope(getPackById('default-generic'), 'generic', 'import');
    expect(ocr.layouts).toEqual(['month-matrix', 'week-strip']);
    expect(ocr.dateDuty).toBeUndefined();
  });
});
