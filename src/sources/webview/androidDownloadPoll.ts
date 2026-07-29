import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const DOWNLOAD_DIRS = [
  'file:///storage/emulated/0/Download',
  'file:///sdcard/Download',
  'file:///storage/emulated/0/Downloads',
];

export type PolledPdf = {
  base64: string;
  filename: string;
  size: number;
  path: string;
};

export type DownloadPollResult =
  | { kind: 'pdf'; pdf: PolledPdf }
  /** LOGA3 often saves Login HTML as document.pdf (~19KB) when the session died. */
  | { kind: 'login_html'; filename: string; size: number; path: string }
  | { kind: 'timeout' };

/**
 * Android fallback: RN WebView routes Content-Disposition to DownloadManager
 * (onFileDownload is a no-op on Android). Poll public Download folders for a new PDF.
 */
export async function pollAndroidDownloadsForPdf(opts: {
  sinceMs: number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<DownloadPollResult> {
  if (Platform.OS !== 'android') return { kind: 'timeout' };
  const timeoutMs = opts.timeoutMs ?? 90000;
  const intervalMs = opts.intervalMs ?? 1500;
  const deadline = Date.now() + timeoutMs;
  const seen = new Set<string>();

  while (Date.now() < deadline) {
    for (const dir of DOWNLOAD_DIRS) {
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) continue;
        const names = await FileSystem.readDirectoryAsync(dir);
        for (const name of names) {
          if (!/\.pdf$/i.test(name)) continue;
          const path = `${dir.replace(/\/$/, '')}/${name}`;
          if (seen.has(path)) continue;
          const meta = await FileSystem.getInfoAsync(path);
          if (!meta.exists || !('size' in meta) || !meta.size || meta.size < 64) continue;
          const mtime =
            'modificationTime' in meta && meta.modificationTime
              ? meta.modificationTime * 1000
              : 0;
          // Prefer files touched after we armed; if mtime missing, take newest-looking once
          if (mtime && mtime + 2000 < opts.sinceMs) {
            seen.add(path);
            continue;
          }
          const base64 = await FileSystem.readAsStringAsync(path, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (!base64 || base64.length < 32) continue;

          // %PDF magic in base64 starts with "JVBERi"
          if (base64.startsWith('JVBERi')) {
            try {
              await FileSystem.deleteAsync(path, { idempotent: true });
            } catch {
              // scoped storage may deny delete; still return bytes for private save
            }
            return {
              kind: 'pdf',
              pdf: {
                base64,
                filename: name,
                size: meta.size,
                path,
              },
            };
          }

          // LOGA3 failure mode: Login HTML saved as document.pdf (~19KB).
          let peek = '';
          try {
            peek = globalThis.atob(base64.slice(0, 400)).slice(0, 280);
          } catch {
            peek = '';
          }
          if (
            /<!DOCTYPE\s+html|<html|LogaHR|Login\.nocache|P&amp;I LogaHR/i.test(peek)
          ) {
            return {
              kind: 'login_html',
              filename: name,
              size: meta.size,
              path,
            };
          }
          seen.add(path);
        }
      } catch {
        // scoped storage / missing dir — try next
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { kind: 'timeout' };
}
