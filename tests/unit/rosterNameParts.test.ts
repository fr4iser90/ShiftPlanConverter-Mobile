import {
  composeRosterNameParts,
  parseRosterNameParts,
} from '../../src/state/rosterNameParts';
import { matchPreferredName } from '../../src/sources/ocr/names';

describe('rosterNameParts', () => {
  it('round-trips Last, First', () => {
    const composed = composeRosterNameParts({
      last: 'PersonA',
      first: 'Alpha',
    });
    expect(composed).toBe('PersonA, Alpha');
    expect(parseRosterNameParts(composed)).toEqual({
      last: 'PersonA',
      first: 'Alpha',
    });
  });

  it('strips legacy title prefix when parsing into fields', () => {
    expect(parseRosterNameParts('Dr. PersonA, Alpha')).toEqual({
      last: 'PersonA',
      first: 'Alpha',
    });
    expect(
      composeRosterNameParts(parseRosterNameParts('Dr. PersonA, Alpha'))
    ).toBe('PersonA, Alpha');
  });

  it('parses legacy single-field strings', () => {
    expect(parseRosterNameParts('PersonA, Alpha')).toEqual({
      last: 'PersonA',
      first: 'Alpha',
    });
  });

  it('preferred Last, First matches wall OA Dr. Surname', () => {
    const preferred = composeRosterNameParts({
      last: 'PersonA',
      first: 'Alpha',
    });
    const hit = matchPreferredName(preferred, [
      { id: 'oa', label: 'OA Dr. PersonA', yCenter: 10, height: 12 },
      { id: 'other', label: 'Frau PersonB', yCenter: 40, height: 12 },
    ]);
    expect(hit?.candidate.label).toBe('OA Dr. PersonA');
    expect(hit!.score).toBeGreaterThanOrEqual(0.85);
  });
});
