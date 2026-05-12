# Release Notes – LifeguardClock v1.1.1

## Editor-Verbesserungen & Bugfix Smartphone-Toast

Dieser Release ergänzt den Editor um zwei neue Automatismen und behebt einen Darstellungsfehler
auf Smartphones.

---

## Bugfix

### Toast verschwindet nicht auf Smartphones

**Problem:** Auf schmalen Displays (z. B. iPhone SE) blieb der Toast-Hinweis am unteren Rand
sichtbar, weil `translateY(90px)` für zwei- bis dreizeilige Meldungen nicht ausreichte.
Zusätzlich bricht iOS Safari `position: fixed`-Transitions beim Viewport-Resize ab, sodass der
Toast eingefroren wirkte.

**Fix:** `translateY` auf `150px` erhöht. Ergänzend `opacity 0↔1`-Übergang hinzugefügt, der
unabhängig von der Transform-Transition greift.

---

## Neue Editor-Funktionen

### Automatische Anwesenheit beim Paar-Hinzufügen

Wird über „Paar hinzufügen" ein Dienst-Typ mit `autoStartKeys: ['anwesenheit']` eingetragen
(Wachdienst, Sanitätsdienst, Ausbildung, Helfer), erzeugt der Editor automatisch ein passendes
Anwesenheits-Paar — sofern kein abdeckendes Anwesenheits-Fenster bereits vorhanden ist.
Funktioniert auch beim Eintragen in einen anderen Monats-PIF als den aktuell geladenen.

### 🗂 Monate-Button: Monatsbereinigung + Anwesenheits-Lücken

Neuer Button in der Editor-Werkzeugleiste. Über „☁ Cloud" oder „📂 Ordner" werden alle
PIF-Dateien eingelesen und zwei Prüfungen durchgeführt:

| Prüfung | Was wird korrigiert |
|---|---|
| **Monats-Bereinigung** | Einträge, deren Zeitstempel nicht zum Dateimonat passt, werden in den richtigen Monats-PIF verschoben. Fehlt die Zieldatei, wird sie erstellt. |
| **Anwesenheits-Lücken** | Jedes vollständige Dienst-Paar (Wachdienst, San, Ausbildung, Helfer) wird auf Anwesenheits-Abdeckung geprüft. Fehlt ein abdeckendes Fenster, wird es automatisch ergänzt. Überlappende Paare desselben Nutzers erhalten nur einen gemeinsamen Block. |

Die Toast-Meldung zeigt beide Ergebnisse, z. B.:
`„3 Einträge verschoben, 2 Anwesenheits-Blöcke ergänzt ✓"`

---

## Service Worker

Cache-Version: **`lgc-shell-v20`** — alle installierten PWAs laden beim nächsten Start die neue
Version automatisch herunter.

---

## Migration / Update

Keine Konfigurationsänderungen notwendig. Bestehende `config.js`-Dateien funktionieren
unverändert weiter.

---

## Bekannte Einschränkungen

- Die Anwesenheits-Lücken-Prüfung im Monate-Button liest Typ-Konfiguration aus dem
  localStorage (`lgc_cloud_types`). Auf Geräten, die noch keine Verbindung zur Cloud hatten,
  kann die Prüfung keine Dienst-Typen erkennen und überspringt die Anwesenheits-Ergänzung.
