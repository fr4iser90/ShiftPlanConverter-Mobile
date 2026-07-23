jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/loga3-test/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  deleteAsync: jest.fn(async () => undefined),
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
      base64: 'JVBERi0x',
      size: 4,
    });
    const pdf = await p;
    expect(pdf.base64).toBe('JVBERi0x');
  });

  it('waitForPdf ignores non-PDF base64', async () => {
    const bridge = new AutomationBridge();
    const p = bridge.waitForPdf(500);
    bridge.handleMessage({
      ok: true,
      type: 'pdfBlob',
      base64: 'AAAA',
      size: 4,
    });
    await expect(p).rejects.toThrow(/Timeout/);
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

  it('orchestrates login + gates + NO_PLAN skip', async () => {
    const bridge = new AutomationBridge();
    const calls: string[] = [];
    let assertLoginCount = 0;

    const inject = (cmd: AutomationCommand) => {
      calls.push(cmd.type);
      const reply = (msg: AutomationMessage) => {
        setTimeout(() => bridge.handleMessage(msg), 1);
      };
      switch (cmd.type) {
        case 'assertLoggedIn':
          assertLoginCount += 1;
          if (assertLoginCount === 1) {
            reply({
              ok: false,
              type: 'assertLoggedIn',
              stillLogin: true,
              error: 'still_on_login',
              code: 'STILL_LOGIN',
            });
          } else {
            reply({ ok: true, type: 'assertLoggedIn', stillLogin: false });
          }
          break;
        case 'fillLogin':
        case 'submitLogin':
        case 'clickOeffnen':
        case 'clickZeiten':
        case 'armCalendarReload':
        case 'selectMonth':
        case 'clickBerechnen':
        case 'clickSmartEdin':
        case 'clickExport':
        case 'openZeitprotokoll':
        case 'clickDownload':
        case 'closeDialog':
        case 'closePopups':
          reply({ ok: true, type: cmd.type, selected: true });
          break;
        case 'assertShellReady':
          reply({
            ok: true,
            type: 'assertShellReady',
            stillLogin: false,
            splash: false,
            zeitenFound: true,
            pickerFound: true,
          });
          break;
        case 'getPickerState':
          reply({ ok: true, type: 'getPickerState', pickerFound: true, month: '03', year: '2026' });
          break;
        case 'verifyCalendarMonth':
          reply({
            ok: true,
            type: 'verifyCalendarMonth',
            month: '03',
            year: '2026',
            signature: {
              firstWeekday: 'SO',
              lastDay: '31',
              ranges: [],
              geKo: [],
              schichtfrei: 0,
            },
          });
          break;
        case 'assertHasPlan':
          reply({
            ok: false,
            type: 'assertHasPlan',
            error: 'NO_PLAN',
            code: 'NO_PLAN',
            signature: { ranges: [], geKo: [], schichtfrei: 0 },
          });
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
    expect(calls).toContain('verifyCalendarMonth');
    expect(calls).toContain('assertHasPlan');
    expect(calls).not.toContain('clickDownload');
  });

  it('waits for shell ready and does not click Zeiten while splash', async () => {
    const bridge = new AutomationBridge();
    const calls: string[] = [];
    let shellProbes = 0;
    let assertLoginCount = 0;

    const inject = (cmd: AutomationCommand) => {
      calls.push(cmd.type);
      const reply = (msg: AutomationMessage) => {
        setTimeout(() => bridge.handleMessage(msg), 1);
      };
      switch (cmd.type) {
        case 'assertLoggedIn':
          assertLoginCount += 1;
          if (assertLoginCount === 1) {
            reply({
              ok: false,
              type: 'assertLoggedIn',
              stillLogin: true,
              error: 'still_on_login',
              code: 'STILL_LOGIN',
            });
          } else {
            reply({ ok: true, type: 'assertLoggedIn', stillLogin: false });
          }
          break;
        case 'fillLogin':
        case 'submitLogin':
        case 'closePopups':
        case 'armCalendarReload':
        case 'selectMonth':
        case 'clickBerechnen':
        case 'clickOeffnen':
          reply({ ok: true, type: cmd.type, selected: true });
          break;
        case 'assertShellReady':
          shellProbes += 1;
          if (shellProbes < 3) {
            reply({
              ok: false,
              type: 'assertShellReady',
              splash: true,
              stillLogin: false,
              zeitenFound: false,
              pickerFound: false,
              error: 'shell_loading',
              code: 'SHELL_LOADING',
            });
          } else {
            reply({
              ok: true,
              type: 'assertShellReady',
              splash: false,
              stillLogin: false,
              zeitenFound: true,
              pickerFound: false,
            });
          }
          break;
        case 'getPickerState':
          reply({
            ok: true,
            type: 'getPickerState',
            pickerFound: calls.includes('clickZeiten'),
            month: '03',
            year: '2026',
          });
          break;
        case 'clickZeiten':
          reply({ ok: true, type: 'clickZeiten', note: 'Zeiten' });
          break;
        case 'verifyCalendarMonth':
          reply({
            ok: true,
            type: 'verifyCalendarMonth',
            month: '03',
            year: '2026',
            signature: {
              firstWeekday: 'SO',
              lastDay: '31',
              ranges: [],
              geKo: [],
              schichtfrei: 0,
            },
          });
          break;
        case 'assertHasPlan':
          reply({
            ok: false,
            type: 'assertHasPlan',
            error: 'NO_PLAN',
            code: 'NO_PLAN',
            signature: { ranges: [], geKo: [], schichtfrei: 0 },
          });
          break;
        default:
          reply({ ok: false, type: cmd.type, error: 'unexpected:' + cmd.type });
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

    expect(shellProbes).toBeGreaterThanOrEqual(3);
    expect(calls.indexOf('clickZeiten')).toBeGreaterThan(calls.indexOf('assertShellReady'));
  });
});
