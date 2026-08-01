/**
 * Verdienstnachweis / Private Cloud commands.
 * In-page JS fragment for buildAutomationScript (not executed in RN).
 */
export const AUTOMATION_HANDLERS_PAYSLIP = `
    if (cmd.type === 'clickVerdienstOeffnen') {
      var vo = findVerdienstOeffnenControl();
      if (vo) {
        vo.click();
        post({
          ok: true,
          type: 'clickVerdienstOeffnen',
          verdienstFound: true,
          note: textOf(vo).slice(0, 60) || 'verdienst-öffnen'
        });
      } else {
        post({
          ok: false,
          type: 'clickVerdienstOeffnen',
          error: 'verdienst_oeffnen_not_found',
          code: 'VERDIENST_OPEN_MISSING',
          verdienstFound: false,
          sample: (document.body && document.body.innerText || '').slice(0, 280)
        });
      }
      return true;
    }

    if (cmd.type === 'assertVerdienstContext') {
      var bodyV = (document.body && document.body.innerText || '');
      var verdienstOpen =
        /Verdienstabrechnung|Verdienstnachweis|Private\\s*Cloud|personal-cloud|Gehaltsabrechnung/i.test(bodyV) &&
        !q('#ZeitdatenMonthPicker');
      var voBtn = findVerdienstOeffnenControl();
      post({
        ok: !!verdienstOpen || !!voBtn,
        type: 'assertVerdienstContext',
        verdienstFound: !!voBtn,
        verdienstOpen: !!verdienstOpen,
        pickerFound: !!q('#ZeitdatenMonthPicker'),
        sample: bodyV.slice(0, 240),
        code: verdienstOpen || voBtn ? undefined : 'VERDIENST_CONTEXT_MISSING'
      });
      return true;
    }

    if (cmd.type === 'openVerdienstDocument') {
      var month = cmd.month;
      var year = cmd.year;
      var monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
      var wantLabel = (month && year) ? (monthNames[month - 1] + ' ' + year) : '';
      var wantSlash = (month && year) ? (String(month).padStart(2,'0') + '/' + year) : '';
      // Prefer a document row that looks like Verdienstabrechnung for the month
      var candidates = qa('a, button, [role="button"], div, span, tr, td, li').filter(function(el) {
        if (!visible(el)) return false;
        var t = textOf(el);
        if (t.length > 120) return false;
        return /Verdienstabrechnung|Verdienstnachweis|Gehaltsabrechnung|\\bPDF\\b/i.test(t);
      });
      var pick = null;
      if (wantLabel || wantSlash) {
        pick = candidates.find(function(el) {
          var t = textOf(el);
          return (wantLabel && t.indexOf(wantLabel) >= 0) || (wantSlash && t.indexOf(wantSlash) >= 0);
        }) || null;
      }
      if (!pick) pick = candidates[0] || null;
      if (pick) {
        pick.click();
        post({
          ok: true,
          type: 'openVerdienstDocument',
          note: textOf(pick).slice(0, 80),
          label: wantLabel || wantSlash || null
        });
      } else {
        post({
          ok: false,
          type: 'openVerdienstDocument',
          error: 'verdienst_document_not_found',
          code: 'VERDIENST_DOC_MISSING',
          sample: (document.body && document.body.innerText || '').slice(0, 280)
        });
      }
      return true;
    }

`;
