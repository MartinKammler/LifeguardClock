# Release Notes – LifeguardClock v1.1.2

## Periodischer Hintergrund-PIF-Sync

Dieser Release löst das Cross-Device-Problem, bei dem das Tablet einen Nutzer als „Aktiv"
anzeigt, obwohl er auf einem anderen Gerät (z. B. Smartphone) bereits ausgestempelt hat.

---

## Problem

In einem Mehr-Gerät-Betrieb (Tablet als Kiosk + Smartphone für Einstempeln unterwegs) war
der State auf dem Tablet nur beim nächsten PIN-Login aktuell. Da Nutzer nach wenigen Sekunden
auto-ausgeloggt werden, war das in der Praxis meist ausreichend — aber nicht in jedem Fall:

- Nutzer stempelt auf dem Smartphone aus, betritt den Raum mit dem Tablet, loggt sich ein →
  Tablet zeigt kurz „Aktiv" bevor der Login-Fetch abgeschlossen ist
- In seltenen Fällen (keine Netzwerkverbindung beim Login, schlechte Latenz) blieb der
  veraltete State länger erhalten

---

## Lösung

Beim App-Start (nach 4 Sekunden, nach `silentConfigCheck`) startet ein 5-Minuten-Hintergrund-
Timer, der die Cloud-PIFs aller Nutzer abruft und den lokalen State aktualisiert — ohne dass
ein Login erforderlich ist.

### Neue Funktionen

| Funktion | Zweck |
|---|---|
| `startBackgroundPifSync()` | Startet den 5-Minuten-`setInterval`-Timer |
| `_runBackgroundPifSync()` | Ruft `fetchUserPif()` sequentiell für alle Nutzer auf |

### Ablauf

```
App-Start
  ↓ nach 3 s: silentConfigCheck()
  ↓ nach 4 s: startBackgroundPifSync()
              └─ alle 5 min: _runBackgroundPifSync()
                               ├─ isCloudConfigured()? → nein: return
                               ├─ _bgPifSyncRunning?   → ja:  return (kein Overlap)
                               └─ für jeden Nutzer: fetchUserPif(u.id)
                                    └─ mergeUserEntries() + rebuildStateFromLog()
                                         └─ lgc_state aktuell
```

### Ergebnis

Ein auf dem Smartphone beendeter Stempel ist spätestens 5 Minuten später auf dem Tablet
korrekt als „Inaktiv" registriert — auch ohne Login. Beim nächsten PIN-Login zeigt das
Tablet sofort den richtigen Stand.

---

## Service Worker

Cache-Version: **`lgc-shell-v21`** — alle installierten PWAs laden beim nächsten Start die neue
Version automatisch herunter.

---

## Migration / Update

Keine Konfigurationsänderungen notwendig. Der Hintergrund-Sync startet automatisch, sofern
Cloud-Zugangsdaten in `config.js` konfiguriert sind. Ohne Cloud-Konfiguration ist die Funktion
ein No-op.

---

## Bekannte Einschränkungen

- Der Hintergrund-Sync läuft im selben Browser-Tab wie die App. Wird der Tab geschlossen oder
  das Gerät in den Standby versetzt, pausieren die Fetches. Beim nächsten Aufwachen setzt der
  Timer regulär fort.
- Intervall fest auf 5 Minuten — nicht konfigurierbar (für die meisten Anwendungsfälle
  ausreichend).
