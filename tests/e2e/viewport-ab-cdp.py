#!/usr/bin/env python3
"""Live A/B: LOGA3 DOM under desktop-1280 vs phone viewport via WebView CDP.

Requires: app open with WebView on LOGA3, adb forward to webview_devtools_remote_<pid>.
Writes /tmp/loga3-shots/viewport-ab/REPORT.json + screenshots via adb.
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

import websocket  # websocket-client

ADB = os.environ.get("ADB", "adb")
SERIAL = os.environ.get("ANDROID_SERIAL", "").strip()
PKG = "com.fr4iser.loga3mobile"
OUT = Path("/tmp/loga3-shots/viewport-ab")
CDP_PORT = int(os.environ.get("LOGA3_CDP_PORT", "9333"))

SNAP_JS = r"""
(function(){
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
      text: (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,80),
      vis: vis(el),
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height)
    };
  }
  var meta = q('meta[name=viewport]');
  var body = ((document.body && document.body.innerText) || '').replace(/\s+/g,' ').trim();
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
    exportInBody: /\bExport\b/i.test(body),
    buchungenInBody: /Buchung/i.test(body),
    loginForm: !!(q('input[type=password]') || /anmelden/i.test(body.slice(0,200))),
    uinCount: uins.length,
    uinSample: uins.slice(0, 40),
    bodySample: body.slice(0, 600)
  };
})()
"""


def adb(args: list[str], timeout: float = 30) -> subprocess.CompletedProcess[str]:
    cmd = [ADB]
    if SERIAL:
        cmd += ["-s", SERIAL]
    cmd += args
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def shot(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = subprocess.check_output(
        ([ADB, "-s", SERIAL] if SERIAL else [ADB]) + ["exec-out", "screencap", "-p"]
    )
    (OUT / name).write_bytes(data)
    print(f"SHOT {name} ({len(data)} bytes)", flush=True)


def cdp_ws_url() -> str:
    with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/list", timeout=5) as r:
        pages = json.load(r)
    pages = [p for p in pages if p.get("type") == "page"]
    if not pages:
        raise RuntimeError("no CDP page targets")
    # Prefer LOGA3
    for p in pages:
        if "loga" in (p.get("url") or "").lower() or "pi-asp" in (p.get("url") or "").lower():
            return p["webSocketDebuggerUrl"]
    return pages[0]["webSocketDebuggerUrl"]


class Cdp:
    def __init__(self, url: str):
        self.ws = websocket.create_connection(url, timeout=20)
        self._id = 0

    def call(self, method: str, params: dict | None = None, timeout: float = 60):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        t0 = time.time()
        while time.time() - t0 < timeout:
            raw = self.ws.recv()
            msg = json.loads(raw)
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result") or {}
        raise TimeoutError(method)

    def evaluate(self, expression: str):
        r = self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            },
            timeout=90,
        )
        if r.get("exceptionDetails"):
            raise RuntimeError(str(r["exceptionDetails"])[:400])
        return (r.get("result") or {}).get("value")

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def set_viewport_meta(cdp: Cdp, content: str) -> None:
    js = (
        "(function(c){var m=document.querySelector('meta[name=viewport]');"
        "if(!m){m=document.createElement('meta');m.name='viewport';"
        "document.head&&document.head.appendChild(m);}m.content=c;"
        "return m.content;})(%s)"
    ) % json.dumps(content)
    print("  viewport =>", cdp.evaluate(js), flush=True)


def load_creds() -> dict[str, str]:
    vals: dict[str, str] = {}
    for line in Path(".env").read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip()
    for k in ("LOGA3_BASE_URL", "LOGA3_USERNAME", "LOGA3_PASSWORD"):
        if k not in vals:
            raise RuntimeError(f".env missing {k}")
    return vals


def try_login(cdp: Cdp, user: str, password: str) -> None:
    """Fill login if password field present — one attempt, no retry spam."""
    snap = cdp.evaluate(SNAP_JS)
    if not snap or not snap.get("loginForm"):
        print("  login: not on login form", flush=True)
        return
    user_js = json.dumps(user)
    pass_js = json.dumps(password)
    ok = cdp.evaluate(
        f"""
(function(){{
  var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
  var userEl = null, passEl = null;
  inputs.forEach(function(el){{
    var t=(el.type||'').toLowerCase();
    var n=((el.name||'')+(el.id||'')+(el.placeholder||'')).toLowerCase();
    if(t==='password') passEl=el;
    else if(!userEl && (t==='text'||t==='email'||t===''||/kenn|user|login|name/.test(n))) userEl=el;
  }});
  if(!passEl) return 'no_password';
  if(userEl){{
    userEl.focus(); userEl.value={user_js};
    userEl.dispatchEvent(new Event('input',{{bubbles:true}}));
    userEl.dispatchEvent(new Event('change',{{bubbles:true}}));
  }}
  passEl.focus(); passEl.value={pass_js};
  passEl.dispatchEvent(new Event('input',{{bubbles:true}}));
  passEl.dispatchEvent(new Event('change',{{bubbles:true}}));
  var btn = Array.prototype.slice.call(document.querySelectorAll('button, a, div, span, input'))
    .find(function(el){{
      var t=((el.innerText||el.value||'')+'').replace(/\\s+/g,' ').trim();
      return /^\\s*anmelden\\s*$/i.test(t);
    }});
  if(btn){{ try{{btn.click();}}catch(e){{}} return 'clicked'; }}
  return 'filled_no_button';
}})()
"""
    )
    print(f"  login: {ok}", flush=True)
    time.sleep(8)


def click_oeffnen(cdp: Cdp) -> str:
    return str(
        cdp.evaluate(
            r"""
(function(){
  var btns = Array.prototype.slice.call(
    document.querySelectorAll('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"]')
  ).filter(function(el){
    var r=el.getBoundingClientRect();
    return r.width>0 && r.height>0;
  });
  if(!btns.length) return 'no_oeffnen';
  try{btns[0].click(); return 'clicked';}catch(e){return 'err:'+e;}
})()
"""
        )
    )


def open_export_panel(cdp: Cdp) -> str:
    """Best-effort: SmartEdin → Export. One path, report result."""
    return str(
        cdp.evaluate(
            r"""
(function(){
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
    export: !!(document.querySelector('div.MenuItem[data-uin="smartthing-cat-exports"]')),
    lagsdzpg: !!(lags && vis(lags)),
    lagsdzpgExists: !!lags
  });
})()
"""
        )
    )


def force_viewport_on_load(cdp: Cdp, viewport_content: str, user_agent: str | None = None) -> None:
    """Survive app inject: set __LOGA3_FORCE_VP before every document."""
    js = "window.__LOGA3_FORCE_VP = %s;" % json.dumps(viewport_content)
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": js})
    if user_agent:
        cdp.call(
            "Network.setUserAgentOverride",
            {"userAgent": user_agent},
        )


def run_mode(cdp: Cdp, label: str, viewport_content: str, creds: dict[str, str], user_agent: str | None = None) -> dict:
    print(f"\n=== MODE {label} ===", flush=True)
    force_viewport_on_load(cdp, viewport_content, user_agent)
    set_viewport_meta(cdp, viewport_content)
    # Hard reload so GWT can rebuild for the new viewport
    cdp.call("Page.reload", {"ignoreCache": True})
    time.sleep(8)
    # Re-assert after app inject race
    set_viewport_meta(cdp, viewport_content)
    try_login(cdp, creds["LOGA3_USERNAME"], creds["LOGA3_PASSWORD"])
    # wait shell-ish
    for i in range(20):
        s = cdp.evaluate(SNAP_JS)
        if s and (s.get("oeffnenCount") or s.get("picker") or not s.get("loginForm")):
            print(f"  shell-ish t={i*2}s oeffnen={s.get('oeffnenCount')} picker={s.get('picker')}", flush=True)
            break
        time.sleep(2)
    else:
        s = cdp.evaluate(SNAP_JS)
        print("  WARN: shell not clearly ready", flush=True)

    if s and s.get("oeffnenCount") and not s.get("picker"):
        print("  click öffnen:", click_oeffnen(cdp), flush=True)
        time.sleep(5)

    print("  open export:", open_export_panel(cdp), flush=True)
    time.sleep(3)
    snap = cdp.evaluate(SNAP_JS)
    snap["mode"] = label
    snap["forcedViewport"] = viewport_content
    shot(f"{label}.png")
    (OUT / f"{label}.json").write_text(json.dumps(snap, indent=2, ensure_ascii=False))
    print(
        f"  RESULT {label}: lagsdzpg={snap.get('lagsdzpg')} vis={snap.get('lagsdzpgVis')} "
        f"export={snap.get('exportMenu')} smartedin={snap.get('smartedin')} "
        f"inner={snap.get('innerWidth')} scrollW={snap.get('scrollWidth')} meta={snap.get('viewportMeta')}",
        flush=True,
    )
    return snap


def ensure_forward() -> None:
    pid = adb(["shell", "pidof", PKG]).stdout.strip().split()[0]
    if not pid:
        raise RuntimeError("app not running")
    adb(["forward", f"tcp:{CDP_PORT}", f"localabstract:webview_devtools_remote_{pid}"])
    print(f"CDP forward pid={pid} port={CDP_PORT}", flush=True)


def launch_app_with_metro() -> None:
    enc = urllib.parse.quote("http://127.0.0.1:8091", safe="")
    adb(["reverse", "tcp:8091", "tcp:8091"])
    adb(["shell", "am", "force-stop", PKG])
    time.sleep(1)
    deep = f"loga3mobile://expo-development-client/?url={enc}"
    # One argv to adb shell → quote for device sh (password may contain !)
    r = adb(["shell", f"am start -a android.intent.action.VIEW -d {shlex.quote(deep)} {PKG}"])
    if r.returncode != 0:
        raise RuntimeError(f"launch metro client failed rc={r.returncode}: {(r.stderr or r.stdout)[:200]}")
    print("LAUNCHED metro client", flush=True)
    time.sleep(16)


def seed_creds(creds: dict[str, str]) -> None:
    q = urllib.parse.urlencode(
        {
            "smoke": "1",
            "url": creds["LOGA3_BASE_URL"],
            "user": creds["LOGA3_USERNAME"],
            "pass": creds["LOGA3_PASSWORD"],
            "hospital": "st-elisabeth-leipzig",
            "group": "pflege",
            "area": "op-bereich",
            "preset": "Anästhesie",
        }
    )
    deep = f"loga3mobile:///?{q}"
    r = adb(["shell", f"am start -a android.intent.action.VIEW -d {shlex.quote(deep)} {PKG}"])
    if r.returncode != 0:
        raise RuntimeError(f"seed failed rc={r.returncode}: {(r.stderr or '')[:120]}")
    print("SEED_OK", flush=True)
    time.sleep(5)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    creds = load_creds()
    launch_app_with_metro()
    seed_creds(creds)
    ensure_forward()
    url = cdp_ws_url()
    print("CDP page", url, flush=True)
    cdp = Cdp(url)
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")
        baseline = cdp.evaluate(SNAP_JS)
        (OUT / "00-baseline.json").write_text(json.dumps(baseline, indent=2, ensure_ascii=False))
        shot("00-baseline.png")
        print(
            f"BASELINE ua_mobile={'Mobile' in (baseline or {}).get('ua','')} "
            f"meta={(baseline or {}).get('viewportMeta')} "
            f"lagsdzpg={(baseline or {}).get('lagsdzpg')} login={(baseline or {}).get('loginForm')}",
            flush=True,
        )

        mobile_ua = (
            "Mozilla/5.0 (Linux; Android 14; moto g73 5G) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        )
        desktop_ua = (
            "Mozilla/5.0 (Linux; X11; x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        # Phone-like: device-width + Mobile UA, no 1280 cheat
        mobile = run_mode(
            cdp,
            "mobile",
            "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
            creds,
            user_agent=mobile_ua,
        )
        # Desktop LOGA3 path: width=1280 + Desktop UA (app default)
        desktop = run_mode(
            cdp,
            "desktop1280",
            "width=1280, initial-scale=0.34, maximum-scale=4, user-scalable=yes",
            creds,
            user_agent=desktop_ua,
        )

        report = {
            "baseline": baseline,
            "mobile": mobile,
            "desktop1280": desktop,
            "verdict": {
                "mobile_has_lagsdzpg": bool(mobile.get("lagsdzpg")),
                "mobile_lagsdzpg_visible": bool(mobile.get("lagsdzpgVis")),
                "desktop_has_lagsdzpg": bool(desktop.get("lagsdzpg")),
                "desktop_lagsdzpg_visible": bool(desktop.get("lagsdzpgVis")),
                "mobile_has_export": bool(mobile.get("exportMenu")),
                "desktop_has_export": bool(desktop.get("exportMenu")),
                "mobile_has_smartedin": bool(mobile.get("smartedin")),
                "desktop_has_smartedin": bool(desktop.get("smartedin")),
                "claim_desktop_only_export": (
                    bool(desktop.get("lagsdzpg") or desktop.get("exportMenu"))
                    and not (mobile.get("lagsdzpg") or mobile.get("exportMenu"))
                ),
            },
        }
        (OUT / "REPORT.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
        v = report["verdict"]
        print("\n======== VERDICT ========", flush=True)
        print(json.dumps(v, indent=2), flush=True)
        print(f"REPORT {OUT / 'REPORT.json'}", flush=True)
        return 0
    finally:
        cdp.close()


if __name__ == "__main__":
    raise SystemExit(main())
