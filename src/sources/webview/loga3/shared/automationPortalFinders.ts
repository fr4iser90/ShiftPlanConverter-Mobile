/**
 * Portal finders (öffnen Zeiten vs Verdienst, splash, wrong-export) — before command handlers.
 * In-page JS fragment for buildAutomationScript (not executed in RN).
 */
export const AUTOMATION_PORTAL_FINDERS = `
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

    function findVerdienstOeffnenControl() {
      // Strict: öffnen inside .personal-cloud — never Zeiten
      var inCloud = qa('.personal-cloud div.LG-Button[aria-label="öffnen"], .personal-cloud-container div.LG-Button[aria-label="öffnen"], .personal-cloud div.LG-Button[aria-label="Öffnen"]').find(function(el) {
        return visible(el);
      });
      if (inCloud) return inCloud;
      function nearVerdienst(el) {
        var p = el;
        for (var i = 0; i < 8 && p; i++) {
          var blob = ((p.innerText || '') + ' ' + (p.className || '')).slice(0, 500);
          if (/\\bZeiten\\b|Kalendarium|Zeitdaten|Buchungen/i.test(blob) && !/Private\\s*Cloud|Verdienstnachweis|personal-cloud|Gehalts/i.test(blob)) {
            return false;
          }
          if (/Private\\s*Cloud|Verdienstnachweis|personal-cloud|Verdienstabrechnung|Gehaltsabrechnung|\\.personal-cloud/i.test(blob)) return true;
          p = p.parentElement;
        }
        return null;
      }
      var buttons = qa('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"], button, a, [role="button"], div.LG-Button, span.LG-Button').filter(function(el) {
        var t = textOf(el);
        var aria = (el.getAttribute && (el.getAttribute('aria-label') || '')) || '';
        return (/^öffnen$/i.test(t) || /^öffnen$/i.test(aria)) && visible(el);
      });
      return buttons.find(function(el) { return nearVerdienst(el) === true; }) || null;
    }

    function findGenerierteDokumenteControl() {
      var byId = q('[data-id="LMAGEDOK"]');
      if (byId) return byId;
      return qa('[aria-label="Generierte Dokumente"], .LGAppToolbarIcon.money').find(function(el) {
        var id = (el.getAttribute && el.getAttribute('data-id')) || '';
        if (id === 'LMAMYDOK') return false;
        return true;
      }) || null;
    }

    function findCloudDirectory(labelExact) {
      var want = String(labelExact || '').trim();
      if (!want) return null;
      return qa('.MyCloudDirectoryWidget').find(function(el) {
        var aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').trim();
        if (aria === want) return true;
        var titleEl = el.querySelector && el.querySelector('.Info .Title, .Title');
        var title = textOf(titleEl || null);
        if (title === want) return true;
        // Loose: aria/title starts with label (truncation) or contains exact month+year
        if (aria.indexOf(want) === 0 || title.indexOf(want) === 0) return true;
        return false;
      }) || null;
    }

    function listCloudDirectoryLabels(limit) {
      var lim = limit || 24;
      var out = [];
      qa('.MyCloudDirectoryWidget').forEach(function(el) {
        if (out.length >= lim) return;
        var aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').trim();
        var titleEl = el.querySelector && el.querySelector('.Info .Title, .Title');
        var title = textOf(titleEl || null);
        out.push(aria || title || '?');
      });
      return out;
    }

    function findVerdienstFileWidget() {
      return qa('.MyCloudFileWidget').find(function(el) {
        var aria = ((el.getAttribute && el.getAttribute('aria-label')) || '').trim();
        var titleEl = el.querySelector && el.querySelector('.Info .Title, .Title');
        var title = textOf(titleEl || null);
        var blob = aria + ' ' + title;
        return /Verdienstnachweis\\.pdf/i.test(blob) || /01\\s*Verdienstnachweis/i.test(blob);
      }) || null;
    }

    function findVerdienstBackControl() {
      return findCloudDirectory('Zurück');
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

`;
