# LifeguardClock – Dokumentation

## Inhaltsverzeichnis

1. [Überblick](#überblick)
2. [Technische Grundlagen & Service Worker](#technische-grundlagen)
3. [Konfiguration (config.js)](#konfiguration-configjs)
4. [Nutzer & PINs](#nutzer--pins)
5. [Startbildschirm & Login](#startbildschirm--login)
6. [Dashboard (Nutzersicht)](#dashboard-nutzersicht)
7. [Zeitgruppen & Automatismen](#zeitgruppen--automatismen)
8. [Auto-Logout](#auto-logout)
9. [Admin-Bereich](#admin-bereich)
10. [Zeitfenster](#zeitfenster)
11. [Crash-Recovery & Sicheres Herunterfahren](#crash-recovery--sicheres-herunterfahren)
12. [Datenspeicherung & Backup](#datenspeicherung--backup)
13. [Tageswechsel](#tageswechsel)
14. [Datenstruktur](#datenstruktur)
15. [Kiosk-Modus](#kiosk-modus)
16. [CSV-Export](#csv-export)
17. [Auswertungs-Dashboard (dashboard.html)](#auswertungs-dashboard-dashboardhtml)
18. [Log-Editor (editor.html)](#log-editor-editorhtml)
19. [Tests](#tests)
20. [Lokaler Proxy-Server (admin-server.py)](#lokaler-proxy-server-admin-serverpy)

---

## Überblick

**LifeguardClock** ist eine vollständig offline-fähige Web-App für die Zeiterfassung im Rettungsschwimmerbetrieb.
Sie verwaltet Anwesenheit, Wachstunden und Sanitätsstunden mit automatischen Regeln und Cloud-Synchronisation.
Alle Daten werden lokal im Browser gespeichert (localStorage). Es wird kein Server benötigt.

---

## Technische Grundlagen

| Eigenschaft       | Wert                                                     |
|-------------------|----------------------------------------------------------|
| Hauptdatei        | `LifeguardClock.html` (HTML, CSS und JS vollständig eingebettet)  |
| Konfiguration     | `config.js` (separat, vor `LifeguardClock.html` geladen)          |
| Framework         | Keines – reines HTML / CSS / JavaScript                  |
| Kryptographie     | WebCrypto API (SHA-256, `crypto.getRandomValues`)        |
| Datenspeicherung  | `localStorage` des Browsers                             |
| Externe Ressource | Google Fonts (JetBrains Mono, Inter)                    |
| Offline-fähig     | Ja (Service Worker + Cache)                              |
| Service Worker    | `sw.js` — App-Shell Cache-First, config.js Network-First |
| Zielgeräte        | Android-Tablet (Kiosk-Betrieb, Hochformat), Smartphone, Desktop |

### Service Worker (`sw.js`)

`LifeguardClock.html` registriert beim Laden automatisch den Service Worker `sw.js`.
Dieser implementiert zwei Caching-Strategien:

| Ressource | Strategie | Begründung |
|---|---|---|
| `LifeguardClock.html`, `manifest.json`, `Logo.png` | **Cache-First** | App-Shell bleibt offline verfügbar |
| `config.js`, WebDAV-Pfade (`/remote.php/…`) | **Network-First** | Immer aktuelle Konfiguration und Cloud-Daten |
| Alles andere | Network-First mit Cache-Fallback | |

> **Hinweis:** Wird `sw.js` nach einer Änderung an `LifeguardClock.html` nicht aktualisiert,
> kann der Browser eine veraltete Version ausliefern. Einen Hard-Reload erzwingen:
> **DevTools → Application → Service Workers → Update** oder Seite mit `Ctrl+Shift+R` laden.

> **Hinweis zur Versionskontrolle:** `config.js` enthält echte Namen und PINs und wird von
> Git ignoriert. Als Vorlage dient `config.example.js`.

---

## Konfiguration (config.js)

Alle betreiberspezifischen Einstellungen befinden sich in `config.js`. Diese Datei wird beim
Laden der App vor dem Hauptskript ausgeführt und stellt das globale Objekt `CONFIG` bereit.
Änderungen werden beim nächsten Neuladen der Seite aktiv.

`config.js` ist optional. Fehlt sie (z. B. bei Hosting über GitHub Pages), greift automatisch
ein Minimal-Fallback:

```js
// Automatischer Fallback wenn config.js nicht gefunden wird
const CONFIG = {
  adminPin:     '000000',
  types: [
    { key: 'anwesenheit', label: 'Anwesenheit', logType: 'anwesenheit',
      color: 'blue', pinned: true }
  ],
  defaultUsers: [],
  removedUsers: [],
  cloud: { url: '', user: '', pass: '' },
};
```

Alle anderen Werte (`dayBoundaryHour`, `pinClearSeconds` usw.) greifen auf ihre eingebauten
Standardwerte zurück. Cloud-Zugangsdaten und Nutzer können danach im Admin-Bereich eingetragen
bzw. aus der Cloud geladen werden.

> **Sicherheitshinweis:** Der Fallback-Admin-PIN `000000` sollte im laufenden Betrieb durch
> eine echte `config.js` mit eigenem PIN ersetzt werden.

Als Einstieg empfehlen sich die fertigen Presets im Ordner `presets/`:

| Datei                    | Beschreibung                                              |
|--------------------------|-----------------------------------------------------------|
| `presets/config.dlrg.js` | DLRG-Ortsgruppe: Anwesenheit, Wachdienst, Sanitätsdienst |
| `presets/config.simple.js` | Nur Anwesenheit, keine Zeitfenster, keine Berechtigungen |

### Gerät & Tageswechsel

| Schlüssel          | Beschreibung                                                                  | Standard |
|--------------------|-------------------------------------------------------------------------------|----------|
| `deviceId`         | Gerätekennung im Cloud-Dateinamen (z. B. `'steg'`, `'boot'`, `'halle'`). Wird weggelassen → automatische lesbare ID (`ipad-3f7a`) | auto |
| `dayBoundaryHour`  | Logischer Tageswechsel (0–23). Stempel vor dieser Stunde zählen zum Vortag.  | `4`      |

### Zeiteinstellungen

| Schlüssel                  | Beschreibung                                                                          | Standard |
|----------------------------|---------------------------------------------------------------------------------------|----------|
| `pinClearSeconds`          | Unvollständige PIN nach X Sekunden automatisch löschen (0 = aus)                     | `5`      |
| `autoLogoutSeconds`        | Automatisches Ausloggen nach X Sekunden Inaktivität im Dashboard                     | `15`     |
| `screensaverSeconds`       | Bildschirmschoner auf dem Login-Bildschirm nach X Sekunden                           | `60`     |
| `cloudSyncDebounceSeconds` | Verzögerung in Sekunden vor dem Cloud-Sync nach dem letzten Stempel (Batching)       | `60`     |

> **Hinweis:** Im Proxy-Betrieb (`localhost` / `127.0.0.1`) wird `cloudSyncDebounceSeconds`
> ignoriert — der Sync erfolgt sofort nach jedem Stempel.

### Standard-Zeitfenster pro Wochentag

```js
zeitfensterDefaults: {
  mo: { start: '07:00', end: '21:00' },
  di: { start: '07:00', end: '21:00' },
  ...
  so: null,
}
```

Gilt als Voreinstellung, wenn für den aktuellen Tag noch kein Zeitfenster manuell im
Admin-Bereich gesetzt wurde. `null` bedeutet: kein Zeitfenster an diesem Tag (Typen mit
`requiresZeitfenster: true` sind den ganzen Tag gesperrt).

### Admin-Zugang

```js
adminPin: '000000'
```

Der Admin-PIN muss 6 Stellen haben und darf keinem Benutzer als reguläre PIN zugewiesen sein.

### Stempel-Typen (ab v0.6: `lgc_types.json`)

Ab v0.6 werden Stempel-Typen zentral in der Cloud-Datei `lgc_types.json` gespeichert und über
**`admin.html` → „Stempel-Typen"** verwaltet. Die App lädt sie beim Start automatisch.

Das `types[]`-Array in `config.js` dient nur noch als **lokaler Fallback**, wenn noch keine
Cloud-Verbindung eingerichtet ist (z. B. beim ersten Start).

**Format `lgc_types.json`:**

```json
{
  "version": 1,
  "updated": "2026-03-19T00:00:00.000Z",
  "types": [
    { "key": "anwesenheit", "label": "Anwesenheit", "logType": "anwesenheit",
      "color": "blue", "pinned": true },
    { "key": "wachdienst", "label": "Wachdienst", "logType": "wachdienst",
      "color": "amber", "requiresZeitfenster": true,
      "maxDurationMs": 7200000, "cooldownMs": 1800000,
      "autoStartKeys": ["anwesenheit"], "mutexKeys": ["sanitaetsdienst"],
      "permissionKey": "wachdienst" }
  ]
}
```

**Pflichtfelder (pro Typ):**

| Feld      | Beschreibung                                                                                   |
|-----------|------------------------------------------------------------------------------------------------|
| `key`     | Eindeutiger interner Schlüssel (keine Sonderzeichen)                                           |
| `label`   | Anzeigename im Dashboard                                                                       |
| `logType` | Bezeichnung im Log — **nach Produktivstart nicht mehr ändern!**                                |
| `color`   | Farbe: `'blue'` \| `'amber'` \| `'orange'` \| `'red'` \| `'green'` \| `'lime'` \| `'cyan'` \| `'violet'` \| `'pink'` \| `'grey'` |

**Optionale Felder:**

| Feld                  | Beschreibung                                                                   |
|-----------------------|--------------------------------------------------------------------------------|
| `pinned`              | `true` → Gruppe bleibt beim Scrollen immer sichtbar                           |
| `disabled`            | `true` → Typ wird vollständig ausgeblendet (kein Button, kein Log)            |
| `requiresZeitfenster` | `true` → Button außerhalb des konfigurierten Zeitfensters gesperrt            |
| `zeitfenster`         | Typ-eigene Zeitfenster pro Wochentag (überschreibt `zeitfensterDefaults`); fehlender Wochentag = ganztägig gesperrt |
| `maxDurationMs`       | Auto-Stop nach X Millisekunden; zeigt Countdown                               |
| `cooldownMs`          | Pflichtpause nach Auto-Stop: Button gesperrt + Countdown                      |
| `autoStartKeys`       | `key`s von Typen, die beim Start dieses Typs automatisch mitgestartet werden  |
| `mutexKeys`           | `key`s von Typen, die beim Start dieses Typs automatisch gestoppt werden      |
| `permissionKey`       | Dieser Typ ist nur für Nutzer sichtbar, die diesen Key in `permissions[]` haben|

**Scroll-Verhalten:** Bei mehr als 3 Typen werden nicht-gepinnte Typen in einem
scrollbaren Bereich unterhalb der gepinnten Typen angezeigt.

### Mitgliederverwaltung

```js
removedUsers: ['alter_eintrag'],

defaultUsers: [
  { id: 'max_muster',   name: 'Max Muster',   pin: '123456', mustChangePIN: true,
    permissions: ['wachdienst'] },
  { id: 'erika_muster', name: 'Erika Muster', pin: '654321', mustChangePIN: true },
]
```

| Feld           | Beschreibung                                                                        |
|----------------|-------------------------------------------------------------------------------------|
| `id`           | Interner Schlüssel (keine Leerzeichen, eindeutig)                                  |
| `name`         | Anzeigename                                                                         |
| `pin`          | 6-stellige Einmal-PIN für die Erstanmeldung                                        |
| `mustChangePIN`| `true` → Benutzer muss PIN nach erstem Login ändern                                |
| `permissions`  | Array mit `permissionKey`-Werten der erlaubten Typen. Weglassen → alle sichtbar.   |
| `removedUsers` | IDs, die beim nächsten Laden aus dem localStorage entfernt werden                  |

Beim Start der App werden neue Einträge aus `defaultUsers` automatisch in den localStorage
übernommen. Bereits vorhandene Benutzer (mit geänderten PINs) werden nicht überschrieben.

---

## Nutzer & PINs

### Einmal-PINs (OTP)

Neue Benutzer erhalten eine Einmal-PIN aus `config.js` (`mustChangePIN: true`). Diese wird
als **Klartext** gespeichert und gilt nur für die erste Anmeldung.

### PIN-Änderung beim ersten Login

Nach der ersten erfolgreichen Anmeldung erscheint automatisch ein Overlay zur PIN-Änderung:

1. Neue 6-stellige PIN eingeben.
2. PIN zur Bestätigung wiederholen.
3. Folgende PINs werden **abgelehnt**:
   - Alle gleichen Ziffern (z. B. `111111`, `999999`)
   - Aufsteigende Folge (`123456`)
   - Absteigende Folge (`987654`)
   - PIN, die bereits von einem anderen Benutzer verwendet wird (auch gegen gehashte PINs geprüft)

Nach erfolgreicher Änderung wird die PIN mit **SHA-256 + zufälligem Salt** (WebCrypto API)
gehasht und im localStorage gespeichert. Der Klartext ist danach nicht mehr rekonstruierbar.

### Gespeichertes Benutzer-Objekt (nach PIN-Änderung)

```json
{
  "id": "max_muster",
  "name": "Max Muster",
  "pin": "a3f8c2...",
  "salt": "e91d04...",
  "mustChangePIN": false
}
```

### PIN zurücksetzen (Admin)

Im Admin-Bereich kann ein Administrator:
- Eine neue **Einmal-PIN manuell eingeben** (wird als Klartext mit `mustChangePIN: true` gesetzt).
- Eine **zufällige Einmal-PIN generieren** lassen (6-stellige Zufallszahl).

Benutzer mit aktiver Einmal-PIN werden in der Nutzerliste mit einem **OTP-Badge** markiert.
Über "Einmal-PINs drucken" kann eine druckfertige Übersicht aller aktuellen Einmal-PINs als
HTML-Seite (`einmalpins.html`) geöffnet werden.

---

## Startbildschirm & Login

### Elemente

- **Digitale Uhrzeit** (HH:MM:SS, sekundengenaue Live-Anzeige)
- **Datum** (ausgeschrieben, z. B. "Freitag, 13. März 2026")
- **PIN-Eingabe**: 6 Punkte zeigen den Füllstand der Eingabe
- **Ziffernblock**: Tasten 1–9, DEL (löschen), 0 (breit, unten mittig)

### Login-Ablauf

1. Ziffern eintippen – Punkte füllen sich von links.
2. Nach der **6. Ziffer** wird die PIN automatisch geprüft – kein Bestätigungsknopf nötig.
3. **Falsche PIN**: Shake-Animation, Fehlermeldung, automatisches Zurücksetzen.
4. **Korrekte Benutzer-PIN**: Weiterleitung zum Dashboard.
   - Wenn `mustChangePIN: true`: Einmal-PIN-Overlay erscheint zuerst.
5. **Admin-PIN**: Weiterleitung zum Admin-Bereich.

> **Sicherheitshinweis:** Nach einem Neustart der Seite (auch nach einem Absturz oder dem
> Drücken der Home-Taste) ist immer eine erneute PIN-Eingabe erforderlich.
> Eine automatische Wiederanmeldung ohne PIN findet **nicht** statt.

### Automatisches Löschen unvollständiger PINs

Wurden Ziffern eingegeben, ohne die Eingabe abzuschließen, wird die PIN nach
`pinClearSeconds` Sekunden (aus `config.js`) automatisch gelöscht. Mit `0` deaktiviert.

### Bildschirmschoner

Nach `screensaverSeconds` Sekunden ohne Interaktion auf dem Login-Bildschirm erscheint
ein Bildschirmschoner (animierter Stempeluhr-Schriftzug). Jede Berührung blendet ihn ab.

### Tastatureingabe (Desktop)

Ziffern 0–9, Backspace und Enter werden direkt auf dem Login-Bildschirm ausgewertet.

---

## Dashboard (Nutzersicht)

### Header

| Zeile | Links               | Rechts          |
|-------|---------------------|-----------------|
| 1     | Begrüßung + Name    | Abmelden-Button |
| 2     | Live-Uhrzeit (amber)| Idle-Countdown  |

### Stempel-Gruppen

Die Gruppen werden vollständig aus `CONFIG.types[]` generiert. Jede Gruppe entspricht einem
Typ und zeigt die konfigurierte Farbe und Bezeichnung.

Jede Gruppe hat zwei Buttons: **Beginnen** und **Beenden**.

- Nicht sichtbar, wenn der Nutzer das `permissionKey` des Typs nicht in `permissions[]` hat.
- Außerhalb des Zeitfensters gesperrt (bei `requiresZeitfenster: true`).
- Während Pflichtpause gesperrt + Countdown (bei `cooldownMs`).
- Eine aktive Gruppe zeigt einen pulsierenden Punkt und einen „Aktiv"-Badge.
- Der Gruppen-Rahmen leuchtet in der Gruppenfarbe, solange sie aktiv ist.

**Scroll-Verhalten:** Typen mit `pinned: true` bleiben immer sichtbar. Bei mehr als 3
Typen werden nicht-gepinnte Typen in einem scrollbaren Bereich darunter angezeigt.

**Countdown-Timer:** Typen mit `maxDurationMs` zeigen einen Countdown bis zum Auto-Stop.
Über „Verlängern" (erscheint anstelle von „Beginnen") wird der Countdown zurückgesetzt.

### "Meine Stunden"-Overlay

Über einen Button im Dashboard-Header kann der eingeloggte Benutzer seine eigenen
kumulierten Stunden des aktuellen Tages einsehen. Die Anzeige ist in den Typ-Farben
gestaltet. Das Overlay schließt sich automatisch beim Auto-Logout.

### Toast-Benachrichtigungen

Nach jeder Aktion erscheint kurz eine Meldung am unteren Bildrand, z. B.:
```
Wachdienst gestartet · Anwesenheit automatisch gestartet
Anwesenheit beendet (3h 12min) · Wachdienst beendet (45min)
```

---

## Zeitgruppen & Automatismen

Alle Automatismen werden vollständig aus `CONFIG.types[]` abgeleitet — kein Verhalten ist
mehr im Code hartkodiert.

### Gegenseitige Sperre (`mutexKeys`)

Typen mit überlappenden `mutexKeys` können nicht gleichzeitig aktiv sein.
Wird ein Typ gestartet, werden alle in `mutexKeys` genannten Typen automatisch gestoppt.

Beispiel DLRG: Wachdienst und Sanitätsdienst schließen sich gegenseitig aus.

### Auto-Start anderer Typen (`autoStartKeys`)

Ein Typ kann beim Start automatisch andere Typen mitstart. Konfiguriert über `autoStartKeys`.

Beispiel DLRG: Wachdienst und Sanitätsdienst starten automatisch die Anwesenheit.

### Kaskadierter Stopp

Wird ein Typ beendet, für den andere Typen `autoStartKeys` definiert haben, werden alle
davon abhängigen Typen automatisch gestoppt. In der Praxis: Anwesenheit beenden stoppt
alle gleichzeitig laufenden Typen.

### Zeitfenster (`requiresZeitfenster`)

Typen mit `requiresZeitfenster: true` können nur innerhalb des konfigurierten Zeitfensters
gestartet werden. Außerhalb sind die Starten-Buttons deaktiviert.

Läuft ein solcher Typ noch und das Zeitfenster endet, wird er **automatisch gestoppt**
(Prüfung alle 10 Sekunden). Der Eintrag wird als `auto: true` markiert.

Jeder Typ mit `requiresZeitfenster: true` hat sein **eigenes Zeitfenster** – zwei Typen
können gleichzeitig aktiv sein und trotzdem unterschiedliche Fenster haben. Das Fenster
für einen Typ wird nach folgender Priorität bestimmt:

1. **Manuell für heute gesetzt** (Admin-Bereich, pro Typ) – höchste Priorität.
2. **Typ-eigenes `zeitfenster`-Objekt** aus `lgc_types.json` (Cloud) – überschreibt den globalen Standard.
3. **Globaler `zeitfensterDefaults`**-Eintrag aus `config.js` – gilt als Standard für alle Typen ohne eigenes `zeitfenster`.
4. **Hartkodierter Fallback** `07:00–21:00`.

Fehlt der aktuelle Wochentag im `zeitfenster`-Objekt eines Typs, ist der Typ an diesem
Tag **ganztägig gesperrt** (null-Fenster).

**Fenster über Mitternacht:** Wird `end` kleiner als `start` konfiguriert (z. B. `22:00`–`02:00`),
gilt das Fenster von 22:00 Uhr bis 02:00 Uhr des Folgetages. Das ist z. B. für Nacht- oder
Veranstaltungsdienste sinnvoll.

**Beispiel für typ-eigenes Zeitfenster:**
```js
{
  key:                 'wachdienst',
  requiresZeitfenster: true,
  zeitfenster: {
    mo: { start: '08:00', end: '20:00' },
    di: { start: '08:00', end: '20:00' },
    // sa + so fehlen → an diesen Tagen gesperrt
  },
}
```

### Zeitlimit & Pflichtpause (`maxDurationMs` / `cooldownMs`)

Typen mit `maxDurationMs` laufen maximal so lange und werden dann automatisch gestoppt
(`auto: true`). Ein Countdown zeigt die verbleibende Zeit.

Nach dem Auto-Stop gilt optional eine Pflichtpause (`cooldownMs`): Der Starten-Button
ist für diese Dauer gesperrt und zeigt einen Countdown.

Über **„Verlängern"** (erscheint anstelle von „Beginnen" während einer aktiven Sitzung)
wird der Countdown zurückgesetzt **ohne** die Laufzeit zurückzusetzen:

- Der **Countdown** startet neu.
- Die **angezeigte Laufzeit** läuft weiter und summiert alle Segmente.
- Im Log wird ein Stop-/Start-Paar mit `extend: true` eingetragen.

---

## Auto-Logout

Nach `autoLogoutSeconds` Sekunden (aus `config.js`) ohne Interaktion im Dashboard wird
der Benutzer automatisch abgemeldet. Laufende Sitzungen bleiben dabei **aktiv**.

- Der Countdown ist im Header sichtbar.
- Farbe: grau → amber (ab 10 s) → rot blinkend (ab 5 s).
- Jede Interaktion (Tippen, Klicken, Tastendruck) setzt den Timer zurück.
- Offene Overlays (z. B. „Meine Stunden") werden beim Auto-Logout automatisch geschlossen.

---

## Admin-Bereich

Erreichbar mit dem Admin-PIN aus `config.js`.

### Aktionsleiste

| Button               | Funktion                                                       |
|----------------------|----------------------------------------------------------------|
| Alle ausstempeln     | Beendet alle aktiven Sitzungen aller Benutzer (Bestätigung)   |
| CSV                  | Exportiert das vollständige Log als CSV-Datei                 |
| Leeren               | Löscht alle Protokolleinträge (Bestätigung erforderlich)      |
| Vollbild beenden     | Verlässt den Vollbild-Modus (nur im Admin sichtbar)           |
| Sicher herunterfahren| Beendet alle Sitzungen sauber und zeigt Shutdown-Bildschirm   |

### Reihenfolge der Bereiche

1. **Aktionsleiste** – Schnellzugriff auf häufige Admin-Aktionen
2. **Statistik-Chips** – Gesamtzahl der Log-Einträge, Aufschlüsselung pro Benutzer
3. **Protokoll-Tabelle** – Vollständige Log-Liste, neueste Einträge zuerst
4. **Stunden-Übersicht** – Kumulierte Zeiten pro Benutzer und Typ
5. **Nutzerverwaltung** – PIN-Reset, Namensänderung, neuer Benutzer
6. **Cloud-Sync** – Nextcloud / WebDAV-Konfiguration und Nutzerdaten-Sicherung
7. **Tages-Backups** – Download und Übersicht vergangener Backups
8. **Zeitfenster** – Tageseinstellung pro Typ (für alle Typen mit `requiresZeitfenster: true`)

### Stempel-Typen (`admin.html`)

`admin.html` enthält eine eigene Karte **„Stempel-Typen"** zur Verwaltung der zentralen
`lgc_types.json`. Änderungen werden sofort in die Cloud geschrieben und beim nächsten Start
aller Geräte übernommen.

- Typen hinzufügen, bearbeiten, löschen
- Alle Felder konfigurierbar: Farbe, Zeitlimit, Pflichtpause, Zeitfenster, Berechtigungen usw.
- Farbige Punkte zeigen die konfigurierte Typ-Farbe direkt in der Liste

### Protokoll-Tabelle

Vollständige Liste aller Einträge, neueste zuerst:

| Spalte      | Inhalt                                       |
|-------------|----------------------------------------------|
| Zeitstempel | Uhrzeit + Datum                              |
| Nutzer      | Name                                         |
| Typ         | Farbiger Badge (Anwesenheit / Wach. / San.)  |
| Aktion      | Start / Stop                                 |
| Dauer       | Bei Stop-Einträgen: Dauer des Segments       |

Automatisch erzeugte Einträge erhalten einen zusätzlichen **Auto**-Badge.

### Stunden-Übersicht

Tabelle mit kumulierten Gesamtzeiten pro Benutzer und Typ:

- Spalten je Typ in der konfigurierten Farbe (aus `CONFIG.types[].color`)
- Laufende Sitzungen werden in Echtzeit mitgezählt und mit **live**-Indikator markiert.
- Pro Benutzer:
  - **OTP-Badge**: Wird angezeigt, wenn eine Einmal-PIN aktiv ist.
  - **Ausstempeln**: Beendet sofort alle aktiven Sitzungen dieses Benutzers.
  - **Bearbeiten**: Öffnet den Eintrags-Editor (Log-Bearbeitung) und die PIN-Verwaltung.

### Eintrags-Editor (Modal)

- Zeigt alle Log-Einträge des Benutzers chronologisch.
- **Zeitstempel bearbeiten**: Datum und Uhrzeit per `datetime-local`-Eingabefeld.
- **Eintrag löschen**: Rotes X markiert den Eintrag zur Löschung (vor dem Speichern rückgängig machbar).
- **Speichern**: Schreibt Änderungen ins Log und erstellt sofort ein Backup.

### PIN-Verwaltung (im Eintrags-Editor)

- Aktuelle PIN-Einstellung des Benutzers anzeigen (OTP-Status oder gehashed).
- **Neue Einmal-PIN manuell eingeben**: Wird als Klartext gesetzt, `mustChangePIN: true`.
- **Zufällige Einmal-PIN generieren**: 6-stellige Zufallszahl, sofort angezeigt.

### Einmal-PINs drucken

Im Admin-Bereich kann eine druckfertige HTML-Übersicht (`einmalpins.html`) aller Benutzer
mit ihren aktuellen Einmal-PINs geöffnet werden (nur Benutzer mit `mustChangePIN: true`
erhalten eine sichtbare PIN; bereits geänderte PINs erscheinen als „—").

### Zeitfenster-Editor

Ermöglicht das Anpassen des Zeitfensters für den **aktuellen Tag**:

- „Von" und „Bis" (Uhrzeit-Eingabe)
- Speichern aktualisiert das Fenster sofort.
- Wird das Fenster verkleinert und laufen noch Sitzungen außerhalb, werden diese sofort gestoppt.
- Statusanzeige: grün = aktuell im Fenster, rot = außerhalb.
- **Fenster über Mitternacht** möglich: wenn „Bis" < „Von" (z. B. `22:00`–`02:00`), gilt das Fenster von 22:00 Uhr bis 02:00 Uhr des Folgetages. Start- und Endzeit dürfen nicht identisch sein.

### Backup-Übersicht

- Tag (logisches Datum, Tageswechsel gemäß `dayBoundaryHour`)
- Zeitpunkt des letzten Backups
- Anzahl der Einträge
- CSV-Download pro Tag

### Kompatible Cloud-Dienste

Der Sync nutzt ausschließlich Standard-**WebDAV** (`PUT`, `MKCOL`, `PROPFIND`).
Jeder Dienst mit WebDAV-Unterstützung funktioniert:

| Anbieter | Bemerkung |
|---|---|
| **Nextcloud** | Empfohlen; selbst gehostet oder gemietet; CORS out-of-the-box |
| **ownCloud** | Identisches Protokoll wie Nextcloud |
| **Hetzner Storage Box** | Günstig, deutsch, DSGVO-konform |
| **Strato HiDrive / IONOS** | Deutsche Anbieter |
| **Infomaniak kDrive** | Schweizer Anbieter, datenschutzfreundlich |
| **pCloud** | Europäische Option mit WebDAV |
| **Box.com** | Business-fokussiert, WebDAV verfügbar |

Nicht kompatibel (kein WebDAV): Google Drive, Dropbox, iCloud Drive, OneDrive Consumer.

> **CORS-Hinweis:** Wird die App über `https://` ausgeliefert, muss der WebDAV-Server
> CORS-Header setzen. Nextcloud macht das automatisch. Bei eigenem Apache/nginx muss
> `Access-Control-Allow-Origin` konfiguriert werden. Bei `file://`-Betrieb (Fully Kiosk)
> gilt diese Einschränkung nicht.

### Cloud-Sync – Log-Dateien

Alle Dateien landen im Ordner `LifeguardClock/` auf dem WebDAV-Server:

| Datei                                    | Inhalt                                         |
|------------------------------------------|------------------------------------------------|
| `lgc_types.json`                  | Zentrale Stempel-Typ-Definitionen (alle Geräte)|
| `lgc_users.json`                  | Nutzerliste, PINs, Berechtigungen (alle Geräte)|
| `lgc_config_<deviceId>.json`      | Geräte-Overrides: deaktivierte Typen, Zeitfenster |
| `lgc_pif_<userId>_YYYY-MM.json`   | Persönliche Stempel-Daten pro Nutzer (monatlich)|
| `lgc_[deviceId]_YYYY-MM-DD.json`  | Tages-Snapshot dieses Geräts (Vollbackup)      |
| `lgc_[deviceId]_latest.json`      | Aktuellster Stand (wird bei jedem Sync ersetzt)|

Die `deviceId` stammt aus `CONFIG.deviceId` (z. B. `steg`) oder wird automatisch als
lesbarer Kurzname generiert (`ipad-3f7a`, `android-9b2c` usw.).

**Multi-Gerät:** Jeder Nutzer hat eine eigene PIF-Datei (`lgc_pif_<userId>_YYYY-MM.json`).
Beim Login wird diese aus der Cloud geladen — der aktive Stempel-Status ist damit auf allen
Geräten sofort konsistent (einstempeln auf Gerät A, ausstempeln auf Gerät B funktioniert korrekt).
Die Geräte-Snapshots (`lgc_[deviceId]_*.json`) dienen weiterhin als Vollbackup.

**PIF-Dateiformat** (`lgc_pif_<userId>_YYYY-MM.json`):

```json
{
  "version":  1,
  "userId":   "abc-1234",
  "userName": "Max Muster",
  "month":    "2026-03",
  "exported": "2026-03-19T14:30:00.000Z",
  "entries":  [ ...Log-Einträge nur dieses Nutzers... ]
}
```

Im Admin-Bereich wird die aktive Geräte-ID angezeigt, damit jeder sein Gerät zuordnen kann.

### Cloud-Sync – Nutzerdaten

Im Cloud-Sync-Bereich gibt es eine zweite Karte **„Nutzerdaten sichern"** mit drei Aktionen:

| Button | Funktion |
|--------|----------|
| **In Cloud sichern** | Lädt `lgc_users.json` in den `LifeguardClock/`-Ordner auf Nextcloud |
| **Aus Cloud wiederherstellen** | Holt die Datei zurück; Bestätigung erforderlich, lokale Daten werden überschrieben |
| **Als Datei herunterladen** | Lokaler Download ohne Cloud-Konfiguration, z. B. bei Tablet-Wechsel |

**Automatische Sicherung:** Bei jeder Nutzeränderung (PIN gesetzt/geändert, Nutzer angelegt/gelöscht)
wird nach einem Debounce von 60 Sekunden automatisch still in die Cloud synchronisiert — genau wie
der Log-Sync nach Stempel-Ereignissen.

**Dateiformat** (`lgc_users.json`):

```json
{
  "version": 1,
  "exported": "2026-03-14T10:00:00.000Z",
  "count": 20,
  "users": [
    { "id": "max_muster", "name": "Max Muster", "pin": "123456", "mustChangePIN": true },
    { "id": "erika_muster", "name": "Erika Muster", "pin": "a3f8c2...", "salt": "e91d04...", "mustChangePIN": false }
  ]
}
```

> Nutzer mit OTP (noch nicht geänderter PIN) erscheinen mit der PIN im Klartext.
> Nutzer mit gesetzter PIN erscheinen mit Hash + Salt — der Klartext ist nicht rekonstruierbar,
> aber die Wiederherstellung funktioniert nahtlos: Nutzer können ihre bisherige PIN weiter verwenden.

---

## Zeitfenster

Das Zeitfenster bestimmt, in welchem Zeitraum Typen mit `requiresZeitfenster: true`
gestartet werden können. Jeder Typ hat sein **eigenes** Zeitfenster.

### Priorität (pro Typ)

1. **Manuell für heute gesetzt** (Admin-Bereich, pro Typ) – höchste Priorität.
2. **Typ-eigenes `zeitfenster`-Objekt** aus `lgc_types.json` (Cloud) – per-Typ-Standard für jeden Wochentag.
3. **Globaler `zeitfensterDefaults`**-Eintrag aus `config.js` – gilt als Standard für Typen ohne eigenes `zeitfenster`.
4. **Hartkodierter Fallback** `07:00–21:00` – falls kein `zeitfensterDefaults` in `config.js`.

Das manuelle Zeitfenster wird täglich zurückgesetzt (der Eintrag im localStorage enthält
das Datum; ein neuer Tag lädt den jeweiligen Standard).

### Zeitfenster im Admin-Bereich

Der Admin-Bereich zeigt pro Typ mit `requiresZeitfenster: true` eine eigene Zeile
mit Start- und Endzeit. Änderungen gelten nur für den **aktuellen Tag** und werden
im localStorage gespeichert.

---

## Crash-Recovery & Sicheres Herunterfahren

### Crash-Recovery

Die App schließt beim Schließen oder Neuladen des Browsers **keine** Sitzungen automatisch.
Laufende Sitzungen (Einzel-Zustände im localStorage) bleiben erhalten.

Nach einem Neustart der Seite **muss die PIN erneut eingegeben** werden. Eine automatische
Wiederanmeldung ohne PIN findet nicht statt (Sicherheit für Shared-Tablets).

Nach der PIN-Eingabe prüft die App automatisch:

- **Wachstunde abgelaufen:** Wenn die 2-h-Grenze während der Unterbrechung überschritten wurde,
  wird ein rückwirkender Stop-Eintrag mit dem korrekten Ablaufzeitpunkt (`Startzeit + 2h`)
  eingetragen und ein Toast angezeigt.
- **Laufende Sitzungen:** Alle anderen aktiven Sitzungen laufen ab dem ursprünglichen
  Einzeitstempel weiter (Laufzeit-Anzeige akkumuliert korrekt).

### Sicheres Herunterfahren

Über den Button **„Sicher herunterfahren"** in der Admin-Aktionsleiste:

1. Alle aktiven Sitzungen aller Benutzer werden mit einem Stop-Eintrag geschlossen (`auto: true`).
2. Die Session wird aus dem localStorage entfernt.
3. Ein Shutdown-Bildschirm (dunkel, mit Uhrzeit) wird angezeigt.

Dieser Vorgang sollte vor dem Ausschalten des Tablets durchgeführt werden.

---

## Datenspeicherung & Backup

### localStorage-Schlüssel

| Schlüssel                       | Inhalt                                                                          |
|---------------------------------|---------------------------------------------------------------------------------|
| `lgc_users`              | Benutzerliste mit PINs (gehashed oder OTP) und Status                          |
| `lgc_log_YYYY-MM`        | Monats-Log aller Protokolleinträge (z. B. `lgc_log_2026-03`)                   |
| `lgc_state`              | Aktiver Stempelzustand pro Benutzer-ID                                         |
| `lgc_session`            | Zuletzt eingeloggter Benutzer (nur intern, kein Auto-Login)                    |
| `lgc_zeitfenster`        | Manuell gesetztes Zeitfenster für den aktuellen Tag                            |
| `lgc_backup_YYYY-MM-DD`  | Tages-Backup (automatisch alle 5 Minuten)                                      |
| `lgc_device_id`          | Auto-generierte Geräte-ID (nur wenn `CONFIG.deviceId` fehlt)                   |
| `lgc_cloud`              | Cloud-Zugangsdaten (URL, Benutzername, Passwort) — wird von allen Apps geteilt |
| `lgc_type_config`        | Typ-Konfiguration (logType, label, color) — von LifeguardClock gesetzt, von Dashboard und Editor gelesen |

### Gemeinsame Datenhaltung (app-übergreifend)

Zwei localStorage-Schlüssel werden von LifeguardClock gesetzt und von Dashboard sowie
Editor gelesen. Sie ermöglichen konsistentes Verhalten ohne dass `config.js` in mehreren
Browser-Kontexten verfügbar sein muss.

**`lgc_cloud`** — Cloud-Zugangsdaten (URL, Benutzername, Passwort).
Wird von LifeguardClock, Dashboard, Editor und admin.html gemeinsam genutzt.
Eingaben in einer App stehen sofort in allen anderen zur Verfügung.

> **Sicherheitshinweis (bewusster Trade-off):** Die Zugangsdaten liegen im Klartext im
> `localStorage` des Browsers. Das ist auf dedizierten Kiosk-Geräten (ein Gerät, ein Zweck,
> kein allgemeiner Browser-Zugriff) akzeptabel. Auf gemeinsam genutzten Geräten mit freiem
> Browser-Zugriff sollten die Zugangsdaten nach der Nutzung manuell gelöscht werden
> (Admin-Bereich → Cloud & Gerät → Zugangsdaten entfernen).

**`lgc_type_config`** — Typ-Konfiguration für Farben und Labels.
Wird beim Start von LifeguardClock befüllt:
```js
[{ logType: 'anwesenheit', label: 'Anwesenheit', color: 'blue' }, …]
```
Dashboard und Editor lesen diesen Schlüssel beim Laden, um Typ-Farben und
Bezeichnungen aus der `config.js` des Stempel-Tablets zu übernehmen — auch wenn
`config.js` im Browser des Auswertungs-PCs nicht vorhanden ist.

Farbschlüssel: `'blue'` | `'green'` | `'amber'` | `'red'` | `'violet'`
(entsprechen den CSS-Variablen `var(--blue)` usw.).

### Backup-Verhalten

- Beim **ersten Laden** der Seite wird sofort ein Backup erstellt.
- Danach alle **5 Minuten** automatisch.
- Nach dem **Speichern im Eintrags-Editor** wird ebenfalls ein Backup ausgelöst.
- Pro logischem Tag gibt es genau **einen** Backup-Eintrag (wird überschrieben).

---

## Tageswechsel

Der logische Tageswechsel erfolgt um die in `CONFIG.dayBoundaryHour` festgelegte Stunde
(Standard: **4**, also 04:00 Uhr morgens). Stempel vor dieser Uhrzeit zählen noch zum **Vortag**.

Betroffen sind:
- Datum der Zeitfenster-Konfiguration
- Dateinamen der Tages-Backups
- Stundenauswertung
- Wochentag-Ermittlung für Zeitfenster-Standards

---

## Datenstruktur

### Benutzer-Objekt (lgc_users)

Einmal-PIN (noch nicht geändert):
```json
{ "id": "max_muster", "name": "Max Muster", "pin": "123456", "mustChangePIN": true }
```

Gehashte PIN (nach erster Anmeldung):
```json
{ "id": "max_muster", "name": "Max Muster", "pin": "a3f8c2...", "salt": "e91d04...", "mustChangePIN": false }
```

### Log-Eintrag

```json
{
  "id": 1741234567890.42,
  "nutzer": "Max Muster",
  "typ": "wachdienst",
  "aktion": "stop",
  "zeitstempel": "2026-03-07T19:45:00.000Z",
  "dauer_ms": 3600000,
  "auto": false
}
```

| Feld          | Typ     | Beschreibung                                                            |
|---------------|---------|-------------------------------------------------------------------------|
| `id`          | number  | Timestamp + Zufallsanteil (eindeutig)                                   |
| `nutzer`      | string  | Anzeigename des Benutzers                                               |
| `typ`         | string  | `logType` des Typs aus `CONFIG.types[]` (unveränderlich nach Produktivstart) |
| `aktion`      | string  | `start`, `stop`                                                         |
| `zeitstempel` | string  | ISO 8601 (UTC)                                                          |
| `dauer_ms`    | number  | Dauer in ms (nur bei Stop-Einträgen)                                    |
| `auto`        | boolean | `true` bei automatisch erzeugten Stop-Einträgen                         |
| `extend`      | boolean | `true` bei Stop-/Start-Paaren durch „Verlängern"                        |

### Zustandsobjekt (lgc_state)

Die Keys im State-Objekt entsprechen den `key`-Werten aus `CONFIG.types[]`.
Zusätzlich enthält jeder Nutzer-State ein `cooldown`-Objekt mit ISO-Timestamps.

```json
{
  "max_muster": {
    "anwesenheit": true,
    "wachdienst": false,
    "sanitaet": false,
    "cooldown": { "wachdienst": null, "sanitaet": null }
  }
}
```

### Zeitfenster (lgc_zeitfenster)

```json
{
  "date": "2026-03-07",
  "types": {
    "wachdienst": { "start": "08:00", "end": "20:00" },
    "sanitaet":   { "start": "10:00", "end": "18:00" }
  }
}
```

Stimmt `date` nicht mit dem heutigen logischen Datum überein, werden die Typ-Standards
aus `config.js` verwendet (Feld `zeitfenster` des Typs bzw. `zeitfensterDefaults`).

---

## Kiosk-Modus

### Was die App selbst absichert

| Funktion                  | Detail                                                                 |
|---------------------------|------------------------------------------------------------------------|
| Vollbild automatisch      | Beim ersten Antippen wird Vollbild angefordert                        |
| Vollbild-Wiedereinstieg   | Bei unbeabsichtigtem Verlassen fordert die App Vollbild erneut an     |
| Bildschirm wach halten    | Wake Lock API verhindert, dass das Display dimmt oder sperrt          |
| Tastaturkürzel blockiert  | F5, F11, F12, Ctrl+R, Ctrl+W, Ctrl+T, Alt+F4 u. a. sind deaktiviert |
| Kontextmenü gesperrt      | Rechtsklick und langes Drücken öffnen kein Kontextmenü               |
| Zurück-Geste blockiert    | Browser-Zurück-Taste und Wischgeste haben keine Wirkung               |
| Ziehen/Auswählen gesperrt | Text kann nicht ausgewählt oder gezogen werden                        |
| Orientierung              | Portrait (Hochformat) – erzwungen über PWA-Manifest                  |
| PIN nach Neustart         | Nach jedem Seitenstart (inkl. Home-Taste + Rückkehr) ist PIN nötig   |

**Vollbild beenden (nur Admin):** Admin-Bereich → Aktionsleiste → „Vollbild beenden".

> **Localhost-Entwicklungsmodus (`IS_PROXY`):** Wird die App über `http://localhost` oder
> `http://127.0.0.1` geöffnet (z. B. über `admin-server.py`), werden Vollbild und
> `pinned`-Verhalten deaktiviert – alle Stempel-Buttons landen im scrollbaren Bereich.
> Das Tablet-Verhalten bleibt unverändert.

---

### Was die App NICHT verhindern kann

Diese Dinge erfordern eine OS-seitige Konfiguration:

- Home-Button / Home-Geste des Betriebssystems
- Benachrichtigungsleiste von oben herunterziehen
- App-Wechsel (Recents-Taste / Drei-Finger-Wisch)
- Einstellungen des Tablets

---

### Android: Screen Pinning (App-Fixierung) einrichten

Screen Pinning ist eine eingebaute Android-Funktion ohne zusätzliche Apps.

**Einrichtung (einmalig):**

1. **Einstellungen → Sicherheit → App-Fixierung** (oder „Bildschirm fixieren")
   - Je nach Hersteller: „Sicherheit & Datenschutz", „Biometrie & Sicherheit" o. ä.
2. **App-Fixierung aktivieren**
3. Optional: „Beim Aufheben PIN verlangen" aktivieren → empfohlen

**LifeguardClock fixieren:**

1. LifeguardClock in Chrome öffnen (als Vollbild oder installierte PWA)
2. **Recents-Taste** antippen
3. App-Karte von LifeguardClock antippen und gedrückt halten oder das **Pin-Symbol** antippen
4. „Fixieren" bestätigen

**Aufheben:** Gleichzeitig Zurück-Taste und Recents-Taste gedrückt halten.

---

### Android: Als PWA installieren (empfohlen)

Eine installierte PWA startet ohne Browser-Adressleiste im Vollbild und wird vom System
als eigenständige App behandelt. Das Manifest erzwingt **Hochformat (Portrait)**.

**Voraussetzung:** Die Datei muss über einen lokalen Webserver ausgeliefert werden
(nicht als `file://`).

**Installation in Chrome:**
1. Seite in Chrome öffnen
2. Drei-Punkte-Menü → „Zum Startbildschirm hinzufügen"
3. „Installieren" bestätigen
4. Ab sofort aus der App-Schublade als „LifeguardClock" öffnen

Dann Screen Pinning auf die installierte App anwenden.

---

### iPad / iPadOS: Geführter Zugriff (Guided Access)

**Einrichtung (einmalig):**

1. **Einstellungen → Bedienungshilfen → Geführter Zugriff**
2. Geführten Zugriff **aktivieren**
3. **Passcode-Einstellungen → Passcode für geführten Zugriff** festlegen

**LifeguardClock sperren:**

1. LifeguardClock in Safari öffnen (als PWA vom Homescreen)
2. **Dreimal die Seitentaste** drücken
3. Geführten Zugriff starten → **Starten** tippen

**Beenden:** Dreimal Seitentaste → Passcode eingeben → Beenden.

---

### Produktives Setup: Amazon Fire Tab 7 (2022) mit Fully Kiosk Browser

Das tatsächlich im Einsatz befindliche Gerät ist ein **Amazon Fire 7 (12. Generation, 2022)**
mit dem **Fully Kiosk Browser** als Kiosk-Lösung.

**Gerät:**

| Eigenschaft    | Wert                                  |
|----------------|---------------------------------------|
| Modell         | Amazon Fire 7 (12. Gen, 2022)         |
| Betriebssystem | Fire OS (Android-basiert)             |
| Browser        | Fully Kiosk Browser (kostenpflichtig) |
| Betrieb        | Dauerbetrieb, Hochformat, an Strom    |

**Fully Kiosk – geänderte Einstellungen gegenüber Werkseinstellung:**

*Start & Laden*

| Einstellung              | Wert                                                        |
|--------------------------|-------------------------------------------------------------|
| Start-URL                | `file:///storage/emulated/0/LifeguardClock.html`                |
| Bei Systemstart starten  | Ja                                                          |
| Bei Absturz neu starten  | Ja                                                          |

> Die App-Dateien (`LifeguardClock.html`, `config.js`, `manifest.json`) liegen im internen Speicher
> unter `/storage/emulated/0/` und werden per USB-Dateiübertragung aktualisiert.
> Da Fully Kiosk die Seite über `file://` lädt, steht die File System Access API nicht zur
> Verfügung — JSON-Export und -Import nutzen den nativen Browser-Download- bzw. -Dateidialog.

*Kiosk & Bildschirm*

| Einstellung                   | Wert / Bedeutung                    |
|-------------------------------|-------------------------------------|
| Kiosk-Modus                   | Aktiv                               |
| Erweiterter Kiosk-Schutz      | Aktiv                               |
| Bildschirmausrichtung         | Hochformat (Portrait) erzwungen     |
| Bildschirm dauerhaft an       | Ja                                  |
| Im Vordergrund halten         | Ja                                  |

*Gesperrte Systemfunktionen (alle deaktiviert)*

Home-Taste, Statusleiste, Lautstärketasten, Ein-/Aus-Taste, Benachrichtigungen,
Screenshots, Kontextmenü, eingehende/ausgehende Anrufe, andere Apps, Multi-Window.

*Fernverwaltung (Remote Admin)*

| Einstellung         | Wert                              |
|---------------------|-----------------------------------|
| Remote Admin        | Aktiv (Zugriff im lokalen Netz)   |
| Screenshot          | Erlaubt                           |
| Dateimanager        | Erlaubt                           |
| Kamerabild          | Erlaubt                           |

*Geräteverwaltung (MDM)*

| Einstellung                      | Wert  |
|----------------------------------|-------|
| ADB (USB-Debugging) deaktivieren | Ja    |
| Safe-Mode-Boot sperren           | Ja    |
| Apps aus unbekannten Quellen     | Ja    |

---

### Empfohlenes Setup für Tablet-Dauerbetrieb

**Mit Fully Kiosk Browser (aktuelles Setup):**

```
1. LifeguardClock.html + config.js + manifest.json per USB auf den internen Speicher des Tablets kopieren
2. Fully Kiosk Browser installieren und konfigurieren (startURL = file:///storage/emulated/0/LifeguardClock.html)
3. Kiosk-Modus aktivieren, Bildschirm-Timeout deaktivieren
4. Tablet an Strom anschließen (Dauerbetrieb)
5. Vor dem Ausschalten: "Sicher herunterfahren" im Admin-Bereich von LifeguardClock verwenden
```

**Alternativ (ohne Fully Kiosk, Android/iPad):**

```
1. LifeguardClock.html + config.js + manifest.json auf lokalem Webserver ablegen
2. In Chrome die Seite als PWA installieren
3. Screen Pinning (Android) oder Geführten Zugriff (iPad) aktivieren
4. Tablet an Strom anschließen (Dauerbetrieb)
5. In den Tablet-Einstellungen: Bildschirm-Timeout auf "Nie" stellen
6. Vor dem Ausschalten: "Sicher herunterfahren" im Admin-Bereich verwenden
```

---

## CSV-Export

Der Export (Haupt-Log oder Tages-Backup) erzeugt eine UTF-8-CSV-Datei mit BOM
(kompatibel mit Microsoft Excel).

**Spalten:** `ID; Zeitstempel; Datum; Uhrzeit; Nutzer; Typ; Aktion; Dauer`

**Dateiname:** `lgc_YYYY-MM-DD.csv` bzw. `lgc_backup_YYYY-MM-DD.csv`

---

## Auswertungs-Dashboard (`dashboard.html`)

Eigenständige Web-App zur Auswertung der von LifeguardClock exportierten JSON-Dateien.
Läuft vollständig im Browser – kein Server nötig. Kann auch über `admin-server.py`
betrieben werden und lädt die Daten dann direkt aus der Cloud.

### Zweck

Auswertung und Übersicht der gesammelten Stempeldaten, typischerweise aus dem
Nextcloud-Sync-Verzeichnis. Geeignet für Saisonauswertungen, Stundenberichte und
Top-Listen.

### Dateiformat

Erwartet Dateien nach dem Schema `lgc_[deviceId]_YYYY-MM-DD.json`:

```json
{
  "version": 2,
  "exported": "2026-03-13T21:45:53.449Z",
  "deviceId": "steg",
  "logicalDay": "2026-03-13",
  "count": 76,
  "log": [
    { "id": 1773405864385.17, "nutzer": "Max Muster", "typ": "anwesenheit",
      "aktion": "start", "zeitstempel": "2026-03-13T12:44:24.384Z" },
    { "id": 1773406282757.52, "nutzer": "Max Muster", "typ": "anwesenheit",
      "aktion": "stop",  "zeitstempel": "2026-03-13T12:51:22.753Z", "dauer_ms": 418372 }
  ]
}
```

> **logicalDay:** Einträge nach Mitternacht (bis zur konfigurierten `dayBoundaryHour`)
> zählen noch zum Vortag. Das Dashboard verwendet ausschließlich `logicalDay` zur
> Tageszuordnung. Die Grenze wird von LifeguardClock beim Export gesetzt.

> **Multi-Gerät:** Mehrere Geräte schreiben je eigene Dateien (`steg`, `boot`, `halle` …).
> Das Dashboard liest alle passenden Dateien ein und führt die Logs zusammen.

### Daten laden

**☁️ Cloud laden** – nur auf `localhost` (Proxy-Betrieb):

Liest `lgc_cloud` (localStorage) für die WebDAV-Zugangsdaten.
Beim ersten Start ohne gespeicherte Zugangsdaten wird einmalig aus `admin_config.js`
geboostrapped. Beim ersten Klick ohne jegliche Zugangsdaten erscheint eine Eingabeleiste.
Danach:

1. PROPFIND auf den `LifeguardClock/`-Ordner → alle `lgc_*_YYYY-MM-DD.json`-Dateien
2. Jede Datei wird per GET geladen
3. Zugangsdaten werden in `localStorage` gespeichert (für folgende Besuche)

**📁 Ordner laden** – lokal oder ohne Proxy:

Öffnet einen nativen Ordner-Dialog.

- In sicheren Kontexten (HTTPS / localhost) wird die File System Access API verwendet.
- Als Fallback (`file://`, Firefox) ein `<input webkitdirectory>`.

Es werden automatisch alle Dateien eingelesen, die dem Muster
`lgc_*_YYYY-MM-DD.json` entsprechen (mit und ohne `deviceId`-Präfix).

### Tabs

| Tab | Inhalt |
|---|---|
| **Übersicht** | Gesamtsummen je Typ, Top-5-Ranglisten für alle Typen (inkl. Anwesenheit), Korrelationsanalyse, Aktivitätskalender |
| **Tage** | ← → Navigation durch alle geladenen Tage, Tabelle pro Person mit Gesamtzeile |
| **Wochen** | ← → Navigation nach Kalenderwoche (ISO), Wochensummen pro Person |
| **Personen** | Personen-Filter, Summary-Cards mit % der Anwesenheit, vollständige Tageshistorie je Person |
| **Export** | CSV-Download: Rohdaten / Wochensummen / Gesamtsummen je Person |

### Aktivitätskalender

Im Übersicht-Tab wird ein Monatskalender angezeigt. Tage mit Daten sind farbig
hervorgehoben und anklickbar – ein Klick springt direkt zur Tagesdetailansicht.

### Korrelationsanalyse

Im Übersicht-Tab erscheint unterhalb der Top-Listen der Abschnitt
**„Korrelation mit Anwesenheit"** – sofern:

- Der Typ `anwesenheit` in den Daten vorhanden ist
- Mind. ein weiterer Typ existiert
- Mind. **3 Personen** geladen sind (weniger ergibt keine statistisch sinnvolle Aussage)

Berechnet wird der **Pearson-Korrelationskoeffizient r** (−1 … +1) zwischen den
Gesamtstunden Anwesenheit und Gesamtstunden des jeweiligen Typs, aggregiert pro Person.

| Wert | Bedeutung |
|---|---|
| nahe +1 | Wer viel anwesend ist, hat auch viele Stunden dieses Typs |
| nahe 0 | Kein linearer Zusammenhang |
| nahe −1 | Gegensätzlicher Zusammenhang (selten sinnvoll) |

### Prozentanteil Anwesenheit (Personen-Tab)

In der Personen-Detailansicht zeigt jede Typ-Karte (außer Anwesenheit selbst) einen
Fortschrittsbalken mit dem Anteil der Typ-Stunden an den Gesamtstunden Anwesenheit dieser
Person. Beispiel: „42 % der Anwesenheit".

### CSV-Export

Alle CSV-Exporte enthalten ein UTF-8-BOM für Kompatibilität mit Microsoft Excel.
Stunden werden in ganzen Minuten exportiert.

| Export | Granularität |
|---|---|
| Alle Tage | Tag × Person × Typ |
| Wochensummen | KW × Person × Typ |
| Gesamtsummen | Person × Typ (über gesamten Zeitraum) |

### Technische Details

| Eigenschaft | Wert |
|---|---|
| Datei | `dashboard.html` |
| Abhängigkeiten | `admin_config.js` (optional, einmaliges Bootstrap der Cloud-Zugangsdaten) |
| Datenhaltung | Arbeitsspeicher; Cloud-Zugangsdaten im `localStorage` (`lgc_cloud`); Typ-Config aus `lgc_type_config` |
| Datenmodell | `by[logicalDay][nutzer][typ] = ms` — nur `stop`-Einträge mit `dauer_ms` |

---

## Log-Editor (`editor.html`)

Werkzeug zur manuellen Pflege einzelner JSON-Tagesdateien.
Geeignet für nachträgliche Korrekturen, das Hinzufügen vergessener Einträge
oder das Bereinigen von Datenfehlern.

### Laden & Speichern

- **Laden:** Button „Laden" oder **Drag & Drop** einer `.json`-Datei auf die Seite
- **☁ Cloud** *(nur im Proxy-Betrieb)*: Öffnet einen Dialog mit allen
  `lgc_*_YYYY-MM-DD.json`-Dateien aus dem Cloud-Ordner zum Auswählen.
  Die Cloud-Zugangsdaten werden aus `lgc_cloud` (localStorage) übernommen.
- **Neue Datei:** Legt eine leere Struktur mit dem heutigen `logicalDay` an
- **Export:** Lädt die bearbeitete Datei herunter – `count` und `exported` werden
  automatisch auf den aktuellen Stand gesetzt
- **☁ Speichern** *(nur im Proxy-Betrieb, nach Cloud-Laden aktiv)*: Schreibt die
  geänderte Datei direkt zurück auf den WebDAV-Server. Der Button ist nur aktiv,
  solange ungespeicherte Änderungen vorliegen.

Der `logicalDay` der Datei ist direkt im Header editierbar.

### Tabellenansicht

Zeigt alle Log-Einträge chronologisch. Pro Zeile:

| Spalte | Beschreibung |
|---|---|
| ✓ / ⚠ | Paar-Validierungsstatus (grün = vollständig, gelb = offen) |
| Person | Anzeigename |
| Typ | Anwesenheit / Wachstunden / Sanitätsstunden (farbige Badge) |
| Aktion | `start` / `stop` |
| Zeitstempel | Datum + Uhrzeit in lokaler Zeit |
| Dauer | Berechnete Dauer (nur bei `stop`-Einträgen) |

**Inline-Bearbeitung:** Klick auf ✏ macht alle Felder der Zeile editierbar.
`✓` speichert, `✕` verwirft. Escape bricht ebenfalls ab.

### Eintragspaar hinzufügen

Der Button „+ Eintragspaar hinzufügen" öffnet ein Modal mit:

- **Person:** Freitextfeld mit Autocomplete aus `config.js` (`CONFIG.defaultUsers`)
  und allen bereits im Dokument vorhandenen Namen
- **Typ:** Auswahlmenü (Anwesenheit / Wachstunden / Sanitätsstunden)
- **Von / Bis:** Datum-Zeit-Felder; die Dauer wird live als Vorschau berechnet

Beim Bestätigen werden exakt zwei Einträge erzeugt (`start` + `stop`) mit
korrekt berechnetem `dauer_ms`. Das Log wird danach chronologisch sortiert.

### Paar-Validierung

Bei jedem Render wird automatisch geprüft, ob alle `start`-Einträge ein passendes
`stop` haben und umgekehrt. Problematische Einträge werden mit ⚠ markiert.
Der Header-Badge zeigt die Gesamtanzahl offener Einträge.

Erkannte Fehler:

| Fehler | Erkennung |
|---|---|
| Start ohne Stop | Start bleibt nach dem letzten Stop der Gruppe offen |
| Stop ohne Start | Stop erscheint ohne vorangehenden Start |
| Doppelter Start | Zweiter Start bevor der erste geschlossen wurde |

### dauer_ms Auto-Berechnung

Beim Speichern einer Bearbeitung:

- Wird ein **Stop**-Zeitstempel geändert: Der nächstgelegene vorangehende `start`
  desselben Nutzers und Typs wird gesucht, `dauer_ms` neu berechnet.
- Wird ein **Start**-Zeitstempel geändert: Der nächstfolgende `stop` desselben
  Nutzers und Typs wird neu berechnet.

### Timeline-Ansicht

Visueller Zeitstrahl pro Person und Typ. Segmente werden als farbige Balken
dargestellt (Farben aus `lgc_type_config` bzw. `config.js`).
Offene Segmente (Start ohne Stop) werden gestrichelt dargestellt.

### Undo / Redo

Jede Mutation (Hinzufügen, Bearbeiten, Löschen) legt einen Snapshot ab.
Bis zu 50 Schritte werden gespeichert.

| Aktion | Tastenkürzel |
|---|---|
| Rückgängig | `Ctrl+Z` oder Button ↩ |
| Wiederholen | `Ctrl+Y` oder Button ↪ |
| Modal / Edit abbrechen | `Escape` |

> **Hinweis:** Eine neue Mutation nach mehrfachem Undo löscht den Redo-Stack
> (Standard-Undo-Verhalten).

### Technische Details

| Eigenschaft | Wert |
|---|---|
| Datei | `editor.html` |
| Abhängigkeiten | `config.js` (optional, für Autocomplete und Typ-Farben); `lgc_type_config` (localStorage, bevorzugt) |
| Datenhaltung | Arbeitsspeicher; Cloud-Zugangsdaten aus `lgc_cloud` (localStorage) |
| Undo-Stack | Max. 50 Snapshots als JSON-Strings |

---

## Tests

Alle Unit-Tests liegen im Unterordner `tests/` und können direkt als HTML-Datei
im Browser geöffnet werden – kein Build-System, kein Node.js erforderlich.

| Datei | Testet |
|---|---|
| `tests/test_LifeguardClock.html` | Kernfunktionen von LifeguardClock (35 Suites) |
| `tests/test_dashboard.html` | Datenaggregation und Formatierung (`dashboard.html`) |
| `tests/test_editor.html` | Validierung, Mutationen, Undo/Redo (`editor.html`) |

---

## Lokaler Proxy-Server (`admin-server.py`)

Python-Skript, das einen HTTP-Server auf `http://localhost:8080` startet.
Dient als lokale Entwicklungsumgebung und löst das CORS-Problem beim direkten
Zugriff auf Nextcloud vom Browser aus.

> **Sicherheit:** Der Server bindet ausschließlich auf `127.0.0.1` — er ist nicht
> aus dem lokalen Netzwerk erreichbar, nur vom selben Rechner.

### Starten

```
python admin-server.py
```

Ausgabe beim Start:

```
  Nextcloud : https://cloud.example.com
  Admin         : http://localhost:8080/admin.html
  Stempeluhr    : http://localhost:8080/LifeguardClock.html
  Editor        : http://localhost:8080/editor.html
  Dashboard     : http://localhost:8080/dashboard.html
  Beenden       : Strg+C
```

### Funktionsweise

| Anfrage | Behandlung |
|---|---|
| Lokale Datei (`.html`, `.js`, …) | Direkt ausgeliefert |
| `/remote.php/*` | Transparent an Nextcloud weitergeleitet (Proxy) |

Der Browser sieht nur `localhost` — kein CORS-Problem. Die App-Dateien können
so mit voller Cloud-Funktionalität direkt aus dem Projektordner heraus genutzt werden.

### Konfiguration

Der Proxy liest die Nextcloud-URL aus `admin_config.js` (Feld `ADMIN_CONFIG.cloud.url`).
Diese Datei wird von Git ignoriert. Vorlage: `admin_config.example.js`.

```js
// admin_config.js
const ADMIN_CONFIG = {
  cloud: {
    url:  'https://cloud.example.com',
    user: 'benutzername',
    pass: 'xxxx-xxxx-xxxx-xxxx',  // App-Passwort
  },
};
```

### IS_PROXY-Verhalten der Apps

Alle vier Apps erkennen den Proxy-Betrieb automatisch anhand des Hostnamens
(`localhost` / `127.0.0.1`) und passen ihr Verhalten an:

| App | IS_PROXY-Besonderheit |
|---|---|
| `LifeguardClock.html` | Kein Vollbild, kein `pinned`-Verhalten; relative WebDAV-URLs; Cloud-Sync sofort (kein Debounce) |
| `admin.html` | URL-Feld in der Cloud-Konfiguration ausgeblendet |
| `editor.html` | Relative WebDAV-URLs für Cloud-Lade/-Speicher |
| `dashboard.html` | „☁️ Cloud laden"-Button aktiv; `admin_config.js` für Zugangsdaten |

### Voraussetzungen

- Python 3.6+, keine externen Pakete
- `admin_config.js` mit Nextcloud-Zugangsdaten im gleichen Verzeichnis

---

## Release-Paket (`make-release.ps1`)

PowerShell-Skript, das ein ZIP-Archiv mit allen Dateien für eine Weitergabe erzeugt.
Sensible Dateien (`config.js`, `admin_config.js`) werden bewusst ausgelassen.

```powershell
.\make-release.ps1 -Version "0.8"
```

Erzeugt `LifeguardClock-v0.8.zip` mit:

- Allen HTML-Apps + externen JS-Dateien (`lifeguardclock.js`, `admin-app.js`, `dashboard-app.js`, `editor-app.js`)
- `sw.js`, `manifest.json`, `Logo.png`, `jsqr.min.js`, `qrcode.min.js`
- `config.example.js`, `admin_config.example.js`, Presets
- `admin-server.py`, `admin-server.bat`
- `README.md`, `DOKUMENTATION.md`, `CHANGELOG.md`, `LICENSE`
- Tests (`tests/`)

> **Hinweis:** `CACHE_NAME` in `sw.js` vor einem Release auf die neue Version bumpen
> (z. B. `lgc-shell-v12`), damit Nutzer nicht die gecachte alte Version erhalten.

