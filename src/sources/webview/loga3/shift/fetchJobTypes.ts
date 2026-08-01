/**
 * Fetch-job public types (no runtime — keeps steps/jobContext free of circular imports).
 */
import type { AutomationCommand } from '../shared/automation';
import type { AutomationBridge } from '../../bridge';
import type { SourceArtifact } from '@/src/sources/types';

export type FetchJobOptions = {
  username: string;
  password: string;
  months: number[];
  year: number;
  inject: (cmd: AutomationCommand) => void;
  bridge: AutomationBridge;
  onStatus?: (line: string) => void;
  replaceEntries?: boolean;
  preserveOutsideMonths?: boolean;
  delay?: (ms: number) => Promise<void>;
  gateTrace?: boolean;
};

export type FetchStepTiming = {
  step: string;
  ms: number;
  at: string;
};

export type FetchJobResult = {
  artifacts: SourceArtifact[];
  texts: string[];
  savedPdfs: string[];
  skippedNoPlan: string[];
  errors: string[];
  gateTraces?: string[];
  timings?: FetchStepTiming[];
};
