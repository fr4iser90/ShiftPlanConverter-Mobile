/**
 * Persist last OCR geometry for device pull (`adb pull`) + Metro/logcat export.
 * Cache write always; Android/data best-effort; full JSON also chunked to logcat
 * so release builds (no run-as) can still export dumps.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { buildMonthMatrixGrid, computeMonthMatrixMetrics } from './layouts/month-matrix';
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

export type PersistOcrGeometryOpts = {
  /** Live lattice used for the on-device matrix (dump rebuild must use this). */
  lattice?: { hYs: number[]; vXs: number[] } | null;
  /** Already-built grid (avoids dump/live mismatch). */
  grid?: ReturnType<typeof buildMonthMatrixGrid> | null;
};

export async function persistOcrGeometryDump(
  ocr: OcrResult,
  opts?: PersistOcrGeometryOpts
): Promise<void> {
  const lattice = opts?.lattice?.hYs?.length
    ? { hYs: opts.lattice.hYs, vXs: opts.lattice.vXs || [] }
    : undefined;
  const grid =
    opts?.grid ??
    buildMonthMatrixGrid(
      ocr.lines,
      ocr.pageWidth,
      ocr.pageHeight,
      lattice ? { lattice } : undefined
    );
  const metrics = computeMonthMatrixMetrics(grid);
  const bandHs = grid.rows
    .map((r) =>
      r.yLo != null && r.yHi != null && r.yHi > r.yLo ? r.yHi - r.yLo : null
    )
    .filter((h): h is number => h != null);
  bandHs.sort((a, b) => a - b);
  const payload = {
    ...serializeOcrGeometry(ocr),
    lattice: lattice || null,
    grid: {
      ok: grid.ok,
      headers: grid.headers,
      nameMaxX: grid.nameMaxX,
      rowSlope: grid.rowSlope,
      headerBandY: grid.headerBandY,
      headerBandTop: grid.headerBandTop,
      headerBandBot: grid.headerBandBot,
      headerFrame: grid.headerFrame,
      latticeQuality: grid.latticeQuality,
      rosterMonth: grid.rosterMonth,
      rosterYear: grid.rosterYear,
      dayFrames: grid.dayFrames,
      personFrames: grid.personFrames,
      rows: grid.rows.map((r) => ({
        name: r.name,
        yCenter: r.yCenter,
        yLo: r.yLo,
        yHi: r.yHi,
        bandSource: r.bandSource,
        cells: r.cells,
      })),
    },
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
      latticeH: lattice?.hYs.length || 0,
      latticeV: lattice?.vXs.length || 0,
      dayFrameCount: grid.dayFrames?.length || 0,
      personFrameCount: grid.personFrames?.length || 0,
      bandHMed: bandHs.length ? bandHs[Math.floor((bandHs.length - 1) / 2)] : null,
      bandHMax: bandHs.length ? bandHs[bandHs.length - 1]! : null,
      latticeQuality: grid.latticeQuality,
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
