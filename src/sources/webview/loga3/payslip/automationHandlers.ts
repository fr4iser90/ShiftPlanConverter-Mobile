/**
 * Verdienstnachweis / Private Cloud / Generierte Dokumente commands.
 * In-page JS fragment for buildAutomationScript (not executed in RN).
 * Selectors: docs/dev/fetch-steps-payslip.md
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
      var genBtn = findGenerierteDokumenteControl();
      var myDok = q('[data-id="LMAMYDOK"]');
      var cloudOpen = !!(genBtn || myDok);
      var voBtn = findVerdienstOeffnenControl();
      var personalCloudDash = !!q('.personal-cloud, .personal-cloud-container');
      post({
        ok: !!cloudOpen || !!voBtn || personalCloudDash,
        type: 'assertVerdienstContext',
        verdienstFound: !!voBtn || personalCloudDash,
        verdienstOpen: !!cloudOpen,
        generierteFound: !!genBtn,
        pickerFound: !!q('#ZeitdatenMonthPicker'),
        sample: bodyV.slice(0, 240),
        code: cloudOpen || voBtn || personalCloudDash ? undefined : 'VERDIENST_CONTEXT_MISSING'
      });
      return true;
    }

    if (cmd.type === 'clickGenerierteDokumente') {
      var gd = findGenerierteDokumenteControl();
      if (gd) {
        gd.click();
        post({
          ok: true,
          type: 'clickGenerierteDokumente',
          generierteFound: true,
          note: ((gd.getAttribute && (gd.getAttribute('aria-label') || gd.getAttribute('data-id'))) || 'LMAGEDOK').slice(0, 40)
        });
      } else {
        post({
          ok: false,
          type: 'clickGenerierteDokumente',
          error: 'generierte_dokumente_not_found',
          code: 'GENERIERTE_MISSING',
          generierteFound: false,
          sample: (document.body && document.body.innerText || '').slice(0, 280)
        });
      }
      return true;
    }

    if (cmd.type === 'assertGenerierteDokumente') {
      var gen = findGenerierteDokumenteControl();
      var selected = !!(gen && /\\bSelected\\b/i.test(String(gen.className || '')));
      var dirs = qa('.MyCloudDirectoryWidget');
      var files = qa('.MyCloudFileWidget');
      var hasBack = !!findVerdienstBackControl();
      var listingOk = dirs.length > 0 || files.length > 0;
      // Must be on Generierte Dokumente tab (Selected), not Meine Dokumente
      var open = !!(gen && selected && listingOk);
      post({
        ok: open,
        type: 'assertGenerierteDokumente',
        generierteFound: !!gen,
        generierteOpen: open,
        hasBack: hasBack,
        dirCount: dirs.length,
        fileCount: files.length,
        sample: listCloudDirectoryLabels(12).join(' | ').slice(0, 240),
        code: open ? undefined : (!gen ? 'GENERIERTE_NOT_OPEN' : (!selected ? 'GENERIERTE_NOT_SELECTED' : 'GENERIERTE_LISTING_EMPTY')),
        note: selected ? 'selected' : 'not-selected'
      });
      return true;
    }

    if (cmd.type === 'probeVerdienstListing') {
      var month = cmd.month;
      var year = cmd.year;
      var monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
      var monthLabel = (month && year) ? (monthNames[month - 1] + ' ' + year) : '';
      var yearLabel = year ? String(year) : '';
      var monthDir = monthLabel ? findCloudDirectory(monthLabel) : null;
      var yearDir = yearLabel ? findCloudDirectory(yearLabel) : null;
      var fileW = findVerdienstFileWidget();
      var back = findVerdienstBackControl();
      var labels = listCloudDirectoryLabels(16);
      var fileNote = fileW ? (((fileW.getAttribute && fileW.getAttribute('aria-label')) || textOf(fileW)).slice(0, 80)) : null;
      var fileSub = '';
      if (fileW) {
        var subEl = fileW.querySelector && fileW.querySelector('.Info .SubTitle, .SubTitle');
        fileSub = textOf(subEl || null);
      }
      // e.g. SubTitle "01.06.2026 Abrechnung" or aria with month
      var mm = month ? String(month).padStart(2, '0') : '';
      var fileMatches =
        !!fileW &&
        !!month &&
        !!year &&
        ((fileSub && fileSub.indexOf(mm + '/' + year) >= 0) ||
          (fileSub && fileSub.indexOf(mm + '.' + year) >= 0) ||
          (fileSub && fileSub.indexOf('.' + mm + '.' + year) >= 0) ||
          (fileNote && monthLabel && fileNote.indexOf(monthLabel) >= 0));
      post({
        ok: true,
        type: 'probeVerdienstListing',
        hasMonthFolder: !!monthDir,
        hasYearFolder: !!yearDir,
        hasFile: !!fileW,
        fileMatchesMonth: !!fileMatches,
        hasBack: !!back,
        dirCount: labels.length,
        label: monthLabel || null,
        note: (monthDir && 'month') || (yearDir && 'year') || (fileMatches && 'file') || (fileW && 'file-other') || 'empty',
        sample: labels.join(' | ').slice(0, 280)
      });
      return true;
    }

    if (cmd.type === 'openVerdienstYearFolder') {
      var y = cmd.year;
      var yLabel = y ? String(y) : '';
      var yDir = yLabel ? findCloudDirectory(yLabel) : null;
      if (yDir) {
        yDir.click();
        post({ ok: true, type: 'openVerdienstYearFolder', label: yLabel, note: yLabel });
      } else {
        post({
          ok: false,
          type: 'openVerdienstYearFolder',
          error: 'year_folder_not_found',
          code: 'VERDIENST_YEAR_MISSING',
          label: yLabel || null,
          sample: (document.body && document.body.innerText || '').slice(0, 280)
        });
      }
      return true;
    }

    if (cmd.type === 'openVerdienstMonthFolder') {
      var m = cmd.month;
      var y2 = cmd.year;
      var monthNames2 = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
      var mLabel = (m && y2) ? (monthNames2[m - 1] + ' ' + y2) : '';
      var mDir = mLabel ? findCloudDirectory(mLabel) : null;
      if (mDir) {
        mDir.click();
        post({ ok: true, type: 'openVerdienstMonthFolder', label: mLabel, note: mLabel });
      } else {
        post({
          ok: false,
          type: 'openVerdienstMonthFolder',
          error: 'month_folder_not_found',
          code: 'VERDIENST_MONTH_MISSING',
          label: mLabel || null,
          sample: (document.body && document.body.innerText || '').slice(0, 280)
        });
      }
      return true;
    }

    if (cmd.type === 'assertVerdienstFileReady') {
      var fw = findVerdienstFileWidget();
      post({
        ok: !!fw,
        type: 'assertVerdienstFileReady',
        hasFile: !!fw,
        note: fw ? (((fw.getAttribute && fw.getAttribute('aria-label')) || textOf(fw)).slice(0, 80)) : null,
        code: fw ? undefined : 'VERDIENST_FILE_MISSING',
        sample: fw ? undefined : ((document.body && document.body.innerText) || '').slice(0, 280)
      });
      return true;
    }

    if (cmd.type === 'clickVerdienstPdfDownload') {
      var fileEl = findVerdienstFileWidget();
      if (!fileEl) {
        post({
          ok: false,
          type: 'clickVerdienstPdfDownload',
          error: 'verdienst_file_not_found',
          code: 'VERDIENST_FILE_MISSING',
          sample: (document.body && document.body.innerText || '').slice(0, 280)
        });
        return true;
      }
      // Select tile so ControlArea icons paint (hover bar on desktop)
      try { fileEl.click(); } catch (e) {}
      var dl = fileEl.querySelector && fileEl.querySelector('[data-uin="ic-download"]');
      if (!dl) {
        post({
          ok: false,
          type: 'clickVerdienstPdfDownload',
          error: 'ic_download_not_found',
          code: 'VERDIENST_DOWNLOAD_MISSING',
          note: ((fileEl.getAttribute && fileEl.getAttribute('aria-label')) || '').slice(0, 60),
          sample: (document.body && document.body.innerText || '').slice(0, 200)
        });
        return true;
      }
      // Force click — ControlArea often aria-hidden / CSS-hidden until hover
      try { dl.click(); } catch (e2) {}
      post({
        ok: true,
        type: 'clickVerdienstPdfDownload',
        note: 'ic-download',
        label: ((fileEl.getAttribute && fileEl.getAttribute('aria-label')) || '').slice(0, 60)
      });
      return true;
    }

    if (cmd.type === 'clickVerdienstBack') {
      var backBtn = findVerdienstBackControl();
      if (backBtn) {
        backBtn.click();
        post({ ok: true, type: 'clickVerdienstBack', hasBack: true, note: 'Zurück' });
      } else {
        post({
          ok: false,
          type: 'clickVerdienstBack',
          error: 'back_not_found',
          code: 'VERDIENST_BACK_MISSING',
          hasBack: false
        });
      }
      return true;
    }

`;
