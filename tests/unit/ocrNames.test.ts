import {
  detectRosterNames,
  detectRosterNamesFromPlainText,
  extractPersonRowFromPlainText,
  extractPersonRowText,
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
        preferred: 'Nordmann, Alice',
        ocrLabel: 'Nortmann, Alic',
        pickedLabel: 'Nortmann, Alic',
      })
    ).toBe('Nordmann, Alice');
  });

  it('allows pencil rename to a new spelling', () => {
    expect(
      resolveConfirmedRosterLabel({
        preferred: 'Nordmann, Alice',
        ocrLabel: 'Nortmann, Alic',
        pickedLabel: 'Westmann, Clara',
      })
    ).toBe('Westmann, Clara');
  });

  it('uses OCR label when no preferred name is set', () => {
    expect(
      resolveConfirmedRosterLabel({
        preferred: null,
        ocrLabel: 'Nortmann, Alic',
        pickedLabel: 'Nortmann, Alic',
      })
    ).toBe('Nortmann, Alic');
  });
});

describe('OCR roster name detection', () => {
  const pageWidth = 1000;
  const pageHeight = 800;

  const sample: OcrLine[] = [
    line('Sa 1 · So 2 · Mo 3', 200, 40, 600, 18),
    line('Nordmann, Alice', 20, 120),
    line('F 07:35-15:50', 200, 118, 80, 18),
    line('Suedmann, Bianca', 25, 200),
    line('U', 210, 198, 40, 18),
    line('noise cell text without comma', 30, 280, 200, 18),
  ];

  it('finds left-column Lastname, Firstname labels', () => {
    const names = detectRosterNames(sample, pageWidth);
    expect(names.map((n) => n.label)).toEqual(['Nordmann, Alice', 'Suedmann, Bianca']);
  });

  it('detects names at the start of dense matrix OCR lines', () => {
    const dense: OcrLine[] = [
      line('Sa 1 So 2 Mo 3', 100, 30, 700, 16),
      line('Nordmann, Alice F 07:35-15:50 U S F2', 15, 140, 900, 22),
      line('Westmann, Dr. Clara U U F 07:35-15:50', 18, 200, 880, 22),
    ];
    const names = detectRosterNames(dense, pageWidth);
    expect(names.map((n) => n.label)).toEqual(['Nordmann, Alice', 'Westmann, Dr. Clara']);
    const row = extractPersonRowText(dense, names[0], pageHeight);
    expect(row).toContain('Nordmann, Alice');
    expect(row).toContain('07:35-15:50');
    expect(row).not.toContain('Westmann');
  });

  it('auto-matches a saved preferred name', () => {
    const names = detectRosterNames(sample, pageWidth);
    const hit = matchPreferredName('Nordmann, Alice', names);
    expect(hit?.candidate.label).toBe('Nordmann, Alice');
    expect(hit?.score).toBe(1);
  });

  it('matches OCR typos against the saved Settings name', () => {
    const names = [
      {
        id: 'nordmann alic',
        label: 'Nortmann, Alic',
        yCenter: 100,
        height: 14,
      },
      {
        id: 'suedmann bianca',
        label: 'Suedmann, Bianca',
        yCenter: 50,
        height: 14,
      },
    ];
    const hit = matchPreferredName('Nordmann, Alice', names);
    expect(hit?.candidate.label).toBe('Nortmann, Alic');
    expect(hit!.score).toBeGreaterThanOrEqual(0.88);
  });

  it('uses aliases for previously corrected OCR spellings', () => {
    const names = [
      {
        id: 'nordmann alic',
        label: 'Nortmann, Alic',
        yCenter: 100,
        height: 14,
      },
    ];
    const hit = matchPreferredName('Nordmann, Alice', names, {
      'nortmann, alic': 'Nordmann, Alice',
    });
    expect(hit?.score).toBe(1);
  });

  it('extracts header + person row strip', () => {
    const names = detectRosterNames(sample, pageWidth);
    const alice = names[0];
    const text = extractPersonRowText(sample, alice, pageHeight);
    expect(text).toContain('Mo 3');
    expect(text).toContain('Nordmann, Alice');
    expect(text).toContain('F 07:35-15:50');
    expect(text).not.toContain('Suedmann');
  });

  it('rejects day strips and mashed OCR blobs as person names', () => {
    expect(isPlausiblePersonName('SA 11502Mo 3 DI4 Mi5 Do 6 Fr7')).toBe(false);
    expect(isPlausiblePersonName('n 1n 6 60')).toBe(false);
    expect(isPlausiblePersonName('Meerheim, 0:00 o7 96')).toBe(false);
    expect(isPlausiblePersonName('Alice, Bob Charlie, Dana Eve')).toBe(false);
    expect(isPlausiblePersonName('Nordmann, Alice')).toBe(true);
    expect(isPlausiblePersonName('Nordm., Alice')).toBe(true);
  });
});
