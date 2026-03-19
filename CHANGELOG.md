# Changelog

Alle relevanten Änderungen pro Release. Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/).

---

## [0.7] – tbd

### Hinzugefügt

- **Per-User Cloud-Dateien (PIF)**: Jeder Nutzer bekommt eine eigene Cloud-Datei `lgc_pif_<userId>_YYYY-MM.json` — Stempel-Einträge werden sofort nach jedem Stempeln dorthin geschrieben; beim Login wird die Datei aus der Cloud geladen und mit dem lokalen Stand gemergt → aktiver Status ist jetzt geräteübergreifend konsistent (einstempeln auf Gerät A, ausstempeln auf Gerät B funktioniert korrekt)

### Geändert

- **QR-Scanner**: BarcodeDetector durch jsQR ersetzt — funktioniert jetzt auf allen Browsern (Firefox, Safari/iOS, ältere Android-WebViews); jsQR wird bei Bedarf von CDN nachgeladen (`jsdelivr.net`)
- **Dashboard Cloud- und Datei-Laden**: Erkennt und lädt jetzt beide Dateitypen — `lgc_pif_*` (per Nutzer) und `lgc_*_DATUM.json` (per Gerät); Einträge werden geräteübergreifend dedupliziert um Doppelzählung zu vermeiden wenn beide Quellen geladen werden
- **Editor Cloud-Laden**: Zeigt `lgc_pif_*`-Dateien in der Dateiliste an (mit `(PIF)`-Label); lädt und speichert PIF-Format korrekt (`entries`-Feld statt `log`)

### Tests

- **`test_LifeguardClock.html`**: Suite 34 für `mergeUserEntries` — 6 Testfälle (leere Eingabe, null, neue Einträge, Duplikate, Mischung, Sortierung)

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
