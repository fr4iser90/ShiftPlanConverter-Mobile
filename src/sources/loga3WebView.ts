import type { AutomationCommand } from './webview/loga3/automation';
import type { AutomationBridge } from './webview/bridge';
import { runFetchJob } from './webview/loga3/fetchJob';
import type { Source, SourceRunOpts, SourceRunResult } from './types';

/**
 * LOGA3 WebView source — wraps `runFetchJob` (raw PDFs only; ingest separately).
 */
export const loga3WebViewSource: Source = {
  id: 'loga3-webview',
  kind: 'webview',
  needsCredentials: true,
  needsWebView: true,
  labelKey: 'sourceLoga3',
  async run(opts: SourceRunOpts): Promise<SourceRunResult> {
    const period = opts.period;
    const creds = opts.credentials;
    const host = opts.host;
    if (!period?.months?.length || !period.year) {
      throw new Error('loga3-webview requires period.months + period.year');
    }
    if (!creds?.username || !creds.password) {
      throw new Error('loga3-webview requires credentials');
    }
    if (!host?.bridge || !host.inject) {
      throw new Error('loga3-webview requires WebView host');
    }
    const result = await runFetchJob({
      username: creds.username,
      password: creds.password,
      months: period.months,
      year: period.year,
      bridge: host.bridge as AutomationBridge,
      inject: host.inject as (cmd: AutomationCommand) => void,
      onStatus: opts.onStatus ? (line) => opts.onStatus!({ line }) : undefined,
      delay: opts.delay,
      gateTrace: opts.gateTrace,
      // Convert/store is ingest's job — these flags are ignored here.
      replaceEntries: opts.replaceEntries,
      preserveOutsideMonths: opts.preserveOutsideMonths,
    });
    return { artifacts: result.artifacts, errors: result.errors };
  },
};
