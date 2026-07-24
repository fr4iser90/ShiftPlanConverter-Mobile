#!/usr/bin/env node
/**
 * Interactive-authorized path (user): SmartEdin → Export → LAGSDZPG → Herunterladen
 * then MonthPicker −3 months → same export again.
 * One path, no retries — fail clearly.
 */
const WebSocket = require('ws');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERIAL = process.env.ANDROID_SERIAL || 'ZY22J3RHFC';
const PKG = 'com.fr4iser.loga3mobile';
const OUT = '/tmp/loga3-shots/dom-steps';
const CDP_PORT = 9334;

function adb(args) {
  return spawnSync('adb', ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 30000 });
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function shot(name) {
  const bin = spawnSync('adb', ['-s', SERIAL, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    maxBuffer: 20 << 20,
  });
  fs.writeFileSync(path.join(OUT, name), bin.stdout);
  console.log('SHOT', name, bin.stdout.length);
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
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
  const pid = (adb(['shell', 'pidof', '-s', PKG]).stdout || '').trim();
  if (!pid) throw new Error('app not running');
  adb(['forward', '--remove', `tcp:${CDP_PORT}`]);
  adb(['forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  const list = JSON.parse(
    spawnSync('curl', ['-sf', `http://127.0.0.1:${CDP_PORT}/json/list`], { encoding: 'utf8' }).stdout || '[]'
  );
  const page = list.find((p) => /loga|pi-asp/i.test(p.url || '')) || list[0];
  if (!page) throw new Error('no CDP page');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call('Runtime.enable');
  return cdp;
}

async function waitEval(cdp, label, deadlineMs, stepMs, expression) {
  const end = Date.now() + deadlineMs;
  let last = null;
  while (Date.now() < end) {
    last = await cdp.evaluate(expression);
    if (last && last.ok) return last;
    await sleep(stepMs);
  }
  throw new Error(label + ' FAILED: ' + JSON.stringify(last));
}

async function snapState(cdp) {
  return cdp.evaluate(`(function(){
    function t(el){return ((el&&(el.innerText||el.textContent||''))||'').replace(/\\s+/g,' ').trim();}
    function vis(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
    var picker=document.querySelector('#ZeitdatenMonthPicker');
    var raw=picker?t(picker):'';
    var m=raw.match(/(\\d{2})\\/(\\d{4})/)||raw.match(/(\\d{1,2})\\.(\\d{4})/);
    return {
      href:location.href,
      pickerLabel:raw.slice(0,80),
      month:m?String(m[1]).padStart(2,'0'):null,
      year:m?m[2]:null,
      smartedin:vis(document.querySelector('[data-uin="ic-smartedingeborder"]')),
      exportMenu:vis(document.querySelector('[data-uin="smartthing-cat-exports"]')),
      lagsdzpg:vis(document.querySelector('[data-uin="smartthing-LAGSDZPG"]')),
      herunterladen:/Herunterladen/i.test(t(document.body)),
      bodySample:t(document.body).slice(0,400)
    };
  })()`);
}

async function runZeitprotokoll(cdp, tag) {
  console.log('\\n=== ZEITPROTOKOLL', tag, '===');
  const before = await snapState(cdp);
  console.log('BEFORE', JSON.stringify(before));

  // 1 SmartEdin
  const se = await cdp.evaluate(`(function(){
    var icon=document.querySelector('span.LG-Icon.ic-smartedingeborder[data-uin="ic-smartedingeborder"]')
      || document.querySelector('[data-uin="ic-smartedingeborder"]');
    if(!icon) return {ok:false,error:'smartedin_not_found'};
    var r=icon.getBoundingClientRect();
    if(r.width<=0||r.height<=0) return {ok:false,error:'smartedin_not_visible'};
    try{icon.scrollIntoView({block:'center'});}catch(e){}
    icon.click();
    return {ok:true};
  })()`);
  console.log('SmartEdin', se);
  if (!se || !se.ok) throw new Error('SmartEdin: ' + JSON.stringify(se));

  await waitEval(
    cdp,
    'Export menu after SmartEdin',
    15000,
    300,
    `(function(){
      var el=document.querySelector('div.MenuItem[data-uin="smartthing-cat-exports"]')
        || document.querySelector('div.MenuItem.selected[data-uin="smartthing-cat-exports"]');
      if(!el) return {ok:false,error:'export_missing'};
      var r=el.getBoundingClientRect();
      return {ok:r.width>0&&r.height>0, error:r.width>0?'':'export_not_visible'};
    })()`
  );

  // 2 Export
  const ex = await cdp.evaluate(`(function(){
    var el=document.querySelector('div.MenuItem[data-uin="smartthing-cat-exports"]')
      || document.querySelector('div.MenuItem.selected[data-uin="smartthing-cat-exports"]');
    if(!el) return {ok:false,error:'export_not_found'};
    try{el.scrollIntoView({block:'center'});}catch(e){}
    el.click();
    return {ok:true};
  })()`);
  console.log('Export', ex);
  if (!ex || !ex.ok) throw new Error('Export: ' + JSON.stringify(ex));

  await waitEval(
    cdp,
    'LAGSDZPG after Export',
    20000,
    400,
    `(function(){
      var el=document.querySelector('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
      if(!el) return {ok:false,error:'lagsdzpg_missing'};
      var r=el.getBoundingClientRect();
      return {ok:r.width>0&&r.height>0, error:r.width>0?'':'lagsdzpg_not_visible'};
    })()`
  );

  // 3 LAGSDZPG
  const zp = await cdp.evaluate(`(function(){
    var el=document.querySelector('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
    if(!el) return {ok:false,error:'button_not_found'};
    try{el.scrollIntoView({block:'center'});}catch(e){}
    el.click();
    return {ok:true, text:((el.innerText||'').replace(/\\s+/g,' ').trim()).slice(0,60)};
  })()`);
  console.log('LAGSDZPG', zp);
  if (!zp || !zp.ok) throw new Error('LAGSDZPG: ' + JSON.stringify(zp));

  await waitEval(
    cdp,
    'Herunterladen dialog',
    45000,
    500,
    `(function(){
      function t(el){return ((el&&(el.innerText||el.textContent||''))||'').replace(/\\s+/g,' ').trim();}
      function vis(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
      var btn=[].slice.call(document.querySelectorAll('button,a,[role="button"],span,div')).find(function(el){
        var s=t(el); return /^Herunterladen$/i.test(s) && vis(el) && s.length<40;
      });
      return {ok:!!btn, error:btn?'':'herunterladen_missing', sample:t(document.body).slice(0,200)};
    })()`
  );

  // 4 Herunterladen
  const dl = await cdp.evaluate(`(function(){
    function t(el){return ((el&&(el.innerText||el.textContent||''))||'').replace(/\\s+/g,' ').trim();}
    function vis(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
    var btn=[].slice.call(document.querySelectorAll('button,a,[role="button"],span,div')).find(function(el){
      var s=t(el); return /^Herunterladen$/i.test(s) && vis(el) && s.length<40;
    });
    if(!btn) return {ok:false,error:'herunterladen_not_found'};
    try{btn.scrollIntoView({block:'center'});}catch(e){}
    btn.click();
    return {ok:true};
  })()`);
  console.log('Herunterladen', dl);
  if (!dl || !dl.ok) throw new Error('Herunterladen: ' + JSON.stringify(dl));

  await sleep(4000);
  const after = await snapState(cdp);
  console.log('AFTER', JSON.stringify(after));
  await shot(`zp-${tag}.png`);
  fs.writeFileSync(path.join(OUT, `zp-${tag}.json`), JSON.stringify({ before, se, ex, zp, dl, after }, null, 2));
  return { before, after };
}

async function monthBack3(cdp) {
  console.log('\\n=== MONTHPICKER −3 ===');
  const before = await snapState(cdp);
  console.log('PICKER_BEFORE', JSON.stringify(before));

  // Prefer ic-previous near picker ×3 (one path)
  for (let i = 0; i < 3; i++) {
    const step = await cdp.evaluate(`(function(){
      function vis(el){if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
      var picker=document.querySelector('#ZeitdatenMonthPicker');
      if(!picker) return {ok:false,error:'picker_missing'};
      var root=picker.parentElement;
      var arrow=null;
      for(var d=0;d<4&&root;d++){
        arrow=[].slice.call(root.querySelectorAll('[data-uin="ic-previous"]')).find(function(el){
          return vis(el) && !el.closest('.gwt-DatePicker');
        });
        if(arrow) break;
        root=root.parentElement;
      }
      if(!arrow) return {ok:false,error:'previous_not_found'};
      arrow.click();
      return {ok:true};
    })()`);
    console.log('back', i + 1, step);
    if (!step || !step.ok) throw new Error('month back step ' + (i + 1) + ': ' + JSON.stringify(step));
    await sleep(2500);
  }

  // Wait until month label changed from before
  const target = await waitEval(
    cdp,
    'Month changed −3',
    20000,
    400,
    `(function(){
      function t(el){return ((el&&(el.innerText||el.textContent||''))||'').replace(/\\s+/g,' ').trim();}
      var picker=document.querySelector('#ZeitdatenMonthPicker');
      if(!picker) return {ok:false,error:'picker_missing'};
      var raw=t(picker);
      var m=raw.match(/(\\d{2})\\/(\\d{4})/)||raw.match(/(\\d{1,2})\\.(\\d{4})/);
      var month=m?String(m[1]).padStart(2,'0'):null;
      var year=m?m[2]:null;
      var beforeMonth=${JSON.stringify(before.month)};
      var beforeYear=${JSON.stringify(before.year)};
      var changed=!(month===beforeMonth && year===beforeYear);
      // also accept if label text changed
      var labelChanged=raw !== ${JSON.stringify(before.pickerLabel || '')};
      return {ok:changed||labelChanged, month:month, year:year, label:raw.slice(0,80), error:(changed||labelChanged)?'':'unchanged'};
    })()`
  );
  console.log('PICKER_AFTER', JSON.stringify(target));
  await shot('month-minus3.png');
  return target;
}

async function main() {
  const cdp = await connect();
  const log = { steps: [] };
  try {
    // Ensure we're on Zeitdaten with picker
    const st = await snapState(cdp);
    console.log('START', JSON.stringify(st));
    if (!st.month && !st.pickerLabel) {
      throw new Error('Not on Zeitdaten (no month picker). Open Zeiten→ÖFFNEN first.');
    }

    const run1 = await runZeitprotokoll(cdp, 'current');
    log.steps.push({ name: 'zp-current', run1 });

    const moved = await monthBack3(cdp);
    log.steps.push({ name: 'month-minus3', moved });

    // After month change, wait for SmartEdin again
    await waitEval(
      cdp,
      'SmartEdin after month change',
      25000,
      400,
      `(function(){
        var el=document.querySelector('[data-uin="ic-smartedingeborder"]');
        if(!el) return {ok:false,error:'smartedin_missing'};
        var r=el.getBoundingClientRect();
        return {ok:r.width>0&&r.height>0, error:r.width>0?'':'smartedin_not_visible'};
      })()`
    );

    const run2 = await runZeitprotokoll(cdp, 'minus3');
    log.steps.push({ name: 'zp-minus3', run2 });

    fs.writeFileSync(path.join(OUT, 'zp-two-months-report.json'), JSON.stringify(log, null, 2));
    console.log('\\nDONE ok — current + −3 months Zeitprotokoll path executed');
  } finally {
    cdp.close();
  }
}

main().catch((e) => {
  console.error('FATAL', e.message || e);
  process.exit(1);
});
