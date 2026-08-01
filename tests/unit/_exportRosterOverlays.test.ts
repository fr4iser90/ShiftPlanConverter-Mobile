/**
 * When OCR_EXPORT_OVERLAYS=1: read dumps in tmp/test-files/dumps, write
 * overlay JPEGs + drift report under tmp/test-files/out/.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import { decode as jpegDecode, encode as jpegEncode } from 'jpeg-js';
import path from 'path';
import { estimateHighlightOverlays } from '../../src/sources/ocr/highlightOverlay';
import {
  detectRuledLattice,
  downscaleGray,
  grayFromRgba,
  scaleLatticeToPage,
} from '../../src/sources/ocr/layouts/imageGrid';
import { buildMonthMatrixGrid } from '../../src/sources/ocr/layouts/month-matrix';
import { normalizeNameKeyPublic } from '../../src/sources/ocr/names';
import {
  checkOverlaysAgainstGroundTruth,
  type OcrRegionGroundTruth,
} from '../../src/sources/ocr/regionGroundTruth';
import type { MonthMatrixDump } from './_ocrFixtures';
import {
  cellMatches,
  findHeaderIndex,
  loadAllRosterCases,
  rosterCasesDir,
} from './_ocrRosterCases';

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

/** Nearest-neighbor resize so overlay draws 1:1 in OCR page space. */
function resizeRgba(
  src: { data: Uint8Array; width: number; height: number },
  dw: number,
  dh: number
): { data: Uint8Array; width: number; height: number } {
  if (src.width === dw && src.height === dh) return src;
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / dw));
      const si = (sy * src.width + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = src.data[si + 3]!;
    }
  }
  return { data: out, width: dw, height: dh };
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

    for (const [caseIndex, c] of cases.entries()) {
      const caseId = `case-${String(caseIndex + 1).padStart(2, '0')}`;
      const sourceStem = path.basename(c.expect.photo, path.extname(c.expect.photo));
      const dumpPath = path.join(dumpDir, `${sourceStem}.json`);
      const photoPath = path.join(dir, c.expect.photo);
      if (!fs.existsSync(dumpPath) || !fs.existsSync(photoPath)) {
        lines.push(`## ${caseId}`, '', '_skip: missing OCR JSON or photo_', '');
        continue;
      }
      any = true;
      const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8')) as MonthMatrixDump & {
        pageHeight?: number;
        meta?: Record<string, unknown>;
      };
      const pageW = dump.pageWidth || 1;
      const pageH = dump.pageHeight || pageW;
      // Printed lattice from the photo (H+V) — ROI = OCR ink, not photo margins.
      const jpeg = loadJpegAutoOrient(photoPath);
      const grayFull = grayFromRgba(jpeg.width, jpeg.height, jpeg.data, 4);
      const gray = downscaleGray(grayFull, 800);
      let inkX0 = Infinity;
      let inkX1 = 0;
      let inkY0 = Infinity;
      let inkY1 = 0;
      for (const l of dump.lines) {
        const b = l.boundingBox;
        inkX0 = Math.min(inkX0, b.x);
        inkX1 = Math.max(inkX1, b.x + b.width);
        inkY0 = Math.min(inkY0, b.y);
        inkY1 = Math.max(inkY1, b.y + b.height);
      }
      if (!Number.isFinite(inkX0)) {
        inkX0 = 0;
        inkX1 = pageW;
        inkY0 = 0;
        inkY1 = pageH;
      }
      const padX = pageW * 0.02;
      const padY = pageH * 0.05;
      const roi = {
        x0: ((inkX0 - padX) * gray.width) / pageW,
        x1: ((inkX1 + padX) * gray.width) / pageW,
        y0: ((inkY0 - padY) * gray.height) / pageH,
        y1: ((inkY1 + padY) * gray.height) / pageH,
      };
      const lattice = scaleLatticeToPage(
        detectRuledLattice(gray, { roi }),
        gray.width,
        gray.height,
        pageW,
        pageH
      );
      const grid = buildMonthMatrixGrid(dump.lines, pageW, pageH, { lattice });
      const personKey = normalizeNameKeyPublic(c.expect.person);
      const row = grid.rows.find(
        (r) =>
          normalizeNameKeyPublic(r.name) === personKey ||
          normalizeNameKeyPublic(r.name).includes(personKey.split(',')[0] || '')
      );

      lines.push(`## ${caseId}`, '');
      lines.push(`- person expect: **masked**`);
      lines.push(`- gridOk: ${grid.ok} · rows: ${grid.rows.length} · headers: ${grid.headers.length}`);
      lines.push(`- rowSlope: ${grid.rowSlope ?? 0}`);
      lines.push(`- matched row: ${row ? 'found' : '_(not found)_'} `);
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

      const regionsPath = path.join(dir, `${sourceStem}.regions.json`);
      if (fs.existsSync(regionsPath)) {
        const gt = JSON.parse(fs.readFileSync(regionsPath, 'utf8')) as OcrRegionGroundTruth;
        const chk = checkOverlaysAgainstGroundTruth({
          stem: caseId,
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
            throw new Error(`[${caseId}] region GT: ${chk.issues.join('; ')}`);
          }
        }
      }

      // Draw in OCR page space (resize photo → pageW×pageH). Dump coords ≠ raw
      const canvas = resizeRgba(jpeg, pageW, pageH);
      for (const box of overlays) {
        const rgba = COLORS[box.kind] || COLORS['own-row']!;
        fillRect(
          canvas.data,
          canvas.width,
          canvas.height,
          box.box.x * pageW,
          box.box.y * pageH,
          (box.box.x + box.box.width) * pageW,
          (box.box.y + box.box.height) * pageH,
          rgba
        );
      }
      const outJpg = path.join(outDir, `${caseId}-overlay.jpg`);
      const encoded = jpegEncode(
        { data: canvas.data, width: canvas.width, height: canvas.height },
        85
      );
      const buf = Buffer.from(encoded.data);
      fs.writeFileSync(outJpg, buf);
      // Also write stem name so opening the private photo overlay stays fresh.
      fs.writeFileSync(path.join(outDir, `${sourceStem}-overlay.jpg`), buf);
      lines.push(`![overlay](${caseId}-overlay.jpg)`, '');
    }

    if (!any) {
      lines.push('_No dumps yet — run device OCR first._', '');
    }
    fs.writeFileSync(path.join(outDir, 'REPORT.md'), lines.join('\n'), 'utf8');
    expect(fs.existsSync(path.join(outDir, 'REPORT.md'))).toBe(true);
  });
});
