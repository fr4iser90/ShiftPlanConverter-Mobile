#!/usr/bin/env node
/** Interactive DOM probe — one action per run. Usage:
 *  node tests/e2e/dom-step.js dump
 *  node tests/e2e/dom-step.js login
 *  node tests/e2e/dom-step.js click-oeffnen
 *  node tests/e2e/dom-step.js click-uin <uin>
 *  node tests/e2e/dom-step.js shot <name>
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WebSocket = require('ws');

const SERIAL = process.env.ANDROID_SERIAL || 'ZY22J3RHFC';
const PKG = 'com.fr4iser.loga3mobile';
const OUT = '/tmp/loga3-shots/dom-steps';
const CDP_PORT = 9334;

const SNAP = `(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function vis(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
  function textOf(el){return ((el&&(el.innerText||el.textContent||el.value))||'').replace(/\\s+/g,' ').trim();}
  function brief(el){
    if(!el)return null; var r=el.getBoundingClientRect();
    return {tag:el.tagName,uin:el.getAttribute('data-uin')||'',aria:el.getAttribute('aria-label')||'',
      cls:String(el.className||'').slice(0,90),text:textOf(el).slice(0,90),
      vis:vis(el),x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};
  }
  var body=textOf(document.body);
  var uins=qa('[data-uin]').map(brief).filter(function(b){return b&&b.vis;});
  var oeffnen=qa('div.LG-Button[aria-label="öffnen"],div.LG-Button[aria-label="Öffnen"]').map(brief);
  var pdfish=uins.filter(function(u){
    return /pdf|export|zeit|lagsd|download|herunter|smartedin|smartthing|drucken|protokoll|abrechnung/i
      .test(u.uin+' '+u.aria+' '+u.text+' '+u.cls);
  });
  return {
    href:String(location.href||''), title:document.title||'',
    viewport:(q('meta[name=viewport]')||{}).content||null,
    innerWidth:window.innerWidth,
    loginForm:!!(q('input[type=password]')||/ANMELDEN|Kennung/i.test(body.slice(0,300))),
    picker:!!q('#ZeitdatenMonthPicker'), pickerVis:vis(q('#ZeitdatenMonthPicker')),
    oeffnenVis:oeffnen.filter(function(b){return b.vis;}),
    smartedin:!!q('[data-uin="ic-smartedingeborder"]'),
    smartedinVis:vis(q('[data-uin="ic-smartedingeborder"]')),
    exportMenu:!!q('[data-uin="smartthing-cat-exports"]'),
    lagsdzpg:!!q('[data-uin="smartthing-LAGSDZPG"]'),
    lagsdzpgVis:vis(q('[data-uin="smartthing-LAGSDZPG"]')),
    herunterladen:/Herunterladen/i.test(body),
    pdfishUins:pdfish.slice(0,40),
    visibleUins:uins.slice(0,50).map(function(u){return {uin:u.uin,text:u.text,aria:u.aria,x:u.x,y:u.y};}),
    bodySample:body.slice(0,700)
  };
})()`;

function adb(args) {
  return spawnSync('adb', ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 30000 });
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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.ws = null;
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result && r.result.value;
  }
  close() {
    try {
      this.ws && this.ws.close();
    } catch (_) {}
  }
}

async function connect() {
  fs.mkdirSync(OUT, { recursive: true });
  let pid = (adb(['shell', 'pidof', '-s', PKG]).stdout || '').trim();
  if (!pid) throw new Error('app not running');
  adb(['forward', '--remove', `tcp:${CDP_PORT}`]);
  adb(['forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  const list = JSON.parse(
    spawnSync('curl', ['-sf', `http://127.0.0.1:${CDP_PORT}/json/list`], { encoding: 'utf8' }).stdout || '[]'
  );
  const page =
    list.find((p) => /loga|pi-asp/i.test(p.url || '')) || list.find((p) => p.type === 'page');
  if (!page) throw new Error('no CDP page');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call('Runtime.enable');
  return { cdp, page };
}

async function shot(name) {
  const bin = spawnSync('adb', ['-s', SERIAL, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    maxBuffer: 20 << 20,
  });
  fs.writeFileSync(path.join(OUT, name), bin.stdout);
  console.log('SHOT', name, bin.stdout.length);
}

async function main() {
  const cmd = process.argv[2] || 'dump';
  const { cdp, page } = await connect();
  console.log('PAGE', page.url);
  try {
    if (cmd === 'dump') {
      const snap = await cdp.evaluate(SNAP);
      const n = String(Date.now()).slice(-6);
      fs.writeFileSync(path.join(OUT, `dump-${n}.json`), JSON.stringify(snap, null, 2));
      await shot(`dump-${n}.png`);
      console.log(JSON.stringify(snap, null, 2));
      return;
    }
    if (cmd === 'login') {
      const creds = loadCreds();
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
        if(userEl){ userEl.focus(); userEl.value=user; userEl.dispatchEvent(new Event('input',{bubbles:true})); userEl.dispatchEvent(new Event('change',{bubbles:true})); }
        passEl.focus(); passEl.value=pass; passEl.dispatchEvent(new Event('input',{bubbles:true})); passEl.dispatchEvent(new Event('change',{bubbles:true}));
        var btn=[].slice.call(document.querySelectorAll('button,a,div,span,input')).find(function(el){
          return /^\\s*anmelden\\s*$/i.test(((el.innerText||el.value||'')+'').trim());
        });
        if(btn){ btn.click(); return 'clicked_anmelden'; }
        return 'filled_no_button';
      })()`);
      console.log('LOGIN', ok);
      await sleep(8000);
      const snap = await cdp.evaluate(SNAP);
      fs.writeFileSync(path.join(OUT, 'after-login.json'), JSON.stringify(snap, null, 2));
      await shot('after-login.png');
      console.log(JSON.stringify(snap, null, 2));
      return;
    }
    if (cmd === 'click-oeffnen') {
      const ok = await cdp.evaluate(`(function(){
        var btns=[].slice.call(document.querySelectorAll('div.LG-Button[aria-label="öffnen"],div.LG-Button[aria-label="Öffnen"]'))
          .filter(function(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;});
        if(!btns.length) return 'none';
        try{btns[0].scrollIntoView({block:'center'}); btns[0].click(); return 'clicked_'+btns.length;}catch(e){return String(e);}
      })()`);
      console.log('OEFFNEN', ok);
      await sleep(5000);
      const snap = await cdp.evaluate(SNAP);
      fs.writeFileSync(path.join(OUT, 'after-oeffnen.json'), JSON.stringify(snap, null, 2));
      await shot('after-oeffnen.png');
      console.log(JSON.stringify(snap, null, 2));
      return;
    }
    if (cmd === 'click-uin') {
      const uin = process.argv[3];
      if (!uin) throw new Error('need uin');
      const ok = await cdp.evaluate(`(function(){
        var el=document.querySelector('[data-uin=${JSON.stringify(uin)}]');
        if(!el) return 'not_found';
        try{el.scrollIntoView({block:'center'}); el.click(); return 'clicked';}catch(e){return String(e);}
      })()`);
      console.log('CLICK_UIN', uin, ok);
      await sleep(3000);
      const snap = await cdp.evaluate(SNAP);
      fs.writeFileSync(path.join(OUT, `after-${uin}.json`), JSON.stringify(snap, null, 2));
      await shot(`after-${uin}.png`);
      console.log(JSON.stringify(snap, null, 2));
      return;
    }
    if (cmd === 'shot') {
      await shot((process.argv[3] || 'manual') + '.png');
      return;
    }
    throw new Error('unknown cmd ' + cmd);
  } finally {
    cdp.close();
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
