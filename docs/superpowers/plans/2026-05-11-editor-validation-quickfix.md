# Editor Validation & Quick-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer Button „☁ Alle prüfen" im Editor lädt alle PIF-Dateien der letzten zwei Monate, erkennt vier Issue-Typen und zeigt Quick-Fix-Cards in einem neuen Tab an — mit direktem Cloud-Speichern pro Fix.

**Architecture:** Zwei reine Funktionen (`buildValidationIssues`, `getLinkedIssues`) analysieren enriched Entries. Neuer Modul-State (`validationIssues`, `validationPifCache`) hält Scan-Ergebnisse. Ein neuer Tab + Panel mit Event-Delegation zeigt Cards. Fix-Funktionen mutieren den Cache und PUT direkt in die Cloud — vollständig unabhängig vom bestehenden Einzeldatei-Editor-State.

**Tech Stack:** Vanilla JS, WebDAV PROPFIND/PUT, `lgc_types.json` aus localStorage, Event-Delegation analog zu `#log-tbody`.

**Spec:** `docs/superpowers/specs/2026-05-11-editor-validation-quickfix-design.md`

---

## Dateistruktur

| Datei | Änderung |
|---|---|
| `editor-app.js` | Neue Konstante, State-Variablen, 7 neue Funktionen, Event-Handler, Button-Listener |
| `editor.html` | Button im Header, Tab in Toolbar, Panel im Main-Bereich, CSS für v-card-Klassen |
| `tests/test_editor.html` | Suite 13 (buildValidationIssues), Suite 14 (getLinkedIssues), Suite 15 (Fix-Mutationen) |

---

## Task 1: `buildValidationIssues` — TDD

**Files:**
- Modify: `tests/test_editor.html` (vor `render()`, neue Suites am Ende)
- Modify: `editor-app.js` (nach `validatePairs`, neue Konstante + Funktion)

- [ ] **Schritt 1: Konstante und Funktion als Stub in `tests/test_editor.html` einfügen**

  Direkt nach dem Block mit `const H1 = ...` und vor `// Suite 1`:

  ```js
  // ─── Validation: Konstante ────────────────────────────────────────────────────
  const MIN_PAIR_DURATION_MS = 15 * 60 * 1000;

  // ─── buildValidationIssues (1:1 aus editor-app.js) ───────────────────────────
  function buildValidationIssues(enrichedEntries, typesConfig) {
    // STUB – wird in Schritt 3 implementiert
    return [];
  }

  // ─── getLinkedIssues (1:1 aus editor-app.js) ─────────────────────────────────
  function getLinkedIssues(issue, allIssues, typesConfig) {
    // STUB
    return [];
  }
  ```

- [ ] **Schritt 2: Suite 13 + 14 in `tests/test_editor.html` schreiben (vor `render()`)**

  ```js
  // ═══════════════════════════════════════════════════════════════════════════════
  // Suite 13 – buildValidationIssues
  // ═══════════════════════════════════════════════════════════════════════════════
  suite('Suite 13 – buildValidationIssues');

  function makeE(id, nutzer, typ, aktion, ts, href) {
    return { id, nutzer, typ, aktion, zeitstempel: ts, pifHref: href || '/p.json' };
  }

  const D = '2026-05-09'; // logischer Tag (nachmittags, UTC = CEST-2h = immer > 04:00 lokal)
  const T08 = `${D}T06:00:00.000Z`; // 08:00 CEST
  const T10 = `${D}T08:00:00.000Z`; // 10:00 CEST
  const T14 = `${D}T12:00:00.000Z`; // 14:00 CEST
  const T14_3 = `${D}T12:03:00.000Z`; // 14:03 CEST (3 min nach T14)

  // Leere Eingabe
  eq('Leere Entries → keine Issues', 0, buildValidationIssues([], []).length);

  // open-start
  const osIssues = buildValidationIssues([
    makeE('s1','Uwe','wachdienst','start', T08),
  ], []);
  eq('open-start: 1 Issue', 1, osIssues.length);
  eq('open-start: issueType', 'open-start', osIssues[0]?.issueType);
  eq('open-start: person', 'Uwe', osIssues[0]?.person);
  eq('open-start: logType', 'wachdienst', osIssues[0]?.logType);
  eq('open-start: mainEntry.id', 's1', osIssues[0]?.mainEntry?.id);
  eq('open-start: pifHref', '/p.json', osIssues[0]?.pifHref);

  // orphan-stop
  const orphanIssues = buildValidationIssues([
    makeE('s2','Uwe','anwesenheit','stop', T14),
  ], []);
  eq('orphan-stop: 1 Issue', 1, orphanIssues.length);
  eq('orphan-stop: issueType', 'orphan-stop', orphanIssues[0]?.issueType);
  eq('orphan-stop: mainEntry.id', 's2', orphanIssues[0]?.mainEntry?.id);

  // double-start
  const dblIssues = buildValidationIssues([
    makeE('d1','Uwe','wachdienst','start', T08),
    makeE('d2','Uwe','wachdienst','start', T10),
  ], []);
  eq('double-start: 1 Issue (zweiter Start bleibt offen → open-start)', 2, dblIssues.length);
  eq('double-start zuerst', 'double-start', dblIssues.find(i => i.issueType === 'double-start')?.issueType);
  eq('open-start danach vorhanden', 'open-start', dblIssues.find(i => i.issueType === 'open-start')?.issueType);
  eq('double-start entries[0].id', 'd1', dblIssues.find(i => i.issueType === 'double-start')?.entries[0]?.id);
  eq('double-start entries[1].id', 'd2', dblIssues.find(i => i.issueType === 'double-start')?.entries[1]?.id);

  // short-pair (3 min < 15 min)
  const spIssues = buildValidationIssues([
    makeE('p1','Uwe','anwesenheit','start', T14),
    makeE('p2','Uwe','anwesenheit','stop',  T14_3),
  ], []);
  eq('short-pair: 1 Issue', 1, spIssues.length);
  eq('short-pair: issueType', 'short-pair', spIssues[0]?.issueType);
  eq('short-pair: entries[0]', 'p1', spIssues[0]?.entries[0]?.id);
  eq('short-pair: entries[1]', 'p2', spIssues[0]?.entries[1]?.id);

  // 15-min-Grenze genau: ≥ 15 min ist kein Issue
  const T15 = new Date(new Date(T14).getTime() + 15 * 60 * 1000).toISOString();
  const no15 = buildValidationIssues([
    makeE('x1','A','anwesenheit','start', T14),
    makeE('x2','A','anwesenheit','stop',  T15),
  ], []);
  eq('15 min genau → kein short-pair', 0, no15.length);

  // Vollständiges Paar >15 min → kein Issue
  const okPair = buildValidationIssues([
    makeE('ok1','A','anwesenheit','start', T08),
    makeE('ok2','A','anwesenheit','stop',  T14),
  ], []);
  eq('Vollständiges Paar → keine Issues', 0, okPair.length);

  // Zwei Personen: Uwe offen, Anna ok
  const twoP = buildValidationIssues([
    makeE('u1','Uwe','anwesenheit','start', T08),
    makeE('a1','Anna','anwesenheit','start', T08),
    makeE('a2','Anna','anwesenheit','stop',  T14),
  ], []);
  eq('Zwei Personen: nur Uwe hat Issue', 1, twoP.length);
  eq('Uwes open-start', 'Uwe', twoP[0]?.person);

  // ═══════════════════════════════════════════════════════════════════════════════
  // Suite 14 – getLinkedIssues
  // ═══════════════════════════════════════════════════════════════════════════════
  suite('Suite 14 – getLinkedIssues');

  const TC = [
    { logType: 'anwesenheit',    autoStartKeys: [] },
    { logType: 'wachdienst',     autoStartKeys: ['anwesenheit'] },
    { logType: 'sanitaetsdienst',autoStartKeys: ['anwesenheit'] },
    { logType: 'ausbildung',     autoStartKeys: [] },
  ];

  function makeIssue(type, person, logType, date) {
    return { issueType: type, person, logType, logicalDate: date, mainEntry: { zeitstempel: T08 },
             pifHref: '/p.json', linked: [], skipped: false };
  }

  const uwAnw = makeIssue('open-start', 'Uwe', 'anwesenheit',    '2026-05-09');
  const uwWach = makeIssue('open-start', 'Uwe', 'wachdienst',    '2026-05-09');
  const uwAus  = makeIssue('open-start', 'Uwe', 'ausbildung',    '2026-05-09');
  const annAnw = makeIssue('open-start', 'Anna','anwesenheit',   '2026-05-09');

  const all = [uwAnw, uwWach, uwAus, annAnw];

  // Anwesenheit → Service
  const linked1 = getLinkedIssues(uwAnw, all, TC);
  eq('Anwesenheit → wachdienst verknüpft', true, linked1.some(l => l.logType === 'wachdienst'));
  eq('Anwesenheit → ausbildung NICHT verknüpft', false, linked1.some(l => l.logType === 'ausbildung'));
  eq('Anwesenheit → Anna nicht verknüpft', false, linked1.some(l => l.person === 'Anna'));

  // Service → Anwesenheit
  const linked2 = getLinkedIssues(uwWach, all, TC);
  eq('wachdienst → anwesenheit verknüpft', true, linked2.some(l => l.logType === 'anwesenheit'));
  eq('wachdienst → keine anderen', 1, linked2.length);

  // Ausbildung (kein autoStartKeys) → keine Links
  const linked3 = getLinkedIssues(uwAus, all, TC);
  eq('ausbildung → keine Links', 0, linked3.length);

  // Nicht open-start → keine Links
  const stopIssue = makeIssue('orphan-stop','Uwe','anwesenheit','2026-05-09');
  eq('orphan-stop → keine Links', 0, getLinkedIssues(stopIssue, all, TC).length);

  // Skipped werden nicht verknüpft
  const uwWachSkipped = { ...uwWach, skipped: true };
  const allWithSkip = [uwAnw, uwWachSkipped, annAnw];
  const linked4 = getLinkedIssues(uwAnw, allWithSkip, TC);
  eq('Geskippte Issues werden nicht verknüpft', 0, linked4.length);
  ```

- [ ] **Schritt 3: Tests ausführen — sollen FEHLSCHLAGEN**

  `tests/test_editor.html` im Browser öffnen.  
  Erwartet: Suite 13 + 14 zeigen alle Tests als `✗` (Stubs geben `[]` zurück).

- [ ] **Schritt 4: Echte Implementierung in `tests/test_editor.html` ersetzen (Stub → Produktion)**

  Den Stub-Block für `buildValidationIssues` und `getLinkedIssues` durch die echte Implementierung ersetzen:

  ```js
  const MIN_PAIR_DURATION_MS = 15 * 60 * 1000;

  function buildValidationIssues(enrichedEntries, typesConfig) {
    const DAY_BOUNDARY = 4;
    function logicalDay(isoTs) {
      const d = new Date(isoTs);
      if (d.getHours() < DAY_BOUNDARY) d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    const groups = {};
    for (const e of enrichedEntries) {
      const k = `${e.nutzer}|||${e.typ}`;
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    }
    const issues = [];
    for (const group of Object.values(groups)) {
      const sorted = [...group].sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
      let openStart = null;
      for (const e of sorted) {
        if (e.aktion === 'start') {
          if (openStart) {
            issues.push({ issueType: 'double-start', person: e.nutzer, logType: e.typ,
              logicalDate: logicalDay(openStart.zeitstempel), mainEntry: null,
              entries: [openStart, e], pifHref: openStart.pifHref, linked: [], skipped: false });
          }
          openStart = e;
        } else {
          if (!openStart) {
            issues.push({ issueType: 'orphan-stop', person: e.nutzer, logType: e.typ,
              logicalDate: logicalDay(e.zeitstempel), mainEntry: e,
              entries: [e], pifHref: e.pifHref, linked: [], skipped: false });
          } else {
            const durMs = new Date(e.zeitstempel) - new Date(openStart.zeitstempel);
            if (durMs > 0 && durMs < MIN_PAIR_DURATION_MS) {
              issues.push({ issueType: 'short-pair', person: e.nutzer, logType: e.typ,
                logicalDate: logicalDay(openStart.zeitstempel), mainEntry: null,
                entries: [openStart, e], pifHref: openStart.pifHref, linked: [], skipped: false });
            }
            openStart = null;
          }
        }
      }
      if (openStart) {
        issues.push({ issueType: 'open-start', person: openStart.nutzer, logType: openStart.typ,
          logicalDate: logicalDay(openStart.zeitstempel), mainEntry: openStart,
          entries: [openStart], pifHref: openStart.pifHref, linked: [], skipped: false });
      }
    }
    return issues;
  }

  function getLinkedIssues(issue, allIssues, typesConfig) {
    if (issue.issueType !== 'open-start') return [];
    const myType = typesConfig.find(t => t.logType === issue.logType);
    const myIsService = !!myType?.autoStartKeys?.includes('anwesenheit');
    return allIssues.filter(o =>
      o !== issue &&
      o.issueType === 'open-start' &&
      o.person === issue.person &&
      o.logicalDate === issue.logicalDate &&
      !o.skipped &&
      (
        (issue.logType === 'anwesenheit' &&
          !!typesConfig.find(t => t.logType === o.logType)?.autoStartKeys?.includes('anwesenheit')) ||
        (myIsService && o.logType === 'anwesenheit')
      )
    );
  }
  ```

- [ ] **Schritt 5: Tests ausführen — sollen BESTEHEN**

  `tests/test_editor.html` im Browser öffnen.  
  Erwartet: Suite 13 + 14 alle `✓`. Suites 1–12 weiterhin alle `✓`.

- [ ] **Schritt 6: Dieselben Funktionen in `editor-app.js` einfügen**

  Nach `validatePairs` (Zeile ~437) einfügen:

  ```js
  // ─── Validation: Konstante ────────────────────────────────────────────────────
  const MIN_PAIR_DURATION_MS = 15 * 60 * 1000;

  // ─── buildValidationIssues ───────────────────────────────────────────────────
  function buildValidationIssues(enrichedEntries, typesConfig) {
    const DAY_BOUNDARY = 4;
    function logicalDay(isoTs) {
      const d = new Date(isoTs);
      if (d.getHours() < DAY_BOUNDARY) d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    const groups = {};
    for (const e of enrichedEntries) {
      const k = `${e.nutzer}|||${e.typ}`;
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    }
    const issues = [];
    for (const group of Object.values(groups)) {
      const sorted = [...group].sort((a, b) => new Date(a.zeitstempel) - new Date(b.zeitstempel));
      let openStart = null;
      for (const e of sorted) {
        if (e.aktion === 'start') {
          if (openStart) {
            issues.push({ issueType: 'double-start', person: e.nutzer, logType: e.typ,
              logicalDate: logicalDay(openStart.zeitstempel), mainEntry: null,
              entries: [openStart, e], pifHref: openStart.pifHref, linked: [], skipped: false });
          }
          openStart = e;
        } else {
          if (!openStart) {
            issues.push({ issueType: 'orphan-stop', person: e.nutzer, logType: e.typ,
              logicalDate: logicalDay(e.zeitstempel), mainEntry: e,
              entries: [e], pifHref: e.pifHref, linked: [], skipped: false });
          } else {
            const durMs = new Date(e.zeitstempel) - new Date(openStart.zeitstempel);
            if (durMs > 0 && durMs < MIN_PAIR_DURATION_MS) {
              issues.push({ issueType: 'short-pair', person: e.nutzer, logType: e.typ,
                logicalDate: logicalDay(openStart.zeitstempel), mainEntry: null,
                entries: [openStart, e], pifHref: openStart.pifHref, linked: [], skipped: false });
            }
            openStart = null;
          }
        }
      }
      if (openStart) {
        issues.push({ issueType: 'open-start', person: openStart.nutzer, logType: openStart.typ,
          logicalDate: logicalDay(openStart.zeitstempel), mainEntry: openStart,
          entries: [openStart], pifHref: openStart.pifHref, linked: [], skipped: false });
      }
    }
    return issues;
  }

  // ─── getLinkedIssues ─────────────────────────────────────────────────────────
  function getLinkedIssues(issue, allIssues, typesConfig) {
    if (issue.issueType !== 'open-start') return [];
    const myType = typesConfig.find(t => t.logType === issue.logType);
    const myIsService = !!myType?.autoStartKeys?.includes('anwesenheit');
    return allIssues.filter(o =>
      o !== issue &&
      o.issueType === 'open-start' &&
      o.person === issue.person &&
      o.logicalDate === issue.logicalDate &&
      !o.skipped &&
      (
        (issue.logType === 'anwesenheit' &&
          !!typesConfig.find(t => t.logType === o.logType)?.autoStartKeys?.includes('anwesenheit')) ||
        (myIsService && o.logType === 'anwesenheit')
      )
    );
  }
  ```

- [ ] **Schritt 7: Commit**

  ```bash
  git add editor-app.js tests/test_editor.html
  git commit -m "feat: add buildValidationIssues + getLinkedIssues with tests"
  ```

---

## Task 2: Fix-Mutationsfunktionen — TDD

**Files:**
- Modify: `tests/test_editor.html`
- Modify: `editor-app.js`

- [ ] **Schritt 1: Stub-Funktionen + `validationPifCache` in `tests/test_editor.html` einfügen**

  Direkt nach den `getLinkedIssues`-Implementierung im Test-Header-Block:

  ```js
  // ─── Validation State (für Tests) ────────────────────────────────────────────
  let validationPifCache = {};

  function applyOpenStartFix(issue, stopIso, linkedToFix) { /* STUB */ }
  function applyOrphanStopFix(issue, startIso)            { /* STUB */ }
  function applyDoubleStartFix(issue, deleteId)           { /* STUB */ }
  function applyShortPairFix(issue, newStartIso, newStopIso) { /* STUB */ }
  function applyDeleteFix(issue)                          { /* STUB */ }
  ```

- [ ] **Schritt 2: Suite 15 in `tests/test_editor.html` schreiben (vor `render()`)**

  ```js
  // ═══════════════════════════════════════════════════════════════════════════════
  // Suite 15 – Fix-Mutationsfunktionen
  // ═══════════════════════════════════════════════════════════════════════════════
  suite('Suite 15 – Fix-Mutationsfunktionen');

  const PIF_URL = '/pif/uwe.json';
  const PIF_URL2 = '/pif/uwe-prev.json';

  function resetCache(extraEntries) {
    validationPifCache = {
      [PIF_URL]: { version: 1, userId: 'uwe', entries: [...(extraEntries || [])] },
    };
  }

  // ── applyOpenStartFix ────────────────────────────────────────────────────────
  const startEntry = { id: 'start1', nutzer: 'Uwe', typ: 'wachdienst',
    aktion: 'start', zeitstempel: '2026-05-09T08:00:00.000Z', pifHref: PIF_URL };
  const osIssue = { issueType: 'open-start', person: 'Uwe', logType: 'wachdienst',
    mainEntry: startEntry, entries: [startEntry], pifHref: PIF_URL, linked: [] };

  resetCache([startEntry]);
  applyOpenStartFix(osIssue, '2026-05-09T14:00:00.000Z', []);
  const entries1 = validationPifCache[PIF_URL].entries;
  eq('applyOpenStartFix: 2 Entries im Cache', 2, entries1.length);
  const addedStop = entries1.find(e => e.aktion === 'stop');
  eq('Stop-Eintrag vorhanden', 'stop', addedStop?.aktion);
  eq('Stop zeitstempel', '2026-05-09T14:00:00.000Z', addedStop?.zeitstempel);
  eq('dauer_ms = 6h', 6 * 3600000, addedStop?.dauer_ms);
  eq('nutzer korrekt', 'Uwe', addedStop?.nutzer);
  eq('typ korrekt', 'wachdienst', addedStop?.typ);

  // applyOpenStartFix mit linked
  const anwEntry = { id: 'anw1', nutzer: 'Uwe', typ: 'anwesenheit',
    aktion: 'start', zeitstempel: '2026-05-09T07:00:00.000Z', pifHref: PIF_URL };
  validationPifCache[PIF_URL] = { version: 1, userId: 'uwe',
    entries: [startEntry, anwEntry] };
  const linkedIssue = { issueType: 'open-start', person: 'Uwe', logType: 'anwesenheit',
    mainEntry: anwEntry, pifHref: PIF_URL };
  applyOpenStartFix(osIssue, '2026-05-09T14:00:00.000Z', [linkedIssue]);
  const entries2 = validationPifCache[PIF_URL].entries;
  eq('Mit linked: 4 Entries', 4, entries2.length);
  const anwStop = entries2.find(e => e.aktion === 'stop' && e.typ === 'anwesenheit');
  eq('Linked Stop vorhanden', 'stop', anwStop?.aktion);
  eq('Linked dauer_ms = 7h', 7 * 3600000, anwStop?.dauer_ms);

  // ── applyOrphanStopFix ────────────────────────────────────────────────────────
  const stopEntry = { id: 'stop1', nutzer: 'Uwe', typ: 'anwesenheit',
    aktion: 'stop', zeitstempel: '2026-05-09T14:00:00.000Z', dauer_ms: 0, pifHref: PIF_URL };
  const orphanIssue = { issueType: 'orphan-stop', person: 'Uwe', logType: 'anwesenheit',
    mainEntry: stopEntry, entries: [stopEntry], pifHref: PIF_URL };

  resetCache([stopEntry]);
  applyOrphanStopFix(orphanIssue, '2026-05-09T08:00:00.000Z');
  const entries3 = validationPifCache[PIF_URL].entries;
  eq('applyOrphanStopFix: 2 Entries', 2, entries3.length);
  const addedStart = entries3.find(e => e.aktion === 'start');
  eq('Start hinzugefügt', 'start', addedStart?.aktion);
  eq('Start zeitstempel', '2026-05-09T08:00:00.000Z', addedStart?.zeitstempel);
  const updatedStop = entries3.find(e => e.id === 'stop1');
  eq('dauer_ms am Stop aktualisiert (6h)', 6 * 3600000, updatedStop?.dauer_ms);

  // ── applyDoubleStartFix ────────────────────────────────────────────────────────
  const ds1 = { id: 'ds1', nutzer: 'Uwe', typ: 'wachdienst',
    aktion: 'start', zeitstempel: '2026-05-09T08:00:00.000Z', pifHref: PIF_URL };
  const ds2 = { id: 'ds2', nutzer: 'Uwe', typ: 'wachdienst',
    aktion: 'start', zeitstempel: '2026-05-09T08:03:00.000Z', pifHref: PIF_URL };
  const dblIssue = { issueType: 'double-start', person: 'Uwe', logType: 'wachdienst',
    mainEntry: null, entries: [ds1, ds2], pifHref: PIF_URL };

  resetCache([ds1, ds2]);
  applyDoubleStartFix(dblIssue, 'ds1');
  const entries4 = validationPifCache[PIF_URL].entries;
  eq('applyDoubleStartFix: 1 Entry übrig', 1, entries4.length);
  eq('ds1 gelöscht', undefined, entries4.find(e => e.id === 'ds1'));
  eq('ds2 bleibt', 'ds2', entries4.find(e => e.id === 'ds2')?.id);

  // ── applyShortPairFix ─────────────────────────────────────────────────────────
  const sp1 = { id: 'sp1', nutzer: 'Uwe', typ: 'anwesenheit',
    aktion: 'start', zeitstempel: '2026-05-09T08:00:00.000Z', pifHref: PIF_URL };
  const sp2 = { id: 'sp2', nutzer: 'Uwe', typ: 'anwesenheit',
    aktion: 'stop', zeitstempel: '2026-05-09T08:03:00.000Z', dauer_ms: 180000, pifHref: PIF_URL };
  const spIssueF = { issueType: 'short-pair', person: 'Uwe', logType: 'anwesenheit',
    mainEntry: null, entries: [sp1, sp2], pifHref: PIF_URL };

  resetCache([sp1, sp2]);
  applyShortPairFix(spIssueF, '2026-05-09T08:00:00.000Z', '2026-05-09T14:00:00.000Z');
  const entries5 = validationPifCache[PIF_URL].entries;
  const fixedStop = entries5.find(e => e.id === 'sp2');
  eq('applyShortPairFix: Stop zeitstempel aktualisiert', '2026-05-09T14:00:00.000Z', fixedStop?.zeitstempel);
  eq('applyShortPairFix: dauer_ms = 6h', 6 * 3600000, fixedStop?.dauer_ms);

  // ── applyDeleteFix ────────────────────────────────────────────────────────────
  resetCache([sp1, sp2]);
  applyDeleteFix({ entries: [sp1, sp2] });
  eq('applyDeleteFix: beide Entries gelöscht', 0, validationPifCache[PIF_URL].entries.length);

  // Über zwei PIFs
  validationPifCache[PIF_URL]  = { version: 1, entries: [sp1] };
  validationPifCache[PIF_URL2] = { version: 1, entries: [{ ...sp2, pifHref: PIF_URL2 }] };
  applyDeleteFix({ entries: [sp1, { ...sp2, pifHref: PIF_URL2 }] });
  eq('applyDeleteFix über 2 PIFs: PIF1 leer', 0, validationPifCache[PIF_URL].entries.length);
  eq('applyDeleteFix über 2 PIFs: PIF2 leer', 0, validationPifCache[PIF_URL2].entries.length);
  ```

- [ ] **Schritt 3: Tests ausführen — sollen FEHLSCHLAGEN**

  `tests/test_editor.html` öffnen.  
  Erwartet: Suite 15 zeigt alle Tests als `✗`.

- [ ] **Schritt 4: Implementierung der Fix-Funktionen in `tests/test_editor.html` einsetzen**

  Den Stub-Block ersetzen:

  ```js
  let validationPifCache = {};

  function applyOpenStartFix(issue, stopIso, linkedToFix) {
    const dur = new Date(stopIso) - new Date(issue.mainEntry.zeitstempel);
    validationPifCache[issue.pifHref].entries.push({
      id: genId(), nutzer: issue.person, typ: issue.logType,
      aktion: 'stop', zeitstempel: stopIso, dauer_ms: dur,
    });
    for (const linked of linkedToFix) {
      const linkedDur = new Date(stopIso) - new Date(linked.mainEntry.zeitstempel);
      validationPifCache[linked.pifHref].entries.push({
        id: genId(), nutzer: linked.person, typ: linked.logType,
        aktion: 'stop', zeitstempel: stopIso, dauer_ms: linkedDur,
      });
    }
  }

  function applyOrphanStopFix(issue, startIso) {
    validationPifCache[issue.pifHref].entries.push({
      id: genId(), nutzer: issue.person, typ: issue.logType,
      aktion: 'start', zeitstempel: startIso,
    });
    const stopInCache = validationPifCache[issue.pifHref].entries.find(
      e => String(e.id) === String(issue.mainEntry.id)
    );
    if (stopInCache) stopInCache.dauer_ms = new Date(stopInCache.zeitstempel) - new Date(startIso);
  }

  function applyDoubleStartFix(issue, deleteId) {
    const toDelete = issue.entries.find(e => String(e.id) === String(deleteId));
    if (!toDelete) return;
    validationPifCache[toDelete.pifHref].entries =
      validationPifCache[toDelete.pifHref].entries.filter(
        e => String(e.id) !== String(deleteId)
      );
  }

  function applyShortPairFix(issue, newStartIso, newStopIso) {
    const [start, stop] = issue.entries;
    const startInCache = validationPifCache[start.pifHref].entries.find(
      e => String(e.id) === String(start.id)
    );
    const stopInCache = validationPifCache[stop.pifHref].entries.find(
      e => String(e.id) === String(stop.id)
    );
    if (startInCache) startInCache.zeitstempel = newStartIso;
    if (stopInCache) {
      stopInCache.zeitstempel = newStopIso;
      stopInCache.dauer_ms = new Date(newStopIso) - new Date(newStartIso);
    }
  }

  function applyDeleteFix(issue) {
    for (const e of issue.entries) {
      validationPifCache[e.pifHref].entries =
        validationPifCache[e.pifHref].entries.filter(
          c => String(c.id) !== String(e.id)
        );
    }
  }
  ```

- [ ] **Schritt 5: Tests ausführen — sollen BESTEHEN**

  `tests/test_editor.html` öffnen.  
  Erwartet: Suites 13–15 alle `✓`. Suites 1–12 weiterhin `✓`.

- [ ] **Schritt 6: Dieselben Fix-Funktionen in `editor-app.js` einfügen**

  Nach `getLinkedIssues` in `editor-app.js` einfügen:

  ```js
  // ─── Validation State ─────────────────────────────────────────────────────────
  let validationIssues  = [];
  let validationPifCache = {};

  // ─── Fix-Mutationsfunktionen ──────────────────────────────────────────────────
  function applyOpenStartFix(issue, stopIso, linkedToFix) {
    const dur = new Date(stopIso) - new Date(issue.mainEntry.zeitstempel);
    validationPifCache[issue.pifHref].entries.push({
      id: genId(), nutzer: issue.person, typ: issue.logType,
      aktion: 'stop', zeitstempel: stopIso, dauer_ms: dur,
    });
    for (const linked of linkedToFix) {
      const linkedDur = new Date(stopIso) - new Date(linked.mainEntry.zeitstempel);
      validationPifCache[linked.pifHref].entries.push({
        id: genId(), nutzer: linked.person, typ: linked.logType,
        aktion: 'stop', zeitstempel: stopIso, dauer_ms: linkedDur,
      });
    }
  }

  function applyOrphanStopFix(issue, startIso) {
    validationPifCache[issue.pifHref].entries.push({
      id: genId(), nutzer: issue.person, typ: issue.logType,
      aktion: 'start', zeitstempel: startIso,
    });
    const stopInCache = validationPifCache[issue.pifHref].entries.find(
      e => String(e.id) === String(issue.mainEntry.id)
    );
    if (stopInCache) stopInCache.dauer_ms = new Date(stopInCache.zeitstempel) - new Date(startIso);
  }

  function applyDoubleStartFix(issue, deleteId) {
    const toDelete = issue.entries.find(e => String(e.id) === String(deleteId));
    if (!toDelete) return;
    validationPifCache[toDelete.pifHref].entries =
      validationPifCache[toDelete.pifHref].entries.filter(
        e => String(e.id) !== String(deleteId)
      );
  }

  function applyShortPairFix(issue, newStartIso, newStopIso) {
    const [start, stop] = issue.entries;
    const startInCache = validationPifCache[start.pifHref].entries.find(
      e => String(e.id) === String(start.id)
    );
    const stopInCache = validationPifCache[stop.pifHref].entries.find(
      e => String(e.id) === String(stop.id)
    );
    if (startInCache) startInCache.zeitstempel = newStartIso;
    if (stopInCache) {
      stopInCache.zeitstempel = newStopIso;
      stopInCache.dauer_ms = new Date(newStopIso) - new Date(newStartIso);
    }
  }

  function applyDeleteFix(issue) {
    for (const e of issue.entries) {
      validationPifCache[e.pifHref].entries =
        validationPifCache[e.pifHref].entries.filter(
          c => String(c.id) !== String(e.id)
        );
    }
  }

  // ─── Cloud: PIF-Dateien speichern ─────────────────────────────────────────────
  async function savePifHrefs(hrefs) {
    const creds = getCloudCreds();
    if (!creds) throw new Error('Keine Cloud-Zugangsdaten');
    await Promise.all([...new Set(hrefs)].map(href => {
      const pif = validationPifCache[href];
      const out = { ...pif, exported: new Date().toISOString(), count: pif.entries.length };
      return fetch(href, {
        method: 'PUT',
        headers: { Authorization: cloudAuth(creds), 'Content-Type': 'application/json' },
        body: JSON.stringify(out, null, 2),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
    }));
  }
  ```

- [ ] **Schritt 7: Commit**

  ```bash
  git add editor-app.js tests/test_editor.html
  git commit -m "feat: add fix mutation functions + savePifHrefs with tests"
  ```

---

## Task 3: HTML-Struktur + CSS

**Files:**
- Modify: `editor.html`

- [ ] **Schritt 1: Button „Alle prüfen" im Header einfügen**

  Nach `<button class="btn" id="btn-cloud-load">☁ Cloud</button>`:

  ```html
  <button class="btn" id="btn-validate-all">&#x2601; Alle pr&uuml;fen</button>
  ```

- [ ] **Schritt 2: Tab „Probleme" in der Toolbar einfügen**

  Nach `<button class="tab-btn" data-tab="timeline">&#x23F1; Timeline</button>`:

  ```html
  <button class="tab-btn" data-tab="validation" id="tab-validation" style="display:none">&#x26A0; Probleme</button>
  ```

- [ ] **Schritt 3: Panel `#panel-validation` im Main-Bereich einfügen**

  Nach `<div class="panel" id="panel-timeline" hidden>…</div>`:

  ```html
  <!-- Validation panel -->
  <div class="panel" id="panel-validation" hidden>
    <div id="validation-cards" class="v-cards-container"></div>
  </div>
  ```

- [ ] **Schritt 4: CSS für Validation-Cards einfügen**

  Im `<style>`-Block, nach `.tl-legend-dot { … }`:

  ```css
  /* ── Validation Cards ────────────────────────────────── */
  .v-cards-container { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
  .v-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px;
            overflow: hidden; }
  .v-card-skipped { opacity: .45; }
  .v-card-hdr { display: flex; align-items: center; gap: 8px; padding: 12px 16px;
                border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .v-person { font-weight: 700; font-size: 14px; }
  .v-date   { font-size: 12px; color: var(--text-3); }
  .v-skip-note { font-size: 11px; color: var(--text-3); font-style: italic; margin-left: auto; }
  .badge-issue-type { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; }
  .badge-issue-type.open-start   { background: rgba(245,158,11,.15); color: var(--warn); }
  .badge-issue-type.orphan-stop  { background: rgba(239,68,68,.15);  color: var(--danger); }
  .badge-issue-type.double-start { background: rgba(239,68,68,.15);  color: var(--danger); }
  .badge-issue-type.short-pair   { background: rgba(156,163,175,.15);color: var(--text-2); }
  .v-card-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .v-info  { font-size: 13px; color: var(--text-2); }
  .v-fix-row { display: flex; align-items: center; gap: 8px; }
  .v-fix-row-double { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .v-fix-label { font-size: 11px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: .5px; color: var(--text-3); white-space: nowrap; }
  .v-time-input { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px;
                  color: var(--text); padding: 6px 10px; font-family: inherit; font-size: 13px; }
  .v-time-input:focus { outline: none; border-color: var(--c-anw); }
  .v-linked-group { display: flex; flex-direction: column; gap: 4px; }
  .v-linked-label { display: flex; align-items: center; gap: 6px; font-size: 13px;
                    color: var(--text-2); cursor: pointer; }
  .v-card-ftr { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 16px 14px; }
  .v-empty { display: flex; flex-direction: column; align-items: center; justify-content: center;
             gap: 8px; padding: 60px 20px; color: var(--text-3); }
  .v-empty-icon  { font-size: 40px; }
  .v-empty-title { font-size: 16px; font-weight: 700; color: var(--ok); }
  .v-all-skipped { padding: 12px 16px; font-size: 13px; color: var(--text-2);
                   background: var(--bg2); border-radius: 10px; border: 1px solid var(--border);
                   display: flex; align-items: center; gap: 10px; }
  ```

- [ ] **Schritt 5: `editor.html` im Browser öffnen**

  Erwartetes Ergebnis: Layout unverändert, neuer Button „☁ Alle prüfen" sichtbar im Header. Kein neuer Tab sichtbar (noch `display:none`). Keine JS-Fehler in der Konsole.

- [ ] **Schritt 6: Commit**

  ```bash
  git add editor.html
  git commit -m "feat: add validation button, tab, panel and CSS"
  ```

---

## Task 4: `fetchAndValidate` + Tab-Integration

**Files:**
- Modify: `editor-app.js`

- [ ] **Schritt 1: Hilfsfunktion `issueTypeLabel` + `setValidationTabBadge` nach `savePifHrefs` einfügen**

  ```js
  function issueTypeLabel(type) {
    return { 'open-start': 'Vergessen auszustempeln', 'orphan-stop': 'Stop ohne Start',
             'double-start': 'Doppelt eingestempelt', 'short-pair': 'Verdächtig kurze Dauer',
           }[type] || type;
  }

  function setValidationTabBadge(state) {
    const tab = document.getElementById('tab-validation');
    tab.style.display = '';
    const active = typeof state === 'number' ? validationIssues.filter(i => !i.skipped).length : null;
    if (state === 'loading') { tab.textContent = '⏳ Prüfe…'; return; }
    if (state === 'error')   { tab.textContent = '⚠ Fehler'; return; }
    const n = typeof state === 'number' ? state : active;
    tab.textContent = n === 0 ? '✓ Alles OK' : `⚠ Probleme (${n})`;
  }
  ```

- [ ] **Schritt 2: `fetchAndValidate` nach `setValidationTabBadge` einfügen**

  ```js
  async function fetchAndValidate() {
    const creds = getCloudCreds();
    if (!creds) {
      alert('Keine Cloud-Zugangsdaten gefunden.\nBitte zuerst in admin.html konfigurieren.');
      return;
    }
    const btn = document.getElementById('btn-validate-all');
    btn.disabled = true;
    setValidationTabBadge('loading');
    // Tab anzeigen + aktivieren
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-validation').classList.add('active');
    activeTab = 'validation';
    document.getElementById('panel-table').hidden    = true;
    document.getElementById('panel-timeline').hidden = true;
    document.getElementById('panel-validation').hidden = false;
    document.getElementById('panel-empty').hidden    = true;
    document.getElementById('validation-cards').innerHTML =
      '<div class="v-empty"><div class="v-empty-title" style="color:var(--text-2)">Lade PIF-Dateien…</div></div>';
    try {
      const base = cloudDavBase(creds);
      const auth = cloudAuth(creds);
      await Promise.all([
        fetch(base, { method: 'MKCOL', headers: { Authorization: auth } }).catch(() => {}),
        refreshTypesFromCloud(),
      ]);
      const res = await fetch(base, { method: 'PROPFIND',
        headers: { Authorization: auth, Depth: '1' } });
      if (!res.ok) throw new Error(`PROPFIND HTTP ${res.status}`);
      const xml = await res.text();

      const now = new Date();
      const months = [
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        (() => { const d = new Date(now); d.setMonth(d.getMonth() - 1);
                 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
      ];

      const hrefs = [...xml.matchAll(/<[^>]*:href[^>]*>([^<]+)<\/[^>]*:href>/g)]
        .map(m => decodeURIComponent(m[1].trim()))
        .filter(h => /lgc_pif_.+_\d{4}-\d{2}\.json$/.test(h) &&
                     months.some(mo => h.includes(`_${mo}.json`)));

      if (hrefs.length === 0) {
        setValidationTabBadge(0);
        document.getElementById('validation-cards').innerHTML =
          '<div class="v-empty"><div class="v-empty-icon">☁</div>' +
          '<div class="v-empty-title" style="color:var(--text-2)">Keine PIF-Dateien für die letzten zwei Monate gefunden</div></div>';
        return;
      }

      validationPifCache = {};
      const results = await Promise.allSettled(hrefs.map(async href => {
        const fileUrl = IS_PROXY
          ? href
          : (creds.url.trim().replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href));
        const r = await fetch(fileUrl, { headers: { Authorization: auth } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        validationPifCache[fileUrl] = { ...data, entries: normalizeLogEntries(data.entries || []) };
        return fileUrl;
      }));

      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) showToast(`${failed} Datei(en) konnten nicht geladen werden.`);

      const enrichedEntries = [];
      for (const [href, pif] of Object.entries(validationPifCache)) {
        for (const e of pif.entries) enrichedEntries.push({ ...e, pifHref: href });
      }

      let typesConfig = [];
      try {
        typesConfig = JSON.parse(localStorage.getItem('lgc_cloud_types') || '[]');
        if (!typesConfig.length) typesConfig = JSON.parse(localStorage.getItem('lgc_type_config') || '[]');
      } catch {}

      validationIssues = buildValidationIssues(enrichedEntries, typesConfig);
      for (const issue of validationIssues) {
        issue.linked = getLinkedIssues(issue, validationIssues, typesConfig);
      }

      buildTypeMaps();
      renderValidationPanel();
    } catch (e) {
      alert('Fehler beim Prüfen: ' + e.message);
      setValidationTabBadge('error');
    } finally {
      btn.disabled = false;
    }
  }
  ```

- [ ] **Schritt 3: Tab-Click-Handler für `validation` erweitern**

  Im bestehenden Tab-Event-Listener (Zeile ~816 in editor-app.js) den Render-Aufruf ergänzen:

  ```js
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    document.getElementById('panel-table').hidden     = activeTab !== 'table';
    document.getElementById('panel-timeline').hidden  = activeTab !== 'timeline';
    document.getElementById('panel-validation').hidden = activeTab !== 'validation';
    if (activeTab === 'validation') renderValidationPanel();
    else if (logData) renderAll();
  }));
  ```

  Achtung: Den **bestehenden** Tab-Listener ersetzen, nicht einen zweiten hinzufügen. Die bestehende Version hat nur `if (logData) renderAll()`.

- [ ] **Schritt 4: Button-Listener für `btn-validate-all` am Ende von `editor-app.js` hinzufügen**

  ```js
  document.getElementById('btn-validate-all').addEventListener('click', fetchAndValidate);
  ```

- [ ] **Schritt 5: Manueller Smoke-Test**

  `editor.html` öffnen (lokaler Server). Cloud-Zugangsdaten vorhanden.  
  Klick auf „☁ Alle prüfen".  
  Erwartet:
  - Tab „⏳ Prüfe…" erscheint und wird aktiv
  - Keine JS-Fehler in der Konsole
  - Nach dem Laden: Tab zeigt entweder „✓ Alles OK" oder „⚠ Probleme (N)"

- [ ] **Schritt 6: Commit**

  ```bash
  git add editor-app.js
  git commit -m "feat: add fetchAndValidate and tab integration"
  ```

---

## Task 5: `renderValidationPanel` + Issue-Cards

**Files:**
- Modify: `editor-app.js`

- [ ] **Schritt 1: `renderValidationPanel` nach `fetchAndValidate` einfügen**

  ```js
  function renderValidationPanel() {
    const active = validationIssues.filter(i => !i.skipped);
    setValidationTabBadge(active.length);
    const container = document.getElementById('validation-cards');
    if (!container) return;

    if (validationIssues.length === 0) {
      container.innerHTML = '<div class="v-empty"><div class="v-empty-icon">✓</div>' +
        '<div class="v-empty-title">Keine Probleme gefunden</div></div>';
      return;
    }

    let html = '';
    if (active.length === 0 && validationIssues.some(i => i.skipped)) {
      html += `<div class="v-all-skipped">${validationIssues.length} Issue(s) übersprungen.&nbsp;` +
        `<button class="btn btn-sm" id="btn-reset-skip">Alle zurücksetzen</button></div>`;
    }
    for (let i = 0; i < validationIssues.length; i++) {
      html += renderIssueCard(validationIssues[i], i);
    }
    container.innerHTML = html;
  }
  ```

- [ ] **Schritt 2: `renderIssueCard` nach `renderValidationPanel` einfügen**

  ```js
  function renderIssueCard(issue, idx) {
    const ti = _TYPE_MAP[issue.logType] ||
      { label: issue.logType, main: '#9ca3af', dim: 'rgba(156,163,175,.15)' };
    const dateStr = issue.logicalDate
      ? new Date(issue.logicalDate + 'T12:00:00').toLocaleDateString('de-DE',
          { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    const hdr = `<div class="v-card-hdr">
      <span class="v-person">${escHtml(issue.person)}</span>
      <span class="badge-typ" style="background:${ti.dim};color:${ti.main}">${escHtml(ti.label)}</span>
      <span class="v-date">${escHtml(dateStr)}</span>
      <span class="badge-issue-type ${issue.issueType}">${escHtml(issueTypeLabel(issue.issueType))}</span>
    </div>`;

    if (issue.skipped) {
      return `<div class="v-card v-card-skipped" data-issue-idx="${idx}">${hdr}
        <div class="v-card-body"><div style="display:flex;gap:8px;align-items:center">
          <span class="v-skip-note">&#x2192; Übersprungen</span>
          <button class="btn btn-sm v-unskip" data-issue-idx="${idx}">Zurücksetzen</button>
        </div></div></div>`;
    }

    let body = '';
    if (issue.issueType === 'open-start') {
      const startTime = fmtTime(issue.mainEntry.zeitstempel);
      const defStop   = issue.logicalDate ? `${issue.logicalDate}T16:00` : '';
      const linkedHtml = issue.linked.map((lk, li) => {
        const lti = _TYPE_MAP[lk.logType] || { label: lk.logType, main: '#9ca3af' };
        return `<label class="v-linked-label">
          <input type="checkbox" class="v-linked-check"
            data-issue-idx="${idx}" data-linked-idx="${li}" checked>
          <span style="color:${lti.main}">${escHtml(lti.label)}</span> ebenfalls beenden
        </label>`;
      }).join('');
      body = `<div class="v-info">Eingestempelt: ${startTime} &mdash; kein Stop vorhanden</div>
        <div class="v-fix-row">
          <span class="v-fix-label">Stop-Zeit</span>
          <input type="datetime-local" class="v-time-input" id="v-stop-${idx}"
            value="${escHtml(defStop)}" step="60">
        </div>
        ${linkedHtml ? `<div class="v-linked-group">${linkedHtml}</div>` : ''}
        <div class="v-card-ftr">
          <button class="btn btn-sm btn-primary v-fix-open-start" data-issue-idx="${idx}">✓ Speichern</button>
          <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
          <button class="btn btn-sm btn-danger v-delete-start" data-issue-idx="${idx}">✗ Start löschen</button>
        </div>`;
    } else if (issue.issueType === 'orphan-stop') {
      const stopTime = fmtTime(issue.mainEntry.zeitstempel);
      const defStart = issue.logicalDate ? `${issue.logicalDate}T08:00` : '';
      body = `<div class="v-info">Stop vorhanden (${stopTime}) &mdash; kein Start gefunden</div>
        <div class="v-fix-row">
          <span class="v-fix-label">Start-Zeit</span>
          <input type="datetime-local" class="v-time-input" id="v-start-${idx}"
            value="${escHtml(defStart)}" step="60">
        </div>
        <div class="v-card-ftr">
          <button class="btn btn-sm btn-primary v-fix-orphan-stop" data-issue-idx="${idx}">✓ Speichern</button>
          <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
          <button class="btn btn-sm btn-danger v-delete-stop" data-issue-idx="${idx}">✗ Stop löschen</button>
        </div>`;
    } else if (issue.issueType === 'double-start') {
      const [e0, e1] = issue.entries;
      const t0 = fmtTime(e0.zeitstempel), t1 = fmtTime(e1.zeitstempel);
      body = `<div class="v-info">Zwei Starts: ${t0} und ${t1} &mdash; kein Stop dazwischen</div>
        <div class="v-card-ftr">
          <button class="btn btn-sm btn-danger v-delete-first-start" data-issue-idx="${idx}">✗ ${t0} löschen</button>
          <button class="btn btn-sm btn-danger v-delete-second-start" data-issue-idx="${idx}">✗ ${t1} löschen</button>
          <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
        </div>`;
    } else if (issue.issueType === 'short-pair') {
      const [sp0, sp1] = issue.entries;
      const durMs = new Date(sp1.zeitstempel) - new Date(sp0.zeitstempel);
      body = `<div class="v-info">Dauer: ${fmtMs(durMs)} (${fmtTime(sp0.zeitstempel)} &ndash; ${fmtTime(sp1.zeitstempel)})</div>
        <div class="v-fix-row-double">
          <div class="v-fix-row">
            <span class="v-fix-label">Von</span>
            <input type="datetime-local" class="v-time-input" id="v-sp-start-${idx}"
              value="${isoToLocalInput(sp0.zeitstempel)}" step="60">
          </div>
          <div class="v-fix-row">
            <span class="v-fix-label">Bis</span>
            <input type="datetime-local" class="v-time-input" id="v-sp-stop-${idx}"
              value="${isoToLocalInput(sp1.zeitstempel)}" step="60">
          </div>
        </div>
        <div class="v-card-ftr">
          <button class="btn btn-sm btn-primary v-fix-short-pair" data-issue-idx="${idx}">✓ Speichern</button>
          <button class="btn btn-sm btn-danger v-delete-pair" data-issue-idx="${idx}">✗ Paar löschen</button>
          <button class="btn btn-sm v-skip" data-issue-idx="${idx}">→ Überspringen</button>
        </div>`;
    }

    return `<div class="v-card" data-issue-idx="${idx}">${hdr}
      <div class="v-card-body">${body}</div></div>`;
  }
  ```

- [ ] **Schritt 3: Manueller UI-Test**

  `editor.html` öffnen. „Alle prüfen" klicken (mit Cloud-Zugang).  
  Erwartet:
  - Issues werden als Cards angezeigt mit korrektem Person-Name, Typ-Badge, Datum und Issue-Typ-Badge
  - `open-start`-Cards haben Stop-Zeit-Input vorausgefüllt mit `16:00` des logischen Tages
  - Linked-Checkboxen erscheinen wo relevant
  - `short-pair`-Cards zeigen beide Zeitfelder editierbar
  - Skip- und Löschen-Buttons sind vorhanden (aber noch nicht verdrahtet)

- [ ] **Schritt 4: Commit**

  ```bash
  git add editor-app.js
  git commit -m "feat: add renderValidationPanel and renderIssueCard"
  ```

---

## Task 6: Event-Delegation + Cloud-Speichern

**Files:**
- Modify: `editor-app.js`

- [ ] **Schritt 1: `performSave`-Hilfsfunktion nach `renderIssueCard` einfügen**

  ```js
  async function performSave(hrefs, issuesToResolve) {
    try {
      await savePifHrefs(hrefs);
      const resolved = new Set(issuesToResolve);
      validationIssues = validationIssues.filter(i => !resolved.has(i));
      renderValidationPanel();
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message);
    }
  }
  ```

- [ ] **Schritt 2: Event-Listener für `#validation-cards` am Ende der Event-Listener-Section einfügen**

  Nach dem `document.getElementById('btn-validate-all').addEventListener(...)`:

  ```js
  document.getElementById('validation-cards').addEventListener('click', async e => {
    // Kein data-issue-idx: "Alle zurücksetzen"-Button
    if (e.target.closest('#btn-reset-skip')) {
      validationIssues.forEach(i => { i.skipped = false; });
      renderValidationPanel();
      return;
    }

    const card = e.target.closest('[data-issue-idx]');
    if (!card) return;
    const idx = parseInt(card.dataset.issueIdx);
    if (isNaN(idx)) return;
    const issue = validationIssues[idx];
    if (!issue) return;

    if (e.target.closest('.v-skip')) {
      issue.skipped = true;
      renderValidationPanel();
      return;
    }
    if (e.target.closest('.v-unskip')) {
      issue.skipped = false;
      renderValidationPanel();
      return;
    }

    if (e.target.closest('.v-fix-open-start')) {
      const inp = document.getElementById(`v-stop-${idx}`);
      if (!inp?.value) { alert('Bitte Stop-Zeit eingeben.'); return; }
      const stopIso = localInputToIso(inp.value);
      if (new Date(stopIso) <= new Date(issue.mainEntry.zeitstempel)) {
        alert('Stop-Zeit muss nach dem Start liegen.'); return;
      }
      const checks = [...document.querySelectorAll(`.v-linked-check[data-issue-idx="${idx}"]`)];
      const linkedToFix = checks
        .filter(cb => cb.checked)
        .map(cb => issue.linked[parseInt(cb.dataset.linkedIdx)])
        .filter(Boolean);
      applyOpenStartFix(issue, stopIso, linkedToFix);
      const hrefs = [issue.pifHref, ...linkedToFix.map(l => l.pifHref)];
      await performSave(hrefs, [issue, ...linkedToFix]);
      return;
    }

    if (e.target.closest('.v-delete-start')) {
      if (!confirm(`Start-Eintrag von ${issue.person} (${issue.logType}) löschen?`)) return;
      applyDeleteFix(issue);
      await performSave([issue.pifHref], [issue]);
      return;
    }

    if (e.target.closest('.v-fix-orphan-stop')) {
      const inp = document.getElementById(`v-start-${idx}`);
      if (!inp?.value) { alert('Bitte Start-Zeit eingeben.'); return; }
      const startIso = localInputToIso(inp.value);
      if (new Date(startIso) >= new Date(issue.mainEntry.zeitstempel)) {
        alert('Start-Zeit muss vor dem Stop liegen.'); return;
      }
      applyOrphanStopFix(issue, startIso);
      await performSave([issue.pifHref], [issue]);
      return;
    }

    if (e.target.closest('.v-delete-stop')) {
      if (!confirm(`Stop-Eintrag von ${issue.person} (${issue.logType}) löschen?`)) return;
      applyDeleteFix(issue);
      await performSave([issue.pifHref], [issue]);
      return;
    }

    if (e.target.closest('.v-delete-first-start')) {
      applyDoubleStartFix(issue, issue.entries[0].id);
      await performSave([issue.entries[0].pifHref], [issue]);
      return;
    }

    if (e.target.closest('.v-delete-second-start')) {
      applyDoubleStartFix(issue, issue.entries[1].id);
      await performSave([issue.entries[1].pifHref], [issue]);
      return;
    }

    if (e.target.closest('.v-fix-short-pair')) {
      const inpS = document.getElementById(`v-sp-start-${idx}`);
      const inpE = document.getElementById(`v-sp-stop-${idx}`);
      if (!inpS?.value || !inpE?.value) { alert('Bitte beide Zeiten eingeben.'); return; }
      const newStartIso = localInputToIso(inpS.value);
      const newStopIso  = localInputToIso(inpE.value);
      if (new Date(newStopIso) <= new Date(newStartIso)) {
        alert('Bis muss nach Von liegen.'); return;
      }
      applyShortPairFix(issue, newStartIso, newStopIso);
      const hrefs = [...new Set([issue.entries[0].pifHref, issue.entries[1].pifHref])];
      await performSave(hrefs, [issue]);
      return;
    }

    if (e.target.closest('.v-delete-pair')) {
      if (!confirm(`Paar von ${issue.person} (${issue.logType}) löschen?`)) return;
      applyDeleteFix(issue);
      const hrefs = [...new Set(issue.entries.map(en => en.pifHref))];
      await performSave(hrefs, [issue]);
      return;
    }
  });
  ```

- [ ] **Schritt 3: End-to-End-Test (manuell)**

  `editor.html` öffnen, „Alle prüfen" klicken.  
  Ein offener Start vorhanden:
  1. Stop-Zeit eingeben, „Speichern" klicken
  2. Erwartet: Card verschwindet, Badge sinkt um 1, PIF-Datei in Cloud aktualisiert (via Nextcloud WebUI prüfen)  
  3. Bei gelinkter Anwesenheit: Checkbox anhaken → beide PIFs werden gespeichert  
  
  „Überspringen" testen:
  1. Klick auf „→ Überspringen"
  2. Card graut aus; beim nächsten „Alle prüfen" erscheint das Issue wieder

- [ ] **Schritt 4: Commit**

  ```bash
  git add editor-app.js
  git commit -m "feat: wire validation fix actions and cloud save"
  ```

---

## Task 7: Polishing + Branch + Push

**Files:**
- Modify: `editor-app.js` (kleine Korrekturen falls nötig)
- Modify: `CHANGELOG.md` (neuer Eintrag)

- [ ] **Schritt 1: Bestehenden Tab-Listener prüfen**

  Sicherstellen, dass in `editor-app.js` der Tab-Listener für `validation` korrekt `panel-table` und `panel-timeline` auf `hidden = true` setzt. Sonst können beim Wechsel von validation zurück zu table/timeline beide Panels gleichzeitig sichtbar sein. Falls nötig:

  Den Tab-Listener ergänzen (falls noch nicht in Task 4 erledigt):

  ```js
  // Im Tab-Click-Listener, Zeile ~816:
  document.getElementById('panel-table').hidden      = activeTab !== 'table';
  document.getElementById('panel-timeline').hidden   = activeTab !== 'timeline';
  document.getElementById('panel-validation').hidden = activeTab !== 'validation';
  document.getElementById('panel-empty').hidden      = logData !== null || activeTab === 'validation';
  ```

- [ ] **Schritt 2: CHANGELOG.md ergänzen**

  Neuen Abschnitt `[Unreleased]` oder `[1.0.2]` am Anfang hinzufügen:

  ```markdown
  ## [Unreleased]

  ### Hinzugefügt
  - Editor: Neuer Button „☁ Alle prüfen" — lädt alle PIF-Dateien der letzten zwei Monate,
    erkennt offene Starts, verwaiste Stops, Doppel-Starts und verdächtig kurze Paare (<15 min)
    und zeigt Quick-Fix-Cards mit direktem Cloud-Speichern an
  ```

- [ ] **Schritt 3: Alle Tests abschließend ausführen**

  `tests/test_editor.html` im Browser öffnen.  
  Erwartet: `✓ Alle N Tests bestanden` (Suites 1–15, kein einziger Fehler).

  `tests/test_dashboard.html` im Browser öffnen.  
  Erwartet: Alle Tests weiterhin bestanden (Regression-Check).

- [ ] **Schritt 4: Finaler Commit**

  ```bash
  git add editor-app.js CHANGELOG.md
  git commit -m "feat: finalize editor validation panel and update changelog"
  ```

- [ ] **Schritt 5: Push auf Remote**

  ```bash
  git -c http.sslVerify=false push origin fixes/preparing-for-big-release
  ```

  Erwartet: Branch erfolgreich gepusht, kein Force-Push nötig.
