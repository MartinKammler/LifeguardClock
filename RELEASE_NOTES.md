# Release Notes – LifeguardClock v1.0

## Highlights

Version 1.0 bringt zuverlässigere Datenhaltung und bessere Administrierbarkeit. Alle bekannten Datenverlust- und Synchronisierungs-Bugs sind behoben.

### Neue Funktion: Protokoll-Konsolidierung

In `admin.html` gibt es eine neue Karte „📋 Protokoll-Konsolidierung". Sie liest alle Gerätedateien (`lgc_*_YYYY-MM-DD.json`) aus der Cloud und überträgt fehlende Einträge in die Nutzer-PIF-Dateien. Bestehende Einträge werden dabei nie überschrieben.

Die Konsolidierung läuft automatisch im Hintergrund wenn die Nutzerliste geladen wird. Per Klick auf „🔄 Konsolidieren" kann sie manuell mit Live-Protokoll ausgelöst werden. Das ist vor allem dann sinnvoll, wenn Geräte längere Zeit offline waren oder wenn PIF-Dateien aus beliebigem Grund unvollständig sind.

### Bugfix: Monatliche PIF-Dateien unvollständig

In allen Versionen vor 1.0 hat `pushUserPif` nur die Einträge des aktuellen Tages in die monatliche Datei geschrieben — nicht den gesamten Monat. Das bedeutete: Ausstempeln auf Gerät B konnte den Einstempel-Eintrag von Gerät A nicht sehen, wenn der auf einem anderen Tag lag. Mit der Protokoll-Konsolidierung können vorhandene Lücken in bestehenden PIF-Dateien nachträglich gefüllt werden.

### Verbesserung: Robuste Deduplizierung

Einträge ohne `id` (Legacy-Daten oder manuell bearbeitete Dateien) erhalten jetzt automatisch einen deterministischen Fallback-Schlüssel. Das verhindert sowohl Datenverlust als auch Doppelzählung beim Laden und Mergen von Dateien in der Stempeluhr, im Dashboard und im Admin.

### Verbesserung: Logische Tagesgrenze im Dashboard

Das Dashboard gruppiert Einträge jetzt korrekt nach `dayBoundaryHour` (Standard: 04:00 Uhr). Einträge die nach Mitternacht aber vor der konfigurierten Grenze liegen, werden dem Vortag zugeordnet — identisch mit dem Verhalten der Stempeluhr.

### Sonstiges

- **admin-server.bat**: Startet jetzt korrekt auch wenn es aus einem anderen Verzeichnis aufgerufen wird (`cd /d "%~dp0"`).
- **PIN-gesetzt-Badge**: In der Nutzertabelle von `admin.html` ist auf einen Blick erkennbar, welche Nutzer bereits ihren PIN gesetzt haben.

---

### Migration / Update

- Kein Änderungsbedarf an `config.js`, Cloud-Dateien oder `lgc_users.json`.
- Service Worker Cache auf `lgc-shell-v15` erhöht — erzwingt automatisches Update auf allen installierten PWAs.
- Hard Refresh (`Strg+Shift+R`) empfohlen falls Änderungen nicht sofort sichtbar sind.
- Um bestehende PIF-Lücken zu schließen: `admin.html` öffnen → Tab „Geräte" → „📋 Protokoll-Konsolidierung" → „🔄 Konsolidieren".

### Bekannte Einschränkungen

- Cloud-Zugangsdaten liegen weiterhin im Klartext im Browser-Storage (localStorage). Empfehlung: dediziertes App-Passwort verwenden.
- Die Rate-Limit-Sperre lebt nur im Arbeitsspeicher — ein Seitenneuladen setzt sie zurück. Für den Kiosk-Betrieb ausreichend.
