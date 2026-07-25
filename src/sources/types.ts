/** Source → Pack/Convert → Sink: raw material from a fetch or file import. */

export type SourcePeriod = {
  months: number[];
  year: number;
};

export type SourceCredentials = {
  username: string;
  password: string;
};

export type SourceArtifact =
  | {
      kind: 'pdf';
      month: number;
      year: number;
      bytes: Uint8Array;
      /** Already extracted (e.g. after period validation in WebView source). */
      text?: string;
      savedPath?: string;
    }
  | { kind: 'text'; month?: number; year?: number; text: string }
  | { kind: 'csv'; text: string }
  | { kind: 'ics'; text: string }
  | { kind: 'skipped'; month: number; year: number; reason: string };

export type SourceProgress = { line: string };

export type SourceRunResult = {
  artifacts: SourceArtifact[];
  errors: string[];
};

export type SourceKind = 'webview' | 'local';

export type SourceRunOpts = {
  period?: SourcePeriod;
  credentials?: SourceCredentials;
  /** WebView host — required when needsWebView. Typed loosely to avoid circular imports. */
  host?: {
    inject: (cmd: unknown) => void;
    bridge: {
      run: (inject: (cmd: unknown) => void, cmd: unknown, timeoutMs?: number) => Promise<unknown>;
      probe: (inject: (cmd: unknown) => void, cmd: unknown, timeoutMs?: number) => Promise<unknown>;
      waitForPdf: (timeoutMs?: number) => Promise<{ base64: string; mime?: string; size?: number; filename?: string }>;
      delay: (ms: number) => Promise<void>;
    };
  };
  onStatus?: (p: SourceProgress) => void;
  delay?: (ms: number) => Promise<void>;
  replaceEntries?: boolean;
  preserveOutsideMonths?: boolean;
  gateTrace?: boolean;
};

export type Source = {
  id: string;
  kind: SourceKind;
  needsCredentials: boolean;
  needsWebView: boolean;
  /** i18n key or plain label for UI */
  labelKey: string;
  run(opts: SourceRunOpts): Promise<SourceRunResult>;
};
