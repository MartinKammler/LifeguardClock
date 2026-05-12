# Release Notes – LifeguardClock v1.0.3

## Stabilitäts-Release: PIF-Sync & Auto-Stop-Logik

Dieser Release behebt mehrere Datenkonsistenz-Probleme rund um PIF-Dateien, Auto-Stops und
den Dashboard-Datenfluss. Keine neuen sichtbaren Features — ausschließlich korrigiertes
Verhalten.

---

### PIF als einzige Datenquelle für Dashboard

Das Dashboard lud bisher sowohl PIF-Dateien als auch Geräte-Logs und versuchte, diese zu
kombinieren. Das führte zu falschen Dauern wenn Start und Stop in verschiedenen Dateien lagen.

**Neu:** Das Dashboard liest ausschließlich `lgc_pif_*`-Dateien. Geräte-Logs (`lgc_<id>_*`)
sind reines Backup und werden für die Anzeige nicht mehr herangezogen.

Zusätzlich merged `buildDB` jetzt alle Einträge eines logischen Tages aus allen geladenen
PIF-Dateien, bevor Start/Stop-Paare gebildet werden. Stop-Einträge ohne passenden Start auf
demselben logischen Tag werden übersprungen.

---

### Merge-basierter PIF-Push (kein Überschreiben mehr)

Bisher hat `pushUserPif` die PIF-Datei blind mit dem lokalen Geräte-Log überschrieben.
Manuell nachgetragene Stopps (via Editor) gingen damit beim nächsten Stempel-Vorgang verloren.

**Neu:** `pushUserPif` liest die bestehende PIF zuerst aus der Cloud und merged:

- Cloud-Einträge bleiben erhalten (schützt Editor-Einträge und Einträge anderer Geräte)
- Lokale Nicht-Auto-Einträge, die noch nicht in der Cloud sind, werden ergänzt
- Auto-Stops (Zeitfenster-Ende, Maximaldauer) werden nur eingefügt, wenn **kein** anderer
  Stop für die Session vorhanden ist — weder echter Stopp noch bereits gepushter Auto-Stop

---

### Auto-Stop-Logik bei Konsolidierung

Die Admin-Konsolidierung übersprang bisher alle Auto-Stops pauschal. Damit fehlten
konfigurierte Endzeiten (Zeitfenster) in PIFs wenn niemand manuell ausstempelte.

**Neu:** Auto-Stops aus Geräte-Logs werden bedingt übernommen — nur wenn kein Stop (echt
oder auto) für die betreffende Session in den PIF-Einträgen existiert.

Einträge vor dem 08.05.2026 (erster realer Stempeltag) werden weiterhin übersprungen.

---

### Auto-Stops in Validierung ausgeblendet

Verwaiste Auto-Stops erzeugten im Editor-Validierungs-Tab „Stop ohne Start"-Issues.
Die angebotene Reparatur (Start-Zeit eingeben) war in diesen Fällen falsch.

**Neu:** `fetchAndValidate` filtert Auto-Stop-Einträge vor der Verarbeitung heraus.
Sie erscheinen nicht mehr als Issues. Beim nächsten Speichern eines anderen Issues in
derselben PIF werden sie automatisch entfernt.

---

### Editor: Einzeleinträge nachtragen

Im Add-Modal gibt es jetzt einen Umschalter „Eintragspaar / Einzeleintrag". Damit lässt sich
ein einzelner Start- oder Stop-Eintrag ohne Gegenstück nachtragen. Bei Stop-Einträgen wird
`dauer_ms` automatisch aus dem letzten passenden Start berechnet.

---

### Service Worker v18

Mehrere JS-Dateien haben sich geändert. Der SW-Cache wird auf `lgc-shell-v18` erhöht — alle
installierten PWAs erhalten die neue Version automatisch beim nächsten App-Start.

---

### Migration / Update

- Kein Änderungsbedarf an `config.js`, `lgc_users.json` oder Cloud-Dateiformat.
- Service Worker Cache auf `lgc-shell-v18` → Update erfolgt automatisch nach App-Neustart.
- Hard Refresh (`Strg+Shift+R`) empfohlen falls Änderungen nicht sofort sichtbar sind.

### Bekannte Einschränkungen

- Cloud-Zugangsdaten liegen weiterhin im Klartext im Browser-Storage (localStorage).
  Empfehlung: dediziertes App-Passwort verwenden.
- Kein Undo/Redo für Validation-Fixes (direktes Cloud-Schreiben ohne Zwischenpuffer).
