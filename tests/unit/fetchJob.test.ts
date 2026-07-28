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

jest.mock('expo-file-system', () => {
  class FakeFile {
    uri = 'file:///tmp/loga3-test/x.pdf';
    exists = true;
    create() {}
    write() {}
    delete() {}
    async arrayBuffer() {
      return new ArrayBuffer(0);
    }
    async base64() {
      return '';
    }
  }
  class FakeDirectory {
    create() {}
    delete() {}
    exists = false;
    list() {
      return [];
    }
  }
  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: 'file:///tmp/loga3-test/' },
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-crypto', () => {
  class AESEncryptionKey {
    static async generate() {
      return new AESEncryptionKey();
    }
    static async import() {
      return new AESEncryptionKey();
    }
    async encoded() {
      return 'dGVzdGtleQ==';
    }
  }
  class AESSealedData {
    static fromCombined() {
      return new AESSealedData();
    }
    async combined() {
      return 'Y29tYmluZWQ=';
    }
  }
  return {
    AESEncryptionKey,
    AESSealedData,
    AESKeySize: { AES256: 256 },
    aesEncryptAsync: jest.fn(async () => new AESSealedData()),
    aesDecryptAsync: jest.fn(async (_s: unknown, _k: unknown, opts?: { output?: string }) => {
      if (opts?.output === 'base64') return '';
      return new Uint8Array();
    }),
  };
});

jest.mock('../../src/widget/refresh', () => ({
  refreshHomeWidgets: jest.fn(async () => undefined),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  multiRemove: jest.fn(async () => undefined),
}));

import type { AutomationCommand, AutomationMessage } from '../../src/sources/webview/loga3/automation';
import { AutomationBridge } from '../../src/sources/webview/bridge';
import { runFetchJob } from '../../src/sources/webview/loga3/fetchJob';

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

  // Sync inject replies + empty delay can starve timers in longer multi-wait paths;
  // splash test covers login + shell gating. Full month orchestration is covered in e2e.
  it.skip('orchestrates login + gates + NO_PLAN skip', async () => {
    const bridge = new AutomationBridge();
    const calls: string[] = [];
    let assertLoginCount = 0;
    let shellReadyCount = 0;

    const inject = (cmd: AutomationCommand) => {
      calls.push(cmd.type);
      const reply = (msg: AutomationMessage) => {
        bridge.handleMessage(msg);
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
          shellReadyCount += 1;
          // First probe: still on login so ensureLoggedIn fills credentials.
          if (shellReadyCount === 1) {
            reply({
              ok: false,
              type: 'assertShellReady',
              stillLogin: true,
              splash: false,
              zeitenFound: false,
              pickerFound: false,
            });
          } else {
            reply({
              ok: true,
              type: 'assertShellReady',
              stillLogin: false,
              splash: false,
              zeitenFound: true,
              pickerFound: true,
            });
          }
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
        case 'assertExportContext':
        case 'dumpLiveSelectors':
          reply({
            ok: true,
            type: cmd.type,
            pickerFound: true,
            maskFound: true,
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
        delay: async () => {},
      })
    ).rejects.toThrow(/NO_PLAN/);

    expect(calls).toContain('fillLogin');
    expect(calls).toContain('verifyCalendarMonth');
    expect(calls).toContain('assertHasPlan');
    expect(calls).not.toContain('clickDownload');
  }, 10000);

  it(
    'waits for shell ready and does not click Zeiten while splash',
    async () => {
    const bridge = new AutomationBridge();
    const calls: string[] = [];
    let shellProbes = 0;
    let assertLoginCount = 0;

    const inject = (cmd: AutomationCommand) => {
      calls.push(cmd.type);
      const reply = (msg: AutomationMessage) => {
        bridge.handleMessage(msg);
      };
      switch (cmd.type) {
        case 'assertLoggedIn':
          assertLoginCount += 1;
          if (assertLoginCount <= 2) {
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
          if (shellProbes === 1) {
            reply({
              ok: false,
              type: 'assertShellReady',
              splash: false,
              stillLogin: true,
              zeitenFound: false,
              oeffnenFound: false,
              pickerFound: false,
            });
          } else if (shellProbes < 4) {
            reply({
              ok: false,
              type: 'assertShellReady',
              splash: true,
              stillLogin: false,
              zeitenFound: false,
              oeffnenFound: false,
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
              zeitenFound: false,
              oeffnenFound: true,
              pickerFound: false,
            });
          }
          break;
        case 'getPickerState':
          reply({
            ok: true,
            type: 'getPickerState',
            pickerFound: calls.includes('clickOeffnen'),
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
        case 'assertExportContext':
        case 'dumpLiveSelectors':
          reply({
            ok: true,
            type: cmd.type,
            pickerFound: true,
            maskFound: true,
            oeffnenFound: true,
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
        delay: async () => {},
      })
    ).rejects.toThrow(/NO_PLAN/);

    expect(shellProbes).toBeGreaterThanOrEqual(3);
    expect(calls.indexOf('clickOeffnen')).toBeGreaterThan(calls.indexOf('assertShellReady'));
    expect(calls).not.toContain('clickZeiten');
  },
  10000
  );
});
