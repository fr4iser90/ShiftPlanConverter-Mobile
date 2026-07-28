/**
 * On-device OCR adapter (ML Kit / Vision via expo-mlkit-ocr).
 * Returns flat text plus geometry. Prefers word-level elements when line boxes
 * are empty (common on Android ML Kit → emptyMap for line.boundingBox).
 */
export type OcrBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrLine = {
  text: string;
  boundingBox: OcrBox;
};

export type OcrResult = {
  text: string;
  lineCount: number;
  lines: OcrLine[];
  /** Image-space max extents from boxes (0 if unknown). Prefer full image size when known. */
  pageWidth: number;
  pageHeight: number;
};

/** Merge OCR bbox extents with real image pixels (boxes are image-space). */
export function mergeOcrPageSizeWithImage(
  boxPageWidth: number,
  boxPageHeight: number,
  imageWidth?: number | null,
  imageHeight?: number | null
): { pageWidth: number; pageHeight: number } {
  return {
    pageWidth: Math.max(boxPageWidth || 0, imageWidth || 0),
    pageHeight: Math.max(boxPageHeight || 0, imageHeight || 0),
  };
}

type NativeBox = { x?: number; y?: number; width?: number; height?: number };
type NativeElement = { text?: string; boundingBox?: NativeBox };
type NativeLine = {
  text?: string;
  boundingBox?: NativeBox;
  elements?: NativeElement[];
};
type NativeBlock = {
  text?: string;
  lines?: NativeLine[];
  boundingBox?: NativeBox;
  elements?: NativeElement[];
};
type NativeResult = { text?: string; blocks?: NativeBlock[] };

export function asBox(b: NativeBox | undefined | null): OcrBox | null {
  if (!b || typeof b !== 'object') return null;
  const x = Number((b as NativeBox).x);
  const y = Number((b as NativeBox).y);
  const width = Number((b as NativeBox).width);
  const height = Number((b as NativeBox).height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** Union of one or more boxes (for synthesizing a line box from elements). */
export function unionBoxes(boxes: OcrBox[]): OcrBox | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (![minX, minY, maxX, maxY].every((n) => Number.isFinite(n))) return null;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function elementLines(line: NativeLine): OcrLine[] {
  const out: OcrLine[] = [];
  for (const el of line.elements || []) {
    const text = String(el.text || '').trim();
    const box = asBox(el.boundingBox);
    if (!text || !box) continue;
    out.push({ text, boundingBox: box });
  }
  return out;
}

/**
 * Collect geometry tokens for the matrix builder.
 * Prefer word-level elements (stable boxes). Fall back to lines / blocks.
 */
export function collectLines(result: NativeResult): OcrLine[] {
  const elementTokens: OcrLine[] = [];
  const lineTokens: OcrLine[] = [];

  for (const block of result?.blocks || []) {
    const blockLines = Array.isArray(block.lines) ? block.lines : [];
    if (blockLines.length) {
      for (const line of blockLines) {
        const fromElements = elementLines(line);
        elementTokens.push(...fromElements);

        const text = String(line.text || '').trim();
        let box = asBox(line.boundingBox);
        if (!box && fromElements.length) {
          box = unionBoxes(fromElements.map((e) => e.boundingBox));
        }
        if (text && box) {
          lineTokens.push({ text, boundingBox: box });
        }
      }
      continue;
    }

    const text = String(block.text || '').trim();
    const box = asBox(block.boundingBox);
    if (text && box) lineTokens.push({ text, boundingBox: box });
  }

  // Word-level boxes make name×day clustering work; line boxes alone often mash a whole row.
  if (elementTokens.length > 0) return elementTokens;
  return lineTokens;
}

export function isOcrNativeAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-mlkit-ocr') as {
      isSupported?: () => boolean;
      recognizeText?: unknown;
    };
    if (typeof mod.isSupported === 'function') return !!mod.isSupported();
    return typeof mod.recognizeText === 'function';
  } catch {
    return false;
  }
}

export async function recognizeImageText(uri: string): Promise<OcrResult> {
  let recognizeText: (u: string) => Promise<NativeResult>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-mlkit-ocr') as {
      recognizeText: typeof recognizeText;
      isSupported?: () => boolean;
    };
    if (mod.isSupported && !mod.isSupported()) {
      throw new Error('OCR_UNSUPPORTED');
    }
    recognizeText = mod.recognizeText;
  } catch (e) {
    if (e instanceof Error && e.message === 'OCR_UNSUPPORTED') throw e;
    throw new Error('OCR_NATIVE_MISSING');
  }

  const result = await recognizeText(uri);
  const lines = collectLines(result);
  let pageWidth = 0;
  let pageHeight = 0;
  for (const line of lines) {
    const box = line.boundingBox;
    pageWidth = Math.max(pageWidth, box.x + box.width);
    pageHeight = Math.max(pageHeight, box.y + box.height);
  }
  // ML Kit boxes are in image pixels — page must be the full image, not bbox max.
  try {
    const { getLocalImageSize } = require('./imageSize') as typeof import('./imageSize');
    const img = await getLocalImageSize(uri);
    const merged = mergeOcrPageSizeWithImage(pageWidth, pageHeight, img.width, img.height);
    pageWidth = merged.pageWidth;
    pageHeight = merged.pageHeight;
  } catch {
    // keep bbox extents
  }
  const text =
    String(result?.text || '').trim() ||
    lines
      .slice()
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x)
      .map((l) => l.text)
      .join('\n');
  return {
    text,
    lineCount: lines.length || (text ? text.split(/\n+/).length : 0),
    lines,
    pageWidth,
    pageHeight,
  };
}
