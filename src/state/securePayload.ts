/**
 * AES-GCM payload helpers — key in Secure Store, ciphertext in AsyncStorage / files.
 * Format: `enc:v1:` + base64(combined IV|ciphertext|tag)
 *
 * CRITICAL: never mint a new key while decrypting. A rotated key makes existing
 * `enc:v1:` payloads permanently unreadable.
 */
import * as SecureStore from 'expo-secure-store';
import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';

const KEY_STORE = 'loga3.aesKey.v1';
const PREFIX = 'enc:v1:';

let cachedKey: AESEncryptionKey | null = null;

function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Android: AESSealedData.fromCombined(base64String) throws — always pass bytes. */
function base64ToBytes(b64: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('atob unavailable — cannot decode sealed payload');
  }
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function clearDataEncryptionKey(): Promise<void> {
  cachedKey = null;
  try {
    await SecureStore.deleteItemAsync(KEY_STORE);
  } catch {
    // ignore
  }
}

/** Load key from Secure Store only — never create. */
export async function getExistingDataKey(): Promise<AESEncryptionKey | null> {
  if (cachedKey) return cachedKey;
  const stored = await SecureStore.getItemAsync(KEY_STORE);
  if (!stored) return null;
  cachedKey = await AESEncryptionKey.import(stored, 'base64');
  return cachedKey;
}

async function getOrCreateKey(): Promise<AESEncryptionKey> {
  const existing = await getExistingDataKey();
  if (existing) return existing;
  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  const b64 = await key.encoded('base64');
  await SecureStore.setItemAsync(KEY_STORE, b64);
  cachedKey = key;
  return key;
}

export function isEncryptedPayload(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

/** Encrypt UTF-8 text → storage string. Empty string stays empty. */
export async function encryptUtf8(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const key = await getOrCreateKey();
  const sealed = await aesEncryptAsync(utf8ToBytes(plaintext), key);
  const combined = await sealed.combined('base64');
  return `${PREFIX}${combined}`;
}

/**
 * Decrypt storage string → UTF-8.
 * Plaintext legacy values pass through unchanged (migration).
 * Encrypted payloads without a key throw — do NOT mint a new key here.
 */
export async function decryptUtf8(stored: string | null | undefined): Promise<string> {
  if (!stored) return '';
  if (!isEncryptedPayload(stored)) return stored;
  const key = await getExistingDataKey();
  if (!key) {
    throw Object.assign(new Error('DATA_KEY_MISSING'), { code: 'DATA_KEY_MISSING' as const });
  }
  // Must be Uint8Array — string base64 hits expo-crypto Android fromCombined bug.
  const sealed = AESSealedData.fromCombined(base64ToBytes(stored.slice(PREFIX.length)));
  const bytes = await aesDecryptAsync(sealed, key, { output: 'bytes' });
  return bytesToUtf8(bytes as Uint8Array);
}

/** Encrypt raw bytes (e.g. PDF) → Uint8Array with magic header + combined sealed. */
export async function encryptBytes(plain: Uint8Array): Promise<Uint8Array> {
  const key = await getOrCreateKey();
  const sealed = await aesEncryptAsync(plain, key);
  const combined = (await sealed.combined('bytes')) as Uint8Array;
  const magic = utf8ToBytes('loga3enc1');
  const out = new Uint8Array(magic.length + combined.length);
  out.set(magic, 0);
  out.set(combined, magic.length);
  return out;
}

/** Decrypt bytes written by encryptBytes; plain PDFs (%PDF) pass through. */
export async function decryptBytes(data: Uint8Array): Promise<Uint8Array> {
  const magic = utf8ToBytes('loga3enc1');
  if (data.length < magic.length + 12) return data;
  for (let i = 0; i < magic.length; i++) {
    if (data[i] !== magic[i]) return data;
  }
  const key = await getExistingDataKey();
  if (!key) {
    throw Object.assign(new Error('DATA_KEY_MISSING'), { code: 'DATA_KEY_MISSING' as const });
  }
  const sealed = AESSealedData.fromCombined(data.slice(magic.length));
  return (await aesDecryptAsync(sealed, key, { output: 'bytes' })) as Uint8Array;
}
