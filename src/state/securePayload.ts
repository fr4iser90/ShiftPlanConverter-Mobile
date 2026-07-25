/**
 * AES-GCM payload helpers — key in Secure Store, ciphertext in AsyncStorage / files.
 * Format: `enc:v1:` + base64(combined IV|ciphertext|tag)
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

export async function clearDataEncryptionKey(): Promise<void> {
  cachedKey = null;
  try {
    await SecureStore.deleteItemAsync(KEY_STORE);
  } catch {
    // ignore
  }
}

async function getOrCreateKey(): Promise<AESEncryptionKey> {
  if (cachedKey) return cachedKey;
  const stored = await SecureStore.getItemAsync(KEY_STORE);
  if (stored) {
    cachedKey = await AESEncryptionKey.import(stored, 'base64');
    return cachedKey;
  }
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
 */
export async function decryptUtf8(stored: string | null | undefined): Promise<string> {
  if (!stored) return '';
  if (!isEncryptedPayload(stored)) return stored;
  const key = await getOrCreateKey();
  const sealed = AESSealedData.fromCombined(stored.slice(PREFIX.length));
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
  const key = await getOrCreateKey();
  const sealed = AESSealedData.fromCombined(data.slice(magic.length));
  return (await aesDecryptAsync(sealed, key, { output: 'bytes' })) as Uint8Array;
}
