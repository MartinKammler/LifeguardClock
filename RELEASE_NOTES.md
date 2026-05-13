# Release Notes – LifeguardClock v1.1.4

## Phantom-Einträge dauerhaft entfernen

---

## Problem

Einträge, die im Editor aus Cloud-PIFs gelöscht wurden, tauchten nach dem nächsten Stempelvorgang wieder auf. Ursache: `pushUserPif` liest das lokale Geräte-Log (`lgc_log_YYYY-MM` in localStorage) als Quelle und fügt alle lokalen Einträge, die nicht in der Cloud-PIF stehen, wieder hinzu. Eine Bereinigung der Cloud reichte also nicht — das Gerät schrieb die Artefakte bei jedem Stempel zurück.

---

## Fix 1 – `logStartDate`-Cutoff

Neues optionales Feld in `config.js` (und per Cloud-Device-Config verteilbar):

```js
logStartDate: '2026-05-01'
```

**Beim App-Start** werden alle `lgc_log_*`-Einträge im localStorage, die vor diesem Datum liegen, sofort gelöscht — kein Netzwerk, keine Nutzerinteraktion nötig. Nach dem ersten Seitenaufruf auf jedem Gerät ist das lokale Log bereinigt.

**Beim Cloud-Sync** (`pushUserPif`, `mergeUserEntries`) werden Einträge vor dem Cutoff herausgefiltert — sie können weder in die Cloud geschrieben noch aus ihr reimportiert werden.

Das Feld ist jetzt in `DEVICE_FIELDS` aufgenommen und wird über `lgc_config_<deviceId>.json` auf alle Geräte verteilt.

---

## Fix 2 – Phantom-Paar-Cleanup (≤ 2 Minuten)

Neue Funktion `removeShortPairs(entries, maxMs)` erkennt Start-Stop-Paare mit einer Dauer von 0 bis 120 Sekunden und entfernt beide Einträge. Diese entstehen typischerweise durch `autoStartKeys` (z. B. Anwesenheit startet automatisch mit Wachdienst) und sofortiges manuelles Stornieren.

Angewendet in:
- **`pushUserPif`** (vor PUT): Kurzpaare gelangen nicht in die Cloud-PIF
- **`mergeUserEntries`** (vor `saveLog`): Kurzpaare werden aus dem lokalen Log bereinigt
- **Editor „Monate"-Button**: Kurzpaare in allen PIF-Dateien werden vor der Monatsanalyse entfernt
- **Editor „Alle prüfen"**: Kurzpaare und Orphan-Stops werden automatisch entfernt und gespeichert, bevor die Validierung läuft

---

## Zusammenspiel

```
Gerät startet
  ↓ logStartDate-Check → löscht pre-cutoff Einträge aus localStorage
  ↓ „Konfig aktualisieren" (Admin-Tab) → lädt neuen logStartDate aus Cloud-Config

Nächster Stempel
  ↓ pushUserPif → filterLocalEntries(≥ logStartDate) + removeShortPairs → PUT
  → Cloud-PIF bleibt sauber

Hintergrund-Sync (alle 5 min)
  ↓ fetchUserPif → mergeUserEntries(filterCloud(≥ logStartDate)) → removeShortPairs
  → lokales Log bleibt sauber
```

---

## Service Worker

Cache-Version: **`lgc-shell-v23`** — alle installierten PWAs laden beim nächsten Start die neue Version automatisch herunter.

---

## Migration / Update

Die `logStartDate`-Einstellung wird automatisch über die Cloud-Device-Config (`lgc_config_<deviceId>.json`) verteilt. Wert für alle Geräte gesetzt auf **`2026-05-01`**.

Keine weiteren Konfigurationsänderungen notwendig.
