/**
 * PDF text extraction via pdfjs-dist (legacy build, no worker).
 * Falls back gracefully if PDF.js cannot run in the current environment.
 */
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  // Dynamic import keeps Jest unit tests free of PDF.js worker quirks.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = '';
  }

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  let pdfText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    let pageText = '';
    try {
      const textContent = await page.getTextContent();
      if (textContent.items.length > 0) {
        let lastY: number | null = null;
        const line: string[] = [];
        const lines: string[] = [];
        textContent.items.forEach((raw) => {
          const item = raw as TextItem;
          if (!('str' in item)) return;
          const y = item.transform[5];
          if (lastY !== null && Math.abs(y - lastY) > 2) {
            lines.push(line.join(' '));
            line.length = 0;
          }
          line.push(item.str);
          lastY = y;
        });
        if (line.length) lines.push(line.join(' '));
        pageText = lines.join('\n');
      }
    } catch (e) {
      console.warn('PDF text extract failed on page', pageNum, e);
    }
    pdfText += (pdfText ? '\n' : '') + pageText;
  }
  return pdfText;
}
