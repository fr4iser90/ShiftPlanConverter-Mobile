/**
 * Shared DOM helpers (q/qa/visible/textOf/…) for LOGA3 inject.
 * In-page JS fragment for buildAutomationScript (not executed in RN).
 */
export const AUTOMATION_DOM_HELPERS = `
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
  /**
   * Chrome arrows next to #ZeitdatenMonthPicker.
   * After armCalendarReload, these reload the day-grid (popup only flips the title).
   */
  function walkToMonthViaArrows(month, year) {
    var mm = String(month).padStart(2, '0');
    var yearStr = String(year);
    var targetNum = Number(yearStr) * 12 + month;
    var deadline = Date.now() + 14000;
    function step() {
      var state = getPickerState();
      if (state.month === mm && state.year === yearStr) {
        return Promise.resolve({
          ok: true, selected: true, month: state.month, year: state.year, label: state.label, note: 'chrome_arrows'
        });
      }
      if (Date.now() >= deadline || !state.month || !state.year) {
        return Promise.resolve({
          ok: false, selected: false, month: state.month, year: state.year, label: state.label, error: 'select_month_failed'
        });
      }
      var curNum = Number(state.year) * 12 + Number(state.month);
      var dir = curNum > targetNum ? 'back' : 'forward';
      if (!clickArrowNearPicker(dir)) {
        return Promise.resolve({
          ok: false, selected: false, month: state.month, year: state.year, label: state.label, error: 'month_arrows_not_found'
        });
      }
      return waitMs(400).then(step);
    }
    return step();
  }
  function selectMonthViaPopup(month, year) {
    var monthLabel = MONTH_LABELS[month - 1];
    var mm = String(month).padStart(2, '0');
    var yearStr = String(year);
    var already = getPickerState();
    // Prefer arrows whenever we know the current month — that path reloads the day-grid after arm.
    if (already.found && already.month && already.year) {
      return walkToMonthViaArrows(month, year);
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
      if (!popup) {
        return walkToMonthViaArrows(month, year);
      }
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
          return walkToMonthViaArrows(month, year);
        }
        var cells = Array.from(popup.querySelectorAll('table.datePickerMonthPicker td')).filter(function(td) {
          return textOf(td) === monthLabel;
        });
        if (!cells.length) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return walkToMonthViaArrows(month, year);
        }
        cells[0].click();
        return waitMs(400).then(function() {
          var state = getPickerState();
          if (state.month === mm && state.year === yearStr) {
            // Popup may only flip title — finish with one arrow away/back via walk from neighbor.
            var awayM = month === 1 ? 12 : month - 1;
            var awayY = month === 1 ? Number(yearStr) - 1 : Number(yearStr);
            return walkToMonthViaArrows(awayM, awayY).then(function(away) {
              if (!away.ok) return { ok: true, selected: true, month: state.month, year: state.year, label: state.label, note: 'popup_only' };
              return walkToMonthViaArrows(month, year);
            });
          }
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return waitMs(150).then(function() { return walkToMonthViaArrows(month, year); });
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

`;
