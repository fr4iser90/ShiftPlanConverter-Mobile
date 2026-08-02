# LOGA3 Verdienstnachweis-Abruf — Steps & Selektoren

Stand: 2026-08-01 · Captures: `tmp/verdienstnachweis/*.png`  
**Orchestration:** `src/sources/webview/loga3/payslip/fetchPayslipJob.ts`  
**Inject:** `payslip/automationHandlers.ts` · `shared/automationPortalFinders.ts` · `shared/automationHandlersCore.ts`  
**Dienstplan-Pendant:** [`fetch-steps.md`](./fetch-steps.md)  
**Phone PASS:** 2026-08-01 · Dev-Client · `job=payslip` months 6,7/2026 → 2 VN importiert.

**Regel:** ein Pfad, keine Fallbacks. Download = **PDF** (`ic-download`), nie ZIP / nie `ic-downloadencrypted`.

---

## Ablauf (Live-UI)

```
1 Login                          (wie Dienstplan) — wenn schon Session: skip
2 Shell bereit
2b Wenn Zeiten/Buchungen offen: einmal „Schließen“ → Dashboard
3 Private-Cloud-Widget → einmal „öffnen“
4 Sidebar → Generierte Dokumente (LMAGEDOK / ic-money)
5 Pro Monat:
   a) ggf. Jahres-Ordner öffnen (ältere Jahre)
   b) Monats-Ordner öffnen (MyCloudDirectoryWidget)
   c) Datei „01 Verdienstnachweis.pdf“ → ic-download
   d) PDF-Capture (%PDF) → parse → upsert
   e) Zurück (Zurück-Ordner) zur Monats-/Jahresliste
```

Screenshots: Dashboard-Widget → Sidebar → Ordnergrid → Datei + Herunterladen → Jahr-Drilldown.

---

## Step → Selektor → Postcondition

| # | Step | Selektor(en) | Muss danach wahr sein |
|---|------|--------------|------------------------|
| **1** | Login | `input[name="Kennung"]` · Passwort · Anmelden | nicht mehr Login |
| **2** | Shell | `öffnen`-Button sichtbar **oder** Cloud schon offen **oder** Zeiten-Maske | nicht Splash |
| **2b** | Zeiten verlassen (nur wenn nötig) | **einmal** Schließen: `[data-uin="mask-LZWZEITD"] [aria-label="Schließen"]` / `ic-delete` (`clickLeaveZeitdaten`) | `.personal-cloud` / Private-Cloud-„öffnen“ sichtbar; Picker/Maske weg |
| **3** | Private Cloud öffnen | **nur** im Widget `.personal-cloud` / `.personal-cloud-container`: `div.LG-Button[aria-label="öffnen"]` (`findVerdienstOeffnenControl`, nie Zeiten) · Titel `#PersonalCloud-*` / Text „Private Cloud“ | Cloud-Ansicht / Toolbar mit Dokument-Icons |
| **4** | Generierte Dokumente | Sidebar: `[data-id="LMAGEDOK"]` · `aria-label="Generierte Dokumente"` · `.LGAppToolbarIcon.money` · `[data-uin="ic-money"]` (**nicht** `LMAMYDOK` / Meine Dokumente) | Header „Generierte Dokumente“; `.FileContainer` mit Ordnern |
| **5a** | Jahr (nur ältere) | `.MyCloudDirectoryWidget[aria-label="2025"]` (o.ä. nur Jahreszahl) | Monat-Ordner für dieses Jahr sichtbar + Zurück-Kachel |
| **5b** | Monat | `.MyCloudDirectoryWidget[aria-label="Juli 2026"]` · Title/Info `.Title` = `Monat YYYY` · SubTitle oft `01.MM.YYYY` | Datei-Kachel sichtbar |
| **5c** | Datei | `.MyCloudFileWidget[aria-label="01 Verdienstnachweis.pdf"]` · Title `01 Verdienstnachweis.pdf` · SubTitle `… Abrechnung` | ControlArea mit Download-Icons |
| **5d** | PDF Download | **nur** `[data-uin="ic-download"]` (`aria-label="Herunterladen"`) **auf dem File-Widget** — nie `ic-downloadencrypted`, nie Ordner-`ic-download` (ZIP-Bulk) | Bytes `%PDF` (`JVBERi`) |
| **5e** | Zurück | `.MyCloudDirectoryWidget[aria-label="Zurück"]` | wieder Monats- oder Jahresliste |

Aktuelles Jahr: Monat-Ordner liegen **direkt** unter Generierte Dokumente. Ältere Jahre: erst Jahres-Ordner, dann Monate.

---

## Wichtige DOM-Anker

| UI | Klasse / Attribut |
|----|-------------------|
| Dashboard-Widget | `.personal-cloud` · `.docs-container` · Preview-Slider |
| Widget-Öffnen | `.dashboard-widget-footer` → `div.LG-Button[aria-label="öffnen"]` |
| Toolbar Meine Docs | `[data-id="LMAMYDOK"]` · `[data-uin="ic-documents"]` — **nicht** für VN |
| Toolbar Generiert | `[data-id="LMAGEDOK"]` · `[data-uin="ic-money"]` — **Pfad** |
| Ordner | `.MyCloudDirectoryWidget` + `aria-label` / `.Info .Title` |
| Datei | `.MyCloudFileWidget` + `aria-label` endet oft auf `.pdf` |
| Download PDF | `[data-uin="ic-download"]` |
| Verschlüsselt | `[data-uin="ic-downloadencrypted"]` — **ignorieren** |

---

## Gap zum Code

Implementiert 2026-08-01: `clickGenerierteDokumente` · Monats-/Jahres-Ordner · `clickVerdienstPdfDownload` (`ic-download`). Fuzzy `openVerdienstDocument` entfernt.

---

## Verboten

- Zeiten-„öffnen“ statt Private Cloud
- `LMAMYDOK` (Meine Dokumente) statt Generierte Dokumente
- Ordner-Download / ZIP / verschlüsselter Download
- Zweites Öffnen / Retry-Schleifen
- Zweites „Schließen“ wenn Dashboard nicht kommt → **FAIL** klar

Siehe auch: [`import-and-payroll-ux.md`](./import-and-payroll-ux.md), [`fetch-steps.md`](./fetch-steps.md).
