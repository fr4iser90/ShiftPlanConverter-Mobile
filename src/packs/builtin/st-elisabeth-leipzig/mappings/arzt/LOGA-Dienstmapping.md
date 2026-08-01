# LOGA-Dienstmapping für den Kalenderexport

Stand: August 2026 · Spec für Pack `st-elisabeth-leipzig` / Ärzte / OP · Anästhesie.

**Implementierung:** `op-anaesthesie.json` (atomare Zeiten + `composeRules`).  
Compose-Engine (Mehrcodes → ein Event) folgt; bis dahin greifen die atomaren Presets für Zeit↔Code.

Diese Datei enthält keine Beschäftigtendaten.


## Grundregeln

- Datum und Uhrzeit sollen mit der lokalen Zeitzone `Europe/Berlin` erzeugt werden.
- Dienste über Mitternacht enden am folgenden Kalendertag.
- Mehrere LOGA-Bausteine können zusammen genau einen Dienst bilden. Nach dem Zusammenfassen dürfen für die verbrauchten Einzelbausteine keine zusätzlichen Kalendereinträge erzeugt werden.
- Zusammengehörige Codes müssen zuerst erkannt werden; erst danach dürfen noch nicht verbrauchte Einzelcodes verarbeitet werden.
- `FT` kennzeichnet einen Feiertag und ist selbst kein Dienst.
- Samstag, Sonntag und ein mit `FT` gekennzeichneter Tag gelten für die folgenden Regeln als Wochenende/Feiertag.

## Logische Dienste und zusammengehörige LOGA-Codes

| Kalenderbezeichnung | Gültigkeit | LOGA-Codes | Beginn | Ende |
|---|---|---|---|---|
| Hausdienst | Montag bis Donnerstag | `ID1` + `B5A` am selben Tag | 11:30 | 08:30 am Folgetag |
| Hausdienst | Freitag | `ID2` + `B29` am selben Tag | 11:30 | 09:00 am Folgetag |
| Hausdienst Tag | Samstag, Sonntag oder Feiertag | `IDT` + `B19` + `S16` am selben Tag | 08:00 | 20:30 |
| Hausdienst Nacht | Folgetag ist Sonntag oder Feiertag | `IDN1` + `B20` am Starttag sowie `FK51` am Folgetag | 19:30 | 09:00 am Folgetag |
| Hausdienst Nacht | Folgetag ist ein normaler Werktag | `IDN2` + `B54` am Starttag sowie `FK74` am Folgetag | 19:30 | 08:30 am Folgetag |
| Rufdienst | Montag bis Donnerstag | `OPD1` + `B27` am selben Tag | 11:30 | 08:00 am Folgetag |
| Rufdienst | Freitag | `OPD2` + `B44` am selben Tag | 11:30 | 08:00 am Folgetag |
| Rufdienst Tag | Samstag, Sonntag oder Feiertag | `OPTn` | 08:00 | 20:00 |
| Rufdienst Nacht | Samstag, Sonntag oder Feiertag | `OPNn` | 20:00 | 08:00 am Folgetag |
| Prämedikationsdienst | Freitag | `PD1` | 09:00 | 17:30 |
| 3. Dienst | Samstag, Sonntag oder Feiertag | `SD` | 07:30 | 16:00 |
| Schmerzdienst | Normaler Werktag | `SD` | 07:30 | 16:00 |
| Zwischendienst | Normaler Werktag | `ZD` | 09:30 | 18:00 |
| Langdienst | Normaler Werktag | `LD` | 11:30 | 20:00 |

### Besonderheit des Codes `SD`

`SD` besitzt abhängig vom Kalendertag zwei fachliche Bezeichnungen:

- Samstag, Sonntag oder Feiertag: **3. Dienst**
- normaler Werktag: **Schmerzdienst**

Im PDF kann der Name des 3. Dienstes optisch in der angrenzenden Spalte stehen. Für das Mapping ist allein der LOGA-Code `SD` zusammen mit der Art des Kalendertages maßgeblich.

## Atomare LOGA-Zeitbausteine

Diese Tabelle ist für die technische Erkennung und für Fälle gedacht, in denen nur ein Teil eines zusammengesetzten Dienstes gebucht ist.

| LOGA-Code | Bedeutung innerhalb des Mappings | Zeit |
|---|---|---|
| `ID1` | Hausdienst, erster Teil Mo–Do | 11:30–20:00 |
| `B5A` | Hausdienst, Nachtanteil Mo–Do | 20:00–08:30 am Folgetag |
| `ID2` | Hausdienst, erster Teil Freitag | 11:30–20:00 |
| `B29` | Hausdienst, Nachtanteil Freitag | 20:00–09:00 am Folgetag |
| `IDT` | Hausdienst Tag, erster Teil | 08:00–09:00 |
| `B19` | Hausdienst Tag, mittlerer Teil | 09:00–19:30 |
| `S16` | Hausdienst Tag, letzter Teil | 19:30–20:30 |
| `IDN1` | Hausdienst Nacht, erster Teil vor Sonntag/Feiertag | 19:30–20:30 |
| `B20` | Hausdienst Nacht, mittlerer Teil vor Sonntag/Feiertag | 20:30–08:00 am Folgetag |
| `FK51` | Hausdienst Nacht, letzter Teil am Sonntag/Feiertag | 08:00–09:00; gehört zum Vortag |
| `IDN2` | Hausdienst Nacht, erster Teil vor einem Werktag | 19:30–20:30 |
| `B54` | Hausdienst Nacht, mittlerer Teil vor einem Werktag | 20:30–07:30 am Folgetag |
| `FK74` | Hausdienst Nacht, letzter Teil am Werktag | 07:30–08:30; gehört zum Vortag |
| `OPD1` | Rufdienst, Tages-/Abendanteil Mo–Do | 11:30–20:00 |
| `B27` | Rufdienst, Nachtanteil Mo–Do | 20:00–08:00 am Folgetag |
| `OPD2` | Rufdienst, Tages-/Abendanteil Freitag | 11:30–20:00 |
| `B44` | Rufdienst, Nachtanteil Freitag | 20:00–08:00 am Folgetag |
| `OPTn` | Rufdienst Tag am Wochenende/Feiertag | 08:00–20:00 |
| `OPNn` | Rufdienst Nacht am Wochenende/Feiertag | 20:00–08:00 am Folgetag |
| `PD1` | Prämedikationsdienst am Freitag | 09:00–17:30 |
| `SD` | Schmerzdienst oder 3. Dienst, abhängig vom Tag | 07:30–16:00 |
| `ZD` | Zwischendienst | 09:30–18:00 |
| `LD` | Langdienst | 11:30–20:00 |

## Weitere Arbeitsdienste aus LOGA

Diese Dienste stehen gewöhnlich nicht in den verglichenen Bereitschaftsdienst-Spalten des PDF, können aber direkt als Kalendereinträge übernommen werden.

| LOGA-Code | Kalenderbezeichnung | Zeit |
|---|---|---|
| `FD` | Frühdienst | 07:30–16:00 |
| `FDI` | Frühdienst Intensiv | 07:30–16:00 |
| `FDK` | Frühdienst Koordinator | 07:30–16:00 |
| `FDO` | Frühdienst Organ | 07:30–16:00 |
| `PD` | Prämedikationsdienst Mo–Do in älteren Plänen | 07:30–16:00 |

`PD` kam im Mai 2026 noch an normalen Werktagen vor. Seit August 2026 gibt es den Prämedikationsdienst nur noch freitags als `PD1`. Für historische Monatspläne muss `PD` deshalb weiterhin unterstützt werden; für Pläne ab August 2026 ist nur `PD1` als Prämedikationsdienst vorgesehen.

## Regeln für Teilbuchungen

Falls bei einer Person nicht alle Bestandteile eines Gesamtdienstes vorhanden sind, wird nur der tatsächlich gebuchte Teil ausgegeben:

| Einzelcode | Kalenderbezeichnung bei alleiniger Buchung |
|---|---|
| `ID1` oder `ID2` | Hausdienst Tag/Abend |
| `B5A` oder `B29` | Hausdienst Nacht |
| `IDT`, `B19` oder `S16` | Hausdienst Tag, Teilbuchung |
| `IDN1`, `B20`, `IDN2` oder `B54` | Hausdienst Nacht, Teilbuchung |
| `FK51` oder `FK74` | Hausdienst Nacht, Folgetagsanteil; möglichst dem Vortagsdienst zuordnen |
| `OPD1` oder `OPD2` | Rufdienst Tag/Abend |
| `B27` oder `B44` | Rufdienst Nacht |

## Empfohlene Reihenfolge für den Parser

1. Pro Person alle Codes eines Datums sammeln; zusätzliche Excel-Zeilen derselben Person gehören zum gleichen Datum.
2. Feiertage anhand von `FT` und zusätzlich über einen konfigurierten Feiertagskalender erkennen.
3. `FK51` und `FK74` zunächst als möglichen Abschluss des Hausnachtdienstes vom Vortag behandeln.
4. Die Kombinationen aus der Tabelle „Logische Dienste“ in der dort angegebenen Form zusammenfassen.
5. Die verwendeten Codes als verarbeitet markieren.
6. Übrig gebliebene Arbeitscodes anhand der atomaren Tabelle als Teilbuchungen ausgeben.
7. Frei-, Wunschfrei- und Abwesenheitscodes je nach gewünschter Kalenderkonfiguration ignorieren oder als Ganztagseintrag ausgeben.

## Keine Dienstzeiten

Folgende Codes sind keine zeitlich definierten Dienste und dürfen nicht mit den oben genannten Arbeitszeiten versehen werden:

| LOGA-Code | Bedeutung/Behandlung |
|---|---|
| `/` | Schichtfrei |
| `//` | Wunschfrei |
| `FT` | Feiertagskennzeichnung |
| `U` | Urlaub |
| `FZA` | Freizeitausgleich |
| `K` | Krank mit Lohnfortzahlung |
| `KARE` | Krank ohne Schein |
| `ZE` | Krank ohne Lohnfortzahlung |
| `EL` | Elternzeit |
| `MS` | Mutterschaft |
| `UU` | Unbezahlter Urlaub |
| `ZU` | Zusatzurlaub |
| `EXP` | Externes Praktikum; keine feste Dienstzeit aus den vorliegenden Dateien ableitbar |
| `FO` | Fortbildung; keine feste Uhrzeit aus den vorliegenden Dateien ableitbar |

Ob `FO`, `EXP`, `MS`, `KARE`, `K`, `ZE` und `EL` in den Kalenderexport aufgenommen werden, ist noch fachlich zu entscheiden. Bis dahin sollte der Importer diese Codes erkennen und ihre Bezeichnung erhalten, aber nur bei aktivierter Option einen Kalendereintrag erzeugen. Für Codes ohne feste Uhrzeit bietet sich dabei ein Ganztagseintrag an.

## Technischer Hinweis für Kalendereinträge

Für einen zusammengefassten Dienst sollte ein einzelnes Ereignis mit `DTSTART` und `DTEND` erzeugt werden. Bei einem Dienst über Mitternacht liegt `DTEND` am Folgetag. Dadurch entstehen beispielsweise aus `ID1` und `B5A` nicht zwei Termine, sondern ein Termin **Hausdienst** von 11:30 Uhr bis 08:30 Uhr am nächsten Tag.
