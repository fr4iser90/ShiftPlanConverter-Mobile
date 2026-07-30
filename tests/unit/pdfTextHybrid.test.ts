import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import { extractTextFromPdfBuffer, tokensToLoga3Text } from '../../src/convert/pdfText';

function ascii(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Minimal hybrid PDF: DCTDecode image + FlateDecode text with Abrechnungsmonat. */
function buildHybridLoga3Pdf(monthLabel = '08/2026'): Uint8Array {
  const content =
    'BT /F1 10 Tf 50 750 Td (Abrechnungsmonat) Tj 0 -14 Td (' +
    monthLabel +
    ') Tj 0 -14 Td (Zeitabrechnung) Tj 0 -14 Td (01) Tj (Mo) Tj (KO*FD) Tj ET\n';
  const flateBody = zlib.deflateSync(Buffer.from(content, 'latin1'));

  // Tiny fake JPEG (enough for DCTDecode marker; not a real image).
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);

  const imgDict =
    `5 0 obj<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 ` +
    `/ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${jpeg.length} >>stream\n`;
  const contentDict =
    `4 0 obj<< /Length ${flateBody.length} /Filter /FlateDecode >>stream\n`;

  const objects = concat(
    ascii('%PDF-1.4\n'),
    ascii('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n'),
    ascii('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n'),
    ascii(
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
        '/Resources << /XObject << /Im0 5 0 R >> /Font << /F1 6 0 R >> >> >>endobj\n'
    ),
    // Image first (like LOGA3 hybrid) — must be skipped by extractor
    ascii(imgDict),
    jpeg,
    ascii('\nendstream\nendobj\n'),
    ascii(contentDict),
    new Uint8Array(flateBody),
    ascii('\nendstream\nendobj\n'),
    ascii('6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n'),
    ascii('trailer<< /Root 1 0 R >>\n%%EOF\n')
  );
  return objects;
}

function toAb(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe('pdfText hybrid LOGA3', () => {
  it('extracts Abrechnungsmonat from synthetic image+FlateDecode PDF', async () => {
    const pdf = buildHybridLoga3Pdf('08/2026');
    const text = await extractTextFromPdfBuffer(toAb(pdf));
    expect(text).toMatch(/Abrechnungsmonat\s+08\/2026/i);
    expect(text).toMatch(/Zeitabrechnung/i);
  });

  it('tokensToLoga3Text keeps month header', () => {
    const rebuilt = tokensToLoga3Text(['Abrechnungsmonat', '08/2026', 'Zeitabrechnung', '01', 'Mo', 'KO*FD']);
    expect(rebuilt).toContain('Abrechnungsmonat 08/2026');
  });

  it('extracts real REPTIP hybrid PDF when present', async () => {
    const candidates = [
      path.join(process.env.HOME || '', 'Downloads', 'REPTIP-1.pdf'),
      path.join(__dirname, '..', 'fixtures', 'reptip-08-hybrid.pdf'),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (!file) {
      console.warn('skip REPTIP fixture (not on disk)');
      return;
    }
    const buf = fs.readFileSync(file);
    const text = await extractTextFromPdfBuffer(toAb(buf));
    expect(text).toMatch(/Abrechnungsmonat\s+08\/2026/i);
    expect(text.length).toBeGreaterThan(40);
  });
});
