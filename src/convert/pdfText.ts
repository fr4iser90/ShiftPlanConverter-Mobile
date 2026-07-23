/**
 * Lightweight PDF text extraction for LOGA3 Zeitprotokoll PDFs.
 *
 * pdfjs-dist 4.x trips Hermes ("Invalid expression encountered"), so we
 * inflate FlateDecode streams (fflate) and rebuild text from `(...)Tj` runs.
 */
import { unzlibSync, inflateSync } from 'fflate';

function bytesToLatin1(u8: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
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
  const tjArrRe = /\[(.*?)\]\s*TJ/gs;
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
  // PDF FlateDecode is zlib-wrapped (CMF/FLG), not raw DEFLATE.
  try {
    return unzlibSync(data);
  } catch {
    try {
      return inflateSync(data);
    } catch {
      return null;
    }
  }
}

function findStreams(pdf: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const latin = bytesToLatin1(pdf);
  // Prefer FlateDecode streams; fall back to any stream body.
  const patterns = [
    /\/FlateDecode\b[\s\S]{0,400}?stream\r?\n([\s\S]*?)endstream/g,
    /stream\r?\n([\s\S]*?)endstream/g,
  ];
  const seen = new Set<number>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(latin))) {
      const start = m.index + m[0].indexOf(m[1]);
      if (seen.has(start)) continue;
      seen.add(start);
      const body = pdf.subarray(start, start + m[1].length);
      let end = body.length;
      while (end > 0 && (body[end - 1] === 0x0a || body[end - 1] === 0x0d || body[end - 1] === 0x20)) {
        end--;
      }
      out.push(body.subarray(0, end));
    }
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
    if (/^(URLTV|URLAUB|KRANK|KR|FEIER)/i.test(kind)) {
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
    throw new Error(`Nicht als PDF erkannt (head ${head || 'empty'}, ${pdf.length} B)`);
  }

  const parts: string[] = [];
  parts.push(...extractTjStrings(bytesToLatin1(pdf)));

  for (const stream of findStreams(pdf)) {
    if (stream.length < 8) continue;
    const inflated = inflatePdfStream(stream);
    if (!inflated) continue;
    const text = bytesToLatin1(inflated);
    if (!/Tj|TJ|BT|ET/.test(text)) continue;
    parts.push(...extractTjStrings(text));
  }

  const rebuilt = tokensToLoga3Text(parts);
  if (rebuilt && /Abrechnungsmonat/i.test(rebuilt)) {
    return rebuilt;
  }

  // Fallback: flat join (gates still see Abrechnungsmonat)
  const flat = parts.join(' ').replace(/\s+Abrechnungsmonat\s+/gi, '\nAbrechnungsmonat ').trim();
  if (!flat) {
    throw new Error('PDF-Text leer (kein FlateDecode/Tj)');
  }
  return flat;
}
