# Release Notes – LifeguardClock v1.0.2

## Feature-Release: Editor-Validierung & Quick-Fix

Dieser Release fügt dem Log-Editor einen neuen Validierungs-Modus hinzu, der alle
PIF-Dateien der letzten zwei Monate auf Stempel-Probleme prüft und direkte Korrekturen
ermöglicht — ohne langen Menüweg.

### Neu: „☁ Alle prüfen"-Button im Editor

Klick auf den neuen Button im Editor-Header startet einen vollautomatischen Scan:

1. Alle `lgc_pif_*`-Dateien des aktuellen und vorherigen Monats werden parallel aus der
   Cloud geladen.
2. Pro Person und Typ werden vier Issue-Typen erkannt:

| Issue | Beschreibung | Quick-Fix |
|---|---|---|
| **Vergessen auszustempeln** | Start ohne nachfolgenden Stop | Stop-Zeit eingeben → Speichern |
| **Stop ohne Start** | Stop-Eintrag ohne vorherigen Start | Start-Zeit nachträglich eintragen |
| **Doppelt eingestempelt** | Zwei Starts ohne Stop dazwischen | Einen der Starts löschen |
| **Verdächtig kurze Dauer** | Vollständiges Paar mit Dauer < 15 min | Zeiten korrigieren oder Paar löschen |

3. Ergebnisse erscheinen als Cards im neuen Tab „⚠ Probleme".
4. Jeder Fix wird direkt in die Cloud geschrieben (PUT auf die betroffene PIF-Datei).

#### Verknüpfte Issues (Anwesenheit ↔ Dienste)

- Wird ein Dienst-Typ (z. B. Wachdienst) beendet, bietet die Card eine Checkbox an,
  Anwesenheit gleichzeitig zu schließen — abgeleitet aus `autoStartKeys` in `lgc_types.json`,
  kein Hardcoding.
- Wird Anwesenheit beendet, werden alle offenen Dienste derselben Person am selben logischen
  Tag automatisch mit angeboten (vorgehaakte Checkboxen).

#### Überspringen

Issues können übersprungen werden (Card graut aus, Issue wird beim nächsten Scan erneut
angezeigt). „Alle zurücksetzen" macht alle Überspringen rückgängig.

---

### Service Worker v17

`editor-app.js` hat sich geändert. Der SW-Cache wird auf `lgc-shell-v17` erhöht, damit alle
installierten PWAs die neue Version automatisch erhalten.

---

### Migration / Update

- Kein Änderungsbedarf an `config.js`, `lgc_users.json` oder Cloud-Dateiformat.
- Service Worker Cache auf `lgc-shell-v17` → Browser-Update erfolgt automatisch nach
  Neustart der App.
- Hard Refresh (`Strg+Shift+R`) empfohlen falls Änderungen nicht sofort sichtbar sind.
- Der neue „Alle prüfen"-Button benötigt Cloud-Zugangsdaten (gleiche wie für den
  bestehenden „☁ Cloud"-Button im Editor).

### Bekannte Einschränkungen

- Cloud-Zugangsdaten liegen weiterhin im Klartext im Browser-Storage (localStorage).
  Empfehlung: dediziertes App-Passwort verwenden.
- Die Kurzzeit-Schwelle (15 min) ist hardcodiert; spätere Konfigurierbarkeit via
  `config.js` ist vorgesehen.
- Kein Undo/Redo für Validation-Fixes (direktes Cloud-Schreiben ohne Zwischenpuffer).
