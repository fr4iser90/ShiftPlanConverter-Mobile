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
      // Prefer Private-Cloud / Verdienstnachweis widget — never Zeiten
      function nearVerdienst(el) {
        var p = el;
        for (var i = 0; i < 8 && p; i++) {
          var blob = ((p.innerText || '') + ' ' + (p.className || '')).slice(0, 500);
          if (/\\bZeiten\\b|Kalendarium|Zeitdaten|Buchungen/i.test(blob) && !/Private\\s*Cloud|Verdienstnachweis|personal-cloud|Gehalts/i.test(blob)) {
            return false;
          }
          if (/Private\\s*Cloud|Verdienstnachweis|personal-cloud|Verdienstabrechnung|Gehaltsabrechnung/i.test(blob)) return true;
          p = p.parentElement;
        }
        return null;
      }
      var buttons = qa('div.LG-Button[aria-label="öffnen"], div.LG-Button[aria-label="Öffnen"], button, a, [role="button"], div.LG-Button, span.LG-Button').filter(function(el) {
        var t = textOf(el);
        var aria = (el.getAttribute && (el.getAttribute('aria-label') || '')) || '';
        return (/^öffnen$/i.test(t) || /^öffnen$/i.test(aria)) && visible(el);
      });
      var preferred = buttons.find(function(el) { return nearVerdienst(el) === true; });
      if (preferred) return preferred;
      // Also accept a tile titled Verdienstnachweis itself
      var tile = qa('div, span, a, button, [role="button"]').find(function(el) {
        var t = textOf(el);
        return /Verdienstnachweis|Private\\s*Cloud|personal-cloud/i.test(t) && visible(el) && t.length < 48;
      });
      if (tile) return tile;
      return null;
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
