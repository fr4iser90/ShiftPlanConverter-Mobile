/**
 * Lightweight PDF text extraction for LOGA3 Zeitprotokoll PDFs.
 *
 * pdfjs-dist 4.x trips Hermes ("Invalid expression encountered"), so we
 * inflate FlateDecode streams (fflate) and rebuild text from `(...)Tj` runs.
 * Rebuilt header tokens (Abrechnungsmonat, Übertrag…) must stay literal for parsers.
 *
 * Hybrid LOGA3 PDFs (JPEG page image + FlateDecode text) are common — skip
 * Image/DCTDecode streams; only inflate content streams.
 */
import { unzlibSync, inflateSync } from 'fflate';

/** Hermes-safe: avoid String.fromCharCode(...largeTypedArray) spreads. */
function bytesToLatin1(u8: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('latin1').decode(u8);
    } catch {
      // fall through
    }
  }
  let s = '';
  const chunk = 0x1000; // 4096 — well under Hermes apply arg limits
  for (let i = 0; i < u8.length; i += chunk) {
    const end = Math.min(i + chunk, u8.length);
    const args: number[] = [];
    for (let j = i; j < end; j++) args.push(u8[j]!);
    s += String.fromCharCode.apply(null, args);
  }
  return s;
}

/** Decode PDF literal string escapes (subset). */
function unescapePdfString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = raw[++i];
    if (n === undefined) break;
    if (n === 'n') out += '\n';
    else if (n === 'r') out += '\r';
    else if (n === 't') out += '\t';
    else if (n === 'b') out += '\b';
    else if (n === 'f') out += '\f';
    else if (n === '(' || n === ')' || n === '\\') out += n;
    else if (n >= '0' && n <= '7') {
      let oct = n;
      for (let k = 0; k < 2 && i + 1 < raw.length; k++) {
        const d = raw[i + 1];
        if (d < '0' || d > '7') break;
        oct += d;
        i++;
      }
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
    } else {
      out += n;
    }
  }
  return out;
}

function extractTjStrings(content: string): string[] {
  const parts: string[] = [];
  const tjRe = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRe.exec(content))) {
    parts.push(unescapePdfString(m[1]));
  }
  const tjArrRe = /\[([\s\S]*?)\]\s*TJ/g;
  while ((m = tjArrRe.exec(content))) {
    const inner = m[1];
    const strRe = /\(((?:\\.|[^\\)])*)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(inner))) {
      parts.push(unescapePdfString(sm[1]));
    }
  }
  return parts;
}

function inflatePdfStream(data: Uint8Array): Uint8Array | null {
  // Copy view → standalone buffer (some RN/fflate paths mishandle byteOffset).
  const raw =
    data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data
      : data.slice();
  try {
    return unzlibSync(raw);
  } catch {
    try {
      return inflateSync(raw);
    } catch {
      return null;
    }
  }
}

function indexOfAscii(hay: Uint8Array, needle: string, from = 0): number {
  const n = needle.length;
  outer: for (let i = from; i <= hay.length - n; i++) {
    for (let j = 0; j < n; j++) {
      if (hay[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

function isImageStreamDict(dict: string): boolean {
  return (
    /\/Subtype\s*\/Image\b/.test(dict) ||
    /\/Filter\s*\/(?:DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)\b/.test(dict)
  );
}

/** Dict of the object that owns `stream` — nearest `<<` before it (not a blind 400B window). */
function dictBeforeStream(pdf: Uint8Array, streamPos: number): string {
  let start = Math.max(0, streamPos - 512);
  for (let i = streamPos - 2; i >= Math.max(0, streamPos - 512); i--) {
    if (pdf[i] === 0x3c /* < */ && pdf[i + 1] === 0x3c) {
      start = i;
      break;
    }
  }
  return bytesToLatin1(pdf.subarray(start, streamPos));
}

/**
 * Byte-scan stream bodies. Do NOT regex [\s\S]*? over a latin1 copy of the whole PDF —
 * that burned ~30–40s per month on Hermes (UI still showed savePdf).
 */
function findStreams(pdf: Uint8Array): { body: Uint8Array; flate: boolean }[] {
  const out: { body: Uint8Array; flate: boolean }[] = [];
  let pos = 0;
  while (pos < pdf.length) {
    const s = indexOfAscii(pdf, 'stream', pos);
    if (s < 0) break;
    // "endstream" contains "stream" — skip those hits
    if (s >= 3 && pdf[s - 3] === 0x65 && pdf[s - 2] === 0x6e && pdf[s - 1] === 0x64) {
      pos = s + 6;
      continue;
    }
    const dict = dictBeforeStream(pdf, s);
    if (isImageStreamDict(dict)) {
      // Advance past this stream body without treating image bytes as content.
      let dataStart = s + 6;
      if (pdf[dataStart] === 0x0d) dataStart++;
      if (pdf[dataStart] === 0x0a) dataStart++;
      const eImg = indexOfAscii(pdf, 'endstream', dataStart);
      pos = eImg < 0 ? s + 6 : eImg + 9;
      continue;
    }
    const flate = /\/FlateDecode\b/.test(dict);
    let dataStart = s + 6;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    const e = indexOfAscii(pdf, 'endstream', dataStart);
    if (e < 0) break;
    let end = e;
    while (end > dataStart && (pdf[end - 1] === 0x0a || pdf[end - 1] === 0x0d || pdf[end - 1] === 0x20)) {
      end--;
    }
    if (end > dataStart) out.push({ body: pdf.subarray(dataStart, end), flate });
    pos = e + 9;
  }
  return out;
}

const WEEKDAY = /^(Mo|Di|Mi|Do|Fr|Sa|So)$/i;
const DAY = /^\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Rebuild LOGA3-ish lines from ordered Tj tokens for the St. Elisabeth parser. */
export function tokensToLoga3Text(parts: string[]): string {
  const header: string[] = [];
  const shifts: string[] = [];
  const onCall: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (/^Abrechnungsmonat$/i.test(parts[i]) && parts[i + 1] && /^\d{2}\/\d{4}$/.test(parts[i + 1])) {
      header.push(`Abrechnungsmonat ${parts[i + 1]}`);
    }
    if (/^Zeitabrechnung$/i.test(parts[i])) {
      header.push('Zeitabrechnung');
    }
    if (/Übertrag\s+aus\s+Vormonat|Uebertrag\s+aus\s+Vormonat/i.test(parts[i]) && parts[i + 1]) {
      header.push(`${parts[i]} ${parts[i + 1]}`);
    } else if (/^Übertrag|^Uebertrag/i.test(parts[i]) && /Vormonat/i.test(parts[i]) && parts[i + 1]) {
      header.push(`${parts[i]} ${parts[i + 1]}`);
    }
    if (/Übertrag\s+in\s+Folgemonat|Uebertrag\s+in\s+Folgemonat/i.test(parts[i]) && parts[i + 1]) {
      header.push(`${parts[i]} ${parts[i + 1]}`);
    }
    if (/^Periode/i.test(parts[i])) {
      const row = [parts[i]];
      for (let j = i + 1; j < Math.min(parts.length, i + 6); j++) {
        if (DAY.test(parts[j]) && j + 1 < parts.length && WEEKDAY.test(parts[j + 1])) break;
        row.push(parts[j]);
      }
      header.push(row.join(' '));
    }
  }

  // Also catch "Übertrag aus Vormonat" split across tokens
  for (let i = 0; i < parts.length - 3; i++) {
    if (/^Übertrag|^Uebertrag/i.test(parts[i]) && /^aus$/i.test(parts[i + 1]) && /^Vormonat$/i.test(parts[i + 2])) {
      header.push(`Übertrag aus Vormonat ${parts[i + 3] || ''}`.trim());
    }
    if (/^Übertrag|^Uebertrag/i.test(parts[i]) && /^in$/i.test(parts[i + 1]) && /^Folgemonat$/i.test(parts[i + 2])) {
      header.push(`Übertrag in Folgemonat ${parts[i + 3] || ''}`.trim());
    }
  }

  for (let i = 0; i < parts.length - 4; i++) {
    if (!DAY.test(parts[i]) || !WEEKDAY.test(parts[i + 1])) continue;
    const kind = parts[i + 2] || '';
    if (/^KO\*/i.test(kind)) {
      const row = [parts[i], parts[i + 1], parts[i + 2]];
      let j = i + 3;
      while (j < parts.length && row.length < 18) {
        if (DAY.test(parts[j]) && j + 1 < parts.length && WEEKDAY.test(parts[j + 1])) break;
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(parts[j])) break;
        row.push(parts[j]);
        j++;
      }
      shifts.push(row.join(' '));
      continue;
    }
    if (/^(URLTV|URLAUB|KROAU|KRANK|KR|FEIER)/i.test(kind)) {
      shifts.push([parts[i], parts[i + 1], kind].join(' '));
    }
  }

  for (let i = 0; i < parts.length - 3; i++) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(parts[i])) continue;
    const row = [parts[i]];
    let j = i + 1;
    while (j < parts.length && row.length < 12) {
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(parts[j])) break;
      if (DAY.test(parts[j]) && j + 1 < parts.length && WEEKDAY.test(parts[j + 1])) break;
      row.push(parts[j]);
      j++;
    }
    if (row.some((t) => TIME.test(t))) {
      onCall.push(row.join(' '));
    }
  }

  const lines = [
    ...header,
    ...shifts,
    ...(onCall.length ? ['Bereitschaftsdienste', ...onCall] : []),
  ];
  return lines.join('\n').trim();
}

const PAYSLIP_LA = /^(?:[0-9]{2,3}|[0-9][A-Z0-9]{1,2}|[A-Z]{2,3})$/;
const PAYSLIP_ROW_NEXT =
  /^\((?:JLL)\)|Grundgehalt|Gesamtbrutto|Zulage|Bereitschaft|Nacht|Samstag|U\/K|Steuer|Kranken|Rente|Auszahl|Steuertage|Sozialversicherung|Gesetzliches|Zusatzversorgung|Überweisung|Steuerbrutto|Steuerfreie|PV-|Freiw|Arbeitslosen|Renten|Pflegeversicherung/i;

/**
 * Rebuild Verdienstabrechnung lines from Tj tokens (LA + text + amounts are separate Tj runs).
 */
export function tokensToPayslipText(parts: string[]): string {
  const lines: string[] = [];
  const trimmed = parts.map((p) => String(p || '').trim()).filter((p) => p.length > 0);

  for (let i = 0; i < trimmed.length; i++) {
    if (/^Abrechnungsmonat$/i.test(trimmed[i]) && trimmed[i + 1]) {
      lines.push(`Abrechnungsmonat ${trimmed[i + 1]}`);
    }
    if (/^Verdienstabrechnung$/i.test(trimmed[i])) {
      lines.push('Verdienstabrechnung');
    }
    if (/^Tarif\b/i.test(trimmed[i])) {
      let s = trimmed[i];
      if (trimmed[i + 1] && /Woche/i.test(trimmed[i + 1])) {
        s += ` ${trimmed[i + 1]}`;
      }
      lines.push(s);
    }
  }

  for (let i = 0; i < trimmed.length; i++) {
    const la = trimmed[i];
    if (!PAYSLIP_LA.test(la) || la === 'LA') continue;
    const next = trimmed[i + 1] || '';
    const looksLikeRow =
      PAYSLIP_ROW_NEXT.test(next) ||
      ['BRG', 'STT', 'SVT', 'SZF', 'BSL', 'ZVH', 'LST', 'BRK', 'ZVS', 'KAN', 'KZA', 'PAN', 'PA9', 'BRR', 'RAN', 'AAN', 'GSN', 'BZV', 'ZVA', 'AZB', 'ZVU'].includes(la);
    if (!looksLikeRow) continue;

    const row = [la];
    let j = i + 1;
    while (j < trimmed.length && row.length < 10) {
      const p = trimmed[j];
      if (PAYSLIP_LA.test(p) && p !== 'LA') {
        const n2 = trimmed[j + 1] || '';
        if (
          PAYSLIP_ROW_NEXT.test(n2) ||
          ['BRG', 'STT', 'SVT', 'SZF', 'GSN', 'AZB', 'BSL', 'LST'].includes(p)
        ) {
          break;
        }
      }
      row.push(p);
      j++;
    }
    lines.push(row.join(' ').replace(/\s+/g, ' ').trim());
    i = j - 1;
  }

  return lines.join('\n').trim();
}

export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  let pdf = new Uint8Array(arrayBuffer);
  // Some captures prefix junk — seek %PDF magic
  if (pdf.length >= 5 && pdf[0] !== 0x25) {
    let offset = -1;
    const lim = Math.min(pdf.length - 5, 2048);
    for (let i = 0; i < lim; i++) {
      if (pdf[i] === 0x25 && pdf[i + 1] === 0x50 && pdf[i + 2] === 0x44 && pdf[i + 3] === 0x46) {
        offset = i;
        break;
      }
    }
    if (offset > 0) pdf = pdf.subarray(offset);
  }
  if (pdf.length < 5 || pdf[0] !== 0x25 /* % */ || pdf[1] !== 0x50 /* P */) {
    const head = Array.from(pdf.subarray(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    throw new Error(`Not a PDF (head ${head || 'empty'}, ${pdf.length} B)`);
  }

  const parts: string[] = [];
  // Prefer inflated FlateDecode content (LOGA3 text lives there).
  const streams = findStreams(pdf);
  const ordered = [
    ...streams.filter((s) => s.flate),
    ...streams.filter((s) => !s.flate),
  ];
  for (const { body, flate } of ordered) {
    if (body.length < 8) continue;
    let text: string;
    if (flate) {
      const inflated = inflatePdfStream(body);
      if (!inflated) continue;
      text = bytesToLatin1(inflated);
    } else {
      // Uncompressed content streams only (images already skipped).
      if (body.length > 512 * 1024) continue;
      text = bytesToLatin1(body);
    }
    if (!/Tj|TJ|BT|ET/.test(text)) continue;
    parts.push(...extractTjStrings(text));
  }

  // Verdienstabrechnung: dedicated line rebuild (tokens are split per cell).
  if (parts.some((p) => /Verdienstabrechnung/i.test(p))) {
    const payslip = tokensToPayslipText(parts);
    if (payslip && /Abrechnungsmonat/i.test(payslip) && /\b(?:100|BRG)\b/.test(payslip)) {
      return payslip;
    }
  }

  const rebuilt = tokensToLoga3Text(parts);
  if (rebuilt && /Abrechnungsmonat/i.test(rebuilt)) {
    return rebuilt;
  }

  // Fallback: flat join (gates still see Abrechnungsmonat)
  const flat = parts.join(' ').replace(/\s+Abrechnungsmonat\s+/gi, '\nAbrechnungsmonat ').trim();
  if (!flat) {
    const flate = streams.filter((s) => s.flate).length;
    throw Object.assign(
      new Error(
        `PDF_TEXT_EMPTY size=${pdf.length}B streams=${streams.length} flate=${flate}`
      ),
      { code: 'PDF_TEXT_EMPTY' as const }
    );
  }
  return flat;
}
