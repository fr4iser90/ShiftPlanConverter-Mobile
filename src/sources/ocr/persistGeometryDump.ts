/**
 * Persist last OCR geometry for device pull (`adb pull`) + Metro/logcat export.
 * Cache write always; Android/data best-effort; full JSON also chunked to logcat
 * so release builds (no run-as) can still export dumps.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { buildMonthMatrixGrid, computeMonthMatrixMetrics } from './monthMatrix';
import type { OcrResult } from './recognize';
import { serializeOcrGeometry } from './geometryDump';

const DUMP_NAME = 'ocr-last-geometry.json';
const PKG = 'com.fr4iser.shiftplan';
const LOG_CHUNK = 2800;

export function ocrDumpPath(): string | null {
  const base = FileSystem.cacheDirectory;
  if (!base) return null;
  return `${base}${DUMP_NAME}`;
}

/** World-pullable on some devices; may fail silently on scoped storage. */
export function ocrDumpExternalPath(): string | null {
  if (Platform.OS !== 'android') return null;
  return `file:///storage/emulated/0/Android/data/${PKG}/files/${DUMP_NAME}`;
}

function emitLogcatDump(json: string): void {
  const id = `${Date.now()}`;
  // eslint-disable-next-line no-console
  console.log(`[ocr-geometry-dump-begin] id=${id} bytes=${json.length}`);
  for (let i = 0; i < json.length; i += LOG_CHUNK) {
    // eslint-disable-next-line no-console
    console.log(`[ocr-geometry-dump] id=${id} off=${i} ${json.slice(i, i + LOG_CHUNK)}`);
  }
  // eslint-disable-next-line no-console
  console.log(`[ocr-geometry-dump-end] id=${id}`);
}

export async function persistOcrGeometryDump(ocr: OcrResult): Promise<void> {
  const grid = buildMonthMatrixGrid(ocr.lines, ocr.pageWidth, ocr.pageHeight);
  const metrics = computeMonthMatrixMetrics(grid);
  const payload = {
    ...serializeOcrGeometry(ocr),
    meta: {
      lineCount: ocr.lines.length,
      textChars: (ocr.text || '').length,
      gridOk: grid.ok,
      headerCount: metrics.headerCount,
      rowCount: metrics.rowCount,
      dayCoverage: metrics.dayCoverage,
      fillRatio: Math.round(metrics.fillRatio * 1000) / 1000,
      sampleNames: grid.rows.map((r) => r.name),
      sampleHeaders: grid.headers.slice(0, 12),
      pageWidth: ocr.pageWidth,
      pageHeight: ocr.pageHeight,
    },
  };
  const json = JSON.stringify(payload);
  const wrote: string[] = [];
  for (const path of [ocrDumpPath(), ocrDumpExternalPath()].filter(Boolean) as string[]) {
    try {
      await FileSystem.writeAsStringAsync(path, json);
      wrote.push(path);
    } catch {
      // best-effort per path
    }
  }
  try {
    emitLogcatDump(json);
  } catch {
    // ignore
  }
  // eslint-disable-next-line no-console
  console.log(
    `[ocr-geometry] lines=${ocr.lines.length} page=${ocr.pageWidth}x${ocr.pageHeight} ` +
      `gridOk=${grid.ok} headers=${metrics.headerCount} days=${metrics.dayCoverage} ` +
      `rows=${metrics.rowCount} wrote=${wrote.length} files=${wrote.join(',') || 'none'}`
  );
}
