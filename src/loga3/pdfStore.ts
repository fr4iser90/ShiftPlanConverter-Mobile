import { Directory, File, Paths } from 'expo-file-system';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function periodFilename(month: number, year: number): string {
  return `${pad2(month)}-${year}`;
}

function pdfsDir(): Directory {
  const dir = new Directory(Paths.document, 'pdfs');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Write raw PDF bytes (avoid legacy base64 writeAsStringAsync — ~40s+/file on device). */
export async function savePdfBytes(bytes: Uint8Array, month: number, year: number): Promise<string> {
  const dir = pdfsDir();
  const file = new File(dir, `${periodFilename(month, year)}.pdf`);
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
  return file.uri;
}

export async function savePdfBase64(
  base64: string,
  month: number,
  year: number
): Promise<string> {
  return savePdfBytes(new Uint8Array(base64ToArrayBuffer(base64)), month, year);
}

export async function deletePdfFile(path: string): Promise<void> {
  try {
    const file = new File(path);
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
}

export async function readPdfBase64(path: string): Promise<string> {
  const file = new File(path);
  return file.base64();
}

/** Decode base64 → ArrayBuffer for PDF text extract */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  if (typeof globalThis.atob !== 'function') {
    throw new Error('atob unavailable — cannot decode PDF base64');
  }
  const binary = globalThis.atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
