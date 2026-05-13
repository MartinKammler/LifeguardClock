# Release Notes – LifeguardClock v1.1.5

## Kurzstempel-Cleanup: Schwellwert auf 15 Minuten angehoben

---

## Überblick

Dieses Release korrigiert mehrere Logik-Fehler rund um Stempel-Sortierung, PIF-Synchronisation
und den automatischen Kurzstempel-Cleanup. Der wichtigste Verhaltensunterschied zu v1.1.4:
Stempel-Paare gelten erst ab 15 Minuten Dauer als gültig (vorher: 2 Minuten).

---

## Änderungen im Detail

### Kurzstempel-Schwellwert: 2 min → 15 min

Stempel-Paare unter 15 Minuten Dauer werden beim manuellen Cleanup (Editor-Button „Monate"
bzw. „Alle prüfen") entfernt. Exakt 15-minütige Dienste bleiben jetzt erhalten (Vergleich
ist exklusiv: `< 15 min` wird entfernt, `≥ 15 min` bleibt).

Umbenennung intern: `PHANTOM_PAIR_MS` → `MIN_PAIR_DURATION_MS`.
Meldungen in Editor und App: „Phantom-Eintrag" → „Kurzstempel-Eintrag".

### Kein automatischer Kurzstempel-Cleanup mehr beim Cloud-Sync

`pushUserPif` und `mergeUserEntries` entfernen Kurzpaare **nicht** mehr automatisch.
Der Cleanup ist damit ausschließlich manuell über den Editor auslösbar. Damit wird
vermieden, dass legitime kurze Dienste beim nächsten Sync unerwartet verschwinden.

### Sortierung nach Zeitstempel (Bugfix)

`compareLogEntries` sortiert jetzt primär nach `zeitstempel`, sekundär nach `id`.
Bisher war die Reihenfolge id-zuerst, was bei nachträglich erstellten früheren Einträgen
(z. B. aus Cloud-Importen) zu falschen State-Berechnungen führte.

`rebuildStateFromLog` sortiert Einträge vor der Auswertung — der zuletzt **zeitlich**
aktive Eintrag bestimmt den Status, nicht der mit der höchsten ID.

### pushUserPif: monatsgenaue Synchronisation (Bugfix)

`pushUserPif` nimmt jetzt einen `month`-Parameter an. `addEntry` übergibt den Monat
aus dem `targetLogKey`, damit nachträglich in einen früheren Monat geschriebene Einträge
in den richtigen PIF-Monat (`lgc_pif_<userId>_YYYY-MM.json`) synchronisiert werden.

Rückgabewert: `true` (Erfolg) oder `false` (Fehler). Fehler erscheinen in der
Cloud-Fehleranzeige der App.

### logStartDate in Geräte-Config-Export

Das Feld `logStartDate` wird jetzt beim Geräte-Config-Export (`pushConfigToCloud`)
mitübertragen und über `lgc_config_<deviceId>.json` auf alle Geräte verteilt.

### Shutdown-Feedback verbessert

Bei `safeShutdown` zeigt die App `⚠ Lokal gespeichert - Cloud-Sync teilweise fehlgeschlagen`,
wenn mindestens ein PIF-Push fehlschlägt.

---

## Service Worker

Cache-Version: **`lgc-shell-v24`** — alle installierten PWAs laden beim nächsten Start
die neue Version automatisch herunter.

---

## Migration / Update

Keine Konfigurationsänderungen notwendig. Der neue 15-min-Schwellwert gilt erst beim
nächsten manuellen Cleanup über den Editor.
