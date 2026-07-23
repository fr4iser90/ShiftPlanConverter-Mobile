import { waitForCondition, WaitTimeoutError } from '../src/loga3/wait';

describe('waitForCondition', () => {
  it('resolves when probe succeeds', async () => {
    let n = 0;
    const v = await waitForCondition(async () => {
      n += 1;
      return n >= 3 ? 'ok' : null;
    }, { timeoutMs: 2000, intervalMs: 10, label: 'test', delay: async () => undefined });
    expect(v).toBe('ok');
    expect(n).toBe(3);
  });

  it('times out with clear label', async () => {
    await expect(
      waitForCondition(async () => null, {
        timeoutMs: 30,
        intervalMs: 5,
        label: 'never',
        delay: (ms) => new Promise((r) => setTimeout(r, ms)),
      })
    ).rejects.toBeInstanceOf(WaitTimeoutError);
  });
});
