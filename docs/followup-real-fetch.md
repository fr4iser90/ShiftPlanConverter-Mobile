# Follow-up: Echten LOGA3-Fetch verdrahten

Der Converter/Preview/ICS-Pfad funktioniert. Was fehlt: **Monatsauswahl → echter Download → PDF → Convert**.

Aktuell: „Fixture konvertieren“ füllt Preview mit `fixtures/…` (5 Tage, 09/2026). Month-Chips ändern nur React-State. `selectMonth` in `src/loga3/automation.ts` ist ein No-Op (postet Status, klickt nicht). `extractTextFromPdfBuffer` existiert, wird von keinem Screen genutzt. Es gibt keinen Button „Ausgewählte laden“ und kein Job-Modul analog Desktop `runDownloadPipeline`.

---

## PROMPT (kopieren)

```
Kontext: LOGA3-Automation-Mobile. Converter + Fixture-Smoke + ICS laufen.
Problem: Monatsauswahl steuert KEINEN echten Download. Preview zeigt nur Fixture (09/2026, ~5 Schichten).

Desktop-Referenz (lokal oder clone):
../LOGA3-Automation/src/loga3-workflow.js → runDownloadPipeline
../LOGA3-Automation/src/loga3-complete.js → Multi-Month-Loop + Login
../LOGA3-Automation/src/loga3-automation.js → Login

ZIEL: Holen-Tab → Monate anhaken → „Ausgewählte laden“ → WebView steuert LOGA3
wie Desktop → PDFs speichern → extractTextFromPdfBuffer → convertPdfText → Preview.
Fixture-Button bleibt nur als Offline-Smoke und klar beschriftet.

════════════════════════════════════════
IST-ZUSTAND (nicht nochmal Scaffold)
════════════════════════════════════════
- app/(tabs)/index.tsx — Month-Chips + Fixture-Button; kein Download-Job
- src/loga3/automation.ts — selectMonth ist Stub (nur postMessage); submitLogin/openZeitprotokoll/clickDownload werden von UI kaum/nicht orchestriert
- src/loga3/Loga3WebView.tsx — lädt URL, kein PDF-Download-Capture
- src/convert/pdfText.ts — extractTextFromPdfBuffer ungenutzt von Screens
- EXPO_PUBLIC_LOGA3_URL Default oft Placeholder (loga3.cloud) — Desktop-Tenant nutzen/konfigurierbar machen

════════════════════════════════════════
AUFGABE (Priorität)
════════════════════════════════════════
1. Holen-UI: Button „Ausgewählte laden“ der selectedMonths + year liest.
2. Neues Modul src/loga3/fetchJob.ts: sequentiell pro Monat die Desktop-Pipeline abbilden:
   Login (fill + submit + wait shell) → öffnen → Monat wählen+verifizieren →
   SmartEdin/Export → Zeitprotokoll → Herunterladen → Dialog schließen → nächster Monat.
3. automation.ts: selectMonth ECHT implementieren (ZeitdatenMonthPicker / Desktop-Selektoren aus loga3-workflow.js portieren). Alle nötigen Commands aufrufbar machen.
4. Loga3WebView: PDF-Bytes capturen (onFileDownload / blob→base64 Bridge / platform download) und per expo-file-system speichern (z.B. MM-YYYY.pdf).
5. Nach jedem PDF: extractTextFromPdfBuffer → convertPdfText → Entries mergen → Store/Preview.
6. Fehler sichtbar: Login fail, NO_PLAN, Timeout, Download fail — Status-Text + nicht silent.
7. URL: .env.example + README mit realem Tenant-Beispiel (wie Desktop); Stub-Button umbenennen/als Debug kennzeichnen.
8. docs/webview-fetch.md + PLAN.md ehrlich aktualisieren (Live-Fetch nicht als done markieren bis es geht).
9. Tests wo sinnvoll (Job-Orchestrator mit gemocktem run()-WebView); Emulator-Smoke dokumentieren.

Definition of Done:
- [ ] Mit gültigen Creds + EXPO_PUBLIC_LOGA3_URL: ausgewählte Monate → echte PDFs → Preview zeigt Schichten dieser Monate (nicht 09/2026-Fixture)
- [ ] Fixture-Button ändert Preview nur wenn man ihn bewusst drückt
- [ ] Ohne Creds: klare Fehlermeldung, kein stilles Fixture
- [ ] Kurz zusammenfassen welche Desktop-Schritte portiert wurden und was noch fragil ist

Starte mit fetchJob + UI-Button + echtem selectMonth; dann PDF-Capture; dann Convert-Wire.
Arbeite im Mobile-Repo; Desktop nur lesen.
```
