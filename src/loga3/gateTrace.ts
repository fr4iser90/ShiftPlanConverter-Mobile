/**
 * Per-gate DOM dumps for Holen / PDF-fetch debug.
 * Files: FileSystem.cacheDirectory + gate-trace/<nn>-<name>.json
 */
import * as FileSystem from 'expo-file-system/legacy';

const DIR = 'gate-trace';

export type GateDump = {
  gate: string;
  at: string;
  pickerFound?: boolean;
  maskFound?: boolean;
  oeffnenFound?: boolean;
  note?: string;
  sample?: string;
  code?: string;
  error?: string;
};

function dirUri(): string | null {
  const base = FileSystem.cacheDirectory;
  if (!base) return null;
  return `${base}${DIR}/`;
}

export async function clearGateTraces(): Promise<void> {
  const dir = dirUri();
  if (!dir) return;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {
    // ignore
  }
}

export async function writeGateTrace(index: number, dump: GateDump): Promise<string | null> {
  const dir = dirUri();
  if (!dir) return null;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const safe = dump.gate.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const path = `${dir}${String(index).padStart(2, '0')}-${safe}.json`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify(dump, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    // eslint-disable-next-line no-console
    console.warn(
      `GATE_TRACE ${dump.gate} picker=${!!dump.pickerFound} mask=${!!dump.maskFound}`
    );
    return path;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('GATE_TRACE_WRITE_FAIL', e);
    return null;
  }
}
