/**
 * WebView automation scripts — Desktop loga3-workflow.js port (in-page JS).
 */

export const LOGA3_LOGIN_URL = String(process.env.EXPO_PUBLIC_LOGA3_URL || '').trim();

export function requireLoga3Url(): string {
  if (!LOGA3_LOGIN_URL) {
    throw new Error(
      'EXPO_PUBLIC_LOGA3_URL fehlt. In .env setzen (Tenant-URL), siehe .env.example.'
    );
  }
  return LOGA3_LOGIN_URL;
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
  | { type: 'probeReady' }
  | { type: 'getPickerState' }
  | { type: 'clickOeffnen' }
  | { type: 'armCalendarReload' }
  | { type: 'selectMonth'; month: number; year: number }
  | { type: 'assertHasPlan' }
  | { type: 'clickSmartEdin' }
  | { type: 'clickExport' }
  | { type: 'openZeitprotokoll' }
  | { type: 'clickDownload' }
  | { type: 'closeDialog' }
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
  pickerFound?: boolean;
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
};

/** Persistently inject to capture PDF blob downloads from LOGA3. */
export const PDF_CAPTURE_INJECT = `
(function() {
  if (window.__loga3PdfCapture) return true;
  window.__loga3PdfCapture = true;
  function post(msg) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {}
  }
  function emitBlob(blob, filename) {
    if (!blob) return;
    var type = blob.type || '';
    if (type && type.indexOf('pdf') === -1 && type.indexOf('octet-stream') === -1 && type.indexOf('application/') === -1) {
      return;
    }
    var reader = new FileReader();
    reader.onloadend = function() {
      var result = String(reader.result || '');
      var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
      post({
        ok: true,
        type: 'pdfBlob',
        base64: base64,
        mime: type || 'application/pdf',
        size: blob.size || 0,
        filename: filename || ''
      });
    };
    reader.onerror = function() {
      post({ ok: false, type: 'pdfBlob', error: 'filereader_failed' });
    };
    reader.readAsDataURL(blob);
  }
  try {
    var origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function(obj) {
      try {
        if (obj && typeof Blob !== 'undefined' && obj instanceof Blob) {
          emitBlob(obj, '');
        }
      } catch (e) {}
      return origCreate(obj);
    };
  } catch (e) {}
  document.addEventListener('click', function(ev) {
    try {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href.indexOf('blob:') === 0) {
        fetch(href).then(function(r) { return r.blob(); }).then(function(b) {
          emitBlob(b, a.getAttribute('download') || '');
        }).catch(function() {});
      }
    } catch (e) {}
  }, true);
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
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function visible(el) {
    if (!el) return false;
    if (el.offsetParent === null && el !== document.body) return false;
    var s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }
  function textOf(el) { return ((el && el.textContent) || '').replace(/\\s+/g, ' ').trim(); }
  function sleep(ms) {
    var start = Date.now();
    while (Date.now() - start < ms) { /* busy wait in sync inject — keep short */ }
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
    var picker = q('#ZeitdatenMonthPicker');
    if (!picker) return { ok: false, error: 'picker_not_found' };
    picker.click();
    sleep(450);
    var popup = null;
    for (var t = 0; t < 20; t++) {
      popup = markMonthPopup();
      if (popup) break;
      sleep(200);
    }
    if (!popup) return { ok: false, error: 'popup_not_found' };

    var sel = readPopupSelector(popup);
    if (sel && sel.active && /^\\d{4}$/.test(sel.active)) {
      var first = popup.querySelector('.datePickerSelectorText .gwt-InlineLabel');
      if (first) first.click();
      sleep(350);
    }

    for (var attempt = 0; attempt < 36; attempt++) {
      sel = readPopupSelector(popup);
      if (sel && sel.active === monthLabel && sel.year === yearStr) break;
      var shownYear = Number((sel && sel.year) || yearStr);
      var shownMonth = MONTH_LABELS.indexOf((sel && sel.active) || '') + 1 || 7;
      var shownNum = shownYear * 12 + shownMonth;
      var targetNum = Number(yearStr) * 12 + month;

      if (shownYear !== Number(yearStr)) {
        var yearDir = shownYear > Number(yearStr) ? 'Vorjahr' : 'Nächstes Jahr';
        var yearBtn = popup.querySelector('[aria-label="' + yearDir + '"]');
        if (yearBtn && visible(yearBtn)) { yearBtn.click(); sleep(350); continue; }
      }
      var monthDir = shownNum > targetNum ? 'Vorheriger Monat' : 'Nächster Monat';
      var monthBtn = popup.querySelector('[aria-label="' + monthDir + '"]');
      if (monthBtn && visible(monthBtn)) { monthBtn.click(); sleep(350); }
      else break;
    }

    sel = readPopupSelector(popup);
    if (!(sel && sel.active === monthLabel && sel.year === yearStr)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { ok: false, error: 'could_not_reach_month', note: (sel && sel.active) + ' ' + (sel && sel.year) };
    }

    var cells = Array.from(popup.querySelectorAll('table.datePickerMonthPicker td')).filter(function(td) {
      return textOf(td) === monthLabel;
    });
    if (!cells.length) {
      return { ok: false, error: 'month_cell_missing' };
    }
    cells[0].click();
    sleep(700);
    var state = getPickerState();
    if (state.month === mm && state.year === yearStr) {
      return { ok: true, selected: true, month: state.month, year: state.year, label: state.label };
    }
    // Fallback: chrome arrows
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    sleep(200);
    var targetNum2 = Number(yearStr) * 12 + month;
    for (var step = 0; step < 24; step++) {
      state = getPickerState();
      if (state.month === mm && state.year === yearStr) {
        return { ok: true, selected: true, month: state.month, year: state.year, label: state.label, note: 'chrome_arrows' };
      }
      if (!state.month || !state.year) break;
      var curNum = Number(state.year) * 12 + Number(state.month);
      var dir = curNum > targetNum2 ? 'back' : 'forward';
      if (!clickArrowNearPicker(dir)) break;
      sleep(500);
    }
    state = getPickerState();
    return {
      ok: state.month === mm && state.year === yearStr,
      selected: state.month === mm && state.year === yearStr,
      month: state.month,
      year: state.year,
      label: state.label,
      error: state.month === mm && state.year === yearStr ? undefined : 'select_month_failed'
    };
  }
  function hasSchedulePlan() {
    var roots = [
      q('[data-uin="mask-LZWZEITD"]'),
      q('.BewerberMaskLayout'),
      q('[class*="MaskLayout"]'),
      q('.LG-MainContent'),
      document.body
    ].filter(Boolean);
    var text = textOf(roots[0] || document.body);
    if (/Zeitprotokoll|KO\\*|GE\\*|Dienstplan|Soll/i.test(text) && text.length > 80) return true;
    // day cells with times
    if ((text.match(/\\b\\d{2}:\\d{2}\\b/g) || []).length >= 2) return true;
    return false;
  }

  try {
    if (cmd.type === 'stubStatus') {
      post({ ok: true, type: 'stubStatus', href: location.href, title: document.title || '' });
      return true;
    }

    if (cmd.type === 'fillLogin') {
      var user =
        q('input[type="text"]') ||
        q('input[name*="user" i]') ||
        q('input[id*="user" i]') ||
        q('input[autocomplete="username"]');
      var pass =
        q('input[type="password"]') ||
        q('input[autocomplete="current-password"]');
      if (!user || !pass) {
        post({ ok: false, type: 'fillLogin', error: 'login_fields_not_found' });
        return true;
      }
      var setVal = function(el, val) {
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setVal(user, cmd.username);
      setVal(pass, cmd.password);
      post({ ok: true, type: 'fillLogin' });
      return true;
    }

    if (cmd.type === 'submitLogin') {
      var btn =
        q('button[type="submit"]') ||
        qa('button').find(function(b){ return /anmelden|login|einloggen/i.test(b.textContent || ''); }) ||
        q('input[type="submit"]');
      if (btn) { btn.click(); post({ ok: true, type: 'submitLogin' }); }
      else post({ ok: false, type: 'submitLogin', error: 'submit_not_found' });
      return true;
    }

    if (cmd.type === 'probeReady') {
      var text = (document.body && document.body.innerText || '').slice(0, 800);
      var ps = getPickerState();
      post({
        ok: true,
        type: 'probeReady',
        href: location.href,
        hasZeitprotokoll: /Zeitprotokoll/i.test(text),
        sample: text.slice(0, 200),
        month: ps.month,
        year: ps.year,
        label: ps.label
      });
      return true;
    }

    if (cmd.type === 'getPickerState') {
      var st = getPickerState();
      post({ ok: true, type: 'getPickerState', month: st.month, year: st.year, label: st.label, pickerFound: st.found });
      return true;
    }

    if (cmd.type === 'clickOeffnen') {
      var oeffnen = qa('button, a, [role="button"], div.LG-Button, span.LG-Button').find(function(el) {
        return /^öffnen$/i.test(textOf(el)) && visible(el);
      });
      if (oeffnen) { oeffnen.click(); post({ ok: true, type: 'clickOeffnen' }); }
      else post({ ok: false, type: 'clickOeffnen', error: 'oeffnen_not_found' });
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
      var result = selectMonthViaPopup(cmd.month, cmd.year);
      post(Object.assign({ type: 'selectMonth', target: String(cmd.month).padStart(2,'0') + '/' + cmd.year }, result));
      return true;
    }

    if (cmd.type === 'assertHasPlan') {
      var plan = hasSchedulePlan();
      post({
        ok: plan,
        type: 'assertHasPlan',
        hasPlan: plan,
        code: plan ? undefined : 'NO_PLAN',
        error: plan ? undefined : 'NO_PLAN',
        month: getPickerState().month,
        year: getPickerState().year
      });
      return true;
    }

    if (cmd.type === 'clickSmartEdin') {
      var icon = q('span.LG-Icon.ic-smartedingeborder[data-uin="ic-smartedingeborder"]') ||
        q('[data-uin="ic-smartedingeborder"]');
      if (icon && visible(icon)) { icon.click(); post({ ok: true, type: 'clickSmartEdin' }); }
      else post({ ok: false, type: 'clickSmartEdin', error: 'smartedin_not_found' });
      return true;
    }

    if (cmd.type === 'clickExport') {
      var exportBtn =
        q('div.MenuItem[data-uin="smartthing-cat-exports"]') ||
        qa('div.MenuItem, div.gwt-Label, button, div.LG-Button, span').find(function(el) {
          return /^Export$/i.test(textOf(el)) && visible(el);
        });
      if (exportBtn) { exportBtn.click(); post({ ok: true, type: 'clickExport' }); }
      else post({ ok: false, type: 'clickExport', error: 'export_not_found' });
      return true;
    }

    if (cmd.type === 'openZeitprotokoll') {
      var zp =
        q('div.LGSmartThingContentItem[data-uin="smartthing-LAGSDZPG"]') ||
        qa('button, a, [role="button"], div.LGSmartThingContentItem, div').find(function(el) {
          return /Zeitprotokoll\\s*generieren/i.test(textOf(el)) && visible(el);
        });
      if (zp) {
        zp.click();
        sleep(400);
        zp.click();
        post({ ok: true, type: 'openZeitprotokoll' });
      } else {
        post({ ok: false, type: 'openZeitprotokoll', error: 'button_not_found' });
      }
      return true;
    }

    if (cmd.type === 'clickDownload') {
      var dl = qa('button, a, [role="button"], span.PrimaryButton, span').find(function(el) {
        var t = textOf(el) + ' ' + (el.getAttribute('aria-label') || '');
        return /herunterladen/i.test(t) && visible(el);
      });
      if (dl) { dl.click(); post({ ok: true, type: 'clickDownload' }); }
      else post({ ok: false, type: 'clickDownload', error: 'download_not_found' });
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

    post({ ok: false, error: 'unknown_command', type: cmd.type });
  } catch (err) {
    post({ ok: false, error: String(err && err.message || err), type: cmd.type });
  }
  return true;
})();
true;
`;
}
