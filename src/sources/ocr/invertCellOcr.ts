/**
 * Fill empty month-matrix cells with short glyphs (U, /) via shape match on
 * the source JPEG. Duty-agnostic — pack mapping still owns U→Urlaub.
 *
 * No ML Kit per cell (too slow / unreliable for pale-on-blue).
 */
import * as FileSystem from 'expo-file-system/legacy';
import { normalizeLocalImageUri } from './capture';
import { cleanCell } from './layouts/month-matrix/geometry';
import type { MonthMatrixGrid } from './layouts/month-matrix/types';
import type { OcrLine } from './recognize';
import { matchShortGlyphFromRgba } from './shortGlyphMatch';
import { isMatrixWeekendColumn } from './matrixCalendar';
import { SHORT_GLYPH_POLICY as P } from './shortGlyphPolicy';
import {
  applyInvertCellHitsToGrid,
  type InvertCellHit,
} from './shortGlyphHits';

export type { InvertCellHit };
export { applyInvertCellHitsToGrid };

function isDigitNoiseCell(text: string): boolean {
  const t = cleanCell(text);
  return /^\d{3,}$/.test(t);
}

type JpegCodec = {
  decode: (
    data: Uint8Array,
    opts?: { useTArray?: boolean }
  ) => { width: number; height: number; data: Uint8Array };
};

function ensureBuffer(): void {
  const g = globalThis as { Buffer?: unknown };
  if (typeof g.Buffer === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    g.Buffer = require('buffer').Buffer;
  }
}

function loadJpeg(): JpegCodec {
  ensureBuffer();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('jpeg-js') as JpegCodec;
}

function b64ToBytes(b64: string): Uint8Array {
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (typeof atobFn === 'function') {
    const bin = atobFn(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer') as { Buffer: { from: (s: string, e: string) => Uint8Array } };
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function readJpegBytes(uri: string): Promise<Uint8Array | null> {
  const input = normalizeLocalImageUri(uri);
  const fsPath = input.replace(/^file:\/\//, '');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    if (typeof fs.existsSync === 'function' && fs.existsSync(fsPath)) {
      return new Uint8Array(fs.readFileSync(fsPath));
    }
  } catch {
    // expo
  }
  const b64 = await FileSystem.readAsStringAsync(input, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!b64 || b64.length < 32) return null;
  return b64ToBytes(b64);
}

/**
 * Shape-match empty cells. `recognize` kept for API compat but unused.
 */
export async function ocrEmptyCellsViaInvert(
  uri: string,
  grid: MonthMatrixGrid,
  pageWidth: number,
  pageHeight: number,
  _recognize?: (uri: string) => Promise<{ lines: OcrLine[]; text: string }>,
  opts?: { maxCells?: number }
): Promise<InvertCellHit[]> {
  const days = grid.dayFrames || [];
  const people = grid.personFrames || [];
  if (!days.length || !people.length || !grid.ok) return [];
  if (!(pageWidth > 0 && pageHeight > 0)) return [];

  const bytes = await readJpegBytes(uri);
  if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];
  const jpeg = loadJpeg();
  const decoded = jpeg.decode(bytes, { useTArray: true });
  const { width: imgW, height: imgH, data } = decoded;
  if (!(imgW > 0 && imgH > 0)) return [];
  const sx = imgW / pageWidth;
  const sy = imgH / pageHeight;

  const maxCells = opts?.maxCells ?? 200;
  const hits: InvertCellHit[] = [];
  let tried = 0;

  const dayOrder = [
    ...days.map((_, di) => di).filter((di) => di < 14),
    ...days.map((_, di) => di).filter((di) => di >= 14),
  ];

  for (const di of dayOrder) {
    for (let ri = 0; ri < people.length; ri++) {
      if (tried >= maxCells) return hits;
      const row = grid.rows[ri];
      const pf = people[ri]!;
      if (!row) continue;
      if (cleanCell(row.cells[di] || '') && !isDigitNoiseCell(row.cells[di] || '')) continue;
      const df = days[di]!;
      const padX = Math.max(1, (df.x1 - df.x0) * 0.05);
      const bandH = pf.y1 - pf.y0;
      // Skip top strip — OCR often parks digit noise on the upper cell edge.
      const yTop = pf.y0 + bandH * 0.18;
      const yBot = pf.y0 + bandH * 0.88;
      const xPadL = di === 0 ? Math.max(1, (df.x1 - df.x0) * 0.02) : padX;
      const x0 = (df.x0 + xPadL) * sx;
      const y0 = yTop * sy;
      const x1 = (df.x1 - padX) * sx;
      const y1 = yBot * sy;
      if (x1 - x0 < 6 || y1 - y0 < 6) continue;
      tried++;

      const m = matchShortGlyphFromRgba(data, imgW, imgH, x0, y0, x1, y1);
      let glyph = m.glyph;
      const weekend = isMatrixWeekendColumn(grid, di);
      if (weekend) {
        // Weekend: prefer "/"; never keep shape-matched "U" (blue bleed).
        if (glyph === 'U') glyph = m.inkFrac >= 0.025 && m.score >= 0.4 ? '/' : null;
        else if (glyph === '/') {
          /* keep */
        } else if (
          m.inkFrac >= P.weekendMarkMinInk &&
          m.inkFrac < P.weekendMarkMaxInk &&
          m.contrast >= P.weekendMarkMinContrast &&
          m.meanLuma >= P.weekendMarkMinLuma &&
          m.meanLuma <= P.weekendMarkMaxLuma
        ) {
          glyph = '/';
        } else {
          glyph = null;
        }
      } else if (glyph === '/') {
        // Weekday slash is almost always a false gray match (duty cells).
        glyph = null;
      }
      if (glyph === 'U' && m.score < P.uAcceptScore) continue;
      if (!glyph || m.score < 0.45) continue;
      const cx = (df.x0 + df.x1) / 2;
      const cy = (pf.y0 + pf.y1) / 2;
      hits.push({
        rowIndex: ri,
        dayIndex: di,
        text: glyph,
        line: {
          text: glyph,
          boundingBox: { x: cx - 6, y: cy - 6, width: 12, height: 12 },
        },
      });
    }
  }
  return hits;
}
