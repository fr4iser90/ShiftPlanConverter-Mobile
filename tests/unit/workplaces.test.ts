/**
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => mem.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        mem.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        mem.delete(k);
      }),
      multiRemove: jest.fn(async (keys: string[]) => {
        for (const k of keys) mem.delete(k);
      }),
    },
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('../../src/state/securePayload', () => ({
  encryptUtf8: jest.fn(async (s: string) => `enc:v1:${s}`),
  decryptUtf8: jest.fn(async (raw: string | null) => {
    if (!raw) return '';
    if (raw.startsWith('enc:v1:')) return raw.slice('enc:v1:'.length);
    return raw;
  }),
  clearDataEncryptionKey: jest.fn(async () => undefined),
  getExistingDataKey: jest.fn(async () => ({})),
  isEncryptedPayload: jest.fn((v: string | null | undefined) => !!v && v.startsWith('enc:v1:')),
}));

import {
  addWorkplace,
  getSnapshot,
  removeWorkplace,
  setActiveWorkplaceId,
  setWorkplace,
} from '../../src/state/store';
import { defaultLabelForPack } from '../../src/state/workplaces';

describe('workplace profiles', () => {
  it('labels Ärzte · OP · Anästhesist/in without repeating Fachbereich', () => {
    expect(
      defaultLabelForPack(
        'st-elisabeth-leipzig',
        'St. Elisabeth Leipzig',
        'OP · Anästhesist/in',
        'Anästhesie',
        'Ärzte',
        'OP',
        'Anästhesist/in'
      )
    ).toBe('St. Elisabeth Leipzig · Ärzte · OP · Anästhesist/in');
  });

  it('creates a profile via setWorkplace and mirrors pack fields', async () => {
    // Clear leftover profiles from other tests in this file (module singleton).
    while (getSnapshot().workplaces.length) {
      await removeWorkplace(getSnapshot().workplaces[0].id);
    }

    await setWorkplace({
      packId: 'st-elisabeth-leipzig',
      groupId: 'pflege',
      areaId: 'op-ata',
      preset: 'Anästhesie',
    });
    const snap = getSnapshot();
    expect(snap.workplaces).toHaveLength(1);
    expect(snap.activeWorkplaceId).toBeTruthy();
    expect(snap.packId).toBe('st-elisabeth-leipzig');
    expect(snap.preset).toBe('Anästhesie');
    expect(snap.workplaces[0].label).toContain('Elisabeth');
  });

  it('keeps two profiles and switches active pack mirror', async () => {
    while (getSnapshot().workplaces.length) {
      await removeWorkplace(getSnapshot().workplaces[0].id);
    }

    await setWorkplace({
      packId: 'st-elisabeth-leipzig',
      groupId: 'pflege',
      areaId: 'op-ata',
      preset: 'Anästhesie',
    });
    const second = await addWorkplace({
      packId: 'default-generic',
      groupId: 'generic',
      areaId: 'import',
      preset: 'Standard',
    });
    let snap = getSnapshot();
    expect(snap.workplaces).toHaveLength(2);
    expect(snap.activeWorkplaceId).toBe(second.id);
    expect(snap.packId).toBe('default-generic');

    const firstId = snap.workplaces.find((w) => w.id !== second.id)!.id;
    await setActiveWorkplaceId(firstId);
    snap = getSnapshot();
    expect(snap.activeWorkplaceId).toBe(firstId);
    expect(snap.packId).toBe('st-elisabeth-leipzig');
  });
});
