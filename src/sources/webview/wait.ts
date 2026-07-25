/**
 * Condition wait — poll a probe until it returns a value, or timeout.
 * Replaces blind sleep + fixed retry counters.
 */

export class WaitTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`Timeout: ${label} (${timeoutMs}ms)`);
    this.name = 'WaitTimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export type WaitForOptions = {
  timeoutMs: number;
  /** Probe interval (default 250ms) */
  intervalMs?: number;
  label: string;
  delay?: (ms: number) => Promise<void>;
  onWait?: (elapsedMs: number) => void;
};

function defaultDelay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call `probe` until it returns a truthy value (not null/false/undefined).
 * Fail fast with WaitTimeoutError — no silent infinite loops.
 */
export async function waitForCondition<T>(
  probe: () => Promise<T | null | false | undefined>,
  opts: WaitForOptions
): Promise<T> {
  const interval = opts.intervalMs ?? 250;
  const delay = opts.delay || defaultDelay;
  const started = Date.now();
  let lastTick = 0;

  while (Date.now() - started < opts.timeoutMs) {
    const value = await probe();
    if (value !== null && value !== false && value !== undefined) {
      return value;
    }
    const elapsed = Date.now() - started;
    if (opts.onWait && elapsed - lastTick >= 2000) {
      lastTick = elapsed;
      opts.onWait(elapsed);
    }
    const remaining = opts.timeoutMs - elapsed;
    if (remaining <= 0) break;
    await delay(Math.min(interval, remaining));
  }
  throw new WaitTimeoutError(opts.label, opts.timeoutMs);
}
