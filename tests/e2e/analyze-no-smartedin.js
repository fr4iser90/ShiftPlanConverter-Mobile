#!/usr/bin/env node
/**
 * Live DOM analysis: paths to Zeitprotokoll/PDF WITHOUT clicking SmartEdin.
 * Output: /tmp/loga3-shots/no-smartedin-ab/
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WebSocket = require('ws');

const ADB = process.env.ADB || 'adb';
const SERIAL = (process.env.ANDROID_SERIAL || 'ZY22J3RHFC').trim();
const PKG = 'com.fr4iser.loga3mobile';
const OUT = '/tmp/loga3-shots/no-smartedin-ab';
const CDP_PORT = 9334;

const DUMP_JS = `(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function vis(el){
    if(!el) return false;
    var r=el.getBoundingClientRect();
    return r.width>0 && r.height>0;
  }
  function textOf(el){ return ((el && (el.innerText||el.textContent||el.value))||'').replace(/\\s+/g,' ').trim(); }
  function brief(el){
    if(!el) return null;
    var r=el.getBoundingClientRect();
    return {
      tag: el.tagName,
      uin: el.getAttribute('data-uin')||'',
      aria: el.getAttribute('aria-label')||'',
      title: el.getAttribute('title')||'',
      cls: String(el.className||'').slice(0,100),
      text: textOf(el).slice(0,100),
      vis: vis(el),
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height)
    };
  }
  var body = textOf(document.body);
  var allUins = qa('[data-uin]').map(brief).filter(Boolean);
  var pdfish = allUins.filter(function(u){
    var hay = (u.uin+' '+u.aria+' '+u.title+' '+u.text+' '+u.cls).toLowerCase();
    return /pdf|export|zeitprotokoll|lagsd|download|herunter|drucken|print|smartedin|smartthing|abrechnung|protokoll/i.test(hay);
  });
  var textHits = [];
  qa('a,button,div,span,li,[role=button],.LG-Button,.MenuItem,.LGSmartThingContentItem').forEach(function(el){
    var t = textOf(el);
    if(!t || t.length>80) return;
    if(!vis(el)) return;
    if(/^(Zeitprotokoll|Export|Herunterladen|Drucken|PDF|Protokoll|SmartEdin|Smart.?Edin)/i.test(t) ||
       /Zeitprotokoll|Herunterladen|PDF export|Druck/i.test(t)) {
      textHits.push(brief(el));
    }
  });
  // menus / toolbars / popups currently in DOM (even if hidden)
  var menus = qa('.popupContent, .gwt-MenuBar, .MenuItem, .LG-Popup, [class*="Popup"], [class*="Dialog"]')
    .slice(0, 80).map(brief).filter(Boolean);
  return {
    href: String(location.href||''),
    title: document.title||'',
    ua: navigator.userAgent||'',
    innerWidth: window.innerWidth,
    viewportMeta: (q('meta[name=viewport]')||{}).content || null,
    picker: !!q('#ZeitdatenMonthPicker'),
    pickerVis: vis(q('#ZeitdatenMonthPicker')),
    mask: !!q('[data-uin="mask-LZWZEITD"]'),
    oeffnen: qa('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"]').map(brief),
    smartedinPresent: !!q('[data-uin="ic-smartedingeborder"]'),
    smartedinVis: vis(q('[data-uin="ic-smartedingeborder"]')),
    exportMenuPresent: !!q('[data-uin="smartthing-cat-exports"]'),
    lagsdzpgPresent: !!q('[data-uin="smartthing-LAGSDZPG"]'),
    lagsdzpgVis: vis(q('[data-uin="smartthing-LAGSDZPG"]')),
    pdfishUins: pdfish.slice(0, 60),
    textHits: textHits.slice(0, 60),
    menuSample: menus.filter(function(m){return m.vis;}).slice(0, 40),
    uinCount: allUins.length,
    bodyHasZeitprotokoll: /Zeitprotokoll/i.test(body),
    bodyHasExport: /\\bExport\\b/i.test(body),
    bodyHasHerunterladen: /Herunterladen/i.test(body),
    bodySample: body.slice(0, 800)
  };
})()`;

function adb(args) {
  const cmd = SERIAL ? [ADB, '-s', SERIAL, ...args] : [ADB, ...args];
  return spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 30000 });
}
function qsh(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function loadCreds() {
  const vals = {};
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    vals[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return vals;
}
function shot(name) {
  fs.mkdirSync(OUT, { recursive: true });
  const cmd = SERIAL
    ? [ADB, '-s', SERIAL, 'exec-out', 'screencap', '-p']
    : [ADB, 'exec-out', 'screencap', '-p'];
  const bin = spawnSync(cmd[0], cmd.slice(1), { encoding: 'buffer', maxBuffer: 20 << 20 });
  fs.writeFileSync(path.join(OUT, name), bin.stdout);
  console.log('SHOT', name, bin.stdout.length);
}

class Cdp {
  constructor(url) {
    this.ws = null;
    this.url = url;
    this._id = 0;
    this._pending = new Map();
  }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
    this.ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (msg.id && this._pending.has(msg.id)) {
        const { resolve, reject } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result || {});
      }
    });
  }
  call(method, params = {}, timeoutMs = 60000) {
    const id = ++this._id;
    const p = new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error('timeout ' + method));
        }
      }, timeoutMs);
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    return p;
  }
  async evaluate(expression) {
    const r = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result && r.result.value;
  }
  close() {
    try {
      this.ws && this.ws.close();
    } catch (_) {}
  }
}

async function ensureAppAndCdp() {
  adb(['reverse', 'tcp:8091', 'tcp:8091']);
  let pid = (adb(['shell', 'pidof', '-s', PKG]).stdout || '').trim();
  if (!pid) {
    const enc = encodeURIComponent('http://127.0.0.1:8091');
    adb([
      'shell',
      `am start -a android.intent.action.VIEW -d ${qsh(
        'loga3mobile://expo-development-client/?url=' + enc
      )} ${PKG}`,
    ]);
    await sleep(18000);
    const creds = loadCreds();
    const qs = new URLSearchParams({
      smoke: '1',
      url: creds.LOGA3_BASE_URL,
      user: creds.LOGA3_USERNAME,
      pass: creds.LOGA3_PASSWORD,
      hospital: 'st-elisabeth-leipzig',
      group: 'pflege',
      area: 'op-bereich',
      preset: 'Anästhesie',
    }).toString();
    adb(['shell', `am start -a android.intent.action.VIEW -d ${qsh('loga3mobile:///?' + qs)} ${PKG}`]);
    await sleep(8000);
    pid = (adb(['shell', 'pidof', '-s', PKG]).stdout || '').trim();
  }
  if (!pid) throw new Error('app not running');
  adb(['forward', '--remove', `tcp:${CDP_PORT}`]);
  const fr = adb(['forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  if (fr.status !== 0) throw new Error('forward failed');
  // wait list
  for (let i = 0; i < 20; i++) {
    const c = spawnSync('curl', ['-sf', '--max-time', '2', `http://127.0.0.1:${CDP_PORT}/json/list`], {
      encoding: 'utf8',
    });
    if (c.status === 0 && c.stdout) {
      const pages = JSON.parse(c.stdout);
      const page =
        pages.find((p) => /loga|pi-asp/i.test(p.url || '')) || pages.find((p) => p.type === 'page');
      if (page) return page;
    }
    await sleep(1000);
  }
  throw new Error('no CDP page');
}

async function login(cdp, creds) {
  const state = await cdp.evaluate(DUMP_JS);
  if (!/anmelden|kennung|kennwort/i.test(state.bodySample || '') && !state.bodySample.includes('ANMELDEN')) {
    // maybe already in
    if (!state.href.includes('loga3/#')) return 'already';
  }
  const ok = await cdp.evaluate(`(function(){
    var user=${JSON.stringify(creds.LOGA3_USERNAME)}, pass=${JSON.stringify(creds.LOGA3_PASSWORD)};
    var inputs=[].slice.call(document.querySelectorAll('input'));
    var userEl=null, passEl=null;
    inputs.forEach(function(el){
      var t=(el.type||'').toLowerCase();
      var n=((el.name||'')+(el.id||'')+(el.placeholder||'')).toLowerCase();
      if(t==='password') passEl=el;
      else if(!userEl && (t==='text'||t==='email'||t===''||/kenn|user|login|name/.test(n))) userEl=el;
    });
    if(!passEl) return 'no_password';
    if(userEl){ userEl.focus(); userEl.value=user; userEl.dispatchEvent(new Event('input',{bubbles:true})); }
    passEl.focus(); passEl.value=pass; passEl.dispatchEvent(new Event('input',{bubbles:true}));
    var btn=[].slice.call(document.querySelectorAll('button,a,div,span,input')).find(function(el){
      return /^\\s*anmelden\\s*$/i.test(((el.innerText||el.value||'')+'').trim());
    });
    if(btn){ btn.click(); return 'clicked'; }
    return 'filled';
  })()`);
  console.log('login', ok);
  await sleep(10000);
  return ok;
}

async function clickOeffnen(cdp) {
  return cdp.evaluate(`(function(){
    var btns=[].slice.call(document.querySelectorAll('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"]'))
      .filter(function(el){ var r=el.getBoundingClientRect(); return r.width>0&&r.height>0; });
    if(!btns.length) return 'no_oeffnen';
    // Prefer Zeiten/Kalendarium context: click first visible
    try{ btns[0].scrollIntoView({block:'center'}); btns[0].click(); return 'clicked:'+btns.length; }catch(e){ return String(e); }
  })()`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const creds = loadCreds();
  const page = await ensureAppAndCdp();
  console.log('PAGE', page.url);
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    // Keep desktop viewport (app default) — we analyze DOM paths, not SmartEdin clicks
    await cdp.call('Network.enable', {});
    await cdp.call('Network.setUserAgentOverride', {
      userAgent:
        'Mozilla/5.0 (Linux; X11; x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await login(cdp, creds);

    // wait shell
    let dump = null;
    for (let i = 0; i < 30; i++) {
      dump = await cdp.evaluate(DUMP_JS);
      if (dump.oeffnen.length || dump.picker) {
        console.log('shell', i * 2, 'oeffnen', dump.oeffnen.length, 'picker', dump.picker);
        break;
      }
      await sleep(2000);
    }
    fs.writeFileSync(path.join(OUT, '01-shell.json'), JSON.stringify(dump, null, 2));
    shot('01-shell.png');

    if (!dump.picker) {
      console.log('click öffnen', await clickOeffnen(cdp));
      await sleep(6000);
      for (let i = 0; i < 20; i++) {
        dump = await cdp.evaluate(DUMP_JS);
        if (dump.picker) break;
        await sleep(1500);
      }
    }
    fs.writeFileSync(path.join(OUT, '02-after-oeffnen.json'), JSON.stringify(dump, null, 2));
    shot('02-after-oeffnen.png');

    // CRITICAL: dump PDF-ish DOM WITHOUT ever clicking SmartEdin
    const noSmart = await cdp.evaluate(DUMP_JS);
    fs.writeFileSync(path.join(OUT, '03-no-smartedin-dump.json'), JSON.stringify(noSmart, null, 2));
    shot('03-no-smartedin.png');

    // Also list EVERY visible toolbar/icon UIN near calendar (broader)
    const toolbar = await cdp.evaluate(`(function(){
      function vis(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
      function brief(el){
        var r=el.getBoundingClientRect();
        return {uin:el.getAttribute('data-uin')||'', aria:el.getAttribute('aria-label')||'',
          cls:String(el.className||'').slice(0,80),
          text:((el.innerText||'')+'').replace(/\\s+/g,' ').trim().slice(0,60),
          vis:vis(el), x:Math.round(r.left), y:Math.round(r.top)};
      }
      return {
        icons: [].slice.call(document.querySelectorAll('[data-uin], .LG-Icon, span.LG-Icon')).map(brief).filter(function(b){return b.vis;}).slice(0,100),
        buttons: [].slice.call(document.querySelectorAll('div.LG-Button, button, [role=button]')).map(brief).filter(function(b){return b.vis;}).slice(0,80)
      };
    })()`);
    fs.writeFileSync(path.join(OUT, '04-visible-toolbar.json'), JSON.stringify(toolbar, null, 2));

    const altPaths = {
      note: 'Paths to PDF/Zeitprotokoll WITHOUT clicking SmartEdin',
      pickerReady: !!noSmart.picker,
      smartedinInDom: noSmart.smartedinPresent,
      smartedinVisible: noSmart.smartedinVis,
      exportWithoutClickingSmartedin: noSmart.exportMenuPresent,
      lagsdzpgWithoutClickingSmartedin: noSmart.lagsdzpgPresent,
      lagsdzpgVisible: noSmart.lagsdzpgVis,
      bodyAlreadyHasZeitprotokoll: noSmart.bodyHasZeitprotokoll,
      bodyAlreadyHasHerunterladen: noSmart.bodyHasHerunterladen,
      pdfishUinsFound: (noSmart.pdfishUins || []).map((u) => u.uin || u.text).filter(Boolean),
      visibleTextHits: (noSmart.textHits || []).map((t) => t.text).filter(Boolean),
      alternativeWithoutSmartedin:
        noSmart.lagsdzpgPresent || noSmart.exportMenuPresent || noSmart.bodyHasHerunterladen
          ? 'POSSIBLE — export/ZP already in DOM without SmartEdin click'
          : 'NOT FOUND in current Zeitdaten view — no Export/LAGSDZPG/Herunterladen without opening SmartEdin first',
    };
    fs.writeFileSync(path.join(OUT, 'REPORT.json'), JSON.stringify(altPaths, null, 2));
    console.log('\n======== NO-SMARTEDIN REPORT ========');
    console.log(JSON.stringify(altPaths, null, 2));
    console.log('OUT', OUT);
  } finally {
    cdp.close();
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
