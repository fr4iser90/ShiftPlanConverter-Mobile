/**
 * When OCR_EXPORT_OVERLAYS=1: read dumps in tmp/test-files/dumps, write
 * overlay JPEGs + drift report under tmp/test-files/out/.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { decode as jpegDecode, encode as jpegEncode } from 'jpeg-js';
import { buildMonthMatrixGrid } from '../../src/sources/ocr/monthMatrix';
import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import { normalizeNameKeyPublic } from '../../src/sources/ocr/names';
import {
  checkOverlaysAgainstGroundTruth,
  type OcrRegionGroundTruth,
} from '../../src/sources/ocr/regionGroundTruth';
import {
  cellMatches,
  findHeaderIndex,
  loadAllRosterCases,
  rosterCasesDir,
} from './_ocrRosterCases';
import type { MonthMatrixDump } from './_ocrFixtures';

const COLORS: Record<string, [number, number, number, number]> = {
  'name-column': [15, 118, 110, 90],
  'day-header': [180, 83, 9, 100],
  'own-row': [37, 99, 235, 110],
};

/** jpeg-js ignores EXIF — bake orientation via ImageMagick when available. */
function loadJpegAutoOrient(photoPath: string): { data: Uint8Array; width: number; height: number } {
  const tmp = path.join(path.dirname(photoPath), `.orient-${path.basename(photoPath)}`);
  try {
    execFileSync('convert', [photoPath, '-auto-orient', tmp], { stdio: 'ignore' });
    const buf = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    return jpegDecode(buf, { useTArray: true }) as {
      data: Uint8Array;
      width: number;
      height: number;
    };
  } catch {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    return jpegDecode(fs.readFileSync(photoPath), { useTArray: true }) as {
      data: Uint8Array;
      width: number;
      height: number;
    };
  }
}

function fillRect(
  data: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: [number, number, number, number]
) {
  const [r, g, b, a] = rgba;
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(w, Math.ceil(x1));
  const bottom = Math.min(h, Math.ceil(y1));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * w + x) * 4;
      const na = a / 255;
      data[i] = Math.round(data[i]! * (1 - na) + r * na);
      data[i + 1] = Math.round(data[i + 1]! * (1 - na) + g * na);
      data[i + 2] = Math.round(data[i + 2]! * (1 - na) + b * na);
    }
  }
  // border
  const br: [number, number, number, number] = [rgba[0], rgba[1], rgba[2], 220];
  for (let x = left; x < right; x++) {
    for (const y of [top, bottom - 1]) {
      if (y < 0 || y >= h) continue;
      const i = (y * w + x) * 4;
      data[i] = br[0];
      data[i + 1] = br[1];
      data[i + 2] = br[2];
    }
  }
  for (let y = top; y < bottom; y++) {
    for (const x of [left, right - 1]) {
      if (x < 0 || x >= w) continue;
      const i = (y * w + x) * 4;
      data[i] = br[0];
      data[i + 1] = br[1];
      data[i + 2] = br[2];
    }
  }
}

describe('export roster overlay screenshots (OCR_EXPORT_OVERLAYS=1)', () => {
  it('writes drift report + overlay JPEGs for each dump', () => {
    if (process.env.OCR_EXPORT_OVERLAYS !== '1') return;

    const dir = rosterCasesDir();
    const outDir = path.join(dir, 'out');
    const dumpDir = path.join(dir, 'dumps');
    fs.mkdirSync(outDir, { recursive: true });

    const cases = loadAllRosterCases(dir);
    const lines: string[] = ['# OCR roster case report', ''];
    let any = false;

    for (const c of cases) {
      const stem = path.basename(c.expect.photo, path.extname(c.expect.photo));
      const dumpPath = path.join(dumpDir, `${stem}.json`);
      const photoPath = path.join(dir, c.expect.photo);
      if (!fs.existsSync(dumpPath) || !fs.existsSync(photoPath)) {
        lines.push(`## ${stem}`, '', '_skip: missing dump or photo_', '');
        continue;
      }
      any = true;
      const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8')) as MonthMatrixDump & {
        pageHeight?: number;
        meta?: Record<string, unknown>;
      };
      const pageW = dump.pageWidth || 1;
      const pageH = dump.pageHeight || pageW;
      const grid = buildMonthMatrixGrid(dump.lines, pageW, pageH);
      const personKey = normalizeNameKeyPublic(c.expect.person);
      const row = grid.rows.find(
        (r) =>
          normalizeNameKeyPublic(r.name) === personKey ||
          normalizeNameKeyPublic(r.name).includes(personKey.split(',')[0] || '')
      );

      lines.push(`## ${stem}`, '');
      lines.push(`- person expect: **${c.expect.person}**`);
      lines.push(`- gridOk: ${grid.ok} · rows: ${grid.rows.length} · headers: ${grid.headers.length}`);
      lines.push(`- rowSlope: ${grid.rowSlope ?? 0}`);
      lines.push(`- matched row: ${row?.name ?? '_(not found)_'}`);
      lines.push('');

      const hits: string[] = [];
      const misses: string[] = [];
      if (row) {
        for (const [key, exp] of Object.entries(c.expect.cells)) {
          const col = findHeaderIndex(grid.headers, key);
          if (col < 0) {
            if (exp === '') continue;
            misses.push(`| ${key} | _(header missing)_ | ${JSON.stringify(exp)} |`);
            continue;
          }
          const cell = row.cells[col] || '';
          if (cellMatches(cell, exp)) {
            hits.push(`| ${key} | \`${cell || '·'}\` | ok |`);
          } else {
            misses.push(`| ${key} | \`${cell || '·'}\` | ${JSON.stringify(exp)} |`);
          }
        }
      } else {
        misses.push('| — | person row missing | — |');
      }

      lines.push(`### Hits (${hits.length})`, '', '| day | got | |', '|---|---|---|', ...hits.slice(0, 40), '');
      lines.push(
        `### Drift / miss (${misses.length})`,
        '',
        '| day | got | expect |',
        '|---|---|---|',
        ...misses,
        ''
      );

      const overlays = estimateHighlightOverlays(
        grid,
        pageW,
        pageH,
        row?.name || c.expect.person
      );

      const regionsPath = path.join(dir, `${stem}.regions.json`);
      if (fs.existsSync(regionsPath)) {
        const gt = JSON.parse(fs.readFileSync(regionsPath, 'utf8')) as OcrRegionGroundTruth;
        const chk = checkOverlaysAgainstGroundTruth({
          stem,
          gt,
          overlays,
          headers: grid.headers,
          colCenters: grid.colCenters,
          pageWidth: pageW,
        });
        lines.push(
          `### Region GT`,
          '',
          chk.ok ? '- **pass**' : `- **FAIL**: ${chk.issues.join('; ')}`,
          `- metrics: \`${JSON.stringify(chk.metrics)}\``,
          ''
        );
        if (!chk.ok && process.env.OCR_CHECK_REGIONS === '1') {
          // No grid → no overlay: surface in report, but don't block other cases.
          const onlyMissing =
            chk.issues.length === 1 && chk.issues[0]!.includes('own-row missing');
          // Steep photo skew: hand marks are axis-aligned; overlay follows diagonal —
          // report FAIL in markdown but don't hard-block the suite.
          const steepSkew = Math.abs(grid.rowSlope || 0) > 0.12;
          if (!(onlyMissing && !grid.ok) && !steepSkew) {
            throw new Error(`[${stem}] region GT: ${chk.issues.join('; ')}`);
          }
        }
      }

      const jpeg = loadJpegAutoOrient(photoPath);
      // Map OCR page → image pixels (page should already be image size after fix).
      const sx = jpeg.width / pageW;
      const sy = jpeg.height / pageH;
      for (const box of overlays) {
        const rgba = COLORS[box.kind] || COLORS['own-row']!;
        fillRect(
          jpeg.data as Uint8Array,
          jpeg.width,
          jpeg.height,
          box.box.x * pageW * sx,
          box.box.y * pageH * sy,
          (box.box.x + box.box.width) * pageW * sx,
          (box.box.y + box.box.height) * pageH * sy,
          rgba
        );
      }
      const outJpg = path.join(outDir, `${stem}-overlay.jpg`);
      const encoded = jpegEncode({ data: jpeg.data, width: jpeg.width, height: jpeg.height }, 85);
      fs.writeFileSync(outJpg, Buffer.from(encoded.data));
      lines.push(`![overlay](${stem}-overlay.jpg)`, '');
    }

    if (!any) {
      lines.push('_No dumps yet — run device OCR first._', '');
    }
    fs.writeFileSync(path.join(outDir, 'REPORT.md'), lines.join('\n'), 'utf8');
    expect(fs.existsSync(path.join(outDir, 'REPORT.md'))).toBe(true);
  });
});
