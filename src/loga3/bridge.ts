import type { AutomationCommand, AutomationMessage } from './automation';

type MsgHandler = (msg: AutomationMessage) => void;

/**
 * Bridges WebView postMessage ↔ async await for fetchJob orchestration.
 */
export class AutomationBridge {
  private handlers: MsgHandler[] = [];
  private pdfWaiters: Array<{
    resolve: (v: { base64: string; mime?: string; size?: number; filename?: string }) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  handleMessage(msg: AutomationMessage) {
    if (msg.type === 'pdfBlob') {
      if (msg.ok && msg.base64) {
        const waiters = this.pdfWaiters.splice(0);
        waiters.forEach((w) => {
          clearTimeout(w.timer);
          w.resolve({
            base64: msg.base64!,
            mime: msg.mime,
            size: msg.size,
            filename: msg.filename,
          });
        });
      } else {
        const waiters = this.pdfWaiters.splice(0);
        waiters.forEach((w) => {
          clearTimeout(w.timer);
          w.reject(new Error(msg.error || 'pdfBlob failed'));
        });
      }
    }
    this.handlers.slice().forEach((h) => h(msg));
  }

  onMessage(handler: MsgHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  waitFor(
    predicate: (msg: AutomationMessage) => boolean,
    timeoutMs = 30000,
    label = 'message'
  ): Promise<AutomationMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timeout waiting for ${label} (${timeoutMs}ms)`));
      }, timeoutMs);
      const off = this.onMessage((msg) => {
        if (!predicate(msg)) return;
        clearTimeout(timer);
        off();
        resolve(msg);
      });
    });
  }

  async run(
    inject: (cmd: AutomationCommand) => void,
    cmd: AutomationCommand,
    timeoutMs = 45000
  ): Promise<AutomationMessage> {
    const pending = this.waitFor((m) => m.type === cmd.type, timeoutMs, cmd.type);
    inject(cmd);
    const msg = await pending;
    if (msg.ok === false) {
      const err = new Error(msg.error || `${cmd.type} failed`);
      (err as Error & { code?: string }).code = msg.code || msg.error;
      throw err;
    }
    return msg;
  }

  waitForPdf(timeoutMs = 120000): Promise<{
    base64: string;
    mime?: string;
    size?: number;
    filename?: string;
  }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pdfWaiters = this.pdfWaiters.filter((w) => w.timer !== timer);
        reject(new Error(`Timeout waiting for PDF download (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pdfWaiters.push({ resolve, reject, timer });
    });
  }

  delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
