# Changelog

Alle relevanten Änderungen pro Release. Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/).

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
