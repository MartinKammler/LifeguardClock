# Release Notes – LifeguardClock v1.0.1

## Bugfix-Release

Dieser Patch behebt einen Anzeigefehler im Dashboard und stellt sicher, dass der Service-Worker-Update-Mechanismus korrekt ausgelöst wird.

### Behoben: Dashboard zeigt falsche Stundenzahl

In der Tagesansicht des Dashboards konnte eine Person eine stark überhöhte Anwesenheitsdauer angezeigt bekommen (z. B. 11 Stunden statt ~2 Stunden). Ursache:

1. Ein Gerät erzeugt an der Tagesgrenze (04:00 Uhr) automatisch einen Stop-Eintrag, wenn eine Sitzung noch als offen gilt.
2. Hatte ein anderes Gerät (oder die PIF-Datei) die Sitzung bereits manuell beendet, kannte das erste Gerät diesen Stop nicht und schrieb einen Auto-Stop mit der vollen Zeitspanne seit dem Einstempeln als `dauer_ms`.
3. Dieser Auto-Stop landet auf dem nächsten logischen Tag — ohne passenden Start. Das Dashboard zählte `dauer_ms` trotzdem, weil kein Start verlangt wurde.

**Fix:** Stop-Einträge ohne passenden Start werden jetzt in `buildDB` übersprungen. Die Daten-Bereinigung in der Cloud ist separat erforderlich (fehlerhafte Auto-Stops aus PIF und Gerätedateien entfernen).

### Service Worker v16

Der v1.0-Tag enthielt noch `lgc-shell-v14` (der Bump auf v15 wurde nach dem Tag-Setzen eingecheckt). Geräte mit v14 haben daher das v1.0-Update möglicherweise nicht automatisch erhalten. v1.0.1 bringt `lgc-shell-v16` und erzwingt das Update auf allen Geräten zuverlässig.

---

### Migration / Update

- Kein Änderungsbedarf an `config.js`, `lgc_users.json` oder Cloud-Dateiformat.
- Service Worker Cache auf `lgc-shell-v16` → Browser-Update erfolgt automatisch nach Neustart der App.
- Hard Refresh (`Strg+Shift+R`) empfohlen falls Änderungen nicht sofort sichtbar sind.
- Sollte im Dashboard noch eine überhöhte Stundenzahl angezeigt werden: fehlerhafte Auto-Stop-Einträge aus der PIF-Datei und den Gerätedateien in der Cloud entfernen (manuell oder über den Editor).

### Bekannte Einschränkungen

- Cloud-Zugangsdaten liegen weiterhin im Klartext im Browser-Storage (localStorage). Empfehlung: dediziertes App-Passwort verwenden.
- Die Rate-Limit-Sperre lebt nur im Arbeitsspeicher — ein Seitenneuladen setzt sie zurück. Für den Kiosk-Betrieb ausreichend.
