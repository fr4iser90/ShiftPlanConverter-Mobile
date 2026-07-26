import { nearestColIndex, owningColIndex } from '../../src/sources/ocr/monthMatrix/geometry';
import { applyPackMappingToCell } from '../../src/sources/ocr/applyPackMapping';
import type { MappingValue } from '../../src/convert/types';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function line(text: string, x: number, w: number, y = 10, h = 12): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('nearestColIndex', () => {
  it('assigns a token to the closest day column only', () => {
    const centers = [100, 150, 200, 250];
    expect(nearestColIndex(155, centers)).toBe(1);
    expect(nearestColIndex(148, centers)).toBe(1);
    expect(nearestColIndex(175, centers)).toBe(2);
  });

  it('soft-prefers right column when left-aligned content sits just left of midpoint', () => {
    // Fr7=681.3 Sa8=716.9 — B38@696.5 must be Sa8 (SOLL), not Fr7
    const centers = [611.25, 681.3333333333334, 716.9444444444445];
    expect(nearestColIndex(696.5, centers, 'B38')).toBe(2);
    // F1@646 near Do6/Fr7 midpoint → Fr7 (SOLL Fr7=F1)
    expect(nearestColIndex(646, centers, 'F1')).toBe(1);
  });

  it('keeps early clock crumbs near their own center (no soft-shift into next day)', () => {
    const centers = [480, 525, 576];
    // "35-" of Mo3 F must stay Mo3, not Di4
    expect(nearestColIndex(485.5, centers, '35-')).toBe(0);
    expect(nearestColIndex(485.5, centers, '07:35')).toBe(0);
  });

  it('soft-right pulls left-aligned Fr21 / Mo17 crumbs across the midpoint', () => {
    const centersFr = [1277.5, 1339.0, 1378.8];
    expect(nearestColIndex(1301.5, centersFr, '0735')).toBe(1);
    const centersMo = [1088.2, 1137.5, 1173.5];
    expect(nearestColIndex(1109, centersMo, '07')).toBe(1);
  });

  it('soft-left pulls morning-start crumbs that spilled into the next day', () => {
    const centers = [1088.2, 1137.5, 1173.5];
    expect(nearestColIndex(1163.5, centers, '0735')).toBe(1);
  });
});

describe('owningColIndex', () => {
  it('assigns left-aligned Fr21 times to Fr21 via overlap windows', () => {
    // Do20=1277.5 Fr21=1339 Sa22=1378.8 — box [1286,1317] mostly left of Fr21 center
    const centers = [1277.5, 1339.0, 1378.8];
    const l = line('0735', 1286, 31);
    expect(owningColIndex(l, centers, 371)).toBe(1);
  });

  it('keeps Mo3 morning crumbs in Mo3', () => {
    const centers = [440.5, 480, 524.5];
    const l = line('35-', 478, 15);
    expect(owningColIndex(l, centers, 371)).toBe(1);
  });
});

describe('lone clock fragments vs printed codes', () => {
  const preset: Record<string, MappingValue> = {
    '11:35-07:35': { code: 'MO', type: 'long', isValidated: true },
    '19:50-07:35': { code: 'B38', type: 'long', isValidated: true },
    '11:35-19:50': { code: 'M3', type: 'work', isValidated: true },
    '07:35-15:50': { code: 'F', type: 'work', isValidated: true },
  };

  it('does not map ambiguous lone HH:MM (shared start/end) to a pack code', () => {
    expect(applyPackMappingToCell('19:50', preset)).toBe('19:50');
    expect(applyPackMappingToCell('11:35', preset)).toBe('11:35');
  });

  it('maps a lone pack-unique end HHMM (15:50 → F only)', () => {
    expect(applyPackMappingToCell('1550', preset)).toBe('F');
    expect(applyPackMappingToCell('15:50', preset)).toBe('F');
  });

  it('still maps full fingerprints and printed codes', () => {
    expect(applyPackMappingToCell('MO', preset)).toBe('MO');
    expect(applyPackMappingToCell('11350735', preset)).toBe('MO');
    expect(applyPackMappingToCell('07351550', preset)).toBe('F');
  });

  it('does not map 35-0735 crumbs to MO', () => {
    expect(applyPackMappingToCell('35-o735', preset)).not.toBe('MO');
    expect(applyPackMappingToCell('35-07:35', preset)).not.toBe('MO');
  });

  it('maps 0735+5560 (OCR typo for 15:50) to F', () => {
    expect(applyPackMappingToCell('0735 5560', preset)).toBe('F');
  });
});
