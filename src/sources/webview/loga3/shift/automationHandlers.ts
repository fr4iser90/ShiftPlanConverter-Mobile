/**
 * Zeiten / Zeitdaten / SmartEdin / Zeitprotokoll commands.
 * In-page JS fragment for buildAutomationScript (not executed in RN).
 */
export const AUTOMATION_HANDLERS_SHIFT = `
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
      // Sidebar control — often CSS-hidden on phone (Mein-Team slab). Desktop uses force:true.
      // Arming only: after this, chrome month-arrows reload the day-grid.
      var selectors = [
        '[data-uin="ic-zaxisrotation"]',
        '.RefreshWrapper[aria-label="Aktualisieren"]',
        '[aria-label="Aktualisieren"]',
        '.RefreshIcon'
      ];
      var clicked = false;
      var note = '';
      for (var s = 0; s < selectors.length; s++) {
        var nodes = qa(selectors[s]);
        for (var n = 0; n < nodes.length; n++) {
          var el = nodes[n];
          if (!el) continue;
          try {
            el.click();
            clicked = true;
            note = selectors[s];
            break;
          } catch (e) {}
        }
        if (clicked) break;
      }
      post({
        ok: clicked,
        type: 'armCalendarReload',
        note: clicked ? note : undefined,
        error: clicked ? undefined : 'arm_reload_control_not_found'
      });
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

`;
