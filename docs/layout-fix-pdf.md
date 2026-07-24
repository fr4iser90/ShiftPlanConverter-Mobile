# LOGA3 Phone Layout-Fix (PDF-Pfad)

Stand: 2026-07-24 · Live bewiesen auf Moto G73 · Code: `src/loga3/layoutFixInject.ts` (via `Loga3WebView`)

## Ergebnis

Mit diesem CSS/JS-Bundle ist auf dem Phone:

1. Buchungsplan nutzbar (kein 30px-Weißblock)
2. SmartEdin → Export → **Zeitprotokoll generieren** → PDF-View erreichbar (**live 2026-07-24**)

App: `src/loga3/layoutFixInject.ts` → `Loga3WebView` (`bootInject` = viewport + layoutFix + PDF capture).

## Kanonisches Bundle (was in die App geht)

| Stufe | Zweck | Selectors / Regel |
|-------|--------|-------------------|
| **CSS3** | Mein-Team weg, Buchungen füllen Clip | `.MyCalLeftPanel` `display:none`; `.ZDMaskWrapper` `left:0;width:100%;height:100%` |
| **CSS4** | SPEICHERN/Icons weg | `.ZDHeaderPanel .RightPanel` kollabieren; `[data-uin=btn-save]` / `.ic-save` hide |
| **CSS5 lite** | Header schmaler | `.ZDHeaderPanel` `max-height:48px` — **ohne** `pointer-events:none` (Monats-Pfeile bleiben) |
| **CSS7** | Weißer Block weg | Ursache: `.L3ZeitdatenFixedWidthGridView` war **~30px**; → `width:100%` + Glass/Mask transparent + Shadow weg |
| **JS** | GWT Absolute-Left | Grid-Breite = `.ZDBodyPanel` width; `.TableWrapper` / `.LGDndTableWrapper` `left:0`; MutationObserver + Interval |

**Nie anfassen:** `.LGSMartThingMainPanel` / SmartEdin-Icon (Export-UI).

## Failures (nicht shippen)

| Experiment | Warum fail |
|------------|------------|
| Nur Team `display:none` | Right blieb 36px |
| `ColHeader` min-width aggressiv | SmartEdin off-clip |
| SmartEdin `position:fixed` / zoom | „Smarten Ding entfernt“ / grau |
| Header `pointer-events:none` (CSS5 voll) | **bricht Monatsnavigation** |

## Noch prüfen

- [x] Monat wechseln (`ic-previous` / `ic-next`) → Header + Grid updaten (**OK 2026-07-24**: Juli→August, `gridW=336`, `pe:auto`)
- [ ] Danach erneut Zeitprotokoll → PDF für den neuen Monat
- [ ] Holen/`fetchJob` End-to-end mit Bundle (ohne CDP)

Details / Lab: [`pdf-path-checklist.md`](pdf-path-checklist.md)
