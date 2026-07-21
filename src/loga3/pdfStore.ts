import * as FileSystem from 'expo-file-system/legacy';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function periodFilename(month: number, year: number): string {
  return `${pad2(month)}-${year}`;
}

export async function getPdfDir(): Promise<string> {
  const dir = `${FileSystem.documentDirectory || ''}pdfs/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  return dir;
}

export async function savePdfBase64(
  base64: string,
  month: number,
  year: number
): Promise<string> {
  const dir = await getPdfDir();
  const path = `${dir}${periodFilename(month, year)}.pdf`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

export async function readPdfBase64(path: string): Promise<string> {
  return FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Decode base64 → ArrayBuffer for pdf.js */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  const atobFn =
    typeof globalThis.atob === 'function'
      ? globalThis.atob.bind(globalThis)
      : (s: string) => {
          // minimal fallback
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { Buffer } = require('buffer');
          return Buffer.from(s, 'base64').toString('binary');
        };
  const binary = atobFn(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
