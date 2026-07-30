/**
 * In-memory ring buffer of recent user-visible status / error lines for support mail.
 * Never store passwords; redact obvious secrets before append.
 */
const MAX_LINES = 80;
const MAX_LINE_CHARS = 220;

type DiagEntry = { at: number; line: string };

let buffer: DiagEntry[] = [];

/** Strip passwords, bearer tokens, and obvious credential query params. */
export function redactDiagLine(raw: string): string {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(/(password|passwd|pwd)\s*[:=]\s*\S+/gi, '$1=***');
  s = s.replace(/(authorization|bearer)\s*[:=]?\s*\S+/gi, '$1 ***');
  s = s.replace(/([?&](?:password|passwd|pwd|token|access_token|refresh_token)=)[^&\s]+/gi, '$1***');
  s = s.replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[jwt]');
  if (s.length > MAX_LINE_CHARS) s = `${s.slice(0, MAX_LINE_CHARS - 1)}…`;
  return s;
}

export function appendDiag(line: string): void {
  const cleaned = redactDiagLine(line);
  if (!cleaned) return;
  const last = buffer[buffer.length - 1];
  if (last && last.line === cleaned) return; // de-dupe consecutive spam
  buffer.push({ at: Date.now(), line: cleaned });
  if (buffer.length > MAX_LINES) {
    buffer = buffer.slice(buffer.length - MAX_LINES);
  }
}

export function clearDiagLog(): void {
  buffer = [];
}

export function getDiagEntries(): readonly DiagEntry[] {
  return buffer;
}

function formatTime(at: number): string {
  try {
    return new Date(at).toISOString().slice(11, 19); // HH:MM:SS UTC
  } catch {
    return '??:??:??';
  }
}

/** Newest lines last; trimmed to maxChars for mailto. */
export function formatDiagLog(maxChars = 700): string {
  if (!buffer.length) return '';
  const rows = buffer.map((e) => `${formatTime(e.at)} ${e.line}`);
  let out = rows.join('\n');
  if (out.length <= maxChars) return out;
  // Keep the end (most recent).
  out = out.slice(out.length - maxChars);
  const nl = out.indexOf('\n');
  if (nl >= 0 && nl < 40) out = out.slice(nl + 1);
  return `…\n${out}`;
}

/** Test helper — replace buffer. */
export function __resetDiagLogForTests(entries?: DiagEntry[]): void {
  buffer = entries ? [...entries] : [];
}
