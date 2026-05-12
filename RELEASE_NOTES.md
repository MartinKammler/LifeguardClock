# Release Notes – LifeguardClock v1.1.0

## Datenkonsistenz & UX-Verbesserungen

Dieser Release schließt mehrere Lücken im Statusmodell, die nach dem Mehrgeräte-Betrieb zu
falschen Anzeigen oder falschen Auto-Stops führen konnten. Außerdem werden blockierende
`alert()`-Dialoge in Editor und Dashboard durch nicht-blockierende Toasts ersetzt, der
Shutdown-Screen zeigt jetzt den Cloud-Sync-Status, und Kiosk-Sperren lassen sich deaktivieren.

---

## Wichtigste Fixes

### Gerät-B-Login zeigt falschen Aktiv-Status (kritisch)

**Problem:** Person stempelt auf Gerät A ein → PIF in Cloud. Person öffnet auf Gerät B die App
→ PIF wird geladen und gemergt → `lgc_state` bleibt trotzdem auf `false`. Dashboard zeigt
„Inaktiv", obwohl laut Log bereits ein Start existiert.

**Fix:** Nach jedem PIF-Merge wird `lgc_state` aus dem zusammengeführten Log neu aufgebaut
(`rebuildStateFromLog`). Erscheint ein Typ nach dem Merge als aktiv, zeigt die Hauptapp
einen Toast „Aktiver Stempelstand aus Cloud übernommen".

### Auto-Stops fehlten in der Cloud-PIF (kritisch)

**Problem:** Zeitfenster-Ende, Maximaldauer, Tageswechsel und „Alle ausstempeln" schrieben den
Stop direkt in den lokalen Log ohne `pushUserPif()` aufzurufen. Die Cloud-PIF enthielt dann
einen offenen Start ohne passenden Stop.

**Fix:** Alle 6 Auto-Stop-Pfade laufen jetzt über `addEntry()`, das `pushUserPif()` aufruft.
Zusätzlich werden bei Netzwerkrückkehr PIFs für alle Nutzer nachgeschoben.

### Zeitfenster-Stop landete auf falschem Zeitpunkt (hoch)

**Problem:** Wenn das Tablet nach Ablauf des Zeitfensters aufwachte (z. B. 21:00-Fenster,
Wakeup um 21:37), wurde der Stop-Eintrag auf 21:37 gesetzt statt auf 21:00.

**Fix:** `zeitfensterEndTs(type)` berechnet den tatsächlichen Endzeitpunkt aus dem Zeitfenster
(immer in der Vergangenheit liegend).

### Monatsgrenze: Stop im falschen Monats-Log (hoch)

**Problem:** Wer am 31.05. um 20:00 einstempelte und die automatische Tagesgrenze (04:00) am
01.06. auslöste, bekam den Stop in `lgc_log_2026-06` geschrieben. Der Mai-Log enthielt dann
einen offenen Start ohne Stop.

**Fix:** `findLogKeyForOpenStart()` sucht den Log-Key des offenen Starts. `addEntry()` akzeptiert
einen `targetLogKey`-Parameter und schreibt den Stop in denselben Monats-Log.

### Cooldown startete zu spät (mittel)

**Problem:** Bei `checkTimeLimits` wurde der Cooldown ab dem Erkennungszeitpunkt gesetzt. Schlief
das Tablet 30 Minuten nach dem 2h-Limit, begann die 30-Minuten-Pause zu spät.

**Fix:** Cooldown wird jetzt ab `stopTs = startMs + maxDurationMs` berechnet.

---

## UX-Verbesserungen

### Shutdown-Screen zeigt Sync-Status

Der „Herunterfahren"-Button wartet jetzt auf den Cloud-Sync der beendeten Sitzungen und zeigt
auf dem Shutdown-Screen: „Synchronisiere Stempeldaten …" → „✓ Cloud-Sync abgeschlossen" (oder
„Stempeldaten lokal gespeichert" wenn kein Cloud-Sync konfiguriert ist).

### Kiosk-Modus konfigurierbar

Tastaturkürzel-Blocker (F5, F12, Ctrl+R …), Kontextmenü und Browser-Zurück-Geste werden nur noch
im echten Kiosk-Betrieb aktiviert (`CONFIG.kioskMode !== false && !IS_PROXY`). Im Proxy-Modus
(localhost) stehen Entwicklerwerkzeuge wieder zur Verfügung.

Kiosk explizit deaktivieren: `kioskMode: false` in `config.js`.

### „Neue Schicht" statt „Verlängern"

Der Button zum Neustarten einer laufenden Session mit `maxDurationMs` heißt jetzt **„Neue
Schicht"**. Das beschreibt präzise, was passiert: die aktuelle Sitzung wird beendet und eine
neue begonnen.

### Toasts statt blockierende Alerts

Editor (`editor.html`) und Dashboard (`dashboard.html`) verwenden jetzt nicht-blockierende
Toast-Meldungen für alle Fehlermeldungen und Validierungshinweise.

---

## Neue Funktionen (intern)

| Funktion | Datei | Zweck |
|---|---|---|
| `prevLogKey()` | `lifeguardclock.js` | Extrahierter Vormonat-Log-Key |
| `saveLogForKey(key, log)` | `lifeguardclock.js` | Gezieltes Schreiben in beliebigen Monats-Log |
| `findLogKeyForOpenStart(user, type)` | `lifeguardclock.js` | Findet Log-Key des offenen Starts |
| `zeitfensterEndTs(type)` | `lifeguardclock.js` | Tatsächlicher Zeitfenster-Ende-Timestamp |
| `rebuildStateFromLog(userId)` | `lifeguardclock.js` | State-Rebuild nach PIF-Merge |

---

## Service Worker

Cache-Version: **`lgc-shell-v19`** — alle installierten PWAs laden beim nächsten Start die neue
Version automatisch herunter.

---

## Migration / Update

Keine Konfigurationsänderungen notwendig. Bestehende `config.js`-Dateien funktionieren
unverändert weiter.

Wer Kiosk-Sperren **bewusst deaktivieren** möchte (z. B. auf Desktop-Geräten), trägt in
`config.js` ein: `kioskMode: false`.

---

## Bekannte Einschränkungen

- Bei sehr schlechter Verbindung kann der Cloud-Sync auf dem Shutdown-Screen hängen bleiben
  (Timeout des Browsers). Die Daten sind lokal gesichert und werden beim nächsten Online-Gang
  synchronisiert.
- Der Vormonat-Log-Key basiert auf der lokalen Systemzeit. Geräte mit falsch eingestellter Uhr
  können in seltenen Fällen in den falschen Monats-Log schreiben.
