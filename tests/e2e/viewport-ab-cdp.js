#!/usr/bin/env node
/**
 * Live A/B: LOGA3 DOM under phone viewport vs desktop-1280 via WebView CDP.
 * Output: /tmp/loga3-shots/viewport-ab/
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WebSocket = require('ws');

const ADB = process.env.ADB || 'adb';
const SERIAL = (process.env.ANDROID_SERIAL || '').trim();
const PKG = 'com.fr4iser.loga3mobile';
const OUT = '/tmp/loga3-shots/viewport-ab';
const CDP_PORT = Number(process.env.LOGA3_CDP_PORT || 9333);

const SNAP_JS = `(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function vis(el){
    if(!el) return false;
    var r=el.getBoundingClientRect();
    return r.width>0 && r.height>0;
  }
  function brief(el){
    if(!el) return null;
    var r=el.getBoundingClientRect();
    return {
      uin: el.getAttribute('data-uin')||'',
      aria: el.getAttribute('aria-label')||'',
      text: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,80),
      vis: vis(el),
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height)
    };
  }
  var meta = q('meta[name=viewport]');
  var body = ((document.body && document.body.innerText) || '').replace(/\\s+/g,' ').trim();
  var lags = q('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
  var exp = q('div.MenuItem[data-uin="smartthing-cat-exports"]');
  var smart = q('[data-uin="ic-smartedingeborder"]');
  var picker = q('#ZeitdatenMonthPicker');
  var oeffnen = qa('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"]');
  var uins = qa('[data-uin]').filter(vis).map(function(el){return el.getAttribute('data-uin');});
  return {
    href: String(location.href||''),
    title: document.title||'',
    ua: navigator.userAgent||'',
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportMeta: meta ? meta.content : null,
    forceVp: window.__LOGA3_FORCE_VP || null,
    picker: !!picker,
    pickerVis: vis(picker),
    oeffnenCount: oeffnen.length,
    oeffnenVis: oeffnen.filter(vis).length,
    smartedin: !!smart,
    smartedinVis: vis(smart),
    exportMenu: !!exp,
    exportMenuVis: vis(exp),
    lagsdzpg: !!lags,
    lagsdzpgVis: vis(lags),
    lagsdzpgBrief: brief(lags),
    zpInBody: /Zeitprotokoll/i.test(body),
    exportInBody: /\\bExport\\b/i.test(body),
    buchungenInBody: /Buchung/i.test(body),
    loginForm: !!(q('input[type=password]') || /anmelden/i.test(body.slice(0,200))),
    uinCount: uins.length,
    uinSample: uins.slice(0, 40),
    bodySample: body.slice(0, 600)
  };
})()`;

function adb(args, timeoutMs = 30000) {
  const cmd = SERIAL ? [ADB, '-s', SERIAL, ...args] : [ADB, ...args];
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: timeoutMs });
  return r;
}

function shlexQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadCreds() {
  const vals = {};
  for (const line of fs.readFileSync('.env', 'utf8').split(/\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    vals[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ['LOGA3_BASE_URL', 'LOGA3_USERNAME', 'LOGA3_PASSWORD']) {
    if (!vals[k]) throw new Error(`.env missing ${k}`);
  }
  return vals;
}

function shot(name) {
  fs.mkdirSync(OUT, { recursive: true });
  const r = adb(['exec-out', 'screencap', '-p'], 20000);
  if (r.status !== 0) throw new Error('screencap failed');
  // spawnSync with encoding corrupts png — use buffer
  const cmd = SERIAL ? [ADB, '-s', SERIAL, 'exec-out', 'screencap', '-p'] : [ADB, 'exec-out', 'screencap', '-p'];
  const bin = spawnSync(cmd[0], cmd.slice(1), { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 });
  fs.writeFileSync(path.join(OUT, name), bin.stdout);
  console.log(`SHOT ${name} (${bin.stdout.length} bytes)`);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} ${res.status}`);
  return res.json();
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this._id = 0;
    this._pending = new Map();
  }
  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
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
          reject(new Error(`timeout ${method}`));
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result && r.result.value;
  }
  close() {
    try {
      this.ws && this.ws.close();
    } catch (_) {}
  }
}

async function setViewportMeta(cdp, content) {
  const js = `(function(c){var m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';document.head&&document.head.appendChild(m);}m.content=c;return m.content;})(${JSON.stringify(content)})`;
  const got = await cdp.evaluate(js);
  console.log('  viewport =>', got);
}

async function forceViewportOnLoad(cdp, viewportContent, userAgent, metrics) {
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__LOGA3_FORCE_VP = ${JSON.stringify(viewportContent)};`,
  });
  await cdp.call('Network.enable', {});
  if (userAgent) {
    await cdp.call('Network.setUserAgentOverride', { userAgent });
  }
  if (metrics) {
    await cdp.call('Emulation.setDeviceMetricsOverride', metrics);
  }
  try {
    await cdp.call('Page.setWebLifecycleState', { state: 'active' });
  } catch (_) {}
}

async function tryLogin(cdp, user, password) {
  const snap = await cdp.evaluate(SNAP_JS);
  if (!snap || !snap.loginForm) {
    console.log('  login: not on login form');
    return;
  }
  const ok = await cdp.evaluate(`(function(){
  var user=${JSON.stringify(user)}, pass=${JSON.stringify(password)};
  var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
  var userEl=null, passEl=null;
  inputs.forEach(function(el){
    var t=(el.type||'').toLowerCase();
    var n=((el.name||'')+(el.id||'')+(el.placeholder||'')).toLowerCase();
    if(t==='password') passEl=el;
    else if(!userEl && (t==='text'||t==='email'||t===''||/kenn|user|login|name/.test(n))) userEl=el;
  });
  if(!passEl) return 'no_password';
  if(userEl){ userEl.focus(); userEl.value=user; userEl.dispatchEvent(new Event('input',{bubbles:true})); userEl.dispatchEvent(new Event('change',{bubbles:true})); }
  passEl.focus(); passEl.value=pass; passEl.dispatchEvent(new Event('input',{bubbles:true})); passEl.dispatchEvent(new Event('change',{bubbles:true}));
  var btn = Array.prototype.slice.call(document.querySelectorAll('button, a, div, span, input')).find(function(el){
    var t=((el.innerText||el.value||'')+'').replace(/\\s+/g,' ').trim();
    return /^\\s*anmelden\\s*$/i.test(t);
  });
  if(btn){ try{btn.click();}catch(e){} return 'clicked'; }
  return 'filled_no_button';
})()`);
  console.log('  login:', ok);
  await sleep(8000);
}

async function clickOeffnen(cdp) {
  return cdp.evaluate(`(function(){
  var btns = Array.prototype.slice.call(document.querySelectorAll('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"]'))
    .filter(function(el){ var r=el.getBoundingClientRect(); return r.width>0 && r.height>0; });
  if(!btns.length) return 'no_oeffnen';
  try{btns[0].click(); return 'clicked';}catch(e){return 'err:'+e;}
})()`);
}

async function openExportPanel(cdp) {
  return cdp.evaluate(`(function(){
  function vis(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
  var icon = document.querySelector('[data-uin="ic-smartedingeborder"]');
  if(icon && vis(icon)){ try{icon.click();}catch(e){} }
  var exp = document.querySelector('div.MenuItem[data-uin="smartthing-cat-exports"]');
  if(!exp){
    var byText = Array.prototype.slice.call(document.querySelectorAll('div,span,a'))
      .find(function(el){return /^Export$/i.test((el.innerText||'').trim()) && vis(el);});
    if(byText){ try{byText.click();}catch(e){} }
  } else if(vis(exp)){ try{exp.click();}catch(e){} }
  var lags = document.querySelector('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
  return JSON.stringify({
    smartedin: !!(icon && vis(icon)),
    export: !!document.querySelector('div.MenuItem[data-uin="smartthing-cat-exports"]'),
    lagsdzpg: !!(lags && vis(lags)),
    lagsdzpgExists: !!lags
  });
})()`);
}

async function runMode(cdp, label, viewportContent, creds, userAgent, metrics) {
  console.log(`\n=== MODE ${label} ===`);
  await forceViewportOnLoad(cdp, viewportContent, userAgent, metrics);
  await setViewportMeta(cdp, viewportContent);
  await cdp.call('Page.reload', { ignoreCache: true });
  await sleep(10000);
  await setViewportMeta(cdp, viewportContent);
  if (metrics) {
    await cdp.call('Emulation.setDeviceMetricsOverride', metrics);
  }
  try {
    await cdp.call('Page.setWebLifecycleState', { state: 'active' });
  } catch (_) {}
  await tryLogin(cdp, creds.LOGA3_USERNAME, creds.LOGA3_PASSWORD);

  let s = null;
  for (let i = 0; i < 45; i++) {
    await setViewportMeta(cdp, viewportContent);
    s = await cdp.evaluate(SNAP_JS);
    const ready =
      s &&
      (s.oeffnenCount > 0 ||
        s.picker ||
        s.uinCount > 0 ||
        (s.bodySample && s.bodySample.length > 40 && !s.loginForm));
    if (ready) {
      console.log(
        `  shell-ish t=${i * 2}s oeffnen=${s.oeffnenCount} picker=${s.picker} uins=${s.uinCount} bodyLen=${(s.bodySample || '').length}`
      );
      break;
    }
    if (i % 5 === 0) {
      console.log(
        `  wait shell ${i * 2}s href=${(s && s.href) || '?'} login=${s && s.loginForm} bodyLen=${(s && s.bodySample && s.bodySample.length) || 0}`
      );
    }
    await sleep(2000);
  }
  if (!s) s = await cdp.evaluate(SNAP_JS);

  if (s && s.oeffnenCount && !s.picker) {
    console.log('  click öffnen:', await clickOeffnen(cdp));
    await sleep(5000);
  }

  console.log('  open export:', await openExportPanel(cdp));
  await sleep(3000);
  const snap = await cdp.evaluate(SNAP_JS);
  snap.mode = label;
  snap.forcedViewport = viewportContent;
  shot(`${label}.png`);
  fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(snap, null, 2));
  console.log(
    `  RESULT ${label}: lagsdzpg=${snap.lagsdzpg} vis=${snap.lagsdzpgVis} export=${snap.exportMenu} smartedin=${snap.smartedin} inner=${snap.innerWidth} scrollW=${snap.scrollWidth} meta=${snap.viewportMeta}`
  );
  return snap;
}

function launchAndSeed(creds) {
  const enc = encodeURIComponent('http://127.0.0.1:8091');
  adb(['reverse', 'tcp:8091', 'tcp:8091']);
  adb(['shell', 'am', 'force-stop', PKG]);
  spawnSync('sleep', ['1']);
  const metroDeep = `loga3mobile://expo-development-client/?url=${enc}`;
  let r = adb(['shell', `am start -a android.intent.action.VIEW -d ${shlexQuote(metroDeep)} ${PKG}`]);
  if (r.status !== 0) throw new Error(`launch failed: ${r.stderr || r.stdout}`);
  console.log('LAUNCHED metro client');
  spawnSync('sleep', ['16']);

  const q = new URLSearchParams({
    smoke: '1',
    url: creds.LOGA3_BASE_URL,
    user: creds.LOGA3_USERNAME,
    pass: creds.LOGA3_PASSWORD,
    hospital: 'st-elisabeth-leipzig',
    group: 'pflege',
    area: 'op-bereich',
    preset: 'Anästhesie',
  }).toString();
  const seedDeep = `loga3mobile:///?${q}`;
  r = adb(['shell', `am start -a android.intent.action.VIEW -d ${shlexQuote(seedDeep)} ${PKG}`]);
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr || r.stdout}`);
  console.log('SEED_OK');
  spawnSync('sleep', ['6']);
}

function ensureForward(retries = 15) {
  for (let i = 0; i < retries; i++) {
    const pid = (adb(['shell', 'pidof', '-s', PKG]).stdout || '').trim().split(/\s+/)[0];
    if (!pid) {
      console.log(`  wait app pid… ${i}`);
      spawnSync('sleep', ['2']);
      continue;
    }
    adb(['forward', '--remove', `tcp:${CDP_PORT}`]);
    const r = adb(['forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
    if (r.status !== 0) {
      console.log(`  forward fail ${i}: ${(r.stderr || '').trim()}`);
      spawnSync('sleep', ['2']);
      continue;
    }
    try {
      // sync check via curl-like spawn
      const c = spawnSync('curl', ['-sf', '--max-time', '2', `http://127.0.0.1:${CDP_PORT}/json/version`], {
        encoding: 'utf8',
      });
      if (c.status === 0 && c.stdout) {
        console.log(`CDP forward pid=${pid} port=${CDP_PORT}`);
        return;
      }
    } catch (_) {}
    console.log(`  cdp not ready ${i}`);
    spawnSync('sleep', ['2']);
  }
  throw new Error('CDP forward never ready');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const creds = loadCreds();
  if (process.env.LOGA3_AB_SKIP_LAUNCH === '1') {
    console.log('SKIP launch (reuse running app)');
    adb(['reverse', 'tcp:8091', 'tcp:8091']);
  } else {
    launchAndSeed(creds);
  }
  ensureForward();
  const pages = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page =
    pages.find((p) => /loga|pi-asp/i.test(p.url || '')) || pages.find((p) => p.type === 'page');
  if (!page) throw new Error('no CDP page');
  console.log('CDP page', page.url);

  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    const baseline = await cdp.evaluate(SNAP_JS);
    fs.writeFileSync(path.join(OUT, '00-baseline.json'), JSON.stringify(baseline, null, 2));
    shot('00-baseline.png');
    console.log(
      `BASELINE ua_has_Mobile=${/Mobile/.test(baseline.ua || '')} meta=${baseline.viewportMeta} lagsdzpg=${baseline.lagsdzpg} login=${baseline.loginForm}`
    );

    const mobileUa =
      'Mozilla/5.0 (Linux; Android 14; moto g73 5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    const desktopUa =
      'Mozilla/5.0 (Linux; X11; x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const mobile = await runMode(
      cdp,
      'mobile',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
      creds,
      mobileUa,
      { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }
    );
    const desktop = await runMode(
      cdp,
      'desktop1280',
      'width=1280, initial-scale=1, maximum-scale=4, user-scalable=yes',
      creds,
      desktopUa,
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }
    );

    const verdict = {
      mobile_has_lagsdzpg: !!mobile.lagsdzpg,
      mobile_lagsdzpg_visible: !!mobile.lagsdzpgVis,
      desktop_has_lagsdzpg: !!desktop.lagsdzpg,
      desktop_lagsdzpg_visible: !!desktop.lagsdzpgVis,
      mobile_has_export: !!mobile.exportMenu,
      desktop_has_export: !!desktop.exportMenu,
      mobile_has_smartedin: !!mobile.smartedin,
      desktop_has_smartedin: !!desktop.smartedin,
      mobile_zp_in_body: !!mobile.zpInBody,
      desktop_zp_in_body: !!desktop.zpInBody,
      claim_desktop_only_export:
        !!(desktop.lagsdzpg || desktop.exportMenu) && !(mobile.lagsdzpg || mobile.exportMenu),
      same_shell_both:
        !!(mobile.oeffnenCount || mobile.picker) && !!(desktop.oeffnenCount || desktop.picker),
    };
    const report = { baseline, mobile, desktop, verdict };
    fs.writeFileSync(path.join(OUT, 'REPORT.json'), JSON.stringify(report, null, 2));
    console.log('\n======== VERDICT ========');
    console.log(JSON.stringify(verdict, null, 2));
    console.log(`REPORT ${path.join(OUT, 'REPORT.json')}`);
  } finally {
    cdp.close();
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
