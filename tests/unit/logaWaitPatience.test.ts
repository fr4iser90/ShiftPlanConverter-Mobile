import {
  getLoGa3WaitScaleFactor,
  LoGa3Timeout,
  LoGa3TimeoutBase,
  setLoGa3WaitScaleFactor,
} from '../../src/sources/webview/loga3/shared/timeouts';
import {
  LOGA3_WAIT_SCALE,
  normalizeWaitPatience,
  scaledBudgetMs,
} from '../../src/sources/webview/loga3/shared/waitPatiencePrefs';

describe('LoGa3 wait patience', () => {
  afterEach(() => {
    setLoGa3WaitScaleFactor(1);
  });

  it('normalizes unknown values to normal', () => {
    expect(normalizeWaitPatience(null)).toBe('normal');
    expect(normalizeWaitPatience('nope')).toBe('normal');
    expect(normalizeWaitPatience('verySlow')).toBe('verySlow');
  });

  it('scales named budgets via helper', () => {
    expect(scaledBudgetMs('waitShell', 'normal', LoGa3TimeoutBase)).toBe(
      LoGa3TimeoutBase.waitShell
    );
    expect(scaledBudgetMs('waitShell', 'verySlow', LoGa3TimeoutBase)).toBe(
      LoGa3TimeoutBase.waitShell * LOGA3_WAIT_SCALE.verySlow
    );
  });

  it('LoGa3Timeout proxy applies live scale factor', () => {
    setLoGa3WaitScaleFactor(1);
    expect(LoGa3Timeout.waitPdf).toBe(LoGa3TimeoutBase.waitPdf);
    setLoGa3WaitScaleFactor(LOGA3_WAIT_SCALE.verySlow);
    expect(getLoGa3WaitScaleFactor()).toBe(2);
    expect(LoGa3Timeout.waitPdf).toBe(LoGa3TimeoutBase.waitPdf * 2);
    expect(LoGa3Timeout.probe).toBe(LoGa3TimeoutBase.probe * 2);
  });

  it('rejects non-positive scale factors', () => {
    setLoGa3WaitScaleFactor(0);
    expect(getLoGa3WaitScaleFactor()).toBe(1);
    setLoGa3WaitScaleFactor(-2);
    expect(getLoGa3WaitScaleFactor()).toBe(1);
  });
});
