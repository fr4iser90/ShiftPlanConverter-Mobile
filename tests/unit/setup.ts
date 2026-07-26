/**
 * Shared Jest mocks so unit tests can import `t()` / store without Expo native modules.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34, select: (o: Record<string, unknown>) => o.android },
  Image: {
    getSize: jest.fn((_u: string, ok: (w: number, h: number) => void) => ok(1600, 1200)),
  },
  TurboModuleRegistry: { get: () => null },
  StyleSheet: {
    create: (s: unknown) => s,
    hairlineWidth: 1,
  },
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  Pressable: 'Pressable',
  Modal: 'Modal',
  FlatList: 'FlatList',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

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

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri: string, actions: unknown[]) => {
    const resize = Array.isArray(actions)
      ? (actions.find((a) => a && typeof a === 'object' && 'resize' in a) as
          | { resize: { width: number; height: number } }
          | undefined)
      : undefined;
    return {
      uri: resize ? `${uri}.ocr.jpg` : uri,
      width: resize?.resize.width ?? 100,
      height: resize?.resize.height ?? 40,
    };
  }),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

jest.mock('react-native-document-scanner-plugin', () => ({
  __esModule: true,
  default: {
    scanDocument: jest.fn(async () => ({ status: 'cancel', scannedImages: [] })),
  },
  ResponseType: { ImageFilePath: 'imageFilePath', Base64: 'base64' },
  ScanDocumentResponseStatus: { Success: 'success', Cancel: 'cancel' },
}));
