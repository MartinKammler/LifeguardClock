# PRD – LifeguardClock

**Stand:** 2026-03-29
**Version:** 0.9.1
**Ziel:** Dokumentation des Ist-Zustands + Inkonsistenz-Register (noch offene Widersprüche)

---

## Problem Statement

Rettungsschwimmer-Vereine (primär DLRG) müssen Anwesenheits- und Dienstzeiten mehrerer Mitglieder pro Wachtag erfassen. Anforderungen:

- **Mehrere Dienst-Typen** (Anwesenheit, Wachdienst, Sanitätsdienst) mit unterschiedlichen Regeln (Zeitlimits, Pflichtpausen, Zeitfenster, gegenseitige Sperrung)
- **Kiosk-Betrieb** auf Android-Tablets im Dauerbetrieb ohne IT-Betreuung vor Ort
- **Mehrere Geräte** an einem Standort oder mehreren Standorten — Daten müssen zentral zusammenlaufen
- **Offline-Betrieb** muss vollständig funktionieren; Sync erfolgt nachgelagert
- **Datenschutz**: Keine personenbezogenen Daten auf externen Servern außer dem selbst betriebenen WebDAV/Nextcloud

---

## Solution

LifeguardClock ist eine vollständig clientseitige Web-App (HTML/CSS/Vanilla JS, kein Build-System) mit vier eigenständigen Oberflächen:

| App | Rolle |
|---|---|
| **LifeguardClock.html** | Kiosk-Stempeluhr — PIN-Login, Dienst-Stempelung, Admin-Panel |
| **admin.html** | Zentrale Verwaltung — Nutzer, Typen, Events, Geräte |
| **dashboard.html** | Auswertung — Stundenübersicht, Wochen-/Personenansicht, Export |
| **editor.html** | Korrekturwerkzeug — Einzel-Einträge nachträglich bearbeiten |

Persistenz: Browser-`localStorage` (lokal), WebDAV/Nextcloud (Cloud-Sync). Kein Backend, kein Node.js.

---

## User Stories

### LifeguardClock.html — Login & PIN

1. [Observed] Als Rettungsschwimmer möchte ich meinen 6-stelligen PIN auf einem Nummernfeld eingeben, damit ich mich ohne Tastatur am Kiosk-Tablet authentifizieren kann.
2. [Observed] Als Rettungsschwimmer möchte ich nach der 6. Ziffer automatisch eingeloggt werden (kein Bestätigen-Button), damit die Eingabe flüssig ist.
3. [Observed] Als Rettungsschwimmer sehe ich 6 Punkte-Indikatoren die sich beim Tippen füllen, damit ich den Eingabefortschritt ohne Klartextanzeige verfolgen kann.
4. [Observed] Als Rettungsschwimmer sehe ich bei falschem PIN eine Fehlermeldung mit verbleibenden Versuchen, damit ich weiß wie viele Versuche ich noch habe.
5. [Observed] Als System reagiert das PIN-Feld bei Fehleingabe mit einer Schüttelanimation und löscht die Eingabe automatisch, damit das Feedback sofort spürbar ist.
6. [Observed] Als System sperrt die App nach 3 aufeinanderfolgenden Fehlversuchen die PIN-Eingabe für 5 Minuten, damit Brute-Force-Angriffe verhindert werden.
7. [Observed] Als gesperrter Nutzer sehe ich das gesamte Nummernfeld versteckt und den Schriftzug „GESPERRT" in der Mitte, damit die Sperre eindeutig kommuniziert wird.
8. [Observed] Als Nutzer mit unvollständiger PIN-Eingabe wird meine Eingabe nach konfigurierbaren Sekunden automatisch gelöscht, damit keine halbeingegebene PIN auf dem Bildschirm stehen bleibt.
9. [Observed] Als Rettungsschwimmer beim ersten Login mit einer Einmal-PIN werde ich aufgefordert, einen neuen persönlichen PIN zu setzen, damit ich ab sofort einen selbst gewählten PIN nutze.
10. [Observed] Als Nutzer beim PIN-Wechsel wird mein neuer PIN auf Schwäche geprüft (alle gleich, aufsteigend, absteigend, bereits vergeben), damit triviale PINs verhindert werden.
11. [Observed] Als Nutzer beim PIN-Wechsel muss ich den neuen PIN zweimal eingeben, damit Tippfehler ausgeschlossen werden.
12. [Observed] Als wartender Nutzer am Login-Screen erscheint nach konfigurierter Inaktivitätszeit ein animierter Logo-Bildschirmschoner, der bei Berührung verschwindet.
13. [Observed] Als Nutzer kann ich über einen QR-Scanner-Overlay am Login-Screen Cloud-Zugangsdaten einscannen, damit die Kiosk-Einrichtung ohne manuelle URL-Eingabe möglich ist.
14. [Observed] Als Nutzer beim QR-Scan erscheint ein Bestätigungsdialog mit Server-URL und Benutzername bevor die Konfiguration übernommen wird, damit gefälschte QR-Codes das Gerät nicht umleiten können.
15. [Observed] Als Nutzer kann ich Cloud-Zugangsdaten auch manuell (URL, Benutzername, Passwort) eingeben, damit Geräte ohne funktionsfähige Kamera eingerichtet werden können.

### LifeguardClock.html — Dienst-Stempelung (Dashboard nach Login)

16. [Observed] Als Rettungsschwimmer sehe ich nach dem Login meine erlaubten Dienst-Typen als farbige Kacheln, damit ich sofort den richtigen Dienst starten kann.
17. [Observed] Als Rettungsschwimmer sehe ich nur Typen die meiner Berechtigungs-Liste entsprechen, damit ich keine Dienste starten kann für die ich nicht autorisiert bin.
18. [Observed] Als Rettungsschwimmer starte ich einen Dienst mit einem Tap auf „Start" und beende ihn mit „Stop", damit jeder Zeitabschnitt als Paar (start/stop) im Log landet.
19. [Observed] Als Rettungsschwimmer sehe ich bei einem aktiven Dienst eine pulsierende Markierung + aktiven Rahmen auf der Kachel, damit ich auf einen Blick erkenne welcher Dienst läuft.
20. [Observed] Als Rettungsschwimmer sehe ich einen Countdown-Timer wenn für einen Typ ein Zeitlimit (`maxDurationMs`) konfiguriert ist, damit ich weiß wann der Dienst automatisch endet.
21. [Observed] Als System stoppt ein Dienst automatisch wenn `maxDurationMs` abgelaufen ist und schreibt einen `auto: true`-Eintrag ins Log, damit Zeitüberschreitungen lückenlos dokumentiert werden.
22. [Observed] Als Rettungsschwimmer sehe ich den Start-Button eines Typs in einer Pflichtpause (`cooldownMs`) deaktiviert mit Countdown, damit ich die Mindestpause nicht versehentlich überspringe.
23. [Observed] Als Rettungsschwimmer kann ich einen laufenden Dienst mit Zeitlimit durch erneuten „Start"-Tap verlängern (Extend), damit keine Unterbrechung im Log entsteht wenn ich weitermachen will.
24. [Observed] Als Rettungsschwimmer wird ein Mutex-Typ (`mutexKeys`) automatisch gestoppt wenn ich einen konkurrierenden Typ starte, damit keine logisch widersprüchlichen Gleichzeitigkeiten entstehen.
25. [Observed] Als Rettungsschwimmer werden Auto-Start-Typen (`autoStartKeys`) automatisch gestartet wenn ich einen übergeordneten Typ starte, damit z. B. Anwesenheit bei Wachdienst-Start automatisch mitläuft.
26. [Observed] Als Rettungsschwimmer wird ein Auto-Start-Typ automatisch mitgestoppt wenn sein übergeordneter Typ gestoppt wird.
27. [Observed] Als Rettungsschwimmer wird mein Dienst automatisch gestoppt wenn das konfigurierte Zeitfenster (`requiresZeitfenster`) abläuft, damit Dienste außerhalb der erlaubten Zeit enden.
28. [Observed] Als Rettungsschwimmer sehe ich den Start-Button eines zeitfensterpflichtigen Typs außerhalb des Zeitfensters deaktiviert.
29. [Observed] Als Rettungsschwimmer sehe ich in einem „Meine Stunden"-Overlay meine heutigen Gesamtstunden je Typ, damit ich meine eigene Tages-Bilanz einsehen kann.
30. [Observed] Als Rettungsschwimmer werde ich nach konfigurierter Inaktivität automatisch ausgeloggt, damit das Gerät für den nächsten Nutzer freigegeben wird.
31. [Observed] Als Rettungsschwimmer sehe ich den Idle-Countdown die letzten 10 Sekunden in Gelb und die letzten 5 Sekunden in Rot blinkend, damit ich rechtzeitig reagieren kann.
32. [Observed] Als System werden beim automatischen Tageswechsel (`dayBoundaryHour`) alle aktiven Dienste aller Nutzer gestoppt und der Log-Key rotiert, damit Logs tagesweise getrennt bleiben.

### LifeguardClock.html — Kiosk-Härtung

33. [Observed] Als System wird beim ersten Touch Vollbild angefordert und bei unbeabsichtigtem Verlassen erneut, damit der Kiosk-Modus zuverlässig aktiv bleibt.
34. [Observed] Als System ist Wake Lock aktiv um das Display vor dem Dimmen zu schützen.
35. [Observed] Als System sind Browser-Tastaturkürzel (F5, Ctrl+R, F12 etc.) sowie Kontextmenü, Textselektion und Zurück-Geste deaktiviert.
36. [Observed] Als System erfordert jeder Seitenneuladen eine erneute PIN-Eingabe — es gibt keine sessionübergreifende Authentifizierung.

### LifeguardClock.html — Admin-Panel

37. [Observed] Als Admin melde ich mich über einen separaten Admin-PIN an um das Admin-Panel zu öffnen.
38. [Observed] Als Admin kann ich alle aktiven Dienste aller Nutzer mit einem Tap beenden (Bestätigung erforderlich).
39. [Observed] Als Admin kann ich das vollständige Log als CSV exportieren.
40. [Observed] Als Admin kann ich das gesamte Log leeren (Bestätigung erforderlich).
41. [Observed] Als Admin sehe ich im Log-Ledger alle Einträge rückwärts chronologisch mit Zeitstempel, Nutzer, Typ, Aktion, Dauer und Auto-Badge.
42. [Observed] Als Admin sehe ich in der Stunden-Übersicht alle Nutzer mit ihren Gesamtstunden je Typ sowie Live-Indikatoren für aktive Dienste.
43. [Observed] Als Admin kann ich einzelne Nutzer direkt aus dem Admin-Panel ausloggen.
44. [Observed] Als Admin kann ich ein Log-Editor-Modal pro Nutzer öffnen um Einträge inline zu bearbeiten, löschen oder zu ergänzen.
45. [Observed] Als Admin kann ich den PIN eines Nutzers zurücksetzen (generiert Einmal-PIN, setzt `mustChangePIN: true`).
46. [Observed] Als Admin kann ich Zeitfenster-Overrides für heute pro Typ einstellen.
47. [Observed] Als Admin kann ich Cloud-Zugangsdaten eintragen und die Verbindung testen.
48. [Observed] Als Admin kann ich die Nutzerliste manuell aus der Cloud laden oder in die Cloud speichern.
49. [Observed] Als Admin nach Rate-Limit-Sperre (3 Fehlversuche am Admin-Dialog) ist das Admin-Passwortfeld für 5 Minuten gesperrt.

### admin.html — Benutzerverwaltung

50. [Observed] Als Admin lege ich neue Nutzer mit ID, Name, initaler PIN und Berechtigungen an.
51. [Observed] Als Admin benenne ich Nutzer um — alle historischen Log-Einträge werden mitgezogen.
52. [Observed] Als Admin lösche ich Nutzer — die ID wird in `removedIds` (Tombstone) in `lgc_users.json` geschrieben damit der Nutzer auf anderen Geräten nicht wieder auftaucht.
53. [Observed] Als Admin vergebe ich Berechtigungen pro Nutzer als Checkboxen die aus den zentralen Typen generiert werden.
54. [Observed] Als Admin setze ich den PIN eines Nutzers zurück (Einmal-PIN mit `mustChangePIN: true`).
55. [Observed] Als Admin drucke ich eine Übersicht aller ausstehenden Einmal-PINs über `einmalpins.html`.
56. [Observed] Als Admin lädt die App beim Start automatisch `lgc_users.json` aus der Cloud wenn Zugangsdaten vorhanden sind.
57. [Observed] Als Admin speichere ich die Nutzerliste explizit in die Cloud (Bestätigung bei Überschreiben).
58. [Observed] Als System werden beim Laden der Cloud-Nutzerliste Nutzer ohne `id` oder `name` verworfen und per `console.warn` protokolliert.
59. [Observed] Als System werden beim Laden gelöschte IDs aus `removedIds` aus der lokalen Liste gefiltert.

### admin.html — Typen-Verwaltung

60. [Observed] Als Admin verwalte ich Stempel-Typen zentral in `lgc_types.json` (Cloud) — alle Geräte laden beim nächsten Start die aktuelle Liste.
61. [Observed] Als Admin lege ich neue Typen mit key, label, logType, Farbe, Berechtigungs-Key, Zeitlimit, Pflichtpause, Zeitfenster, Mutex-Keys, AutoStart-Keys und pinned-Flag an.
62. [Observed] Als Admin bearbeite ich bestehende Typen inline.
63. [Observed] Als Admin lösche ich Typen — historische Log-Einträge behalten ihr `logType`-Feld.
64. [Observed] Als System werden beim Laden der Cloud-Typen Einträge ohne `key` oder `logType` verworfen.
65. [Observed] Als System wird beim Start automatisch `lgc_types.json` geladen; ein leeres Array löscht die lokale Typ-Liste (kein Silent-Ignore mehr).
66. [Observed] Als System fällt die App auf `CONFIG.types` aus `config.js` zurück wenn `lgc_types.json` in der Cloud noch nicht existiert (HTTP 404).

### admin.html — Events / Sonderzeiten

67. [Observed] Als Admin lege ich tagesbasierte Sonderevents an (`lgc_events.json`) mit Datum, Label und typ-spezifischen Zeitfenster-Overrides.
68. [Observed] Als Admin ist maximal ein Event pro Tag erlaubt (Duplikat-Schutz).
69. [Observed] Als System wird das aktive Event für heute beim Cloud-Sync geladen und dessen Zeitfenster mit höchster Priorität angewendet (Event > localStorage-Override > Typ-Default > globaler Default).
70. [Observed] Als Rettungsschwimmer sehe ich im Dashboard-Header ein kleines Badge wenn heute ein Sonderevent aktiv ist.

### admin.html — Geräte-Verwaltung

71. [Observed] Als Admin sehe ich alle registrierten Geräte (aus `lgc_config_<deviceId>.json` in der Cloud).
72. [Observed] Als Admin kann ich für jedes Gerät Typen deaktivieren oder Zeitfenster überschreiben.
73. [Observed] Als System registriert sich ein neues Gerät automatisch in der Cloud wenn keine eigene Konfigurationsdatei vorhanden ist.
74. [Observed] Als Admin kann ich ein Deploy-Signal senden (`lgc_deploy.json`) das alle verbundenen Geräte beim nächsten Sync zum Neuladen veranlasst.

### dashboard.html — Datenauswertung

75. [Observed] Als Auswertender lade ich Zeiterfassungsdaten über WebDAV direkt aus der Cloud.
76. [Observed] Als Auswertender lade ich Zeiterfassungsdaten alternativ aus einem lokalen Ordner über die File System Access API.
77. [Observed] Als Auswertender werden beim Laden PIF-Dateien (pro Nutzer) und Geräte-Snapshots (pro Gerät) automatisch dedupliziert.
78. [Observed] Als Auswertender filtere ich die Anzeige nach Zeitraum (Von/Bis) und Typ-Auswahl.
79. [Observed] Als Auswertender sehe ich im Tab „Übersicht" Gesamtstunden je Typ mit Korrelations-Balken (Anwesenheit ↔ Wachdienst / Sanitätsdienst).
80. [Observed] Als Auswertender sehe ich im Tab „Tage" eine Tagesliste mit Stundenaufschlüsselung je Typ.
81. [Observed] Als Auswertender sehe ich im Tab „Wochen" eine ISO-Wochen-Aggregation.
82. [Observed] Als Auswertender sehe ich im Tab „Personen" Gesamtstunden je Nutzer und Typ.
83. [Observed] Als Auswertender exportiere ich Daten als CSV in drei Varianten: Rohdaten, Wochensummen, Personensummen.
84. [Observed] Als Auswertender ist das Dashboard rein lesend — keine Bearbeitung von Einträgen möglich.

### editor.html — Log-Korrektur

85. [Observed] Als Admin lade ich eine einzelne Log-Datei aus der Cloud (WebDAV-Picker) oder per lokalem Datei-Picker.
86. [Observed] Als Admin bearbeite ich Zeitstempel von Einträgen inline über einen `datetime-local`-Picker.
87. [Observed] Als Admin markiere ich Einträge zum Löschen (sofort rückgängig machbar vor dem Speichern).
88. [Observed] Als Admin füge ich neue Einträge (Nutzer, Typ, Aktion, Zeitstempel) manuell hinzu.
89. [Observed] Als Admin sehe ich Warnungen bei unpaarigen Einträgen (Start ohne Stop oder umgekehrt).
90. [Observed] Als Admin sehe ich eine Timeline-Ansicht mit farbcodierten Einträgen je Typ.
91. [Observed] Als Admin kann ich bis zu 50 Schritte rückgängig machen oder wiederholen (Undo/Redo).
92. [Observed] Als Admin speichere ich bearbeitete Logs zurück in die Cloud (WebDAV).
93. [Observed] Als System werden beim Import ungültige Einträge (fehlende Pflichtfelder, ungültige Zeitstempel, unbekannte Aktionen) per `normalizeLogEntries()` herausgefiltert.

### Cloud-Sync & Offline

94. [Observed] Als System werden Log-Änderungen nach einem konfigurierbaren Debounce (Standard: 60 Sek.) automatisch in die Cloud geschrieben.
95. [Observed] Als System ist die App vollständig offline-funktionsfähig — Sync erfolgt bei Wiederverbindung.
96. [Observed] Als System sind WebDAV-Verbindungsfehler (`TypeError` / Netzwerkfehler) silent; unerwartete Parse-/Logik-Fehler werden per `console.warn('[lgc]…')` sichtbar gemacht.
97. [Observed] Als System werden Cross-Origin-Anfragen an die Cloud nicht gecacht (Service Worker: Network-Only für WebDAV).
98. [Observed] Als System synct jeder Nutzer über eine eigene monatliche PIF-Datei (`lgc_pif_<userId>_YYYY-MM.json`) damit geräteübergreifender Status konsistent ist.
99. [Observed] Als System schreibt jedes Gerät täglich einen vollständigen Snapshot (`lgc_[deviceId]_YYYY-MM-DD.json`) als Audit-Trail in die Cloud.
100. [Observed] Als System werden Basic-Auth-Credentials Unicode-sicher kodiert (`btoa(unescape(encodeURIComponent(…)))`) damit Umlaute in Passwörtern nicht brechen.

### Service Worker & PWA

101. [Observed] Als Nutzer ist die App-Shell (HTML, CSS, Logo, Manifest, JS-Dateien) offline via Service Worker gecacht.
102. [Observed] Als Nutzer löst ein SW-Cache-Update (neue `CACHE_NAME`) automatisch einen App-Reload mit Toast aus.
103. [Observed] Als Nutzer kann die App als PWA installiert werden (Portrait-Erzwingung via Manifest, maskable Icon).

---

## Evidence Summary

| Quelle | Gewicht |
|---|---|
| `lifeguardclock.js`, `admin-app.js`, `dashboard-app.js`, `editor-app.js` | Primär — implementiertes Verhalten |
| `LifeguardClock.html`, `admin.html`, `dashboard.html`, `editor.html` | UI-Text, CSS-Klassen, DOM-Struktur |
| `config.example.js`, `presets/config.dlrg.js` | Konfigurationsfelder und Defaults |
| `CHANGELOG.md`, `RELEASE_NOTES.md` | Historischer Kontext, Absichten hinter Änderungen |
| `tests/test_*.html` — 5 Suiten | Verhalten wie es getestet sein soll |
| Explizite Nutzerbestätigung (diese Sitzung) | Scope-Entscheidungen, Ziele |

---

## Implementation Decisions

### Kernmodule

| Modul | Verantwortung |
|---|---|
| **Auth** | PIN-Hashing (SHA-256 + Salt), Rate-Limiting, Lockout, PIN-Wechsel-Zwang |
| **Log Engine** | Einträge schreiben, lesen, validieren; Tageswechsel; Backup |
| **State Machine** | Pro Nutzer/Typ: active/inactive/cooldown; Trigger für auto-stop, cascading, extend |
| **Automation Engine** | `checkTimeLimits`, `checkZeitfensterEnd`, `checkDayBoundary` — laufen periodisch |
| **Cloud Sync** | Debounced push/pull; PIF-Sync; Config-Pull; Conflict-Handling |
| **Type Config** | Normalisierung, Validierung, Fallback-Hierarchie (Cloud → localStorage → config.js) |
| **User Management** | Cloud-CRUD, Tombstone (`removedIds`), OTP-Generierung, Merge-Logik |
| **QR Setup** | jsQR-Integration, Bestätigungsdialog, Fallback auf manuelles Formular |
| **Kiosk Layer** | Fullscreen, Wake Lock, Keyboard/Gesture-Blocking |

### Daten-Kontraktpunkte

- **Log-Eintrag**: `nutzer` (string), `typ` (string), `aktion` (`start`|`stop`), `zeitstempel` (ISO-8601) — Pflichtfelder; `dauer_ms`, `auto`, `extend` optional
- **Typ-Objekt**: `key` + `logType` sind Pflicht und nach Produktivstart unveränderlich
- **User-Objekt**: `id` + `name` Pflicht; `pin` ist Klartext (OTP) oder SHA-256-Hash + `salt`
- **Event-Objekt**: `date` als `YYYY-MM-DD`-String Pflicht
- **Tombstone**: `removedIds[]` in `lgc_users.json` — rückwärtskompatibel (ältere Versionen ignorieren)

### Fallback-Hierarchie Typen

```
lgc_types.json (Cloud)
  → lgc_cloud_types (localStorage-Cache)
    → CONFIG.types (config.js)
      → Minimal-Fallback (nur Anwesenheit)
```

### Sicherheits-Entscheidungen

- **Rate-Limit**: 3 Fehlversuche → 5-Minuten-Sperre; nur im Arbeitsspeicher (kein Storage) — Reset bei Seitenneuladen ist für Kiosk-Betrieb akzeptiert
- **Admin-Passwort**: SHA-256 + Salt in localStorage; Default-Passwort als bekannter Fallback wenn kein Hash vorhanden
- **CSP**: `script-src 'self'` in allen HTML-Dateien — Inline-Scripts und CDN-Loads verboten
- **XSS**: Alle dynamischen Inhalte über `escHtml()` escaped; `data-*`-Attribute statt String-Interpolation in Event-Handlern
- **CSS-Injection**: `safeColor()`-Whitelist für Typ-Farben in `admin-app.js`

---

## Testing Decisions

### Was gute Tests aussagen sollen

- **Externes Verhalten**, nicht interne Implementierungsdetails
- Grenzfälle: leere Arrays, `null`, fehlende Felder, ungültige Typen
- Sicherheits-kritische Pfade: PIN-Hashing, Rate-Limit, Schema-Validierung, Tombstone-Merge

### Schutzbedürftigste Flows

1. PIN-Authentifizierung (Hash-Korrektheit, Lockout-Logik, Schwach-PIN-Erkennung)
2. Type-Schema-Validierung (`_validCloudType`, `_validType`) — Fehler hier können alle Cloud-Typen stumm verwerfen
3. `mergeCloudUsers` mit `removedIds` — Tombstone-Logik verhindert Nutzer-Drift
4. `normalizeLogEntries` — Fehlerhafte Einträge beim Import können Stunden-Auswertung verfälschen
5. Service Worker Routing — falsches Caching von WebDAV-Requests bricht Cloud-Sync

### Bekannte Regressions-Risiken

- **Type-Schema**: Feld-Umbenennung `id`/`name` → `key`/`logType` war ein stiller Breaking Change — Tests müssen das korrekte Schema fest verankern
- **Empty-Array-Guard**: `validTypes.length > 0` als Guard hat leere Cloud-Listen maskiert — Test muss leeres Array als gültigen Zustand abdecken
- **Lockout-Inkonsistenz**: Sperrzeit war in Tests (30 Min), UI-Text und Code inkonsistent — nach Fix auf 5 Min vereinheitlicht

---

## Current vs Desired Behavior

### Behalten (funktioniert korrekt)

- PIN-Login-Flow inkl. Rate-Limit (5 Min, Keypad-Verstecken)
- Dienst-Automation (Mutex, AutoStart, MaxDuration, Cooldown, Zeitfenster)
- Cloud-Sync (PIF, Geräte-Snapshot, Debounce)
- Tombstone (`removedIds`) für Nutzer-Drift
- CSP + XSS-Escaping

### Noch offen / Inkonsistent (Blocker-Register)

Keine offenen Inkonsistenzen.

### Bewusst akzeptierte Restrisiken

| Risiko | Begründung |
|---|---|
| Rate-Limit-Sperre nur im RAM | Kiosk-Tablets werden nicht neu gestartet; für Angriffsszenarien ausreichend |
| Admin-Passwort-Default-Fallback | Kein First-Run-Setup-Zwang; bekanntes Default-Passwort wenn Storage leer — mittelfristig beheben |
| Cloud-Credentials in `localStorage` | Klartext im Browser; Empfehlung: dediziertes App-Passwort; für physisch gesicherte Kiosk-Geräte akzeptabel |

---

## Out of Scope

- Echtzeit-Push-Benachrichtigungen zwischen Geräten (Sync ist poll-basiert)
- SMS/E-Mail-Alerts
- Multi-Admin-Hierarchien (mehr als ein Admin-PIN)
- OAuth2 / SSO-Authentifizierung
- Automatische Schicht-Rotation oder Dienst-Planung
- Biometrische Authentifizierung
- Feldverschlüsselung at rest
- Export in Fremdformate (Excel, SQL, DATEV)
- Internationalisierung (UI-Text ist Deutsch, hardcoded)
- Automatische Zeitzonen-Konvertierung
- Keine Unterstützung für Google Drive, Dropbox, OneDrive Consumer (nur WebDAV)

---

## Open Questions and Assumptions

| # | Frage | Annahme |
|---|---|---|
| A1 | Ist `DOKUMENTATION.md` nach v0.9.1 noch korrekt? | Nicht verifiziert — muss gesondert geprüft werden |
| A2 | Ist der Admin Auto-Load-Guard in `admin-app.js` wirklich noch `length > 0` oder bereits behoben? | Laut Review-Dokument offen; Code-Prüfung steht aus |
| A3 | Werden `lgc_backup_*`-Einträge je aufgeräumt oder wachsen sie unbegrenzt? | Kein Cleanup-Mechanismus gefunden; Annahme: manuell |
| A4 | Was passiert wenn zwei Admins gleichzeitig `lgc_users.json` speichern (Last-Write-Wins)? | Last-Write-Wins via WebDAV — kein Locking; für Ein-Standort-Betrieb akzeptabel |
| A5 | Gibt es eine Obergrenze für Einträge in `lgc_pif_*`-Dateien? | Keine technische Grenze; localStorage-Quota des Browsers als implizites Limit |

---

## Further Notes

- **`config.js` niemals ins Repo committen** — enthält echte Namen, PINs und Cloud-Zugangsdaten; `.gitignore`-Eintrag vorhanden aber frühe Git-History könnte noch echte Daten enthalten
- **`logType`-Feld ist immutable** nach Produktivstart — Log-Auswertungen filtern darauf; Umbenennen erzeugt historische Inkonsistenz
- **Release-Prozess**: `CACHE_NAME` in `sw.js` vor jedem Release bumpen; `make-release.ps1` erzeugt ZIP ohne sensible Dateien
- **Localhost-Betrieb** (`IS_PROXY`) ändert mehrere Verhaltensweisen: kein Debounce, kein Vollbild, Desktop-Layout — Tests laufen immer im Proxy-Modus
- **CSS-Variablen-Tippfehler** sind stille Fehler — Browser ignoriert unbekannte `var()`-Referenzen ohne Meldung; Suite 44 fängt Regressions für `LifeguardClock.html` per Fetch-Test ab
