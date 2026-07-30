/**
 * Ingest merge: preserveOutsideMonths replaces only months with real PDF/text data.
 * NO_PLAN skipped months must keep existing store entries.
 */
jest.mock('../../src/widget/refresh', () => ({
  refreshHomeWidgets: jest.fn(),
}));

jest.mock('../../src/schedule/prefs', () => ({
  markSuccessfulFetch: jest.fn(async () => undefined),
}));

import { ingestArtifacts } from '../../src/ingest/ingestArtifacts';
import { getSnapshot, setEntries } from '../../src/state/store';
import type { ShiftEntry } from '../../src/convert/types';

function entry(date: string, type = 'F'): ShiftEntry {
  return {
    date,
    type,
    start: '07:00',
    end: '15:30',
    workplaceId: 'wp-test',
  };
}

const JUL_TEXT = [
  'Abrechnungsmonat 07/2026',
  'Zeitabrechnung',
  '05 So KO* 10:00 GE* 17:30 0,30 7,00',
].join('\n');

describe('ingestArtifacts month preserve', () => {
  beforeEach(async () => {
    await setEntries(
      [entry('2026-01-10'), entry('2026-07-05'), entry('2026-08-12')],
      {
        rawText: 'old-jan\nold-jul',
        summaries: [],
      }
    );
    const snap = getSnapshot();
    Object.assign(snap, {
      preset: 'Anästhesie',
      packId: 'st-elisabeth-leipzig',
      groupId: 'pflege',
      areaId: 'op-bereich',
      activeWorkplaceId: 'wp-test',
    });
  });

  it('NO_PLAN does not wipe existing month entries', async () => {
    expect(getSnapshot().entries).toHaveLength(3);

    const result = await ingestArtifacts(
      [{ kind: 'skipped', month: 1, year: 2026, reason: 'NO_PLAN' }],
      { preserveOutsideMonths: true, replaceEntries: false }
    );

    expect(result.skippedNoPlan).toEqual(['01/2026']);
    expect(getSnapshot().entries).toHaveLength(3);
    expect(getSnapshot().entries.some((e) => e.date.startsWith('2026-01'))).toBe(true);
  });

  it('replaces only PDF months; NO_PLAN month keeps old entries', async () => {
    const result = await ingestArtifacts(
      [
        {
          kind: 'pdf',
          month: 7,
          year: 2026,
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          text: JUL_TEXT,
        },
        { kind: 'skipped', month: 8, year: 2026, reason: 'NO_PLAN' },
      ],
      { preserveOutsideMonths: true, replaceEntries: false }
    );

    expect(result.skippedNoPlan).toEqual(['08/2026']);
    expect(result.entries.some((e) => e.date.startsWith('2026-01'))).toBe(true);
    expect(result.entries.some((e) => e.date.startsWith('2026-08'))).toBe(true);
    // July was in replace set — old 07-05 gone or superseded by parsed row
    expect(result.entries.some((e) => e.date.startsWith('2026-07'))).toBe(true);
  });
});
