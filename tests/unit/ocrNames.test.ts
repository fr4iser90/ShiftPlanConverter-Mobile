import {
  detectRosterNames,
  detectRosterNamesFromPlainText,
  extractPersonRowFromPlainText,
  extractPersonRowText,
  filterPreferredNameMatches,
  isPlausiblePersonName,
  matchPreferredName,
  resolveConfirmedRosterLabel,
} from '../../src/sources/ocr/names';
import type { OcrLine } from '../../src/sources/ocr/recognize';

function line(text: string, x: number, y: number, w = 120, h = 20): OcrLine {
  return { text, boundingBox: { x, y, width: w, height: h } };
}

describe('resolveConfirmedRosterLabel', () => {
  it('keeps Settings Mein Name when user taps an OCR-misread row', () => {
    expect(
      resolveConfirmedRosterLabel({
        preferred: 'PersonA, Alpha',
        ocrLabel: 'PersonA, Alpa',
        pickedLabel: 'PersonA, Alpa',
      })
    ).toBe('PersonA, Alpha');
  });

  it('allows pencil rename to a new spelling', () => {
    expect(
      resolveConfirmedRosterLabel({
        preferred: 'PersonA, Alpha',
        ocrLabel: 'PersonA, Alpa',
        pickedLabel: 'PersonC, Gamma',
      })
    ).toBe('PersonC, Gamma');
  });

  it('uses OCR label when no preferred name is set', () => {
    expect(
      resolveConfirmedRosterLabel({
        preferred: null,
        ocrLabel: 'PersonA, Alpa',
        pickedLabel: 'PersonA, Alpa',
      })
    ).toBe('PersonA, Alpa');
  });
});

describe('OCR roster name detection', () => {
  const pageWidth = 1000;
  const pageHeight = 800;

  const sample: OcrLine[] = [
    line('Sa 1 · So 2 · Mo 3', 200, 40, 600, 18),
    line('PersonA, Alpha', 20, 120),
    line('F 07:35-15:50', 200, 118, 80, 18),
    line('PersonB, Beta', 25, 200),
    line('U', 210, 198, 40, 18),
    line('noise cell text without comma', 30, 280, 200, 18),
  ];

  it('finds left-column Lastname, Firstname labels', () => {
    const names = detectRosterNames(sample, pageWidth);
    expect(names.map((n) => n.label)).toEqual(['PersonA, Alpha', 'PersonB, Beta']);
  });

  it('detects names at the start of dense matrix OCR lines', () => {
    const dense: OcrLine[] = [
      line('Sa 1 So 2 Mo 3', 100, 30, 700, 16),
      line('PersonA, Alpha F 07:35-15:50 U S F2', 15, 140, 900, 22),
      line('PersonC, Dr. Gamma U U F 07:35-15:50', 18, 200, 880, 22),
    ];
    const names = detectRosterNames(dense, pageWidth);
    expect(names.map((n) => n.label)).toEqual(['PersonA, Alpha', 'PersonC, Dr. Gamma']);
    const row = extractPersonRowText(dense, names[0], pageHeight);
    expect(row).toContain('PersonA, Alpha');
    expect(row).toContain('07:35-15:50');
    expect(row).not.toContain('PersonC');
  });

  it('auto-matches a saved preferred name', () => {
    const names = detectRosterNames(sample, pageWidth);
    const hit = matchPreferredName('PersonA, Alpha', names);
    expect(hit?.candidate.label).toBe('PersonA, Alpha');
    expect(hit?.score).toBe(1);
  });

  it('matches OCR typos against the saved Settings name', () => {
    const names = [
      {
        id: 'persona alpa',
        label: 'PersonA, Alpa',
        yCenter: 100,
        height: 14,
      },
      {
        id: 'personb beta',
        label: 'PersonB, Beta',
        yCenter: 50,
        height: 14,
      },
    ];
    const hit = matchPreferredName('PersonA, Alpha', names);
    expect(hit?.candidate.label).toBe('PersonA, Alpa');
    expect(hit!.score).toBeGreaterThanOrEqual(0.88);
  });

  it('uses aliases for previously corrected OCR spellings', () => {
    const names = [
      {
        id: 'persona alpa',
        label: 'PersonA, Alpa',
        yCenter: 100,
        height: 14,
      },
    ];
    const hit = matchPreferredName('PersonA, Alpha', names, {
      'persona, alpa': 'PersonA, Alpha',
    });
    expect(hit?.score).toBe(1);
  });

  it('matches wall-plan titles (OA Dr. Surname) to Mein Name Last, First', () => {
    const names = [
      { id: 'oa dr persona', label: 'OA Dr. PersonA', yCenter: 40, height: 14 },
      { id: 'frau personb', label: 'Frau PersonB', yCenter: 80, height: 14 },
    ];
    expect(isPlausiblePersonName('OA Dr. PersonA')).toBe(true);
    expect(isPlausiblePersonName('Dr. PersonA')).toBe(true);
    const hit = matchPreferredName('PersonA, Alpha', names);
    expect(hit?.candidate.label).toBe('OA Dr. PersonA');
    expect(hit!.score).toBeGreaterThanOrEqual(0.88);
  });

  it('accepts OÄ / Hr. wall labels (Anästhesie board OCR)', () => {
    expect(isPlausiblePersonName('OÄ Dr. PersonA')).toBe(true);
    expect(isPlausiblePersonName('Hr. PersonA')).toBe(true);
    const names = [
      { id: 'oa', label: 'OÄ Dr. PersonA', yCenter: 40, height: 14 },
      { id: 'hr', label: 'Hr. PersonA', yCenter: 80, height: 14 },
      { id: 'other', label: 'Frau PersonB', yCenter: 120, height: 14 },
    ];
    const hits = filterPreferredNameMatches('PersonA, Alpha', names, null, 0.8);
    expect(hits.map((h) => h.label).sort()).toEqual(['Hr. PersonA', 'OÄ Dr. PersonA']);
  });

  it('collapses title OCR variants of the same wall surname', () => {
    const names = [
      { id: 'oa dr persona', label: 'OA Dr. PersonA', yCenter: 40, height: 14 },
      { id: 'dr persona', label: 'Dr. PersonA', yCenter: 80, height: 14 },
      { id: 'persona', label: 'PersonA', yCenter: 120, height: 14 },
      { id: 'frau personb', label: 'Frau PersonB', yCenter: 160, height: 14 },
    ];
    const hit = matchPreferredName('PersonA, Alpha', names);
    expect(hit?.score).toBeGreaterThanOrEqual(0.88);
  });

  it('does not unique-boost when two distinct people share a surname', () => {
    const names = [
      { id: 'persona alpha', label: 'PersonA, Alpha', yCenter: 40, height: 14 },
      { id: 'persona beta', label: 'PersonA, Beta', yCenter: 80, height: 14 },
    ];
    const hit = matchPreferredName('PersonA, Gamma', names);
    // Same surname, different givens — no unique-surname wall boost.
    expect(!hit || hit.score < 0.88).toBe(true);
  });

  it('extracts header + person row strip', () => {
    const names = detectRosterNames(sample, pageWidth);
    const alice = names[0];
    const text = extractPersonRowText(sample, alice, pageHeight);
    expect(text).toContain('Mo 3');
    expect(text).toContain('PersonA, Alpha');
    expect(text).toContain('F 07:35-15:50');
    expect(text).not.toContain('PersonB');
  });

  it('rejects day strips and mashed OCR blobs as person names', () => {
    expect(isPlausiblePersonName('SA 11502Mo 3 DI4 Mi5 Do 6 Fr7')).toBe(false);
    expect(isPlausiblePersonName('n 1n 6 60')).toBe(false);
    expect(isPlausiblePersonName('PersonX, 0:00 o7 96')).toBe(false);
    expect(isPlausiblePersonName('Alpha, Beta Charlie, Gamma Delta')).toBe(false);
    expect(isPlausiblePersonName('PersonA, Alpha')).toBe(true);
    expect(isPlausiblePersonName('PersonA., Alpha')).toBe(true);
  });
});
