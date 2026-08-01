/**
 * Login, shell, PDF download/close commands.
 * In-page JS fragment for buildAutomationScript (not executed in RN).
 */
export const AUTOMATION_HANDLERS_CORE = `
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
        __p = '';
        try { cmd.password = ''; } catch (e) {}
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
      setNative(pass, __p);
      __p = '';
      try { cmd.password = ''; } catch (e) {}
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
                  if (base64 && base64.length >= 32 && base64.indexOf('JVBERi') === 0) {
                    post({
                      ok: true,
                      type: 'pdfBlob',
                      base64: base64,
                      mime: 'application/pdf',
                      size: raw.length || 0,
                      filename: 'pdfjs-viewer.pdf',
                      note: 'scrapePdfViewer'
                    });
                  } else {
                    post({ ok: false, type: 'pdfBlob', error: 'pdfjs_not_pdf' });
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
                // Only real %PDF — never Login-HTML saved as .pdf
                if (base64 && base64.length >= 32 && base64.indexOf('JVBERi') === 0) {
                  post({ ok: true, type: 'pdfBlob', base64: base64, mime: b.type || 'application/pdf', size: b.size || 0, filename: href, note: 'href-fetch' });
                } else {
                  post({ ok: false, type: 'pdfBlob', error: 'href_not_pdf', note: String((b && b.type) || '').slice(0, 40) });
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

    if (cmd.type === 'leavePdfViewer') {
      try {
        var inPdf =
          !!(window.PDFViewerApplication) ||
          !!q('embed[type="application/pdf"], object[type="application/pdf"]') ||
          /\\.pdf($|\\?)/i.test(String(location.href || '')) ||
          /^blob:/i.test(String(location.href || '')) ||
          /pdfjs|chrome-extension:\\/\\/|mime=application\\/pdf/i.test(String(location.href || ''));
        if (inPdf && history.length > 1) {
          history.back();
          post({ ok: true, type: 'leavePdfViewer', note: 'history.back' });
        } else {
          post({ ok: true, type: 'leavePdfViewer', note: inPdf ? 'no_history' : 'not_in_viewer' });
        }
      } catch (e) {
        post({ ok: false, type: 'leavePdfViewer', error: String(e && e.message || e) });
      }
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

`;
