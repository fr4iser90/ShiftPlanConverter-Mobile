import type { ShiftEntry } from '../../convert/types';

/** How the target receives shifts. */
export type ExportTargetKind = 'oauth' | 'file';

export type ExportTargetResult = {
  skipped: boolean;
  reason?: string;
  created?: number;
  deleted?: number;
};

export type ExportTargetSyncOpts = {
  richDetails?: boolean;
  /** When true, file targets open the share sheet; when false, they only report readiness. */
  interactive?: boolean;
};

/**
 * Pluggable calendar / export destination.
 * One-tap runs oauth targets that are configured + enabled; file targets are offered after fetch.
 */
export type ExportTarget = {
  id: string;
  kind: ExportTargetKind;
  /** i18n key for settings / labels */
  labelKey: string;
  isConfigured(): Promise<boolean>;
  /** Prefs flag: should one-tap attempt this oauth sync? */
  isEnabledInQuickUpdate(): Promise<boolean>;
  sync(entries: ShiftEntry[], opts?: ExportTargetSyncOpts): Promise<ExportTargetResult>;
};
