/**
 * Optional gate against a local device OCR dump (`/tmp/ocr-last-geometry.json`).
 * Skips when dump absent — never commit real dumps.
 */
import { existsSync, readFileSync } from 'fs';

import anaesthOcr from '../../src/packs/builtin/st-elisabeth-leipzig/mappings/arzt/op-anaesthesie.ocr.json';
import { detectOcrLayout } from '../../src/sources/ocr/detectLayout';
import { looksLikeDateDutyAxes, measureAxisCues } from '../../src/sources/ocr/layouts/axisCues';
import type { OcrLine } from '../../src/sources/ocr/recognize';

const DUMP = '/tmp/ocr-last-geometry.json';

function loadLines(): { lines: OcrLine[]; pageWidth: number; pageHeight: number; text: string } | null {
  if (!existsSync(DUMP)) return null;
  const g = JSON.parse(readFileSync(DUMP, 'utf8'));
  const lines: OcrLine[] = (g.lines || []).map((l: { text?: string; boundingBox?: Record<string, number> }) => {
    const b = l.boundingBox || {};
    const x = b.x ?? b.x0 ?? 0;
    const y = b.y ?? b.y0 ?? 0;
    const width = b.width ?? (b.x1 != null ? b.x1 - x : 10);
    const height = b.height ?? (b.y1 != null ? b.y1 - y : 10);
    return { text: String(l.text || ''), boundingBox: { x, y, width, height } };
  });
  return {
    lines,
    pageWidth: g.pageWidth || 1800,
    pageHeight: g.pageHeight || 1251,
    text: lines.map((l) => l.text).join('\n'),
  };
}

describe('device dump auto-detect (Anästhesie board)', () => {
  it('prefers date-duty over month-matrix / week-strip', () => {
    const dump = loadLines();
    if (!dump) return;
    const dateDuty = (anaesthOcr as { dateDuty?: unknown }).dateDuty as Parameters<
      typeof detectOcrLayout
    >[1] extends { dateDuty?: infer D }
      ? D
      : never;
    const priors = (anaesthOcr as { layoutPriors?: Record<string, number> }).layoutPriors;
    const cues = measureAxisCues(dump.lines, dump.pageWidth, dump.pageHeight);
    expect(cues.leftDateRows).toBeGreaterThanOrEqual(10);
    expect(looksLikeDateDutyAxes(cues)).toBe(true);
    const det = detectOcrLayout(
      {
        text: dump.text,
        lines: dump.lines,
        pageWidth: dump.pageWidth,
        pageHeight: dump.pageHeight,
      },
      { dateDuty, layoutPriors: priors }
    );
    expect(det.layoutId).toBe('date-duty');
    expect(det.scores['date-duty']).toBeGreaterThan(det.scores['month-matrix']);
    expect(det.scores['date-duty']).toBeGreaterThan(det.scores['week-strip']);
  });
});
