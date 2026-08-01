jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.0.0-test' } },
}));

jest.mock('react-native', () => ({
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));

import {
  __resetDiagLogForTests,
  appendDiag,
  formatDiagLog,
  redactDiagLine,
} from '../../src/support/diagLog';
import { buildErrorReportMailBody } from '../../src/support/mailto';

describe('diagLog', () => {
  beforeEach(() => {
    __resetDiagLogForTests();
  });

  it('redacts password-like fragments', () => {
    expect(redactDiagLine('password=secret123 ok')).toMatch(/password=\*\*\*/i);
    expect(redactDiagLine('Authorization: Bearer abc.def.ghi')).toMatch(/\*\*\*/);
    expect(redactDiagLine('https://x/?token=abc&y=1')).toContain('token=***');
  });

  it('keeps a ring of recent lines and formats newest last', () => {
    appendDiag('one');
    appendDiag('two');
    appendDiag('two'); // consecutive dedupe
    appendDiag('three');
    const text = formatDiagLog(2000);
    expect(text).toContain('one');
    expect(text).toContain('three');
    expect(text.indexOf('one')).toBeLessThan(text.indexOf('three'));
    expect(text.split('\n').filter((l) => l.includes('two'))).toHaveLength(1);
  });

  it('includes diag block in error report mail body', () => {
    appendDiag('login ok');
    appendDiag('month 07');
    const body = buildErrorReportMailBody({
      error: 'PDF timeout',
      pack: 'st-elisabeth-leipzig',
      group: 'pflege',
      area: 'op-ata',
      context: 'Fetch',
    });
    expect(body).toContain('PDF timeout');
    expect(body).toMatch(/login ok|month 07/);
    expect(body.toLowerCase()).not.toContain('password=secret');
  });
});
