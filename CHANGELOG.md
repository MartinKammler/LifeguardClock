# Changelog

Alle relevanten Änderungen pro Release. Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/).

---

## [1.1.2] – 2026-05-13

### Neu

- **Periodischer Hintergrund-PIF-Sync** (`lifeguardclock.js`): `startBackgroundPifSync()` startet
  beim App-Start (nach 4 s) einen `setInterval`-Timer (5 Minuten). `_runBackgroundPifSync()` ruft
  `fetchUserPif()` sequentiell für alle Nutzer auf und hält `lgc_state` aktuell, ohne dass ein
  PIN-Login nötig ist. Ein Concurrency-Flag (`_bgPifSyncRunning`) verhindert parallele Läufe.
  Ergebnis: Ein auf dem Smartphone beendeter Stempel wird spätestens nach 5 Minuten auf dem
  Tablet registriert — auch wenn kein Nutzer eingeloggt ist.

- **Suite 37** (`test_LifeguardClock.html`): 3 Tests für `_runBackgroundPifSync`
  (alle User aufgerufen wenn Cloud konfiguriert; kein Aufruf ohne Cloud; Flag blockiert
  gleichzeitige Ausführung).

### Service Worker

- Cache-Version auf `lgc-shell-v21` erhöht (erzwingt Update auf allen installierten PWAs).

### Version

- `APP_VERSION` auf `'1.1.2'` gesetzt.

---

## [1.1.1] – 2026-05-12

### Behoben

- **Toast verschwindet nicht auf Smartphones** (`LifeguardClock.html`): `translateY(90px)` war bei
  mehrzeiligen Toasts auf schmalen Displays zu gering — der Toast blieb teilweise sichtbar.
  Erhöht auf `translateY(150px)`. Zusätzlich `opacity 0/1`-Übergang ergänzt als Fallback für
  iOS Safari, das `position: fixed`-Transitions beim Viewport-Resize abbricht.

### Neu (Editor)

- **Anwesenheit automatisch beim Paar-Hinzufügen** (`editor-app.js`): Wird über „Paar hinzufügen"
  ein Dienst-Typ mit `autoStartKeys: ['anwesenheit']` (Wachdienst, San, Ausbildung, Helfer)
  eingetragen, erzeugt der Editor im Hintergrund automatisch ein passendes Anwesenheits-Paar —
  sofern kein abdeckendes Anwesenheits-Fenster bereits vorhanden ist. Gilt auch beim Schreiben
  in einen anderen Monats-PIF.

- **🗂 Monate-Button** (`editor.html`, `editor-app.js`): Neuer Button in der Editor-Werkzeugleiste.
  Liest bei Cloud- oder Verzeichnis-Betrieb alle PIF-Dateien ein und führt zwei Prüfungen durch:
  1. **Monats-Bereinigung**: Einträge, deren Zeitstempel nicht zum Dateimonat passen, werden in
     die korrekte Monats-PIF verschoben (neue Datei wird erstellt falls nötig).
  2. **Anwesenheits-Lücken**: Jedes vollständige Dienst-Paar (Wachdienst, San, Ausbildung, Helfer)
     wird auf Anwesenheits-Abdeckung geprüft. Fehlt ein abdeckendes Anwesenheits-Fenster, wird
     es automatisch ergänzt. Überlappende Dienst-Paare desselben Nutzers erhalten nur einen
     gemeinsamen Block.
  Toast-Meldung zeigt z. B. „3 Einträge verschoben, 2 Anwesenheits-Blöcke ergänzt ✓".

### Service Worker

- Cache-Version auf `lgc-shell-v20` erhöht (erzwingt Update auf allen installierten PWAs).

### Version

- `APP_VERSION` auf `'1.1.1'` gesetzt.

---

## [1.1.0] – 2026-05-12

### Behoben (Datenkonsistenz – Sprint 1 & 2)

- **State-Rebuild nach PIF-Merge** (`lifeguardclock.js`, `rebuildStateFromLog`): Nach jedem
  Cloud-PIF-Merge wird `lgc_state` für den Nutzer aus dem zusammengeführten Log neu aufgebaut.
  Verhindert, dass das Dashboard auf Gerät B „Inaktiv" zeigt, obwohl laut Log ein offener Start
  von Gerät A vorhanden ist.

- **Auto-Stops in PIF** (`lifeguardclock.js`): Alle 6 Auto-Stop-Pfade (`checkZeitfensterEnd`,
  `checkTimeLimits`, `checkDayBoundary`, `stopAllActiveSessions`, `logAllActiveSessions`,
  `stopUserSessions`) schreiben jetzt über `addEntry()`, das `pushUserPif()` aufruft. Auto-Stops
  fehlen nicht mehr in der Cloud-PIF.

- **PIF-Push bei Netzwerkrückkehr** (`lifeguardclock.js`): Im `online`-Handler werden PIFs für
  alle Nutzer nachgeschoben, die lokal Einträge haben. Offline erzeugte Stempel landen zuverlässig
  in der Cloud.

- **Zeitfenster-Timestamp** (`lifeguardclock.js`, `checkZeitfensterEnd`, `zeitfensterEndTs`):
  Auto-Stop beim Zeitfenster-Ende verwendet jetzt den exakten Endzeitpunkt des Zeitfensters
  statt dem Erkennungszeitpunkt (`new Date().toISOString()`). Wacht das Tablet nach dem Fenster
  auf, landet der Stop trotzdem korrekt auf 21:00 statt 21:37.

- **Monatsgrenze-Stop im richtigen Log** (`lifeguardclock.js`, `checkDayBoundary`,
  `findLogKeyForOpenStart`): Der Auto-Stop bei Tageswechsel wird jetzt in denselben Monats-Log
  geschrieben, in dem der offene Start liegt. Zuvor landete der Stop eines 31.05.-Starts
  in `lgc_log_2026-06`, was den Mai-Log mit offener Sitzung hinterließ.

- **Cooldown ab echtem Stop-Zeitpunkt** (`lifeguardclock.js`, `checkTimeLimits`): Cooldown wird
  jetzt von `stopTs` (= `startMs + maxDurationMs`) berechnet, nicht vom Erkennungszeitpunkt.
  Schläft das Tablet 30 Minuten nach dem Limit ein, beginnt die Pause trotzdem zum richtigen
  Zeitpunkt.

- **Null-Dauer-Dubletten verhindert** (`checkZeitfensterEnd`, `checkDayBoundary`): Ist im Log
  kein offener Start vorhanden, wird kein Stop-Eintrag mehr geschrieben. Veralteter State wird
  still bereinigt (`state[key] = false`).

### Neu

- **`prevLogKey()`** (`lifeguardclock.js`): Extrahierte Hilfsfunktion für den Vormonat-Log-Key.
  `getPrevLog()`, `findLogKeyForOpenStart()` und `saveLogForKey()` nutzen sie einheitlich.

- **`saveLogForKey(key, log)`** (`lifeguardclock.js`): Primitive Basis für `saveLog()` und
  `addEntry()` mit optionalem `targetLogKey`-Parameter. Ermöglicht gezieltes Schreiben in
  Vormonat-Logs.

- **`findLogKeyForOpenStart(userName, logType)`** (`lifeguardclock.js`): Sucht im aktuellen und
  Vormonat-Log nach dem offenen Start-Eintrag und gibt dessen Log-Key zurück.

- **`zeitfensterEndTs(type)`** (`lifeguardclock.js`): Berechnet den Zeitfenster-Ende-Zeitstempel
  als immer vergangenen Wert (subtrahiert ggf. einen Tag).

### Geändert (UX – Sprint 3)

- **Shutdown-Screen Sync-Status** (`lifeguardclock.js`, `LifeguardClock.html`): `safeShutdown()`
  ist jetzt async. Nach dem Stoppen aller Sitzungen werden PIFs für alle zuvor aktiven Nutzer
  gepusht. Der Shutdown-Screen zeigt „Synchronisiere …" → „✓ Cloud-Sync abgeschlossen"
  (oder „Stempeldaten lokal gespeichert" wenn kein Cloud-Sync konfiguriert).

- **Cloud-Übernahme-Meldung** (`lifeguardclock.js`, `fetchUserPif`): Wird nach einem PIF-Merge
  ein Typ für den eingeloggten Nutzer neu aktiv, erscheint ein Toast „Aktiver Stempelstand aus
  Cloud übernommen".

- **Kiosk-Modus konfigurierbar** (`lifeguardclock.js`, `KIOSK_MODE`): Tastaturkürzel-Blocker
  (F5/F12/Ctrl+R …), Kontextmenü, Popstate-Guard, Drag/Select und Orientierungssperre werden
  nur noch aktiviert wenn `CONFIG.kioskMode !== false && !IS_PROXY`. Im Proxy-/Entwicklungsmodus
  bleiben Entwicklerwerkzeuge erreichbar.

- **„Neue Schicht" statt „Verlängern"** (`lifeguardclock.js`): Der Button zum Neustarten einer
  aktiven Session mit `maxDurationMs` heißt jetzt „Neue Schicht" — beschreibt fachlich korrekt,
  dass eine neue Zeitscheibe begonnen wird.

- **Toasts statt `alert()` in Editor und Dashboard** (`editor-app.js`, `editor.html`,
  `dashboard-app.js`, `dashboard.html`): Alle 21 nativen `alert()`-Aufrufe durch nicht-
  blockierende Toast-Meldungen ersetzt. Toast-CSS und `<div id="toast">` in beiden HTML-Dateien
  ergänzt. `editor-app.js` hatte `showToast()` bereits als `alert()`-Wrapper — jetzt echte
  DOM-Implementierung.

### Tests (Sprint 1–3)

- **Suite 30** (`test_LifeguardClock.html`): 6 Tests für `rebuildStateFromLog`
  (offener Start → true, abgeschlossenes Paar → false, leerer Log → alles false,
  Cooldown erhalten, zwei Typen aktiv, unbekannte userId).

- **Suite 31**: 4 Tests Auto-Stop → `pushUserPif` (`checkTimeLimits`, `checkZeitfensterEnd`,
  `checkDayBoundary` rufen `pushUserPif` auf; staler State → kein Push).

- **Suite 32**: 4 Tests `findLogKeyForOpenStart` (aktueller Log, Vormonat-Log, letzter Stop → null,
  kein Eintrag → null).

- **Suite 33**: 2 Tests `zeitfensterEndTs` (Fenster-Ende in Vergangenheit → heute, in Zukunft → gestern).

- **Suite 34**: 2 Tests `checkDayBoundary` Monatsgrenze (Stop in Vormonat-Log; staler State →
  State bereinigt, kein Stop).

- **Suite 35**: 1 Test `checkZeitfensterEnd` staler State (kein Stop-Eintrag ohne offenen Start).

- **Suite 36**: 1 Test `checkTimeLimits` Cooldown-Timing (Cooldown endet vor `now + cooldownMs`).

- Stubs `calcDurationMs`, `getTypeStartMs` durchsuchen jetzt beide Logs (aktuell + Vormonat).

### Service Worker

- Cache-Version auf `lgc-shell-v19` erhöht (erzwingt Update auf allen installierten PWAs).

### Version

- `APP_VERSION` auf `'1.1.0'` gesetzt.

---

## [1.0.3] – 2026-05-12

### Geändert

- **PIF als kanonische Datenquelle** (`dashboard-app.js`): Dashboard lädt nur noch
  `lgc_pif_*`-Dateien aus der Cloud; Geräte-Logs sind reines Backup und werden nicht mehr
  geladen. `buildDB` merged alle Tageseinträge aller Quellen bevor Start/Stop-Paare gebildet
  werden (`allByDay`-Merge). Stop-Einträge ohne passenden Start auf demselben logischen Tag
  werden ignoriert (verhindert fehlerhafte Dauern durch verwaiste Auto-Stops).

- **`pushUserPif` – merge-basierter Push** (`lifeguardclock.js`): Statt blindem Überschreiben
  liest `pushUserPif` die bestehende PIF zuerst aus der Cloud und merged: Cloud-Einträge
  bleiben erhalten (schützt manuell nachgetragene Stopps), lokale Nicht-Auto-Einträge werden
  ergänzt. Auto-Stops (Zeitfenster-Ende, `maxDurationMs`) werden nur eingefügt, wenn kein
  anderer Stop für die Session vorhanden ist — weder echt noch bereits gepushter Auto-Stop.

- **Konsolidierung** (`admin-app.js`): Auto-Stops aus Geräte-Logs werden nun bedingt
  übernommen — nur wenn kein Stop für die betreffende Session in den gemergten PIF-Einträgen
  existiert. Einträge vor dem 08.05.2026 (erster realer Stempeltag) werden übersprungen.

- **Editor: Einzeleinträge** (`editor-app.js`, `editor.html`): Neuer Modus „Einzeleintrag"
  im Add-Modal ermöglicht das Nachtragen eines einzelnen Start- oder Stop-Eintrags. Bei
  Stop-Einträgen wird `dauer_ms` automatisch aus dem letzten passenden Start berechnet.

- **Validierung: Auto-Stops ausgeblendet** (`editor-app.js`): `fetchAndValidate` filtert
  Auto-Stop-Einträge vor der Normalisierung heraus — verwaiste Auto-Stops erzeugen keine
  „Stop ohne Start"-Issues mehr.

### Behoben

- **Veraltete `dauer_ms` aus Auto-Stops** (`dashboard-app.js`): Ein Stop-Eintrag mit
  `dauer_ms > 0` aber ohne gepaarten Start wurde gezählt. Fix: Duration wird ausschließlich
  aus Timestamps berechnet, nur wenn `openStart` vorhanden ist.

### Service Worker

- Cache-Version auf `lgc-shell-v18` erhöht (erzwingt Update auf allen installierten PWAs).

### Version

- `APP_VERSION` auf `'1.0.3'` gesetzt.

---

## [1.0.2] – 2026-05-11

### Hinzugefügt
- **Editor: „☁ Alle prüfen"** — Neuer Button lädt alle PIF-Dateien der letzten zwei Monate,
  erkennt vier Issue-Typen und zeigt Quick-Fix-Cards mit direktem Cloud-Speichern an:
  - *Vergessen auszustempeln* (open-start): Stop-Zeit eingeben und speichern; mit Checkbox für
    verknüpfte Anwesenheit (abgeleitet aus `autoStartKeys` in `lgc_types.json`)
  - *Stop ohne Start* (orphan-stop): Start-Zeit nachträglich eintragen
  - *Doppelt eingestempelt* (double-start): einen der beiden Starts löschen
  - *Verdächtig kurze Dauer* (<15 min, short-pair): Zeiten korrigieren oder Paar löschen
  - Überspringen-Funktion: Issue bleibt ausgegraut sichtbar, erscheint beim nächsten Scan wieder

### Geändert
- **Service Worker**: Cache-Version auf `lgc-shell-v17` erhöht — erzwingt Update auf allen
  installierten PWAs (editor-app.js hat sich geändert)
- **`APP_VERSION`**: auf `'1.0.2'` gesetzt

### Tests
- **`test_editor.html`**: Suite 13 (buildValidationIssues), Suite 14 (getLinkedIssues),
  Suite 15 (Fix-Mutationsfunktionen) — 50+ neue Assertions

---

## [1.0.1] – 2026-05-10

### Behoben

- **Verwaister Auto-Stop im Dashboard** (`dashboard-app.js`): Ein Stop-Eintrag mit `dauer_ms` wurde im Dashboard gezählt, auch wenn kein passender Start auf demselben logischen Tag existierte. Ursache war ein fehlerhafter Auto-Stop an der Tagesgrenze, den das Gerät erzeugte weil es einen manuellen Stop (nur in der PIF-Datei vorhanden) nicht kannte — der Auto-Stop landete auf dem nächsten logischen Tag ohne Start und blähte die angezeigte Dauer auf (Symptom: Uwe Schönfeld mit 11 h am 10.05.). Fix: verwaiste Stop-Einträge werden in `buildDB` übersprungen (`if (!openStart) continue`)

### Geändert

- **Service Worker**: Cache-Version auf `lgc-shell-v16` erhöht — erzwingt Update auf allen installierten PWAs (v15 war bereits auf manchen Geräten ausgerollt)
- **`APP_VERSION`**: auf `'1.0.1'` gesetzt — Splash Screen zeigt korrekte Version

### Tests

- **`test_dashboard.html`**: `buildDB`-Stub durch echte Produktions-Implementierung ersetzt (Start/Stop-Pairing, Timestamp-Fallback); `makeLog` berechnet jetzt echte Startzeitstempel; Suiten 5, 13, 14 auf paired Start/Stop umgestellt; Suite 15 neu: 5 Regressionsfälle für den Auto-Stop-Bug
- **`test_sw.html`**: CACHE_NAME auf `lgc-shell-v16` aktualisiert

### Hinweis

Der v1.0-Tag enthielt `lgc-shell-v14` (der SW-Bump auf v15 wurde nach dem Tag-Setzen committed). v1.0.1 bereinigt das mit v16.

---

## [1.0] – 2026-05-08

### Hinzugefügt

- **Protokoll-Konsolidierung** (`admin.html` + `admin-app.js`): Neue Karte „📋 Protokoll-Konsolidierung" im Admin-Tab „Geräte" — liest alle Gerätedateien (`lgc_*_YYYY-MM-DD.json`) aus der Cloud und ergänzt fehlende Einträge in den Nutzer-PIF-Dateien (`lgc_pif_<userId>_YYYY-MM.json`). Bestehende Einträge werden nicht überschrieben. Läuft außerdem automatisch beim Laden der Nutzerliste im Hintergrund (`console.debug`-Ausgabe); manuell auslösbar per Button mit Live-Protokoll
- **PIN-gesetzt-Badge** in `admin.html`: Zeigt grünes „✓ PIN gesetzt"-Badge in der Nutzer-Tabelle an, wenn ein Nutzer bereits einen PIN-Hash (Salt) hat — sofort erkennbar ob Erst-Login noch aussteht

### Geändert

- **Robuste Eintrags-Deduplizierung** (`lifeguardclock.js`, `dashboard-app.js`): `normalizeImportedEntries()` / `takeUniqueImportedEntries()` vergeben Einträgen ohne `id` einen deterministischen Fallback-Schlüssel (`fallback:<content-hash>:<index>`) — verhindert Datenverlust und Doppelzählung bei Legacy-Einträgen ohne ID in allen Import- und Merge-Pfaden
- **Logische Tagesgrenze im Dashboard** (`dashboard-app.js`): `entryLogicalDay()` berücksichtigt `dayBoundaryHour` — Einträge vor 04:00 Uhr werden dem Vortag zugeordnet (wie in LifeguardClock.html); betrifft Datei-Import und Cloud-Laden für PIF- und Gerätedateien
- **admin-server.bat**: `cd /d "%~dp0"` am Anfang — Server startet korrekt auch wenn das BAT-File aus einem anderen Verzeichnis aufgerufen wird

### Behoben

- **`pushUserPif` schreibt nur heutige Einträge** (`lifeguardclock.js`): Filter `startsWith(day)` schrieb nur Einträge des aktuellen Tages in die monatliche PIF-Datei — korrigiert auf `startsWith(month)`; beim Ausstempeln in einem anderen Gerät wurden so die früheren Einträge des Monats nicht mitgeführt
- **`compareLogEntries`** (`lifeguardclock.js`): Neue Sortierfunktion für `mergeUserEntries` — sortiert zuerst nach numerischer ID, dann nach Zeitstempel, dann lexikografisch; verhindert Inkonsistenzen beim Mischen lokaler und Cloud-Einträge ohne numerische IDs
- **`restoreFromCloud` Eintrags-Normalisierung** (`lifeguardclock.js`): Wiederhergestellte Backup-Einträge werden vor dem Speichern normalisiert — Einträge ohne ID erhalten Fallback-Schlüssel, Backup-Anzahl im Toast zeigt tatsächliche Entry-Anzahl nach Normalisierung

### Tests

- Bestehende Test-Suites 34–43 unverändert gültig; Änderungen an `mergeUserEntries` und `normalizeImportedEntries` durch Suite 34 abgedeckt

---

## [0.9] – 2026-03-23

### Hinzugefügt

- **Sonderevents / `lgc_events.json`**: Neues Cloud-Dokument für tagesbasierte Zeitfenster-Overrides — Admin legt Events mit Datum, Label und Typ-Zeitfenstern an; Stempeluhr lädt beim Cloud-Sync das aktive Event für heute und wendet dessen Zeitfenster mit höchster Priorität an (Event > localStorage-Override > Typ-Default > globaler Default)
- **Event-Badge im Dashboard-Header**: Kleines `📅`-Symbol rechts der Uhrzeit zeigt an, wenn heute ein Sonderevent aktiv ist (Tooltip: Event-Label); wird per `updateEventBanner()` bei jedem Sync aktualisiert
- **Events-Verwaltung in admin.html**: Neue Karte „Sonderzeiten-Events" im Tab „Typen & Sonderzeiten" — vollständiges CRUD (Anlegen, Bearbeiten, Löschen) mit Datum-Picker und Typ-spezifischen Start-/End-Zeiten für alle konfigurierten Typen; Duplikat-Schutz (max. 1 Event pro Tag)
- **Admin Tab-Navigation**: admin.html in 4 Tabs reorganisiert: „☁ Cloud & QR", „👥 Mitglieder", „🏷 Typen & Sonderzeiten", „📱 Geräte" — Tab-Zustand wird in localStorage gespeichert und beim Reload wiederhergestellt
- **Desktop-Layout (IS_DESKTOP)**: Stempelkacheln werden auf Nicht-Touch-Geräten mit ≥ 1024 px Bildschirmbreite automatisch nebeneinander angezeigt (max. 3 pro Reihe, 300 px Höhe) — unabhängig von der Zugriffs-URL (nicht mehr nur auf `localhost`)
- **Typen-Fallback aus `config.js`**: Wenn `lgc_types.json` in der Cloud noch nicht existiert (HTTP 404), werden die Typen aus `CONFIG.types` automatisch vorbefüllt — einmaliges „In Cloud speichern" genügt zur Erstanlage; gilt für Auto-Load beim Start und für den manuellen „Typen laden"-Button

### Geändert

- **10 Farben vollständig**: `orange`, `cyan`, `pink`, `lime` jetzt in allen vier relevanten Stellen konsistent: `VALID_COLORS`, `varMap` (CSS-Variablen in Kacheln), `colorToThClass` (Stunden-Übersicht), `.ov-th-*`-CSS-Klassen
- **Service Worker**: Cache-Version auf `lgc-shell-v13` erhöht — erzwingt Update auf allen installierten PWAs

### Behoben

- **Admin-Karten beim Start zugeklappt**: Cloud- und Typen-Karten in admin.html wurden beim Start mit zugeklappter Karte aber offenem Icon angezeigt (doppeltes `class`-Attribut im HTML); Typen-Karte startet jetzt korrekt offen
- **Auto-Load Typen fehlerfrei**: Netzwerkfehler beim automatischen Typen-Laden beim Start werden jetzt als Toast angezeigt statt silent ignoriert; `btn-types-save` wird beim Auto-Load korrekt aktiviert

### Tests

- **`test_LifeguardClock.html`**: Suite 38 `ACTIVE_EVENT Zeitfenster-Override` (5 Fälle); Suite 39 `normalizeType/VALID_COLORS alle 10 Farben` (16 Fälle inkl. Per-Farbe-Loop); Suite 40 `colorToThClass/varMap Vollständigkeit` (23 Fälle inkl. Per-Farbe-Loops)
- **`test_admin.html`**: `assertNull`/`assertNotNull`-Hilfsfunktionen ergänzt; Suite 7 `Events – Datum-Matching` (5 Fälle); Suite 8 `Events – Duplikat-Schutz` (5 Fälle)
- **`test_sw.html`**: CACHE_NAME auf `lgc-shell-v13` aktualisiert

---

## [0.9.1] – 2026-03-23

### Sicherheitsfixes (Security-Review v0.9)

- **QR-Bootstrap Bestätigungsdialog** (Issue 1): Gescannter `lgc://cloud?`-QR-Code wird nicht mehr blind übernommen — neues Overlay zeigt Server-URL und Benutzernamen, Nutzer muss explizit bestätigen; `escHtml()` schützt die Anzeige
- **Rate-Limit PIN + Admin-Passwort** (Issue 3): 3 aufeinanderfolgende Fehlversuche lösen eine 5-Minuten-Sperre aus; Fehlermeldung zeigt verbleibende Versuche bzw. Restdauer; Zähler wird bei Erfolg zurückgesetzt; gilt sowohl für den PIN-Keypad als auch für den Admin-Passwort-Dialog
- **CSS-Kontext-Injection `t.color`** (Issue 5): `safeColor()`-Whitelist in `admin-app.js` prüft alle 10 erlaubten CSS-Farbnamen; unbekannte Werte werden auf `'blue'` zurückgesetzt
- **Nutzerdrift / Tombstone** (Issue 6): `removedIds`-Array in `lgc_users.json` verhindert, dass vom Admin gelöschte Nutzer auf anderen Geräten wieder auftauchen; `deleteUser` in admin-app.js schreibt IDs in die Tombstone-Liste, `mergeCloudUsers` filtert sie aus der lokal-only-Liste
- **Schema-Validierung Cloud-Daten** (Issue 4): Neue Minimal-Validatoren `_validCloudUser`, `_validCloudType`, `_validCloudEvent` in `lifeguardclock.js` und `_validUser`, `_validType` in `admin-app.js` — ungültige Einträge (Nutzer: fehlendes `id`/`name`; Typen: fehlendes `key`/`logType`; Events: fehlendes ISO-Datum) werden mit `console.warn` verworfen, bevor Daten in localStorage gespeichert werden; betrifft `syncUsersFromCloud`, `syncCloudConfig` (Types + Events) und `loadUsers`/Types-Load in admin
- **Selektive catch-Blöcke** (Issue 9): Netzwerkfehler (`TypeError` / fetch-Meldung) bleiben still; unerwartete Parse-/Logik-Fehler werden mit `console.warn('[lgc] ...')` sichtbar gemacht
- **admin-server.py: Multi-Threading + Root-Redirect** (Issue 8): `HTTPServer` auf `ThreadingHTTPServer` umgestellt — parallele Browser-Anfragen (PROPFIND + GET) werden nicht mehr gestapelt; GET `/` leitet automatisch auf `/admin.html` weiter

### Tests

- **`test_LifeguardClock.html`**: Suite 41 `mergeCloudUsers mit removedIds` (5 Fälle); Suite 42 `_validCloudUser/_validCloudType/_validCloudEvent` (15 Fälle); Suite 43 `Rate-Limit Zähler/Lockout-Logik` (5 Fälle) — Sperrzeit auf 5 Minuten korrigiert
- **`test_admin.html`**: Suite 9 `safeColor CSS-Injection-Schutz` (5 Fälle); Suite 10 `_validUser/_validType Schema-Validierung` (11 Fälle)
- **`test_sw.html`**: CACHE_NAME auf `lgc-shell-v14` aktualisiert

### Geändert

- **Service Worker**: Cache-Version auf `lgc-shell-v14` erhöht — erzwingt Update auf allen installierten PWAs

### Behoben (Review 2)

- **Lockout-Sperrzeit konsistent auf 5 Minuten**: Kommentar, UI-Meldung (`submitAdminPw`) und Test-Suite 43 stimmten nicht mit `RATE_LOCKOUT_MS = 5 * 60 * 1000` überein — alle auf 5 Minuten vereinheitlicht
- **Admin Auto-Load leere Typen**: Auto-Load beim Start ignorierte leere `lgc_types.json` (Guard `length > 0`) — wird jetzt wie der manuelle Load-Button behandelt; leeres Array löscht korrekt die lokale Typ-Liste; ungültige Einträge werden per `_validType` gefiltert
- **CSS-Variablen-Tippfehler** (`LifeguardClock.html`): `var(--surface2)` → `var(--surface-2)`, `var(--muted)` → `var(--text-2)` — QR-Scanner-Overlay-Eingabefeld und Trennlinie wurden wegen unbekannter Variablen ohne korrekte Hintergrundfarbe gerendert
- **jsQR Lazy-Load Fehlerbehandlung**: Fehlt oder ist `jsqr.min.js` beschädigt, blieb der QR-Scanner-Overlay in halbem Zustand stehen — jetzt: `stopQrScanner()` + `showManualCloudForm()` auf Ladefehler

### Bekannte Restrisiken (bewusst akzeptiert)

- **Admin-Passwort-Fallback**: Bei erstmaligem Setup oder gelöschtem Storage fällt die App auf ein bekanntes Default-Passwort zurück. Mittelfristig soll ein First-Run-Setup-Zwang eingeführt werden.
- **Cloud-Credentials in `localStorage`**: WebDAV-Zugangsdaten liegen im Klartext im Browser-Storage. Empfehlung: dediziertes App-Passwort/Nebenkonto verwenden. Für Kiosk-Geräte mit physischer Zugangskontrolle akzeptabel.

---

## [0.8] – 2026-03-21

### Hinzugefügt

- **Content Security Policy (CSP)**: Alle 4 HTML-Dateien haben jetzt ein `<meta http-equiv="Content-Security-Policy">`-Tag mit `script-src 'self'` — Inline-Scripts und -Handler sind vollständig entfernt, XSS über Script-Injection wird vom Browser geblockt
- **JS-Extraktion**: Inline-`<script>`-Blöcke aus allen HTML-Dateien in externe JS-Dateien ausgelagert: `lifeguardclock.js`, `admin-app.js`, `dashboard-app.js`, `editor-app.js`
- **qrcode.min.js lokal gebündelt**: QR-Code-Generator in admin.html lädt jetzt aus lokalem Paket statt CDN
- **jsQR lokal gebündelt** (`jsqr.min.js`): QR-Scanner lädt jsQR jetzt aus dem lokalen Paket statt direkt vom CDN; funktioniert jetzt auch im Offline-/Kiosk-Betrieb ohne initiale Internetverbindung
- **Proxy-Layout (PC/localhost)**: Stempelkacheln werden im Browser bei `localhost` nebeneinander in fester Höhe (220 px) angezeigt statt hochskaliert auf Vollbild — übersichtlicher für die Web-Oberfläche

### Geändert

- **Alle Inline-onclick/onchange-Handler entfernt**: Statische Handler durch `addEventListener`, dynamische Handler durch Event-Delegation mit `data-*`-Attributen ersetzt — insgesamt ~44 Handler in LifeguardClock.html migriert
- **Service Worker** (`sw.js`): Cache-Version auf `lgc-shell-v12`, APP_SHELL enthält alle 5 neuen JS-Dateien
- **Fehlendes `#users-section`-Element**: `<div id="users-section">` im Tab Passwort ergänzt — `renderUsersSection()` hatte bisher ins Leere gerendert

### Behoben

- **PIN-Eingabe auf Touchscreens (Doppel-Auslösung)**: `touchend`-Handler auf dem Keypad prüft jetzt `e.cancelable` bevor `preventDefault()` aufgerufen wird; `click`-Handler ignoriert synthetische Clicks innerhalb von 500 ms nach `touchend` — verhindert doppelte Zifferneingabe bei nicht-cancelable Events (z. B. während Scroll-Geste auf Fire-Tablet / Silk)
- **XSS-Escaping editor.html Timeline**: Typ-Labels (`ti.label`) in Legende, Zeilen-Header und Segment-`title`-Attributen, sowie `logicalDay` im Timeline-Header jetzt über `escHtml()` escaped
- **dashboard.html `jumpToDay` onclick entfernt**: Kalender-Tage nutzen jetzt `data-iso`-Attribute + Event-Delegation
- **Inline-onclick `handleAction`**: `type.key` wird jetzt über `data-type`/`data-action`-Attribute übergeben
- **Schema-Validierung `lgc_users`**: Einträge ohne `id` oder `name` werden in `getUsers()` verworfen
- **Schema-Validierung Cloud-Typen**: Zentrale `normalizeType()`-Funktion validiert und normalisiert alle Typ-Felder; `color` wird gegen Whitelist geprüft, `key` gegen `[a-zA-Z0-9_-]`; ungültige Arrays/Zahlen werden verworfen
- **jsQR CDN-Fallback entfernt**: CDN-Nachlade-Versuch wurde durch CSP (`script-src 'self'`) sowieso blockiert — jetzt klarer Fehler statt stiller Fehlschlag
- **Editor: negative Dauer beim Bearbeiten verhindert**: Stop-vor-Start-Validierung greift jetzt auch beim nachträglichen Editieren (nicht nur beim Hinzufügen)
- **Editor: Import-Validierung**: `normalizeLogEntries()` filtert ungültige Einträge bei Cloud- und Datei-Imports (fehlende Pflichtfelder, ungültige Zeitstempel, unbekannte Aktionen)

### Tests

- **`test_LifeguardClock.html`**: Suite 35 `getUsers() Schema-Validierung` (6 Fälle); Suite 36 `filterValidCloudTypes()` (7 Fälle); Suite 37 `escHtml XSS-Escaping` (7 Fälle)
- **`test_sw.html`**: APP_SHELL + CACHE_NAME auf v12 aktualisiert; 3 neue Tests für neue JS-Dateien im Cache-Routing

---

## [0.7] – 2026-03-20

### Hinzugefügt

- **Per-User Cloud-Dateien (PIF)**: Jeder Nutzer bekommt eine eigene Cloud-Datei `lgc_pif_<userId>_YYYY-MM.json` — Stempel-Einträge werden sofort nach jedem Stempeln dorthin geschrieben; beim Login wird die Datei aus der Cloud geladen und mit dem lokalen Stand gemergt → aktiver Status ist jetzt geräteübergreifend konsistent (einstempeln auf Gerät A, ausstempeln auf Gerät B funktioniert korrekt)

### Geändert

- **QR-Scanner**: BarcodeDetector durch jsQR ersetzt — funktioniert jetzt auf allen Browsern (Firefox, Safari/iOS, ältere Android-WebViews); jsQR wird bei Bedarf von CDN nachgeladen (`jsdelivr.net`)
- **Dashboard Cloud- und Datei-Laden**: Erkennt und lädt jetzt beide Dateitypen — `lgc_pif_*` (per Nutzer) und `lgc_*_DATUM.json` (per Gerät); Einträge werden geräteübergreifend dedupliziert um Doppelzählung zu vermeiden wenn beide Quellen geladen werden
- **Kachel-Layout Landscape-Tablets**: `@media (max-height: 640px)` sorgt dafür dass genau 3 Stempelkacheln auf den Schirm passen (getestet auf Fire 7, 1024×600 px) — überschreibt die 768px-Desktop-Paddings die vorher 52px Bottom-Abstand erzwangen; Kachelhöhe via `height: calc((100vh - 148px) / 3)`, Schriften und Buttons kompakter
- **Editor Cloud-Laden**: Zeigt ausschließlich `lgc_pif_*`-Dateien im Dropdown — Gerätedateien können weiterhin per lokalem Datei-Picker geladen werden; PIF-Format wird korrekt geladen (`entries` → `log`) und gespeichert; Typen werden beim Cloud-Laden automatisch aus `lgc_types.json` aktualisiert (`lgc_cloud_types`-Fallback in `buildTypeMaps`)
- **About-Dialog**: Splash-Logo vergrößert (240 px), GitHub-Link ergänzt

### Behoben

- **Service Worker Cache-Version** auf `lgc-shell-v10` erhöht — erzwingt Cache-Update auf installierten PWAs so dass der neue jsQR-Scanner ausgeliefert wird statt des gecachten v0.6-Stands (mit BarcodeDetector)
- **Service Worker cached `/remote.php/` im Proxy-Modus**: Wenn die App über den lokalen Proxy (`localhost`) läuft, wurden same-origin `/remote.php/…`-Requests fälschlicherweise in den Cache geschrieben — jetzt immer Network-Only
- **XSS-Escaping editor.html**: `e.nutzer` im Edit-Input-`value`-Attribut und in der Anzeigespalte, `ti.label` im Typ-Badge, `t.logType`/`t.label` im Typ-Dropdown und Cloud-Picker-`href` / Dateiname jetzt konsequent über `escHtml()` escaped; `populateTypSelect()` escaped jetzt `t.logType` und `t.label`
- **XSS-Escaping dashboard.html**: Typ-Labels (`T_INFO[t]?.label`) in Übersichts-, Tages-, Wochen- und Personen-Tabellen sowie Personennamen in Tages- und Wochen-Tabellenzeilen jetzt escaped
- **XSS-Escaping LifeguardClock.html**: `tl` (Typ-Label) im Badge der Edit-Modal-Tabelle escaped; `stopUserSessions`- und `openEditModal`-Buttons nutzen jetzt `data-uid`/`data-name`-Attribute statt unsicherer String-Interpolation im `onclick`-Handler (verhindert JS-Injection durch Sonderzeichen in Benutzernamen)
- **Orientierungs-Inkonsistenz**: `screen.orientation.lock()` rief bisher `'landscape'` auf — widerspricht Manifest (`"orientation": "portrait"`) und CSS-Fallback (zeigt „Bitte Gerät drehen" im Querformat); jetzt `'portrait'`
- **Event-Listener-Leak dashboard.html**: `renderPersonFilter()` hat bei jedem `renderAll()`-Aufruf einen neuen Click-Handler am `#person-filter`-Element registriert — Listener wird jetzt einmalig beim Initialisieren gesetzt
- **Versionsdrift**: `APP_VERSION` in `LifeguardClock.html` auf `'0.7'` aktualisiert

### Tests

- **`test_LifeguardClock.html`**: Suite 34 für `mergeUserEntries` — 6 Testfälle (leere Eingabe, null, neue Einträge, Duplikate, Mischung, Sortierung)
- **`test_sw.html`**: Neuer Testfall „same-origin `/remote.php/` (Proxy-Modus localhost) → network-only"

---

## [0.6] – 2026-03-19

### Hinzugefügt

- **Zentrale Typen-Verwaltung** (`lgc_types.json`): Stempel-Typen werden jetzt zentral in der Cloud gespeichert und in `admin.html` verwaltet (Anlegen, Bearbeiten, Löschen) — gelten automatisch für alle Geräte beim nächsten Start
- **Typen-Karte in admin.html**: Neue Karte „Stempel-Typen" — vollständige Formular-Bearbeitung aller Typ-Felder (key, label, logType, Farbe, Berechtigung, Max-Dauer, Pflichtpause, Zeitfenster, Mutex, AutoStart); farbige Punkte zeigen Typ-Farbe direkt in der Liste
- **Permissions automatisch aktuell**: Berechtigungs-Checkboxen beim Nutzer-Anlegen/Bearbeiten kommen jetzt aus den zentralen Typen — neue Typen erscheinen ohne Anpassung der Konfiguration sofort
- **Per-device Overrides**: Gerätekonfiguration enthält jetzt nur noch `typeOverrides` (disabled + zeitfenster pro Typ) statt vollständiger Typen-Kopie
- **Auto-Registrierung**: Findet `silentConfigCheck` keine `lgc_config_<deviceId>.json` in der Cloud (HTTP 404), wird die Gerätekonfiguration automatisch gepusht — Gerät erscheint danach in der admin.html-Gerätesuche
- **10 Farben**: Farbpalette erweitert von 5 auf 10 — neu: `orange`, `lime`, `cyan`, `violet`, `pink`, `grey`; konsistent in LifeguardClock.html, admin.html, dashboard.html und editor.html
- **Geräteinfo im Admin-PIN-Popup**: Zeigt Geräte-ID und Cloud-Sync-Status (Uhrzeit letzter Sync oder Fehlertext) direkt beim Admin-Login-Prompt
- **„Gerät drehen"-Overlay nur auf Touchgeräten**: Media-Query `pointer: coarse` begrenzt das Hochformat-Overlay auf echte Mobilgeräte — erscheint nicht mehr auf Laptops oder Desktops
- **PWA Statusleiste**: `viewport-fit=cover` + `background:#09090d` auf `<html>` — verhindert weißen Streifen im Statusleistenbereich auf Android/iOS

### Geändert

- **`lgc_config_<deviceId>.json`**: Neues Format `v2` — enthält nur noch gerätespezifische Felder + `typeOverrides`, keine vollständige Typ-Definition mehr (Rückwärtskompatibilität zu v1-Format gewährleistet)
- **`config.js`**: `types`-Array dient nur noch als lokaler Fallback; globale Typen werden aus `lgc_types.json` geladen
- **`silentConfigCheck`**: Prüft jetzt zusätzlich `lgc_types.json` — bei Änderung automatischer Reload; fehlende Gerätekonfiguration löst Auto-Push aus
- **Orientierungssperre**: JS `screen.orientation.lock()` entfernt — PWA-Manifest übernimmt Portrait-Erzwingung ohne Animations-Flackern beim Start
- **Service Worker**: Cross-Origin-Requests (Cloud/WebDAV beliebiger Anbieter) werden nicht mehr gecacht — vorher war nur Nextclouds `/remote.php/` explizit ausgenommen; basename-Matching für App-Shell ist jetzt kompatibel mit GitHub Pages Subdirectory-Deployment; Cache auf `lgc-shell-v9`
- **`genId()` in `admin.html`**: Nutzer-IDs werden jetzt via `crypto.randomUUID()` erzeugt (Fallback: `Date.now() + random`), statt nur `Date.now()` — keine Kollisionen bei schnellen Mehrfachaktionen

### Behoben

- **Monatswechsel-Bug**: Auto-Stop an der Tagesgrenze (z. B. 04:00 Uhr) hat am Monatsende falsche Dauern (0 ms) erzeugt, weil `calcDurationMs` und `getTypeStartMs` nur den aktuellen Monats-Log durchsuchten — jetzt wird auch der Vormonats-Log einbezogen (`getPrevLog`)
- **User-Rename**: Umbenennen eines Nutzers hat alle bisherigen Log- und Backup-Einträge unter dem alten Namen belassen — Auswertungen zeigten dieselbe Person doppelt; alle `lgc_log_*`- und `lgc_backup_*`-Einträge werden jetzt beim Umbenennen mitgezogen
- **Cloud-Sync überschreibt lokale PINs**: Startup-Sync hat lokal gesetzte PINs (Hash+Salt) mit dem Cloud-Stand überschrieben, wenn dort noch eine OTP-Version stand — neues Merge-Verhalten bevorzugt die lokale Version sofern der Nutzer seine PIN bereits gesetzt hat
- **Cloud-PIN-Reset nicht wirksam**: Admin-Reset in `admin.html` (PIN löschen + `mustChangePIN: true`) wurde auf Geräten ignoriert, die bereits einen lokalen Hash hatten — expliziter Admin-Reset (kein `salt` in Cloud) gewinnt jetzt immer
- **CSV Formula Injection**: Felder wie Nutzername und Typ-Bezeichnung in CSV-Exporten wurden ohne Schutz gegen Formel-Injection ausgegeben; `=`, `+`, `-`, `@`, Tab, CR als Zell-Präfix werden jetzt neutralisiert — betrifft Haupt-App und Dashboard
- **Basic Auth bricht bei Nicht-ASCII-Credentials**: `btoa()` direkt auf Klartext aufgerufen; Umlaute oder andere Nicht-ASCII-Zeichen in Nextcloud-Passwörtern konnten die Verbindung brechen — jetzt `btoa(unescape(encodeURIComponent(...)))` in `LifeguardClock.html` (8 Stellen) und `admin.html`

### Sicherheit

- **`einmalpins.html` aus Release-ZIP entfernt**: Datei enthält echte Mitgliedernamen und aktive Einmal-PINs und darf nie verteilt werden (war bereits in `.gitignore`, fehlte aber im Release-Script)
- **`fully-settings.json` aus Release-ZIP entfernt**: Enthält verschlüsselte Kiosk- und Remote-Admin-Passwörter sowie den Betreibernamen — gerätespezifisch, nicht für Weitergabe geeignet (war bereits in `.gitignore`)

### Tests

- **`test_sw.html`**: Routing-Logik auf neuen SW-Stand aktualisiert (Cross-Origin → `network-only`, basename-Matching, `lgc-shell-v9`)
- **`test_admin.html`**: `authHeader` verwendet jetzt Unicode-sicheres Encoding; neuer Testfall für Umlaute in Credentials
- **`test_LifeguardClock.html`**: Suite 21 (Push-Export) korrigiert — `types` dürfen nicht mehr im Geräte-Export stehen; Kettenreaktion-Regressionstest als in v0.6 strukturell behoben dokumentiert

---

## [0.5] – 2026-03-18

### Hinzugefügt

- **Maskable PWA-Icon**: `Logo-icon.png` (schwarzer Hintergrund, kein Text) als `maskable`-Icon im Manifest — Android zeigt adaptives Icon ohne weißen Rand
- **Manuelle Cloud-Eingabe**: Formular (URL, Benutzername, App-Passwort) immer sichtbar unterhalb des QR-Scanners — kein separater Fallback-Modus mehr, funktioniert auf allen Geräten
- **iOS-Kompatibilität**: Kein BarcodeDetector → Video wird ausgeblendet, Formular bleibt — Cloud-Einrichtung auf Safari/iOS vollständig möglich
- **Geräte-Registrierung**: Nach QR-Scan oder manueller Cloud-Eingabe wird `lgc_config_<deviceId>.json` sofort in die Cloud geschrieben — Gerät erscheint dadurch direkt in der Gerätesuche von `admin.html`
- **PWA-Update-Toast**: Service Worker `controllerchange`-Event → App zeigt Toast „Update installiert" und lädt automatisch neu
- **Cloud Deploy-Signal**: Admin kann in `admin.html` (Tab Cloud & Gerät) ein Deploy-Signal senden (`lgc_deploy.json`) — alle verbundenen Geräte laden beim nächsten `silentConfigCheck` automatisch neu
- **XSS-Härtung admin.html**: Geräte-IDs und Zeitfenster-Werte in `innerHTML` konsequent mit `escHtml()` escaped

---

## [0.4] – 2026-03-17

### Hinzugefügt

- **Fallback-Konfiguration**: Fehlt `config.js` (z. B. GitHub Pages), startet die App automatisch mit Minimal-Config (nur Anwesenheit, Admin-PIN `000000`) — ermöglicht Hosting ohne sensible Dateien im Repo
- **GitHub Pages Hosting**: App direkt über GitHub Pages hostbar — kein eigener Server nötig; Fallback greift automatisch wenn `config.js` fehlt
- **QR-Code Cloud-Setup**: Admin erzeugt Einrichtungs-QR in `admin.html` → Mitglieder scannen auf dem Login-Screen → Cloud automatisch konfiguriert (BarcodeDetector API)
- **Admin-Tabs**: Admin-Bereich in Tabs unterteilt (Protokoll, Stunden, Passwort, Zeitfenster, Cloud & Gerät)
- **Stille Konfig-Aktualisierung**: Gerätekonfiguration wird beim App-Start und bei Netzwerkrückkehr automatisch aus der Cloud aktualisiert (ohne Benutzerinteraktion)
- **Hosting-Dokumentation**: README um Abschnitt „Hosting / Installation" erweitert (GitHub Pages/PWA, Tablet/Kiosk, Windows); DOKUMENTATION.md erklärt Fallback-Config mit Sicherheitshinweis

### Geändert

- **Default Admin-Passwort**: `Admin1234` → `Admin19101913`
- **Nutzerverwaltung**: Aus dem Stempeluhr-Admin entfernt — erfolgt jetzt ausschließlich über `admin.html`
- **Cloud & Gerät**: „In Cloud sichern" und „Als Datei herunterladen" für Nutzerdaten entfernt (Verwaltung über `admin.html`)

### Sicherheit

- **XSS-Härtung**: Alle innerHTML-Stellen mit dynamischen Nutzerdaten (Namen, PINs, Labels) konsequent mit `escHtml()` escaped — betrifft LifeguardClock.html, dashboard.html und editor.html
- **Admin-Passwort gehasht**: Admin-Passwort wird per SHA-256 + Salt in localStorage gespeichert statt im Klartext; Migration von Altbestand automatisch

### Tests

- **test_admin.html**: Neue Testsuite für admin.html-Kernlogik (OTP-Erzeugung, ID-Generierung, HTML-Escaping, Nutzerverwaltung, Auth-Header)
- **test_sw.html**: Neue Testsuite für Service Worker (Request-Routing, APP_SHELL-Konfiguration, Edge Cases)

---

## [0.2] – 2026-03-17

### Hinzugefügt

- **Service Worker** (`sw.js`): App-Shell offline-fähig (Cache-First für HTML/Logo/Manifest, Network-First für config.js und WebDAV)
- **`cloudSyncDebounceSeconds`** in `config.js`: Cloud-Sync-Verzögerung konfigurierbar; im Proxy-Betrieb (`localhost`) wird sie ignoriert — sofortiger Sync
- **`lgc_type_config`** (localStorage): LifeguardClock schreibt Typ-Konfiguration (logType, label, color) beim Start; Dashboard und Editor lesen daraus Farben und Labels — unabhängig davon ob `config.js` im Browser verfügbar ist
- **Editor Cloud-Integration**: Buttons „☁ Cloud" (Datei aus WebDAV laden) und „☁ Speichern" (zurückschreiben) im Proxy-Betrieb
- **Zeitfenster über Mitternacht**: Fenster wie `22:00–02:00` werden korrekt erkannt (`start > end` → `now >= start || now < end`)
- **`make-release.ps1`**: Reproduzierbares Release-ZIP ohne sensible Dateien (`config.js`, `admin_config.js`)
- **Kaskadierter Stopp**: Wird ein Typ gestoppt, werden automatisch alle Typen beendet die ihn in `autoStartKeys` referenzieren (z. B. Anwesenheit beenden stoppt laufenden Wach-/Sanitätsdienst)

### Geändert

- **Umbenennung**: `stempeluhr.html` → `LifeguardClock.html`, Präfix `stempeluhr_` → `lgc_` (localStorage-Keys und Cloud-Dateien)
- **Log-Key nach Monat**: `lgc_log_YYYY` → `lgc_log_YYYY-MM` — begrenzt Wachstum auf ~120 KB/Monat statt unbegrenzt pro Jahr
- **Einheitliche Cloud-Zugangsdaten**: Ein einziger `lgc_cloud`-Key für LifeguardClock, Dashboard, Editor und admin.html — Eingabe in einer App gilt sofort in allen anderen
- **Typ-Farben** in Dashboard, Editor und „Meine Stunden": Alle Apps verwenden jetzt die in `config.js` konfigurierten Farben (`blue`, `amber`, `red`, `green`, `violet`) statt hardcodierter Positionen
- **Admin-Server**: Bindet jetzt ausschließlich auf `127.0.0.1` (vorher `0.0.0.0` — im LAN erreichbar)

### Behoben

- **`calcDurationMs`**: Trifft der Rückwärtsscan zuerst auf einen `stop`-Eintrag, wird `0` zurückgegeben statt den falschen Start zu nehmen — verhindert fehlerhafte Dauern bei Dateninkonsistenz (z. B. `start, stop, stop`)
- **Zeitfenster-Vergleich**: Numerisch statt lexikografisch — `9:00` wurde früher größer als `10:00` bewertet
- **CORS**: Korrekte Header-Behandlung für WebDAV-Requests vom Browser
- **`crypto.randomUUID()`**: Fallback für ältere Android WebViews (Fire OS)
- **Admin-Log-Tabelle**: Scrollbereich hatte kollabierte Höhe — Tabelle zeigte nur eine Zeile
- **„Meine Stunden"-Farben**: `color: 'amber'` wurde als ungültiger CSS-Wert direkt gesetzt; jetzt `var(--amber)`
- **5 weitere Bugs** aus Code-Review (Kettenreaktion leere Cloud-Types, defaultUsers-Schutz, Tageswechsel-Auto-Stop u. a.)

---

## [0.1-rc1] – 2026-03-15

Erste veröffentlichte Version.

### Enthalten

- PIN-Login (6 Stellen, SHA-256 + Salt)
- Konfigurierbare Stempel-Typen (`CONFIG.types[]`) mit Farben, Zeitlimits, Pflichtpausen, Zeitfenstern, Berechtigungen
- Automatiken: `mutexKeys`, `autoStartKeys`, `maxDurationMs`/`cooldownMs`, `requiresZeitfenster`
- Admin-Bereich: Log, Stunden-Übersicht, Nutzer-/PIN-Verwaltung, Zeitfenster-Editor, Cloud-Sync
- Cloud-Sync zu Nextcloud / WebDAV (gerätebasierte Dateinamen für Multi-Gerät-Betrieb)
- Kaskadierter Tageswechsel-Auto-Stop (`dayBoundaryHour`)
- Auswertungs-Dashboard (`dashboard.html`): Tabs Übersicht / Tage / Wochen / Personen / Export, Korrelationsanalyse, Aktivitätskalender
- Log-Editor (`editor.html`): Inline-Bearbeitung, Paar-Validierung, Timeline, Undo/Redo (50 Schritte)
- Benutzerverwaltung (`admin.html`): Cloud-basiert, Einmal-PINs
- Kiosk-Modus: Vollbild, Wake Lock, Tastatur-/Gesten-Sperre
- Lokaler Proxy-Server (`admin-server.py`) für CORS-freien WebDAV-Zugriff
- PWA-Manifest (`manifest.json`), Portrait-Erzwingung
- Unit-Tests für Kernlogik, Dashboard-Aggregation und Editor-Validierung
