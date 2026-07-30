import { getParser, listParserIds, parsePdfAuto, parsePdfList } from '../../src/convert/parsers';
import { getOcrEngine, listOcrEngineIds, OCR_ROSTER_ENGINE_ID } from '../../src/convert/parsers/ocr';
import {
  getDefaultGenericPack,
  getOcrConfigForPack,
  getOcrEngineIdForPack,
  getPackById,
  getParserIdForPack,
  getPdfConfigForPack,
} from '../../src/packs';

describe('default-generic pack parsers', () => {
  it('pack PDF is JSON-only → pdf-auto engine', () => {
    const pack = getDefaultGenericPack();
    expect(pack.id).toBe('default-generic');
    expect(getParserIdForPack(pack)).toBe('pdf-auto');
    expect(getPdfConfigForPack(pack).engine).toBe('pdf-auto');
  });

  it('pack OCR is JSON-only → shared ocr-roster engine', () => {
    const pack = getDefaultGenericPack();
    const ocr = getOcrConfigForPack(pack);
    expect(ocr.engine).toBe('ocr-roster');
    expect(ocr.usePackMapping).toBe(true);
    expect(getOcrEngineIdForPack(pack)).toBe(OCR_ROSTER_ENGINE_ID);
    expect(getOcrEngine(getOcrEngineIdForPack(pack)).id).toBe(OCR_ROSTER_ENGINE_ID);
    expect(listOcrEngineIds()).toEqual(['ocr-roster']);

    const st = getPackById('st-elisabeth-leipzig');
    expect(getOcrEngineIdForPack(st)).toBe('ocr-roster');
    expect(getOcrConfigForPack(st).preferredLayout).toBe('month-matrix');
    expect(getParserIdForPack(st)).toBe('pdf-payroll');
    expect(getPdfConfigForPack(st).engine).toBe('pdf-payroll');
  });

  it('registers PDF engines under convert registry', () => {
    const ids = listParserIds();
    expect(ids).toEqual(
      expect.arrayContaining(['pdf-auto', 'pdf-list', 'pdf-timesheet', 'pdf-payroll'])
    );
    expect(ids).not.toEqual(expect.arrayContaining(['st-elisabeth-zeitprotokoll-pdf']));
    expect(typeof getParser('pdf-list')).toBe('function');
  });

  it('parses ISO list lines', () => {
    const text = `date type start end
2026-07-15 F 07:00-15:30
2026-07-16 U`;
    const parsed = parsePdfList(text);
    expect(parsed.mainEntries.length).toBeGreaterThanOrEqual(1);
    expect(parsed.mainEntries[0]).toMatchObject({
      date: '2026-07-15',
      type: 'F',
      start: '07:00',
      end: '15:30',
    });
  });

  it('auto prefers timesheet when Abrechnungsmonat present', () => {
    const text = `Abrechnungsmonat 07/2026
15 F 07:00-15:30`;
    const parsed = parsePdfAuto(text);
    expect(parsed.year).toBe('2026');
    expect(parsed.month).toBe('07');
    expect(parsed.mainEntries.length).toBeGreaterThanOrEqual(1);
  });
});
