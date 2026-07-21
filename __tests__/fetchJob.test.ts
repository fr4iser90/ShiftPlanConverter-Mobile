jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/loga3-test/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { AutomationBridge } from '../src/loga3/bridge';
import { runFetchJob } from '../src/loga3/fetchJob';
import type { AutomationCommand, AutomationMessage } from '../src/loga3/automation';

describe('AutomationBridge', () => {
  it('resolves run() when matching message arrives', async () => {
    const bridge = new AutomationBridge();
    const inject = (cmd: AutomationCommand) => {
      setTimeout(() => {
        bridge.handleMessage({ ok: true, type: cmd.type });
      }, 5);
    };
    const msg = await bridge.run(inject, { type: 'stubStatus' }, 2000);
    expect(msg.ok).toBe(true);
    expect(msg.type).toBe('stubStatus');
  });

  it('rejects run() on ok:false', async () => {
    const bridge = new AutomationBridge();
    const inject = (cmd: AutomationCommand) => {
      bridge.handleMessage({ ok: false, type: cmd.type, error: 'boom', code: 'X' });
    };
    await expect(bridge.run(inject, { type: 'submitLogin' }, 2000)).rejects.toThrow(/boom/);
  });

  it('waitForPdf resolves on pdfBlob', async () => {
    const bridge = new AutomationBridge();
    const p = bridge.waitForPdf(2000);
    bridge.handleMessage({
      ok: true,
      type: 'pdfBlob',
      base64: 'AAAA',
      size: 4,
    });
    const pdf = await p;
    expect(pdf.base64).toBe('AAAA');
  });
});

describe('runFetchJob guards', () => {
  it('fails without credentials (no silent fixture)', async () => {
    const bridge = new AutomationBridge();
    await expect(
      runFetchJob({
        username: '',
        password: '',
        months: [1],
        year: 2026,
        bridge,
        inject: () => undefined,
      })
    ).rejects.toThrow(/Zugangsdaten/);
  });

  it('fails without selected months', async () => {
    const bridge = new AutomationBridge();
    await expect(
      runFetchJob({
        username: 'u',
        password: 'p',
        months: [],
        year: 2026,
        bridge,
        inject: () => undefined,
      })
    ).rejects.toThrow(/Monate/);
  });

  it('orchestrates login + one month with mocked WebView', async () => {
    const bridge = new AutomationBridge();
    const calls: string[] = [];

    // Minimal valid-ish PDF header base64 (not a real PDF — we mock extract later path by failing assertHasPlan NO_PLAN skip)
    const inject = (cmd: AutomationCommand) => {
      calls.push(cmd.type);
      const reply = (msg: AutomationMessage) => {
        setTimeout(() => bridge.handleMessage(msg), 1);
      };
      switch (cmd.type) {
        case 'fillLogin':
        case 'submitLogin':
        case 'clickOeffnen':
        case 'armCalendarReload':
        case 'selectMonth':
        case 'clickSmartEdin':
        case 'clickExport':
        case 'openZeitprotokoll':
        case 'clickDownload':
        case 'closeDialog':
          reply({ ok: true, type: cmd.type, selected: true });
          break;
        case 'assertHasPlan':
          // Skip month via NO_PLAN so we don't need real PDF/pdf.js in unit test
          reply({ ok: false, type: 'assertHasPlan', error: 'NO_PLAN', code: 'NO_PLAN' });
          break;
        default:
          reply({ ok: false, type: cmd.type, error: 'unexpected' });
      }
    };

    await expect(
      runFetchJob({
        username: 'user',
        password: 'pass',
        months: [3],
        year: 2026,
        bridge,
        inject,
        replaceEntries: true,
        delay: async () => undefined,
      })
    ).rejects.toThrow(/NO_PLAN/);

    expect(calls).toContain('fillLogin');
    expect(calls).toContain('submitLogin');
    expect(calls).toContain('selectMonth');
    expect(calls).toContain('assertHasPlan');
  });
});
