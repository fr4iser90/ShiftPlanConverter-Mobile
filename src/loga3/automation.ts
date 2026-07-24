/**
 * WebView automation scripts — Desktop loga3-workflow.js port (in-page JS).
 */

import { getLoga3BaseUrl } from './env';

/** @deprecated use getLoga3BaseUrl() — value changes after Settings hydrate */
export function getLoga3LoginUrl(): string {
  return getLoga3BaseUrl();
}

export function requireLoga3Url(): string {
  const url = getLoga3BaseUrl();
  if (!url) {
    throw new Error(
      'LOGA3-URL fehlt. In Settings (pro Installation) eintragen — nicht im App-Build.'
    );
  }
  return url;
}

export const MONTH_LABELS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

export type AutomationCommand =
  | { type: 'fillLogin'; username: string; password: string }
  | { type: 'submitLogin' }
  | { type: 'assertLoggedIn' }
  | { type: 'assertShellReady' }
  | { type: 'probeReady' }
  | { type: 'getPickerState' }
  | { type: 'getContentSignature' }
  | { type: 'verifyCalendarMonth'; month: number; year: number }
  | { type: 'clickBerechnen' }
  | { type: 'getDialogAbrechnungsmonat' }
  | { type: 'isZeitprotokollDialogVisible' }
  | { type: 'clickOeffnen' }
  | { type: 'clickZeiten' }
  | { type: 'armCalendarReload' }
  | { type: 'selectMonth'; month: number; year: number }
  | { type: 'assertHasPlan' }
  | { type: 'clickSmartEdin' }
  | { type: 'clickExport' }
  | { type: 'openZeitprotokoll' }
  | { type: 'armPdfCapture'; ms?: number }
  | { type: 'probeDialog' }
  | { type: 'clickDownload' }
  | { type: 'scrapePdfViewer' }
  | { type: 'closeDialog' }
  | { type: 'closePopups' }
  /** Picker/mask ready for PDF export path */
  | { type: 'assertExportContext' }
  /** Live dump: data-uin / aria / SmartThings / calendar titles (for parity) */
  | { type: 'dumpLiveSelectors' }
  | { type: 'stubStatus' };

export type AutomationMessage = {
  ok?: boolean;
  type?: string;
  error?: string;
  code?: string;
  href?: string;
  title?: string;
  hasZeitprotokoll?: boolean;
  sample?: string;
  note?: string;
  stillLogin?: boolean;
  /** LOGA3 boot splash / loading tiles still visible */
  splash?: boolean;
  zeitenFound?: boolean;
  /** Desktop entry: div.LG-Button[aria-label="öffnen"] */
  oeffnenFound?: boolean;
  pickerFound?: boolean;
  /** [data-uin="mask-LZWZEITD"] personal Zeitdaten mask */
  maskFound?: boolean;
  /** SmartThings Export menu item visible */
  exportPanel?: boolean;
  /** Zeitprotokoll generieren tile (LAGSDZPG) visible */
  lagsdzpg?: boolean;
  target?: string;
  month?: string | null;
  year?: string | null;
  label?: string | null;
  selected?: boolean;
  hasPlan?: boolean;
  base64?: string;
  mime?: string;
  size?: number;
  filename?: string;
  /** Content signature / gate */
  signature?: {
    key?: string;
    gridKey?: string;
    bookingsLabel?: string | null;
    firstWeekday?: string | null;
    lastDay?: string | null;
    dayCount?: number;
    schichtfrei?: number;
    ranges?: string[];
    geKo?: string[];
    sample?: string;
  };
  reason?: string;
  dialogVisible?: boolean;
  monthToken?: string | null;
  dialogYear?: string | null;
  dialogSource?: string;
};

/**
 * Persistently inject to capture PDF downloads from LOGA3.
 *
 * Android note: react-native-webview does NOT emit onFileDownload — Content-Disposition
 * hits DownloadManager. We must capture in-page (all frames) via blob/XHR/fetch/URL hooks.
 */
export const PDF_CAPTURE_INJECT = `
(function() {
  function install(win) {
    if (!win || win.__loga3PdfCapture) return;
    win.__loga3PdfCapture = true;
    var armedUntil = 0;
    function armed() { return Date.now() < armedUntil; }
    win.__loga3ArmPdfCapture = function(ms) {
      armedUntil = Date.now() + (ms || 120000);
      try { post({ ok: true, type: 'pdfCaptureArmed', note: String(ms || 120000) }); } catch (e) {}
    };
    function post(msg) {
      try {
        var w = win;
        for (var i = 0; i < 8; i++) {
          if (w.ReactNativeWebView && w.ReactNativeWebView.postMessage) {
            w.ReactNativeWebView.postMessage(JSON.stringify(msg));
            return;
          }
          if (!w.parent || w.parent === w) break;
          w = w.parent;
        }
      } catch (e) {}
    }
    function headerLooksPdf(ct, name) {
      ct = (ct || '').toLowerCase();
      name = name || '';
      return ct.indexOf('pdf') >= 0
        || ct.indexOf('octet-stream') >= 0
        || /\\.pdf($|\\?)/i.test(name);
    }
    function bytesLookPdf(u8) {
      try {
        if (!u8 || u8.length < 4) return false;
        return u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46; // %PDF
      } catch (e) { return false; }
    }
    function emitBlob(blob, filename, force) {
      if (!blob) return;
      var type = (blob.type || '').toLowerCase();
      var name = filename || '';
      var looksPdf = force
        || headerLooksPdf(type, name)
        || (!type && blob.size > 500)
        || (armed() && blob.size > 500 && (type.indexOf('application/') === 0 || !type));
      if (!looksPdf) return;
      var finish = function(okBlob) {
        var reader = new FileReader();
        reader.onloadend = function() {
          var result = String(reader.result || '');
          var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
          if (!base64 || base64.length < 32) {
            post({ ok: false, type: 'pdfBlob', error: 'empty_base64' });
            return;
          }
          // Verify magic when possible (data URL decoded later on RN; check prefix of base64 of %PDF)
          post({
            ok: true,
            type: 'pdfBlob',
            base64: base64,
            mime: type || 'application/pdf',
            size: okBlob.size || 0,
            filename: name,
            note: 'frame-capture'
          });
        };
        reader.onerror = function() {
          post({ ok: false, type: 'pdfBlob', error: 'filereader_failed' });
        };
        reader.readAsDataURL(okBlob);
      };
      // Confirm %PDF magic for ambiguous types
      if (!headerLooksPdf(type, name) || type.indexOf('octet-stream') >= 0) {
        try {
          var slice = blob.slice(0, 5);
          var fr = new FileReader();
          fr.onloadend = function() {
            var buf = fr.result;
            var u8 = buf ? new Uint8Array(buf) : null;
            if (bytesLookPdf(u8) || headerLooksPdf(type, name) || force) finish(blob);
          };
          fr.readAsArrayBuffer(slice);
          return;
        } catch (e) {}
      }
      finish(blob);
    }
    function emitArrayBuffer(buf, filename, mime, force) {
      try {
        var u8 = new Uint8Array(buf);
        if (!force && !bytesLookPdf(u8) && !headerLooksPdf(mime, filename)) return;
        emitBlob(new Blob([buf], { type: mime || 'application/pdf' }), filename || '', true);
      } catch (e) {
        post({ ok: false, type: 'pdfBlob', error: String(e && e.message || e) });
      }
    }
    function captureUrl(url, filename) {
      if (!url) return;
      post({ ok: true, type: 'pdfCaptureProbe', note: String(url).slice(0, 160) });
      try {
        win.fetch(url, { credentials: 'include', redirect: 'follow' })
          .then(function(res) {
            var ct = (res.headers && res.headers.get('content-type') || '').toLowerCase();
            return res.blob().then(function(b) { return { b: b, ct: ct }; });
          })
          .then(function(o) {
            emitBlob(o.b, filename || url, headerLooksPdf(o.ct, filename || url) || armed());
          })
          .catch(function(e) {
            post({ ok: false, type: 'pdfBlob', error: 'capture_url:' + String(e && e.message || e) });
          });
      } catch (e) {
        post({ ok: false, type: 'pdfBlob', error: 'capture_url_throw:' + String(e && e.message || e) });
      }
    }
    function shouldInterceptUrl(url) {
      if (!url) return false;
      var u = String(url);
      if (u.indexOf('blob:') === 0 || u.indexOf('data:application/pdf') === 0) return true;
      if (/\\.pdf($|\\?)/i.test(u)) return true;
      // When armed: intercept export-ish HTTP URLs (Content-Disposition → Android DownloadManager otherwise)
      if (armed() && /^https?:/i.test(u)
        && /export|download|zeitprotokoll|report|pdf|stream|servlet|generat|attachment|print/i.test(u)) {
        return true;
      }
      return false;
    }
    // createObjectURL
    try {
      var origCreate = win.URL.createObjectURL.bind(win.URL);
      win.URL.createObjectURL = function(obj) {
        try {
          if (obj && typeof win.Blob !== 'undefined' && obj instanceof win.Blob) {
            emitBlob(obj, '', armed());
          }
        } catch (e) {}
        return origCreate(obj);
      };
    } catch (e) {}
    // XHR
    try {
      var OrigXHR = win.XMLHttpRequest;
      function WrappedXHR() {
        var xhr = new OrigXHR();
        var _url = '';
        var open = xhr.open;
        xhr.open = function(method, url) {
          _url = String(url || '');
          return open.apply(xhr, arguments);
        };
        xhr.addEventListener('load', function() {
          try {
            var ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
            var want = armed() || headerLooksPdf(ct, _url);
            if (!want) return;
            if (xhr.responseType === 'blob' && xhr.response) emitBlob(xhr.response, _url, true);
            else if (xhr.responseType === 'arraybuffer' && xhr.response) emitArrayBuffer(xhr.response, _url, ct, true);
            else if (!xhr.responseType || xhr.responseType === '' || xhr.responseType === 'text') {
              var t = xhr.responseText || '';
              if (t.indexOf('%PDF') === 0) {
                var arr = new Uint8Array(t.length);
                for (var i = 0; i < t.length; i++) arr[i] = t.charCodeAt(i) & 0xff;
                emitArrayBuffer(arr.buffer, _url, ct || 'application/pdf', true);
              }
            }
          } catch (e) {}
        });
        return xhr;
      }
      WrappedXHR.prototype = OrigXHR.prototype;
      win.XMLHttpRequest = WrappedXHR;
    } catch (e) {}
    // fetch
    try {
      var origFetch = win.fetch.bind(win);
      win.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        return origFetch(input, init).then(function(res) {
          try {
            var ct = (res.headers && res.headers.get('content-type') || '').toLowerCase();
            if (armed() || headerLooksPdf(ct, url)) {
              res.clone().blob().then(function(b) {
                emitBlob(b, url, true);
              }).catch(function() {});
            }
          } catch (e) {}
          return res;
        });
      };
    } catch (e) {}
    // window.open
    try {
      var origOpen = win.open;
      win.open = function(url) {
        if (shouldInterceptUrl(url)) {
          captureUrl(url, '');
          return null;
        }
        return origOpen.apply(win, arguments);
      };
    } catch (e) {}
    // location.assign / replace — when armed, fetch first (Android DownloadManager otherwise)
    try {
      var loc = win.location;
      var origAssign = loc.assign.bind(loc);
      var origReplace = loc.replace.bind(loc);
      function maybeCaptureNav(url, fallback) {
        if (!armed() || !url || !/^https?:/i.test(String(url))) {
          return fallback(url);
        }
        post({ ok: true, type: 'pdfCaptureProbe', note: 'nav:' + String(url).slice(0, 140) });
        win.fetch(String(url), { credentials: 'include', redirect: 'follow' })
          .then(function(res) {
            return res.blob().then(function(b) {
              var ct = (res.headers && res.headers.get('content-type') || '').toLowerCase();
              if (headerLooksPdf(ct, url) || (b && b.size > 500)) {
                emitBlob(b, String(url), true);
                return;
              }
              fallback(url);
            });
          })
          .catch(function() { fallback(url); });
      }
      loc.assign = function(url) { maybeCaptureNav(url, origAssign); };
      loc.replace = function(url) { maybeCaptureNav(url, origReplace); };
    } catch (e) {}
    // iframe.src setter
    try {
      var desc = Object.getOwnPropertyDescriptor(win.HTMLIFrameElement && win.HTMLIFrameElement.prototype, 'src');
      if (desc && desc.set) {
        Object.defineProperty(win.HTMLIFrameElement.prototype, 'src', {
          configurable: true,
          enumerable: true,
          get: desc.get,
          set: function(v) {
            var self = this;
            if (armed() && v && /^https?:/i.test(String(v))) {
              post({ ok: true, type: 'pdfCaptureProbe', note: 'iframe:' + String(v).slice(0, 140) });
              win.fetch(String(v), { credentials: 'include', redirect: 'follow' })
                .then(function(res) {
                  return res.blob().then(function(b) {
                    var ct = (res.headers && res.headers.get('content-type') || '').toLowerCase();
                    if (headerLooksPdf(ct, v) || (b && b.size > 800)) {
                      // verify magic
                      try {
                        var slice = b.slice(0, 5);
                        var fr = new FileReader();
                        fr.onloadend = function() {
                          var u8 = fr.result ? new Uint8Array(fr.result) : null;
                          if (bytesLookPdf(u8) || headerLooksPdf(ct, v)) {
                            emitBlob(b, String(v), true);
                          } else {
                            desc.set.call(self, v);
                          }
                        };
                        fr.readAsArrayBuffer(slice);
                        return;
                      } catch (e) {}
                      emitBlob(b, String(v), true);
                      return;
                    }
                    desc.set.call(self, v);
                  });
                })
                .catch(function() { desc.set.call(self, v); });
              return;
            }
            if (shouldInterceptUrl(v)) { captureUrl(String(v), ''); return; }
            return desc.set.call(this, v);
          }
        });
      }
    } catch (e) {}
    // anchor / download clicks
    try {
      win.document.addEventListener('click', function(ev) {
        try {
          var t = ev.target;
          var a = t && t.closest ? t.closest('a[href]') : null;
          if (!a) return;
          var href = a.getAttribute('href') || '';
          if (shouldInterceptUrl(href) || a.hasAttribute('download')) {
            if (armed() || shouldInterceptUrl(href)) {
              ev.preventDefault();
              ev.stopPropagation();
              captureUrl(href, a.getAttribute('download') || href);
            }
          }
        } catch (e) {}
      }, true);
    } catch (e) {}
    // Android often opens Chromium PDF.js viewer instead of DownloadManager —
    // scrape bytes from the viewer / embeds / recent network resources while armed.
    function scrapeViewerOnce() {
      try {
        var app = win.PDFViewerApplication;
        if (app && app.pdfDocument && typeof app.pdfDocument.getData === 'function') {
          if (win.__loga3PdfViewerScraped) return;
          win.__loga3PdfViewerScraped = true;
          app.pdfDocument.getData().then(function(u8) {
            try {
              var buf = u8 && u8.buffer ? u8.buffer : u8;
              emitArrayBuffer(buf, 'pdfjs-viewer.pdf', 'application/pdf', true);
            } catch (e) {
              win.__loga3PdfViewerScraped = false;
            }
          }).catch(function() { win.__loga3PdfViewerScraped = false; });
          return;
        }
      } catch (e) {}
      try {
        var nodes = win.document ? win.document.querySelectorAll('embed, object, iframe') : [];
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var src = el.src || el.getAttribute('src') || el.getAttribute('data') || '';
          if (!src) continue;
          if (src.indexOf('blob:') === 0 || /pdf/i.test(src) || /\\.pdf($|\\?)/i.test(src)) {
            captureUrl(src, 'embed.pdf');
          }
        }
      } catch (e) {}
      try {
        if (!win.__loga3SeenRes) win.__loga3SeenRes = {};
        var entries = win.performance && win.performance.getEntriesByType
          ? win.performance.getEntriesByType('resource') : [];
        for (var j = 0; j < entries.length; j++) {
          var n = entries[j].name || '';
          if (!/^https?:/i.test(n)) continue;
          if (!/pdf|zeitprotokoll|export|download|servlet|stream|attachment|report/i.test(n)) continue;
          if (win.__loga3SeenRes[n]) continue;
          win.__loga3SeenRes[n] = 1;
          captureUrl(n, n);
        }
      } catch (e) {}
    }
    win.__loga3ScrapePdfViewer = scrapeViewerOnce;
    try {
      if (!win.__loga3PdfViewerPoll) {
        win.__loga3PdfViewerPoll = setInterval(function() {
          if (!armed()) return;
          scrapeViewerOnce();
        }, 1200);
      }
    } catch (e) {}
  }
  function installTree(win) {
    try { install(win); } catch (e) {}
    try {
      var frames = win.document && win.document.querySelectorAll('iframe');
      if (!frames) return;
      for (var i = 0; i < frames.length; i++) {
        try {
          if (frames[i].contentWindow) installTree(frames[i].contentWindow);
        } catch (e) {}
      }
    } catch (e) {}
  }
  installTree(window);
  try {
    var mo = new MutationObserver(function() { installTree(window); });
    mo.observe(document.documentElement || document, { childList: true, subtree: true });
  } catch (e) {}
  return true;
})();
true;
`;

/**
 * Returns JS that runs inside the WebView and posts results via window.ReactNativeWebView.
 */
export function buildAutomationScript(cmd: AutomationCommand): string {
  const payload = JSON.stringify(cmd);
  const monthsJson = JSON.stringify(MONTH_LABELS);
  return `
(function() {
  var cmd = ${payload};
  var MONTH_LABELS = ${monthsJson};
  function post(msg) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {}
  }
  function q(sel, root) {
    if (root) return root.querySelector(sel);
    return qAll(sel);
  }
  function qa(sel, root) {
    if (root) return Array.from(root.querySelectorAll(sel));
    return qaAll(sel);
  }
  function allDocuments() {
    var docs = [document];
    try {
      Array.from(document.querySelectorAll('iframe')).forEach(function(f) {
        try {
          if (f.contentDocument) docs.push(f.contentDocument);
        } catch (e) {}
      });
    } catch (e) {}
    return docs;
  }
  function qAll(sel) {
    var found = null;
    allDocuments().some(function(doc) {
      var el = doc.querySelector(sel);
      if (el) { found = el; return true; }
      return false;
    });
    return found;
  }
  function qaAll(sel) {
    var out = [];
    allDocuments().forEach(function(doc) {
      out = out.concat(Array.from(doc.querySelectorAll(sel)));
    });
    return out;
  }
  function visible(el) {
    if (!el) return false;
    var s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    // GWT DialogBox is often position:fixed → offsetParent === null even when on-screen
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return true;
  }
  function textOf(el) { return ((el && el.textContent) || '').replace(/\\s+/g, ' ').trim(); }
  function waitMs(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }
  function getPickerState() {
    var picker = q('#ZeitdatenMonthPicker');
    if (!picker) return { month: null, year: null, label: null, found: false };
    var raw = textOf(picker);
    var m = raw.match(/(\\d{2})\\/(\\d{4})/) || raw.match(/(\\d{1,2})\\.(\\d{4})/);
    if (m) {
      return {
        month: String(m[1]).padStart(2, '0'),
        year: m[2],
        label: raw,
        found: true
      };
    }
    for (var i = 0; i < MONTH_LABELS.length; i++) {
      if (raw.indexOf(MONTH_LABELS[i]) >= 0) {
        var y = raw.match(/\\b(20\\d{2})\\b/);
        return {
          month: String(i + 1).padStart(2, '0'),
          year: y ? y[1] : null,
          label: raw,
          found: true
        };
      }
    }
    return { month: null, year: null, label: raw, found: true };
  }
  function markMonthPopup() {
    qa('[data-loga3-month-popup]').forEach(function(el) { el.removeAttribute('data-loga3-month-popup'); });
    var roots = []
      .concat(qa('.gwt-PopupPanel'))
      .concat(qa('[class*="PopupPanel"]'))
      .concat(qa('.LG-Popup'))
      .concat(qa('table'));
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root || !visible(root)) continue;
      var cells = Array.from(root.querySelectorAll('td')).map(function(td) { return textOf(td); });
      var hits = MONTH_LABELS.filter(function(m) { return cells.indexOf(m) >= 0; }).length;
      if (hits >= 4) {
        root.setAttribute('data-loga3-month-popup', '1');
        return root;
      }
    }
    return null;
  }
  function readPopupSelector(popup) {
    if (!popup) return null;
    var labels = Array.from(popup.querySelectorAll('.datePickerSelectorText .gwt-InlineLabel'));
    var active = labels.find(function(el) { return el.classList.contains('active'); });
    var yearEl = labels.find(function(el) { return /^\\d{4}$/.test(textOf(el)); });
    return {
      active: active ? textOf(active) : null,
      year: yearEl ? textOf(yearEl) : null
    };
  }
  function clickArrowNearPicker(dir) {
    var picker = q('#ZeitdatenMonthPicker');
    if (!picker) return false;
    var uin = dir === 'back' ? 'ic-previous' : 'ic-next';
    var root = picker.parentElement;
    for (var depth = 0; depth < 4 && root; depth++) {
      var arrow = Array.from(root.querySelectorAll('[data-uin="' + uin + '"]')).find(function(el) {
        return visible(el) && !el.closest('.gwt-DatePicker');
      });
      if (arrow) { arrow.click(); return true; }
      root = root.parentElement;
    }
    return false;
  }
  function selectMonthViaPopup(month, year) {
    var monthLabel = MONTH_LABELS[month - 1];
    var mm = String(month).padStart(2, '0');
    var yearStr = String(year);
    var already = getPickerState();
    if (already.found && already.month === mm && already.year === yearStr) {
      return Promise.resolve({
        ok: true, selected: true, month: already.month, year: already.year, label: already.label, note: 'already'
      });
    }
    var picker = q('#ZeitdatenMonthPicker');
    if (!picker) return Promise.resolve({ ok: false, error: 'picker_not_found' });
    picker.click();

    function until(deadline, stepMs, probe) {
      function tick() {
        var v = probe();
        if (v) return Promise.resolve(v);
        if (Date.now() >= deadline) return Promise.resolve(null);
        return waitMs(stepMs).then(tick);
      }
      return tick();
    }

    var popupDeadline = Date.now() + 5000;
    return waitMs(200).then(function() {
      return until(popupDeadline, 150, function() { return markMonthPopup(); });
    }).then(function(popup) {
      if (!popup) return { ok: false, error: 'popup_not_found' };
      var sel = readPopupSelector(popup);
      var chain = Promise.resolve();
      if (sel && sel.active && /^\\d{4}$/.test(sel.active)) {
        var first = popup.querySelector('.datePickerSelectorText .gwt-InlineLabel');
        if (first) {
          first.click();
          chain = waitMs(200);
        }
      }
      var navDeadline = Date.now() + 12000;
      function navigate() {
        return chain.then(function() {
          sel = readPopupSelector(popup);
          if (sel && sel.active === monthLabel && sel.year === yearStr) return;
          if (Date.now() >= navDeadline) return;
          var shownYear = Number((sel && sel.year) || yearStr);
          var shownMonth = MONTH_LABELS.indexOf((sel && sel.active) || '') + 1 || 7;
          var shownNum = shownYear * 12 + shownMonth;
          var targetNum = Number(yearStr) * 12 + month;
          if (shownYear !== Number(yearStr)) {
            var yearDir = shownYear > Number(yearStr) ? 'Vorjahr' : 'Nächstes Jahr';
            var yearBtn = popup.querySelector('[aria-label="' + yearDir + '"]');
            if (yearBtn && visible(yearBtn)) {
              yearBtn.click();
              chain = waitMs(200);
              return navigate();
            }
          }
          var monthDir = shownNum > targetNum ? 'Vorheriger Monat' : 'Nächster Monat';
          var monthBtn = popup.querySelector('[aria-label="' + monthDir + '"]');
          if (monthBtn && visible(monthBtn)) {
            monthBtn.click();
            chain = waitMs(200);
            return navigate();
          }
        });
      }
      return navigate().then(function() {
        sel = readPopupSelector(popup);
        if (!(sel && sel.active === monthLabel && sel.year === yearStr)) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return { ok: false, error: 'could_not_reach_month', note: (sel && sel.active) + ' ' + (sel && sel.year) };
        }
        var cells = Array.from(popup.querySelectorAll('table.datePickerMonthPicker td')).filter(function(td) {
          return textOf(td) === monthLabel;
        });
        if (!cells.length) return { ok: false, error: 'month_cell_missing' };
        cells[0].click();
        return waitMs(400).then(function() {
          var state = getPickerState();
          if (state.month === mm && state.year === yearStr) {
            return { ok: true, selected: true, month: state.month, year: state.year, label: state.label };
          }
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return waitMs(150).then(function() {
            var targetNum2 = Number(yearStr) * 12 + month;
            var chromeDeadline = Date.now() + 10000;
            function chromeStep() {
              state = getPickerState();
              if (state.month === mm && state.year === yearStr) {
                return Promise.resolve({
                  ok: true, selected: true, month: state.month, year: state.year, label: state.label, note: 'chrome_arrows'
                });
              }
              if (Date.now() >= chromeDeadline || !state.month || !state.year) {
                return Promise.resolve({
                  ok: false,
                  selected: false,
                  month: state.month,
                  year: state.year,
                  label: state.label,
                  error: 'select_month_failed'
                });
              }
              var curNum = Number(state.year) * 12 + Number(state.month);
              var dir = curNum > targetNum2 ? 'back' : 'forward';
              if (!clickArrowNearPicker(dir)) {
                return Promise.resolve({
                  ok: false, selected: false, month: state.month, year: state.year, label: state.label, error: 'select_month_failed'
                });
              }
              return waitMs(300).then(chromeStep);
            }
            return chromeStep();
          });
        });
      });
    });
  }
  function getContentSignature() {
    var mask = q('[data-uin="mask-LZWZEITD"]') || q('.BewerberMaskLayout') || document.body;
    var text = ((mask && mask.innerText) || (document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim();
    var bookings = text.match(/Buchungen für\\s+([A-Za-zÄÖÜäöüß]+)\\s+(\\d{4})/i);
    var dayRe = /\\b([0-3]\\d)\\s*(MO|DI|MI|DO|FR|SA|SO)\\b/g;
    var days = [];
    var dm;
    while ((dm = dayRe.exec(text))) days.push(dm);
    var first = null;
    for (var di = 0; di < days.length; di++) {
      if (days[di][1] === '01') { first = days[di]; break; }
    }
    var last = days.length ? days[days.length - 1] : null;
    var ranges = [];
    var rm;
    var rangeRe = /(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})/g;
    while ((rm = rangeRe.exec(text))) ranges.push(rm[1] + '-' + rm[2]);
    var geKo = [];
    var gm;
    var geRe = /(?:KO\\*|GE\\*)\\s*(\\d{1,2}:\\d{2})/g;
    while ((gm = geRe.exec(text))) geKo.push(gm[1]);
    var schichtfrei = (text.match(/SCHICHTFREI/g) || []).length;
    var bookingsLabel = bookings ? (bookings[1] + ' ' + bookings[2]) : null;
    var firstWeekday = first ? first[2] : null;
    var lastDay = last ? last[1] : null;
    var key = [
      bookingsLabel || 'no-bookings',
      firstWeekday ? ('01' + firstWeekday) : 'no01',
      lastDay ? ('L' + lastDay) : 'noL',
      'sf' + schichtfrei,
      'r' + ranges.slice(0, 15).join(','),
      'g' + geKo.slice(0, 15).join(',')
    ].join('|');
    var gridKey = [
      firstWeekday ? ('01' + firstWeekday) : 'no01',
      lastDay ? ('L' + lastDay) : 'noL',
      'sf' + schichtfrei,
      'r' + ranges.slice(0, 15).join(','),
      'g' + geKo.slice(0, 15).join(',')
    ].join('|');
    return {
      key: key,
      gridKey: gridKey,
      bookingsLabel: bookingsLabel,
      firstWeekday: firstWeekday,
      lastDay: lastDay,
      dayCount: days.length,
      schichtfrei: schichtfrei,
      ranges: ranges.slice(0, 20),
      geKo: geKo.slice(0, 20),
      sample: text.slice(0, 280)
    };
  }
  function hasSchedulePlan() {
    var sig = getContentSignature();
    return (sig.ranges && sig.ranges.length > 0) || (sig.geKo && sig.geKo.length > 0) || (sig.schichtfrei > 0);
  }
  function expectedFirstWeekdayCode(month, year) {
    var codes = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
    return codes[new Date(Number(year), Number(month) - 1, 1).getDay()];
  }
  function expectedLastDay(month, year) {
    return String(new Date(Number(year), Number(month), 0).getDate());
  }

  try {
    if (cmd.type === 'stubStatus') {
      post({ ok: true, type: 'stubStatus', href: location.href, title: document.title || '' });
      return true;
    }

    if (cmd.type === 'fillLogin') {
      function setNative(el, val) {
        el.focus();
        el.click();
        var proto = window.HTMLInputElement.prototype;
        var desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, val);
        else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }
      var userSelectors = [
        'input[name="Kennung"]',
        'input[name="username"]',
        'input[placeholder*="Kennung"]',
        'input[id*="Kennung"]',
        'input[type="text"]',
        'input[autocomplete="username"]'
      ];
      var passSelectors = [
        'input[name="Kennwort"]',
        'input[name="password"]',
        'input[placeholder*="Kennwort"]',
        'input[type="password"]',
        'input[autocomplete="current-password"]'
      ];
      var user = null, pass = null, ui, pi;
      // NO busy-wait here — it blocks GWT/SPA render in WebView
      for (ui = 0; ui < userSelectors.length; ui++) {
        user = q(userSelectors[ui]);
        if (user) break;
        user = null;
      }
      for (pi = 0; pi < passSelectors.length; pi++) {
        pass = q(passSelectors[pi]);
        if (pass) break;
        pass = null;
      }
      if (!user || !pass) {
        post({
          ok: false,
          type: 'fillLogin',
          error: 'login_fields_not_found',
          sample: (document.body && document.body.innerText || '').slice(0, 160),
          href: location.href,
          note: 'inputs=' + qa('input').length
        });
        return true;
      }
      setNative(user, cmd.username);
      setNative(pass, cmd.password);
      post({ ok: true, type: 'fillLogin', note: (user.getAttribute('name') || '') + '/' + (pass.getAttribute('name') || '') });
      return true;
    }

    if (cmd.type === 'submitLogin') {
      function clickHard(el) {
        if (!el) return;
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
        el.focus && el.focus();
        ['pointerdown','mousedown','mouseup','pointerup','click'].forEach(function(type) {
          try {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          } catch (e) {}
        });
        try { el.click(); } catch (e) {}
      }
      var passEl = q('input[name="Kennwort"]') || q('input[type="password"]');
      if (passEl) {
        try {
          passEl.focus();
          passEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          passEl.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          passEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        } catch (e) {}
      }
      var btn = qa('button, input, a, [role="button"], div, span').find(function(b) {
        var t = textOf(b) + ' ' + (b.value || '') + ' ' + (b.getAttribute('aria-label') || '');
        return /^\\s*anmelden\\s*$/i.test(textOf(b) || (b.value || '')) && visible(b);
      });
      if (!btn) {
        btn = qa('button, input, a, [role="button"], div, span').find(function(b) {
          var t = textOf(b) + ' ' + (b.value || '');
          return /anmelden|login|einloggen/i.test(t) && visible(b) && textOf(b).length < 40;
        });
      }
      if (btn) {
        clickHard(btn);
        post({ ok: true, type: 'submitLogin', note: 'clicked:' + textOf(btn).slice(0, 40) });
      } else if (passEl) {
        post({ ok: true, type: 'submitLogin', note: 'enter_only' });
      } else {
        post({ ok: false, type: 'submitLogin', error: 'submit_not_found' });
      }
      return true;
    }

    if (cmd.type === 'assertLoggedIn') {
      var body = (document.body && document.body.innerText || '');
      if (/Kennung bzw\\. das Kennwort ist falsch|Kennwort ist falsch|Login failed/i.test(body)) {
        post({ ok: false, type: 'assertLoggedIn', error: 'bad_credentials', code: 'BAD_CREDENTIALS' });
        return true;
      }
      var kennung = q('input[name="Kennung"]') || q('input[placeholder*="Kennung"]');
      var kennwort = q('input[name="Kennwort"]') || q('input[type="password"]');
      // Do NOT use visible() here — GWT inputs often report offsetParent=null in WebView
      var stillLogin = !!kennung || (!!kennwort && /Anmelden/i.test(body));
      var picker = q('#ZeitdatenMonthPicker');
      post({
        ok: !stillLogin,
        type: 'assertLoggedIn',
        stillLogin: stillLogin,
        pickerFound: !!picker,
        error: stillLogin ? 'still_on_login' : undefined,
        code: stillLogin ? 'STILL_LOGIN' : undefined,
        sample: body.slice(0, 200),
        href: location.href,
        note: 'kennung=' + !!kennung + ',kennwort=' + !!kennwort
      });
      return true;
    }

    function findOeffnenControl() {
      // Prefer Zeiten/Kalendarium widget — never Private-Cloud "öffnen"
      function nearZeiten(el) {
        var p = el;
        for (var i = 0; i < 8 && p; i++) {
          var blob = ((p.innerText || '') + ' ' + (p.className || '')).slice(0, 400);
          if (/Private\\s*Cloud|Verdienstnachweis|personal-cloud/i.test(blob) && !/Zeiten|Kalendarium|Buchungen/i.test(blob)) {
            return false;
          }
          if (/\\bZeiten\\b|Kalendarium|Zeitdaten/i.test(blob)) return true;
          p = p.parentElement;
        }
        return null;
      }
      var buttons = qa('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"], button, a, [role="button"], div.LG-Button, span.LG-Button').filter(function(el) {
        var t = textOf(el);
        var aria = (el.getAttribute && (el.getAttribute('aria-label') || '')) || '';
        return (/^öffnen$/i.test(t) || /^öffnen$/i.test(aria)) && visible(el);
      });
      var preferred = buttons.find(function(el) { return nearZeiten(el) === true; });
      if (preferred) return preferred;
      return buttons.find(function(el) { return nearZeiten(el) !== false; }) || buttons[0] || null;
    }

    function findZeitenControl() {
      // Desktop does not use this — keep extremely narrow (Zeiten label only).
      return (
        qa('button, a, [role="button"], div, span, td, li, [data-uin]').find(function(el) {
          var t = textOf(el);
          return /^zeiten$/i.test(t) && visible(el) && t.length < 16;
        }) ||
        qa('a, button, div, span, [role="button"]').find(function(el) {
          var t = textOf(el);
          return /^zeitdaten$/i.test(t) && visible(el) && t.length < 20;
        }) ||
        null
      );
    }

    /** Only Abrechnung/wrong-export dialogs. Never inspect or navigate team UI. */
    function detectWrongExportDialog() {
      var body = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ');
      if (
        /keine\\s+(Abrechnungen?|Zeitprotokolle?)\\s+(verfügbar|gefunden|erstellt)/i.test(body) ||
        /Abrechnung(en)?\\s+.*(nicht|keine)\\s+verfügbar/i.test(body) ||
        /Es wurden keine Abrechnungen/i.test(body)
      ) {
        return { blocked: true, code: 'WRONG_EXPORT', sample: body.slice(0, 220) };
      }
      return { blocked: false, code: '', sample: body.slice(0, 120) };
    }

    function isBootSplash() {
      if (document.querySelector('[aria-busy="true"]')) return true;
      var busySel = [
        '[class*="loading" i]',
        '[class*="spinner" i]',
        '[class*="LoadingPanel"]',
        '[class*="splash" i]',
        '.gwt-PopupPanelGlass'
      ];
      for (var bi = 0; bi < busySel.length; bi++) {
        var nodes = document.querySelectorAll(busySel[bi]);
        for (var bj = 0; bj < nodes.length; bj++) {
          if (visible(nodes[bj])) return true;
        }
      }
      var raw = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim();
      // Classic LOGA3 boot: almost only "LOGA3" + loading tiles, no nav yet
      if (
        /^LOGA3\\b/i.test(raw) &&
        raw.length < 120 &&
        !findZeitenControl() &&
        !findOeffnenControl() &&
        !q('#ZeitdatenMonthPicker')
      ) {
        return true;
      }
      return false;
    }

    if (cmd.type === 'assertShellReady') {
      var body2 = (document.body && document.body.innerText || '');
      var kennung2 = q('input[name="Kennung"]') || q('input[placeholder*="Kennung"]');
      var kennwort2 = q('input[name="Kennwort"]') || q('input[type="password"]');
      var stillLogin2 = !!kennung2 || (!!kennwort2 && /Anmelden/i.test(body2));
      var splash = !stillLogin2 && isBootSplash();
      var zCtrl = findZeitenControl();
      var oCtrl = findOeffnenControl();
      var picker2 = q('#ZeitdatenMonthPicker');
      // Desktop: post-login shell shows "öffnen" long before a "Zeiten" tab exists.
      var ready = !stillLogin2 && !splash && (!!picker2 || !!oCtrl || !!zCtrl);
      var noteBits = [];
      if (picker2) noteBits.push('picker');
      if (oCtrl) noteBits.push('oeffnen');
      if (zCtrl) noteBits.push('zeiten:' + textOf(zCtrl).slice(0, 24));
      if (!noteBits.length) noteBits.push('no_entry');
      post({
        ok: ready,
        type: 'assertShellReady',
        stillLogin: stillLogin2,
        splash: splash,
        zeitenFound: !!zCtrl,
        oeffnenFound: !!oCtrl,
        pickerFound: !!picker2,
        error: stillLogin2
          ? 'still_on_login'
          : (splash ? 'shell_loading' : (ready ? undefined : 'shell_not_ready')),
        code: stillLogin2 ? 'STILL_LOGIN' : (splash ? 'SHELL_LOADING' : (ready ? undefined : 'SHELL_NOT_READY')),
        sample: body2.slice(0, 200),
        href: location.href,
        note: splash ? 'LOGA3 splash / loading' : noteBits.join(',')
      });
      return true;
    }

    if (cmd.type === 'probeReady') {
      var text = (document.body && document.body.innerText || '').slice(0, 800);
      var ps = getPickerState();
      var inputs = qa('input').slice(0, 12).map(function(el) {
        return {
          type: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          id: el.getAttribute('id') || '',
          placeholder: el.getAttribute('placeholder') || ''
        };
      });
      var iframes = Array.from(document.querySelectorAll('iframe')).slice(0, 8).map(function(f) {
        var accessible = false;
        try { accessible = !!(f.contentDocument && f.contentDocument.body); } catch (e) { accessible = false; }
        return { src: f.getAttribute('src') || '', name: f.getAttribute('name') || '', accessible: accessible };
      });
      post({
        ok: true,
        type: 'probeReady',
        href: location.href,
        hasZeitprotokoll: /Zeitprotokoll/i.test(text),
        sample: text.slice(0, 200),
        month: ps.month,
        year: ps.year,
        label: ps.label,
        note: JSON.stringify({ inputs: inputs, iframes: iframes, inputCount: qa('input').length })
      });
      return true;
    }

    if (cmd.type === 'getPickerState') {
      var st = getPickerState();
      post({ ok: true, type: 'getPickerState', month: st.month, year: st.year, label: st.label, pickerFound: st.found });
      return true;
    }

    if (cmd.type === 'clickOeffnen') {
      var oeffnen = findOeffnenControl();
      if (oeffnen) {
        oeffnen.click();
        post({ ok: true, type: 'clickOeffnen', note: textOf(oeffnen).slice(0, 40) || 'aria-öffnen' });
      } else {
        post({ ok: false, type: 'clickOeffnen', error: 'oeffnen_not_found', oeffnenFound: false });
      }
      return true;
    }

    if (cmd.type === 'clickZeiten') {
      if (isBootSplash()) {
        post({
          ok: false,
          type: 'clickZeiten',
          error: 'shell_still_loading',
          code: 'SHELL_LOADING',
          splash: true,
          sample: (document.body && document.body.innerText || '').slice(0, 240)
        });
        return true;
      }
      var z = findZeitenControl();
      if (z) { z.click(); post({ ok: true, type: 'clickZeiten', note: textOf(z).slice(0, 40) }); }
      else post({
        ok: false,
        type: 'clickZeiten',
        error: 'zeiten_not_found',
        zeitenFound: false,
        splash: isBootSplash(),
        sample: (document.body && document.body.innerText || '').slice(0, 240)
      });
      return true;
    }

    if (cmd.type === 'armCalendarReload') {
      var selectors = [
        '[data-uin="ic-zaxisrotation"]',
        '.RefreshWrapper[aria-label="Aktualisieren"]',
        '[aria-label="Aktualisieren"]',
        '.RefreshIcon'
      ];
      var clicked = false;
      for (var s = 0; s < selectors.length; s++) {
        var el = q(selectors[s]);
        if (el && visible(el)) { el.click(); clicked = true; break; }
      }
      post({ ok: clicked, type: 'armCalendarReload', error: clicked ? undefined : 'aktualisieren_not_found' });
      return true;
    }

    if (cmd.type === 'selectMonth') {
      selectMonthViaPopup(cmd.month, cmd.year).then(function(result) {
        post(Object.assign({ type: 'selectMonth', target: String(cmd.month).padStart(2,'0') + '/' + cmd.year }, result));
      }).catch(function(err) {
        post({ ok: false, type: 'selectMonth', error: String(err && err.message || err) });
      });
      return true;
    }

    if (cmd.type === 'getContentSignature') {
      post({ ok: true, type: 'getContentSignature', signature: getContentSignature(), pickerFound: getPickerState().found });
      return true;
    }

    if (cmd.type === 'verifyCalendarMonth') {
      var sig = getContentSignature();
      var picker = getPickerState();
      var mm = String(cmd.month).padStart(2, '0');
      var yearStr = String(cmd.year);
      var expectedWd = expectedFirstWeekdayCode(cmd.month, cmd.year);
      var expectedLast = expectedLastDay(cmd.month, cmd.year);
      var headerOk = picker.month === mm && picker.year === yearStr;
      var weekdayOk = sig.firstWeekday === expectedWd;
      var lastDayOk = !sig.lastDay || sig.lastDay === expectedLast;
      var ok = headerOk && !!sig.firstWeekday && weekdayOk && lastDayOk;
      var reason = !headerOk
        ? ('header ' + picker.month + '/' + picker.year + ' != ' + mm + '/' + yearStr)
        : (!sig.firstWeekday ? 'day01 missing' : (!weekdayOk ? ('day01=' + sig.firstWeekday + ' expected=' + expectedWd) : (!lastDayOk ? ('lastDay=' + sig.lastDay + ' expected=' + expectedLast) : undefined)));
      post({
        ok: ok,
        type: 'verifyCalendarMonth',
        signature: sig,
        month: picker.month,
        year: picker.year,
        reason: reason,
        error: ok ? undefined : (reason || 'content_invalid'),
        code: ok ? undefined : 'CONTENT_INVALID'
      });
      return true;
    }

    if (cmd.type === 'clickBerechnen') {
      var ber = qa('button, a, [role="button"], div.LG-Button, span').find(function(el) {
        return /^berechnen$/i.test(textOf(el)) && visible(el);
      });
      if (ber) { ber.click(); post({ ok: true, type: 'clickBerechnen' }); }
      else post({ ok: true, type: 'clickBerechnen', note: 'not_found' });
      return true;
    }

    if (cmd.type === 'getDialogAbrechnungsmonat') {
      var dialogs = []
        .concat(qa('.gwt-DialogBox'))
        .concat(qa('[class*="Dialog"]'))
        .concat(qa('.popupContent'));
      var texts = dialogs.filter(function(el) { return el && visible(el); }).map(function(el) {
        return ((el.innerText || '')).replace(/\\s+/g, ' ').trim();
      });
      var blob = texts.join(' \\n ');
      // Prefer dialogs that look like Zeitprotokoll (Herunterladen)
      var zpBlob = texts.filter(function(t) {
        return /Herunterladen|Abrechnungsmonat|Zeitprotokoll/i.test(t);
      }).join(' \\n ');
      if (zpBlob) blob = zpBlob;
      var labeled = blob.match(/Abrechnungsmonat\\s*[:\\-]?\\s*(\\d{1,2})\\s*[\\/.\\-]\\s*(\\d{4})/i)
        || blob.match(/Abrechnungsmonat\\s*[:\\-]?\\s*([A-Za-zÄÖÜäöüß]+)\\s+(\\d{4})/i);
      if (labeled) {
        post({ ok: true, type: 'getDialogAbrechnungsmonat', monthToken: labeled[1], dialogYear: labeled[2], dialogSource: 'dialog-label', sample: labeled[0] });
      } else if (blob && /Herunterladen/i.test(blob)) {
        // Dialog ready but no Abrechnungsmonat label — Desktop relies on content gate
        var generic = blob.match(/\\b(0?[1-9]|1[0-2])\\s*[\\/.\\-]\\s*(20\\d{2})\\b/);
        if (generic) {
          post({ ok: true, type: 'getDialogAbrechnungsmonat', monthToken: generic[1], dialogYear: generic[2], dialogSource: 'dialog-generic', sample: generic[0] });
        } else {
          post({ ok: true, type: 'getDialogAbrechnungsmonat', monthToken: null, dialogYear: null, dialogSource: 'dialog-missing', sample: blob.slice(0, 300) });
        }
      } else {
        // Do NOT scan whole body for MM/YYYY — calendar dates false-positive and block download
        post({ ok: true, type: 'getDialogAbrechnungsmonat', monthToken: null, dialogYear: null, dialogSource: 'dialog-missing', sample: (blob || '').slice(0, 300) });
      }
      return true;
    }

    if (cmd.type === 'isZeitprotokollDialogVisible') {
      var badDlg = detectWrongExportDialog();
      if (badDlg.blocked) {
        post({
          ok: false,
          type: 'isZeitprotokollDialogVisible',
          dialogVisible: false,
          code: badDlg.code,
          error: badDlg.code,
          note: 'blocked',
          sample: badDlg.sample
        });
        return true;
      }
      var herunter = qa('button, a, [role="button"], span.PrimaryButton, span, div, input').some(function(el) {
        return /^Herunterladen$/i.test(textOf(el).trim()) && visible(el) && textOf(el).length < 40;
      });
      var visibleDlg = qa('.gwt-DialogBox, [class*="Dialog"], .popupContent').some(function(el) {
        if (!visible(el)) return false;
        var t = textOf(el);
        return /Herunterladen|Zeitprotokoll|Abrechnungsmonat/i.test(t) && !/keine\\s+Abrechnung/i.test(t);
      });
      if (!visibleDlg) visibleDlg = herunter;
      post({
        ok: true,
        type: 'isZeitprotokollDialogVisible',
        dialogVisible: !!visibleDlg,
        note: herunter ? 'herunterladen' : (visibleDlg ? 'dialog' : 'none')
      });
      return true;
    }

    if (cmd.type === 'assertHasPlan') {
      var sigPlan = getContentSignature();
      var plan = (sigPlan.ranges && sigPlan.ranges.length > 0)
        || (sigPlan.geKo && sigPlan.geKo.length > 0)
        || (sigPlan.schichtfrei > 0);
      post({
        ok: plan,
        type: 'assertHasPlan',
        hasPlan: plan,
        signature: sigPlan,
        code: plan ? undefined : 'NO_PLAN',
        error: plan ? undefined : 'NO_PLAN',
        month: getPickerState().month,
        year: getPickerState().year
      });
      return true;
    }

    if (cmd.type === 'dumpLiveSelectors') {
      function brief(el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          uin: el.getAttribute('data-uin') || '',
          aria: el.getAttribute('aria-label') || '',
          title: el.getAttribute('title') || '',
          cls: String(el.className || '').slice(0, 80),
          text: textOf(el).replace(/\\s+/g, ' ').trim().slice(0, 80),
          vis: visible(el),
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height)
        };
      }
      var uins = [];
      qa('[data-uin]').forEach(function(el) {
        if (!visible(el)) return;
        var u = el.getAttribute('data-uin') || '';
        if (!u) return;
        uins.push(brief(el));
      });
      var smart = qa('div.LGSmartThingContentItem, div.MenuItem').map(brief).filter(function(x) {
        return x && x.vis;
      });
      var oeffnen = qa('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"]').map(brief);
      var titles = [];
      qa('div, span, h1, h2, label').forEach(function(el) {
        var t = textOf(el).replace(/\\s+/g, ' ').trim();
        if (!t || t.length > 60 || !visible(el)) return;
        if (/Zeitdaten|öffnen|Export|Zeitprotokoll|Abrechnung|Herunterladen|Buchungen/i.test(t)) {
          titles.push(brief(el));
        }
      });
      var body = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim();
      var payload = {
        href: String(location.href || ''),
        title: document.title || '',
        picker: !!q('#ZeitdatenMonthPicker'),
        mask: !!q('[data-uin="mask-LZWZEITD"]'),
        oeffnenCount: oeffnen.length,
        oeffnen: oeffnen.slice(0, 10),
        smart: smart.slice(0, 40),
        titles: titles.slice(0, 40),
        uins: uins.slice(0, 80),
        bodySample: body.slice(0, 500),
        zpHint: /Zeitprotokoll/i.test(body)
      };
      var json = JSON.stringify(payload);
      try { console.log('LOGA3_LIVE_SELECTORS ' + json); } catch (e) {}
      post({
        ok: true,
        type: 'dumpLiveSelectors',
        note: 'uins=' + uins.length + ' smart=' + smart.length + ' titles=' + titles.length,
        sample: json.slice(0, 12000),
        pickerFound: payload.picker,
        maskFound: payload.mask,
        oeffnenFound: oeffnen.length > 0
      });
      return true;
    }

    if (cmd.type === 'assertExportContext') {
      var bad = detectWrongExportDialog();
      var mask = q('[data-uin="mask-LZWZEITD"]');
      var picker = q('#ZeitdatenMonthPicker');
      var exportPanel = q('div.MenuItem[data-uin="smartthing-cat-exports"]') ||
        q('div.MenuItem.selected[data-uin="smartthing-cat-exports"]');
      var lags = q('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
      // Ready = month picker present. Never navigate/inspect team UI.
      var ok = !!picker && !bad.blocked;
      if (picker) {
        try { picker.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {}
      }
      post({
        ok: ok,
        type: 'assertExportContext',
        maskFound: !!(mask && visible(mask)),
        pickerFound: !!(picker && visible(picker)),
        exportPanel: !!(exportPanel && visible(exportPanel)),
        lagsdzpg: !!(lags && visible(lags)),
        code: bad.blocked ? bad.code : (picker ? undefined : 'PICKER_MISSING'),
        error: bad.blocked ? bad.code : (picker ? undefined : 'PICKER_MISSING'),
        sample: bad.sample,
        note: [
          picker ? 'picker' : 'no_picker',
          mask && visible(mask) ? 'mask' : 'no_mask',
          bad.blocked ? bad.code : 'ctx_ok'
        ].join(',')
      });
      return true;
    }

    if (cmd.type === 'clickSmartEdin') {
      var icon = q('span.LG-Icon.ic-smartedingeborder[data-uin="ic-smartedingeborder"]') ||
        q('[data-uin="ic-smartedingeborder"]');
      if (icon && visible(icon)) {
        try { icon.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
        icon.click();
        var panel = q('div.MenuItem[data-uin="smartthing-cat-exports"]') ||
          q('div.MenuItem.selected[data-uin="smartthing-cat-exports"]');
        post({
          ok: true,
          type: 'clickSmartEdin',
          exportPanel: !!(panel && visible(panel)),
          note: panel && visible(panel) ? 'export_panel' : 'clicked_wait_panel'
        });
      } else post({ ok: false, type: 'clickSmartEdin', error: 'smartedin_not_found' });
      return true;
    }

    if (cmd.type === 'clickExport') {
      // Desktop: UIN first — text "Export" only as last resort
      var exportBtn =
        q('div.MenuItem[data-uin="smartthing-cat-exports"]') ||
        q('div.MenuItem.selected[data-uin="smartthing-cat-exports"]');
      if (!exportBtn || !visible(exportBtn)) {
        exportBtn = qa('div.MenuItem').find(function(el) {
          return /^Export$/i.test(textOf(el)) && visible(el);
        }) || null;
      }
      if (exportBtn && visible(exportBtn)) {
        try { exportBtn.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
        exportBtn.click();
        var zpReady = q('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
        var ready = !!(zpReady && visible(zpReady));
        post({
          ok: true,
          type: 'clickExport',
          lagsdzpg: ready,
          exportPanel: true,
          note: ready ? 'lagsdzpg_visible' : 'export_clicked'
        });
      } else post({ ok: false, type: 'clickExport', error: 'export_not_found', exportPanel: false });
      return true;
    }

    if (cmd.type === 'armPdfCapture') {
      try {
        function armWin(w) {
          try { if (w && w.__loga3ArmPdfCapture) w.__loga3ArmPdfCapture(cmd.ms || 180000); } catch (e) {}
          try {
            var ifr = w.document && w.document.querySelectorAll('iframe');
            if (!ifr) return;
            for (var i = 0; i < ifr.length; i++) {
              try { if (ifr[i].contentWindow) armWin(ifr[i].contentWindow); } catch (e) {}
            }
          } catch (e) {}
        }
        armWin(window);
        post({ ok: true, type: 'armPdfCapture', note: String(cmd.ms || 180000) });
      } catch (e) {
        post({ ok: false, type: 'armPdfCapture', error: String(e && e.message || e) });
      }
      return true;
    }

    if (cmd.type === 'probeDialog') {
      var boxes = qa('.gwt-DialogBox, [class*="Dialog"], .popupContent').filter(function(el) { return visible(el); });
      var herunter = qa('button, a, [role="button"], span, div').filter(function(el) {
        return /herunterladen/i.test(textOf(el)) && visible(el);
      });
      var zp = q('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
      var body = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ');
      post({
        ok: true,
        type: 'probeDialog',
        dialogVisible: boxes.length > 0 || herunter.length > 0,
        note: 'boxes=' + boxes.length + ' herunter=' + herunter.length + ' zp=' + (zp && visible(zp) ? '1' : '0'),
        sample: body.slice(0, 280)
      });
      return true;
    }

    if (cmd.type === 'openZeitprotokoll') {
      var badZp = detectWrongExportDialog();
      if (badZp.blocked) {
        post({
          ok: false,
          type: 'openZeitprotokoll',
          error: badZp.code,
          code: badZp.code,
          sample: badZp.sample
        });
        return true;
      }
      // Desktop: only smartthing-LAGSDZPG (+ exact label on same widget class)
      var zp = q('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]');
      if (!zp || !visible(zp)) {
        zp = qa('div.LGSmartThingContentItem').find(function(el) {
          return /^Zeitprotokoll\\s*generieren$/i.test(textOf(el).replace(/\\s+/g, ' ').trim()) && visible(el);
        }) || null;
      }
      if (!zp) {
        post({
          ok: false,
          type: 'openZeitprotokoll',
          error: 'button_not_found',
          sample: (document.body && document.body.innerText || '').slice(0, 240),
          note: q('[data-uin="smartthing-cat-exports"]') ? 'export_present' : 'export_missing',
          lagsdzpg: false
        });
        return true;
      }
      try { zp.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
      var clickTarget = zp.querySelector('.gwt-Label, .LG-Label, span, a, div') || zp;
      // Desktop: click, wait 1s, then click-and-hold ~1s — NO Enter spam (hits wrong widgets)
      try { clickTarget.click(); } catch (e) { try { zp.click(); } catch (e2) {} }
      waitMs(1000).then(function() {
        var r = zp.getBoundingClientRect();
        var cx = Math.floor(r.left + r.width / 2);
        var cy = Math.floor(r.top + r.height / 2);
        var down = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
        var up = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 0 };
        try { clickTarget.dispatchEvent(new MouseEvent('mousedown', down)); } catch (e) {}
        return waitMs(1100).then(function() {
          try { clickTarget.dispatchEvent(new MouseEvent('mouseup', up)); } catch (e) {}
          try { clickTarget.click(); } catch (e) { try { zp.click(); } catch (e2) {} }
          post({
            ok: true,
            type: 'openZeitprotokoll',
            lagsdzpg: true,
            note: 'hold:' + textOf(zp).slice(0, 40) + ' @' + cx + ',' + cy,
            href: zp.getAttribute('data-uin') || ''
          });
        });
      }).catch(function(err) {
        post({ ok: false, type: 'openZeitprotokoll', error: String(err && err.message || err) });
      });
      return true;
    }

    if (cmd.type === 'scrapePdfViewer') {
      var notes = [];
      function scrapeWin(w, depth) {
        if (!w || depth > 6) return;
        try {
          if (w.__loga3ScrapePdfViewer) {
            w.__loga3ScrapePdfViewer();
            notes.push('hook');
          }
        } catch (e) {}
        try {
          var app = w.PDFViewerApplication;
          if (app && app.pdfDocument && typeof app.pdfDocument.getData === 'function') {
            notes.push('pdfjs');
            app.pdfDocument.getData().then(function(u8) {
              try {
                var raw = u8 && u8.buffer ? new Uint8Array(u8.buffer || u8) : new Uint8Array(u8);
                var blob = new Blob([raw], { type: 'application/pdf' });
                var reader = new FileReader();
                reader.onloadend = function() {
                  var result = String(reader.result || '');
                  var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
                  if (base64 && base64.length >= 32) {
                    post({
                      ok: true,
                      type: 'pdfBlob',
                      base64: base64,
                      mime: 'application/pdf',
                      size: raw.length || 0,
                      filename: 'pdfjs-viewer.pdf',
                      note: 'scrapePdfViewer'
                    });
                  }
                };
                reader.readAsDataURL(blob);
              } catch (err) {}
            }).catch(function() {});
          }
        } catch (e) {}
        try {
          var nodes = w.document ? w.document.querySelectorAll('embed, object, iframe') : [];
          for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var src = el.src || el.getAttribute('src') || el.getAttribute('data') || '';
            if (src && (src.indexOf('blob:') === 0 || /pdf/i.test(src))) {
              notes.push('embed');
              try {
                w.fetch(src, { credentials: 'include' }).then(function(r) { return r.blob(); }).then(function(b) {
                  var reader = new FileReader();
                  reader.onloadend = function() {
                    var result = String(reader.result || '');
                    var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
                    if (base64 && base64.length >= 32 && base64.indexOf('JVBERi') === 0) {
                      post({
                        ok: true,
                        type: 'pdfBlob',
                        base64: base64,
                        mime: 'application/pdf',
                        size: b.size || 0,
                        filename: 'embed.pdf',
                        note: 'scrape-embed'
                      });
                    }
                  };
                  reader.readAsDataURL(b);
                }).catch(function() {});
              } catch (e2) {}
            }
            try { if (el.contentWindow) scrapeWin(el.contentWindow, depth + 1); } catch (e3) {}
          }
        } catch (e) {}
        try {
          var entries = w.performance && w.performance.getEntriesByType
            ? w.performance.getEntriesByType('resource') : [];
          for (var j = 0; j < entries.length; j++) {
            var n = entries[j].name || '';
            if (!/^https?:/i.test(n)) continue;
            if (!/pdf|zeitprotokoll|export|download|servlet|stream|attachment|report/i.test(n)) continue;
            notes.push('res');
            try {
              w.fetch(n, { credentials: 'include' }).then(function(r) { return r.blob(); }).then(function(b) {
                var reader = new FileReader();
                reader.onloadend = function() {
                  var result = String(reader.result || '');
                  var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
                  if (base64 && base64.length >= 32 && base64.indexOf('JVBERi') === 0) {
                    post({
                      ok: true,
                      type: 'pdfBlob',
                      base64: base64,
                      mime: 'application/pdf',
                      size: b.size || 0,
                      filename: 'perf-resource.pdf',
                      note: 'scrape-perf'
                    });
                  }
                };
                reader.readAsDataURL(b);
              }).catch(function() {});
            } catch (e4) {}
          }
        } catch (e) {}
      }
      scrapeWin(window, 0);
      post({
        ok: true,
        type: 'scrapePdfViewer',
        note: notes.length ? notes.slice(0, 8).join(',') : 'no_viewer_yet',
        sample: (document.title || '') + ' | ' + String(location.href || '').slice(0, 120)
      });
      return true;
    }

    if (cmd.type === 'clickDownload') {
      // Arm capture in this frame + same-origin iframes (Android has no onFileDownload)
      try {
        function armWin(w) {
          try { if (w && w.__loga3ArmPdfCapture) w.__loga3ArmPdfCapture(120000); } catch (e) {}
          try { if (w && w.__loga3ScrapePdfViewer) w.__loga3ScrapePdfViewer(); } catch (e) {}
          try {
            var ifr = w.document && w.document.querySelectorAll('iframe');
            if (!ifr) return;
            for (var i = 0; i < ifr.length; i++) {
              try { if (ifr[i].contentWindow) armWin(ifr[i].contentWindow); } catch (e) {}
            }
          } catch (e) {}
        }
        armWin(window);
      } catch (e) {}
      var dl = qa('button, a, [role="button"], span.PrimaryButton, span').find(function(el) {
        // Desktop: exact "Herunterladen" only — never pdf/speichern/download wildcards
        var t = textOf(el).replace(/\\s+/g, ' ').trim();
        var aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').trim();
        return (/^Herunterladen$/i.test(t) || /^Herunterladen$/i.test(aria)) && visible(el) && t.length < 40;
      });
      if (dl) {
        // Prefer direct href capture over native DownloadManager
        try {
          var href = dl.getAttribute && (dl.getAttribute('href') || '');
          if (href && (href.indexOf('blob:') === 0 || /\\.pdf($|\\?)/i.test(href) || /^https?:/i.test(href))) {
            if (window.__loga3ArmPdfCapture) { /* already armed */ }
            fetch(href, { credentials: 'include' }).then(function(r) { return r.blob(); }).then(function(b) {
              // PDF_CAPTURE_INJECT emit via createObjectURL path — also post via FileReader here
              var reader = new FileReader();
              reader.onloadend = function() {
                var result = String(reader.result || '');
                var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
                if (base64 && base64.length >= 32) {
                  post({ ok: true, type: 'pdfBlob', base64: base64, mime: b.type || 'application/pdf', size: b.size || 0, filename: href, note: 'href-fetch' });
                }
              };
              reader.readAsDataURL(b);
            }).catch(function() {});
          }
        } catch (e) {}
        dl.click();
        post({ ok: true, type: 'clickDownload', note: textOf(dl).slice(0, 40) });
      } else post({
        ok: false,
        type: 'clickDownload',
        error: 'download_not_found',
        sample: (document.body && document.body.innerText || '').slice(0, 240)
      });
      return true;
    }

    if (cmd.type === 'closeDialog') {
      var close =
        q('[data-uin="ic-delete"][aria-label="Schließen"]') ||
        q('[aria-label="Schließen"].ic-delete') ||
        q('[title="Schließen"]') ||
        qa('button, [role="button"], span').find(function(el) {
          return /^Schließen$/i.test(textOf(el)) && visible(el);
        });
      if (close) { close.click(); post({ ok: true, type: 'closeDialog' }); }
      else post({ ok: false, type: 'closeDialog', error: 'close_not_found' });
      return true;
    }

    if (cmd.type === 'closePopups') {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      } catch (e) {}
      // Click glass if present
      var glass = q('.gwt-PopupPanelGlass, .popupContent ~ .gwt-PopupPanelGlass');
      if (glass && visible(glass)) { try { glass.click(); } catch (e) {} }
      post({ ok: true, type: 'closePopups' });
      return true;
    }

    post({ ok: false, error: 'unknown_command', type: cmd.type });
  } catch (err) {
    post({ ok: false, error: String(err && err.message || err), type: cmd.type });
  }
  return true;
})();
true;
`;
}
