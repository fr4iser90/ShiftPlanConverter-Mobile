/**
 * Phone WebView layout fixes for LOGA3 Zeitdaten → Zeitprotokoll PDF.
 *
 * Proven live 2026-07-24 (Moto G73). See docs/pdf-path-checklist.md.
 * Do NOT hide SmartEdin / LGSMartThing*. Do NOT pointer-events:none the whole header
 * (month arrows #ZeitdatenMonthPicker / ic-previous / ic-next must stay clickable).
 */
export const LOGA3_LAYOUT_FIX_STYLE_ID = 'loga3-layout-fix-v1';

/** CSS only — injected as <style id=loga3-layout-fix-v1>. */
export const LOGA3_LAYOUT_FIX_CSS = `
/* CSS3: hide Mein-Team slab; give Buchungen the clip */
.MyCalLeftPanel,
.MyCalLeftPanel.ZDLeftPanel,
.ZDLeftPanel {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
}
.ZDMaskWrapper {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  width: 100% !important;
  min-width: 100% !important;
  height: 100% !important;
  box-shadow: none !important;
  background: transparent !important;
}

/* CSS4: SPEICHERN / icon strip only — keep month title + arrows */
.ZDHeaderPanel .RightPanel {
  max-height: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
[data-uin="btn-save"],
.ic-save,
.save-button,
.save-edit-mode-button {
  display: none !important;
  pointer-events: none !important;
}

/* CSS5 lite: shrink header chrome but KEEP clicks for month nav */
.ZDHeaderPanel {
  max-height: 48px !important;
  overflow: hidden !important;
}
.ZDBodyPanel {
  min-height: 280px !important;
}

/* CSS7: empty white slab was L3ZeitdatenFixedWidthGridView ~30px wide */
.LG-GlassPanel.LG-SimpleMaskLayout-ContentPanel,
[data-uin="mask-LZWZEITD"] {
  background: transparent !important;
}
.L3ZeitdatenFixedWidthGridView {
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
  overflow: auto !important;
}
.L3ZeitdatenFixedWidthGridView .TableWrapper,
.L3ZeitdatenFixedWidthGridView .LGDndTableWrapper,
.LGDndTableWrapper.ZeitDatenMaske {
  left: 0 !important;
  margin-left: 0 !important;
  transform: none !important;
}
.ColHeader {
  min-height: 18px !important;
  height: auto !important;
}
`.trim();

/**
 * Inject CSS + keep re-applying GWT width quirks when Zeitdaten grid mounts.
 * Safe to call multiple times (idempotent style tag).
 * Quiet: no full-document MutationObserver thrash (that fights SmartEdin / Export menus).
 * Only fixGrid when width is actually wrong; slow interval is enough after GWT mounts.
 */
export function buildLayoutFixInject(): string {
  const cssJson = JSON.stringify(LOGA3_LAYOUT_FIX_CSS);
  const styleId = JSON.stringify(LOGA3_LAYOUT_FIX_STYLE_ID);
  return `(function(){try{
  var CSS=${cssJson};
  var SID=${styleId};
  function ensureStyle(){
    var s=document.getElementById(SID);
    if(!s){ s=document.createElement('style'); s.id=SID; (document.documentElement||document.head||document.body).appendChild(s); }
    if(s.textContent!==CSS) s.textContent=CSS;
  }
  function fixGrid(){
    ensureStyle();
    var body=document.querySelector('.ZDBodyPanel');
    var grid=document.querySelector('.L3ZeitdatenFixedWidthGridView');
    if(!(body&&grid)) return;
    var bw=body.getBoundingClientRect().width;
    if(!(bw>80)) return;
    var cur=grid.getBoundingClientRect().width;
    if(Math.abs(cur-bw)>2){
      grid.style.setProperty('width', bw+'px', 'important');
      grid.style.setProperty('min-width', bw+'px', 'important');
    }
    [].slice.call(grid.querySelectorAll('.TableWrapper, .LGDndTableWrapper')).forEach(function(el){
      if(el.style.left==='0px' && el.style.marginLeft==='0px') return;
      el.style.setProperty('left','0px','important');
      el.style.setProperty('margin-left','0','important');
      el.style.setProperty('transform','none','important');
    });
  }
  ensureStyle();
  fixGrid();
  if(!window.__loga3LayoutFixObs){
    window.__loga3LayoutFixObs=true;
    // Slow poll only — MutationObserver on document caused layout thrash during Export/LAGSDZPG.
    setInterval(fixGrid, 2500);
  }
}catch(e){}})();`;
}
