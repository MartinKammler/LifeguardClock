# Design: Editor — Validierung & Quick-Fix für PIF-Dateien

**Datum:** 2026-05-11  
**Status:** Approved  
**Scope:** `editor.html` / `editor-app.js`

---

## Zusammenfassung

Neuer Modus im bestehenden Log-Editor: Ein Button „☁ Alle prüfen" lädt alle PIF-Dateien des aktuellen und des vorherigen Monats aus der Cloud, scannt sie auf Probleme und zeigt diese in einem neuen Tab „⚠ Probleme" als Cards an. Jede Card bietet Inline-Quick-Fixes (Stop-Zeit hinzufügen, Eintrag löschen, Zeiten bearbeiten) mit direktem Cloud-Speichern — ohne langen Menüweg.

---

## 1. Trigger & Laden

- Neuer Button `☁ Alle prüfen` im Header, rechts neben `☁ Cloud`
- Klick startet:
  1. Cloud-Credentials prüfen (gleiche Logik wie `openCloudPicker`)
  2. PROPFIND auf den LifeguardClock-Ordner
  3. Alle PIF-Dateien filtern: aktueller Monat (`YYYY-MM`) + vorheriger Monat
  4. Alle Dateien parallel laden via `Promise.all`
  5. `refreshTypesFromCloud()` parallel aufrufen
  6. Entries zusammenführen, Quell-PIF-URL je Entry merken
  7. Tab `⚠ Probleme` aktivieren und Ergebnisse anzeigen
- Ladefehler einzelner Dateien: Toast „N Dateien konnten nicht geladen werden", Rest wird trotzdem verarbeitet
- Button ist während des Ladens disabled, Tab zeigt `⏳ Prüfe…`

---

## 2. Validierungslogik

Pro Person + Typ werden Entries chronologisch sortiert und auf vier Issue-Typen geprüft. Beide Monate werden **gemeinsam** pro Person ausgewertet, sodass Monatsgrenz-Paare (Start im Vormonat, Stop im aktuellen Monat) nicht fälschlich als Issue erscheinen.

| Issue-Typ | Bedingung | Beschreibung |
|---|---|---|
| `open-start` | Start ohne nachfolgenden Stop | „Vergessen auszustempeln" |
| `orphan-stop` | Stop ohne vorherigen Start | „Stop ohne Start" |
| `double-start` | Zwei Starts ohne Stop dazwischen | „Doppelt eingestempelt" |
| `short-pair` | Vollständiges Paar mit Dauer < 15 min | „Verdächtig kurze Dauer" |

Schwellwert: `MIN_PAIR_DURATION_MS = 15 * 60 * 1000` (hardcodiert, spätere Konfigurierbarkeit via `config.js` vorgesehen).

### Datenstruktur je Issue

```js
{
  issueType: 'open-start' | 'orphan-stop' | 'double-start' | 'short-pair',
  person: 'Uwe Schönfeld',
  logType: 'wachdienst',
  logicalDate: '2026-05-09',
  mainEntry: { ...entry },        // betroffener Eintrag (open-start, orphan-stop); null bei double-start
  entries: [...],                 // beide Start-Entries bei double-start; [startEntry, stopEntry] bei short-pair
  pifHref: '…/lgc_pif_uwe_schoenfeld_2026-05.json',
  pifData: { … },                 // geladene PIF (Referenz auf validationPifCache)
  linked: [                       // andere open-start Issues derselben Person/Datum mit Anwesenheits-Bezug
    { logType: 'anwesenheit', mainEntry: …, pifHref: …, pifData: … }
  ],
  skipped: false
}
```

---

## 3. Verknüpfungslogik (Linked Issues)

Abgeleitet aus `lgc_types.json` — kein Hardcoding auf `'anwesenheit'`.

**Regel 1 — Service → Anwesenheit:**  
Wenn der Issue-Typ `autoStartKeys: ['anwesenheit']` hat (z. B. wachdienst, sanitätsdienst, helfer), wird beim Fix eine Checkbox für Anwesenheit angeboten — vorausgehakt, abwählbar.

**Regel 2 — Anwesenheit → Service (automatisch):**  
Wenn Anwesenheit beendet wird, werden alle offenen Service-Typen derselben Person am selben logischen Tag, deren `autoStartKeys` `'anwesenheit'` enthält, **automatisch mit beendet**. Sie erscheinen als vorgehaakte Checkboxen (Transparenz), spiegeln das Verhalten der Hauptapp wider.

**Regel 3 — Kein Link:**  
Typen ohne `autoStartKeys` (z. B. ausbildung, verwaltung) erzeugen keine Linked-Checkbox.

```js
function getLinkedIssues(issue, allIssues, typesConfig) {
  if (issue.issueType !== 'open-start') return [];
  const myType = typesConfig.find(t => t.logType === issue.logType);
  const myIsService = myType?.autoStartKeys?.includes('anwesenheit');
  return allIssues.filter(o =>
    o !== issue && o.issueType === 'open-start' &&
    o.person === issue.person && o.logicalDate === issue.logicalDate &&
    (
      (issue.logType === 'anwesenheit' &&
        typesConfig.find(t => t.logType === o.logType)?.autoStartKeys?.includes('anwesenheit')) ||
      (myIsService && o.logType === 'anwesenheit')
    )
  );
}
```

---

## 4. Issue-Cards UI

Jede Card zeigt oben: **Person · Typ-Badge (farbig) · logisches Datum**. Darunter je nach Issue-Typ:

### `open-start` — Vergessen auszustempeln
```
Uwe Schönfeld · [Wachdienst] · 09.05.2026
Eingestempelt: 10:00 — kein Stop vorhanden
Stop-Zeit:  [14:00  ▾]
☑ Anwesenheit ebenfalls beenden (14:00)    ← nur wenn Anwesenheit ebenfalls open-start
[✓ Speichern]  [→ Überspringen]  [✗ Start löschen]
```

### `orphan-stop` — Stop ohne Start
```
Uwe Schönfeld · [Anwesenheit] · 09.05.2026
Stop vorhanden (14:00) — kein Start gefunden
Start-Zeit: [09:00  ▾]
[✓ Speichern]  [→ Überspringen]  [✗ Stop löschen]
```

### `double-start` — Doppelt eingestempelt
```
Uwe Schönfeld · [Wachdienst] · 09.05.2026
Zwei Starts: 09:00 und 09:03 — kein Stop dazwischen
[✗ 09:00 löschen]  [✗ 09:03 löschen]  [→ Überspringen]
```

### `short-pair` — Verdächtig kurze Dauer
```
Uwe Schönfeld · [Anwesenheit] · 09.05.2026
Dauer: 3 min  (09:00 – 09:03)
Von: [09:00  ▾]   Bis: [09:03  ▾]
[✓ Speichern]  [✗ Paar löschen]  [→ Überspringen]
```

**Stop-Zeit-Eingabe für `open-start`:** Linked-Checkboxen übernehmen die eingegebene Zeit automatisch. Validation: Stop muss nach Start liegen.

---

## 5. State-Management & Speichern

Eigener State, unabhängig von `logData`:

```js
let validationIssues  = [];   // alle Issues inkl. skipped
let validationPifCache = {};  // href → pifData (geladene + ggf. geänderte PIFs)
```

### Fix-Abläufe

**`open-start`:**
1. Neuen Stop-Entry erstellen (`id: genId(), nutzer, typ, aktion:'stop', zeitstempel, dauer_ms`)
2. In `validationPifCache[pifHref].entries` einfügen
3. Für jede angehakte Linked-Issue: gleiche Logik in deren `pifHref`
4. Alle betroffenen PIFs per PUT speichern (`Promise.all` über unique hrefs — mehrere Issues in derselben PIF werden gebündelt in einem einzigen PUT)
5. Issue + verknüpfte Issues aus sichtbarer Liste entfernen; Badge aktualisieren

**`orphan-stop`:**
1. Neuen Start-Entry einfügen, `dauer_ms` am Stop-Entry neu berechnen
2. PUT → Issue entfernen

**`double-start`:**
1. Gewählten Entry aus `entries` löschen
2. PUT → Issue entfernen

**`short-pair`:**
1. Start- und Stop-Entry in `entries` aktualisieren (Zeitstempel + `dauer_ms` neu berechnen)
2. PUT → Issue entfernen

**Skip:**  
`skipped: true` — kein Cloud-Schreiben, Issue bleibt ausgegraut sichtbar. Kein persistentes Merken: beim nächsten „Alle prüfen" erscheint es wieder.

---

## 6. Tab-Integration

- Tab `⚠ Probleme` ist immer im DOM vorhanden, aber der Tab-Button ist per CSS (`display:none`) ausgeblendet bis nach dem ersten erfolgreichen Scan — dann dauerhaft sichtbar (auch bei 0 Issues)
- Der bestehende `logData`-Stand (Einzeldatei-Editor) bleibt vollständig unberührt — orthogonale Modi
- Tab-Badge-Zustände:

| Zustand | Badge |
|---|---|
| Wird geladen | `⏳ Prüfe…` |
| N offene Issues | `⚠ Probleme (N)` |
| Keine Probleme | `✓ Alles OK` |
| Alle übersprungen | `– N übersprungen` |

Bei „Alle übersprungen": Button „Alle zurücksetzen" setzt alle `skipped: false` und zeigt alle Cards wieder.

---

## 7. Edge Cases

| Fall | Verhalten |
|---|---|
| Einzelne PIF lädt nicht | Toast, Rest wird verarbeitet |
| PUT schlägt fehl | Inline-Fehler auf der Card, Retry möglich |
| Issue liegt im Vormonat | Wird in die Vormonats-PIF geschrieben (URL aus `pifHref`) |
| Stop-Zeit vor Start-Zeit | Inline-Validierung verhindert Speichern |
| Keine Cloud-Credentials | Gleicher Alert wie beim Cloud-Button |
| Keine PIF-Dateien gefunden | Info-Meldung im Tab |

---

## 8. Abgrenzung / nicht im Scope

- Ordner-Laden (File System Access API) — nur Cloud-Variante
- Konfigurierbare Kurzzeit-Schwelle (15 min hardcodiert)
- Kein Undo/Redo für Validation-Fixes (direktes Cloud-Schreiben)
- Kein Laden der geänderten PIF-Dateien in den Haupt-Editor nach dem Fix
