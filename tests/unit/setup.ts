/**
 * Shared Jest mocks so unit tests can import `t()` / store without Expo native modules.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

jest.mock('expo-crypto', () => {
  class AESEncryptionKey {
    static async generate() {
      return new AESEncryptionKey();
    }
    static async import() {
      return new AESEncryptionKey();
    }
    async encoded() {
      return 'dGVzdGtleQ==';
    }
  }
  class AESSealedData {
    static fromCombined() {
      return new AESSealedData();
    }
    async combined() {
      return 'Y29tYmluZWQ=';
    }
  }
  return {
    AESEncryptionKey,
    AESSealedData,
    AESKeySize: { AES256: 256 },
    aesEncryptAsync: jest.fn(async () => new AESSealedData()),
    aesDecryptAsync: jest.fn(async (_s: unknown, _k: unknown, opts?: { output?: string }) => {
      if (opts?.output === 'base64') return '';
      return new Uint8Array();
    }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  multiRemove: jest.fn(async () => undefined),
}));
