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
      // Candidate only — NEVER post ok:true without %PDF magic (Login-HTML is ~19KB).
      var looksCandidate = force
        || headerLooksPdf(type, name)
        || (armed() && blob.size > 500);
      if (!looksCandidate) return;
      try {
        var slice = blob.slice(0, 8);
        var fr = new FileReader();
        fr.onloadend = function() {
          var u8 = fr.result ? new Uint8Array(fr.result) : null;
          if (!bytesLookPdf(u8)) {
            post({
              ok: false,
              type: 'pdfBlob',
              error: 'not_pdf_magic',
              note: (type || name || '').slice(0, 60),
              size: blob.size || 0
            });
            return;
          }
          var reader = new FileReader();
          reader.onloadend = function() {
            var result = String(reader.result || '');
            var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
            if (!base64 || base64.length < 32 || base64.indexOf('JVBERi') !== 0) {
              post({ ok: false, type: 'pdfBlob', error: 'not_pdf_b64', size: blob.size || 0 });
              return;
            }
            post({
              ok: true,
              type: 'pdfBlob',
              base64: base64,
              mime: 'application/pdf',
              size: blob.size || 0,
              filename: name,
              note: 'frame-capture'
            });
          };
          reader.onerror = function() {
            post({ ok: false, type: 'pdfBlob', error: 'filereader_failed' });
          };
          reader.readAsDataURL(blob);
        };
        fr.onerror = function() {
          post({ ok: false, type: 'pdfBlob', error: 'magic_read_failed' });
        };
        fr.readAsArrayBuffer(slice);
      } catch (e) {
        post({ ok: false, type: 'pdfBlob', error: String(e && e.message || e) });
      }
    }
    function emitArrayBuffer(buf, filename, mime, force) {
      try {
        var u8 = new Uint8Array(buf);
        if (!bytesLookPdf(u8)) {
          post({
            ok: false,
            type: 'pdfBlob',
            error: 'not_pdf_magic',
            note: String(filename || '').slice(0, 80),
            size: u8.length || 0
          });
          return;
        }
        emitBlob(new Blob([buf], { type: 'application/pdf' }), filename || '', true);
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
            return res.arrayBuffer().then(function(buf) {
              var ct = (res.headers && res.headers.get('content-type') || '').toLowerCase();
              return { buf: buf, ct: ct };
            });
          })
          .then(function(o) {
            var u8 = new Uint8Array(o.buf);
            if (!bytesLookPdf(u8)) {
              post({
                ok: false,
                type: 'pdfBlob',
                error: 'capture_url_not_pdf',
                note: (o.ct || '').slice(0, 40),
                size: u8.length || 0
              });
              return;
            }
            emitArrayBuffer(o.buf, filename || url, 'application/pdf', true);
          })
          .catch(function(e) {
            post({ ok: false, type: 'pdfBlob', error: 'capture_url:' + String(e && e.message || e) });
          });
      } catch (e) {
        post({ ok: false, type: 'pdfBlob', error: 'capture_url_throw:' + String(e && e.message || e) });
      }
    }
    // Click/open: only blob / data-pdf / *.pdf — never preventDefault on GWT servlets
    // (that blocked LOGA3 download JS and left DownloadManager with Login-HTML).
    function shouldInterceptUrl(url) {
      if (!url) return false;
      var u = String(url);
      if (u.indexOf('blob:') === 0 || u.indexOf('data:application/pdf') === 0) return true;
      if (/\\.pdf($|\\?)/i.test(u)) return true;
      return false;
    }
    function shouldCaptureNavUrl(url) {
      if (!url || !armed()) return false;
      var u = String(url);
      if (shouldInterceptUrl(u)) return true;
      return /^https?:/i.test(u)
        && /export|download|zeitprotokoll|report|pdf|stream|servlet|generat|attachment|print/i.test(u);
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
            // emitBlob/emitArrayBuffer enforce %PDF — HTML login never resolves waiters
            if (xhr.responseType === 'blob' && xhr.response) emitBlob(xhr.response, _url, true);
            else if (xhr.responseType === 'arraybuffer' && xhr.response) emitArrayBuffer(xhr.response, _url, ct, true);
            else if (!xhr.responseType || xhr.responseType === '' || xhr.responseType === 'text') {
              var t = xhr.responseText || '';
              if (t.indexOf('%PDF') === 0) {
                var arr = new Uint8Array(t.length);
                for (var i = 0; i < t.length; i++) arr[i] = t.charCodeAt(i) & 0xff;
                emitArrayBuffer(arr.slice().buffer, _url, ct || 'application/pdf', true);
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
              res.clone().arrayBuffer().then(function(buf) {
                emitArrayBuffer(buf, url, ct || 'application/pdf', true);
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
        if (shouldCaptureNavUrl(url)) {
          post({ ok: true, type: 'pdfCaptureProbe', note: 'open:' + String(url).slice(0, 140) });
          win.fetch(String(url), { credentials: 'include', redirect: 'follow' })
            .then(function(res) { return res.arrayBuffer(); })
            .then(function(buf) {
              var u8 = new Uint8Array(buf);
              if (bytesLookPdf(u8)) {
                emitArrayBuffer(buf, String(url), 'application/pdf', true);
                return;
              }
              origOpen.apply(win, [url]);
            })
            .catch(function() { origOpen.apply(win, [url]); });
          return null;
        }
        return origOpen.apply(win, arguments);
      };
    } catch (e) {}
    // location.assign / replace — when armed, fetch with cookies first (DownloadManager has none)
    try {
      var loc = win.location;
      var origAssign = loc.assign.bind(loc);
      var origReplace = loc.replace.bind(loc);
      function maybeCaptureNav(url, fallback) {
        if (!shouldCaptureNavUrl(url) || !/^https?:/i.test(String(url))) {
          return fallback(url);
        }
        post({ ok: true, type: 'pdfCaptureProbe', note: 'nav:' + String(url).slice(0, 140) });
        win.fetch(String(url), { credentials: 'include', redirect: 'follow' })
          .then(function(res) { return res.arrayBuffer(); })
          .then(function(buf) {
            var u8 = new Uint8Array(buf);
            if (bytesLookPdf(u8)) {
              emitArrayBuffer(buf, String(url), 'application/pdf', true);
              return;
            }
            // HTML/login → still navigate (viewer may work); never emit fake PDF
            post({ ok: false, type: 'pdfBlob', error: 'nav_not_pdf', size: u8.length || 0 });
            fallback(url);
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
            if (shouldCaptureNavUrl(v) && /^https?:/i.test(String(v))) {
              post({ ok: true, type: 'pdfCaptureProbe', note: 'iframe:' + String(v).slice(0, 140) });
              win.fetch(String(v), { credentials: 'include', redirect: 'follow' })
                .then(function(res) { return res.arrayBuffer(); })
                .then(function(buf) {
                  var u8 = new Uint8Array(buf);
                  if (bytesLookPdf(u8)) {
                    emitArrayBuffer(buf, String(v), 'application/pdf', true);
                    return;
                  }
                  desc.set.call(self, v);
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
    win.__loga3CaptureUrl = captureUrl;
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

