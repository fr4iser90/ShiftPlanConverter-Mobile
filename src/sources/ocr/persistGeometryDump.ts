/**
 * Persist last OCR geometry for device pull (`adb pull`) + Metro log summary.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { buildMonthMatrixGrid, computeMonthMatrixMetrics } from './monthMatrix';
import type { OcrResult } from './recognize';
import { serializeOcrGeometry } from './geometryDump';

const DUMP_NAME = 'ocr-last-geometry.json';

export function ocrDumpPath(): string | null {
  const base = FileSystem.cacheDirectory;
  if (!base) return null;
  return `${base}${DUMP_NAME}`;
}

export async function persistOcrGeometryDump(ocr: OcrResult): Promise<void> {
  const path = ocrDumpPath();
  if (!path) return;
  const grid = buildMonthMatrixGrid(ocr.lines, ocr.pageWidth);
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
    },
  };
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload));
  // eslint-disable-next-line no-console
  console.log(
    `[ocr-geometry] lines=${ocr.lines.length} page=${ocr.pageWidth}x${ocr.pageHeight} ` +
      `gridOk=${grid.ok} headers=${metrics.headerCount} days=${metrics.dayCoverage} ` +
      `rows=${metrics.rowCount} file=${path}`
  );
}
