/**
 * LifeguardClock – Grundkonfiguration (Vorlage)
 * ==========================================
 * Diese Datei als "config.js" kopieren und anpassen.
 * Die echte config.js wird von Git ignoriert (sensible Daten).
 *
 * WICHTIG: PINs müssen genau 6 Ziffern lang sein.
 */

const CONFIG = {

  /* ── Gerät & Tageswechsel ─────────────────────────────────── */
  // Eindeutige Kennung dieses Geräts – erscheint im Cloud-Dateinamen
  // Empfohlen: sprechender Name wie 'steg', 'boot', 'halle'
  // Weglassen → automatische UUID (im Browser gespeichert, reicht für ein Gerät)
  deviceId: 'geraet1',

  // Logischer Tageswechsel in Stunden (0–23)
  // Stempel vor dieser Uhrzeit zählen noch zum Vortag (z. B. Nachtveranstaltungen)
  dayBoundaryHour: 4,

  /* ── Zeiteinstellungen ────────────────────────────────────── */
  // Unvollständige PIN nach X Sekunden automatisch löschen (0 = deaktiviert)
  pinClearSeconds: 5,
  // Automatisches Ausloggen nach X Sekunden Inaktivität im Dashboard
  autoLogoutSeconds: 15,
  // Bildschirmschoner auf dem Login-Bildschirm nach X Sekunden Inaktivität
  screensaverSeconds: 60,

  /* ── Standard-Zeitfenster pro Wochentag ───────────────────── */
  // start/end: 'HH:MM' – gilt für Typen mit requiresZeitfenster: true
  // null bedeutet: kein Zeitfenster an diesem Tag (Knöpfe gesperrt)
  zeitfensterDefaults: {
    mo: { start: '07:00', end: '21:00' },
    di: { start: '07:00', end: '21:00' },
    mi: { start: '07:00', end: '21:00' },
    do: { start: '07:00', end: '21:00' },
    fr: { start: '07:00', end: '21:00' },
    sa: { start: '07:00', end: '21:00' },
    so: { start: '07:00', end: '21:00' },
  },

  /* ── Admin-Zugang ─────────────────────────────────────────── */
  adminPin: '000000',   // <-- sicheren PIN setzen!

  /* ── Stempel-Typen ────────────────────────────────────────── */
  //
  // Pflichtfelder:
  //   key      – eindeutiger interner Schlüssel (keine Sonderzeichen)
  //   label    – Anzeigename im Dashboard
  //   logType  – Bezeichnung im Log (unveränderlich nach Produktivstart!)
  //   color    – Farbe: 'blue' | 'green' | 'amber' | 'red' | 'violet'
  //
  // Optionale Felder:
  //   pinned              – true: bleibt beim Scrollen immer sichtbar
  //   disabled            – true: Typ vollständig ausgeblendet (kein Button, kein Log)
  //   requiresZeitfenster – true: Knopf außerhalb des Zeitfensters gesperrt
  //   zeitfenster         – Typ-eigene Zeitfenster pro Wochentag (überschreibt zeitfensterDefaults)
  //                         Fehlender Wochentag = ganztägig gesperrt
  //                         Beispiel: zeitfenster: { mo: {start:'08:00',end:'20:00'}, di: {...} }
  //   maxDurationMs       – Auto-Stop nach X Millisekunden
  //   cooldownMs          – Pflichtpause nach Auto-Stop (Knopf gesperrt + Countdown)
  //   autoStartKeys       – Startet diese Typen automatisch beim Start mit
  //   mutexKeys           – Stoppt diese Typen automatisch beim Start
  //   permissionKey       – Nutzer braucht diesen Key in permissions[], sonst unsichtbar
  //
  // Scroll-Verhalten:
  //   Bei mehr als 3 Typen werden nicht-gepinnte Typen scrollbar.
  //   Gepinnte Typen (pinned: true) bleiben immer sichtbar.
  //
  types: [
    {
      key:     'anwesenheit',
      label:   'Anwesenheit',
      logType: 'anwesenheit',
      color:   'blue',
      pinned:  true,
    },
    {
      key:                 'typ_a',
      label:               'Typ A',
      logType:             'typ_a',
      color:               'amber',
      requiresZeitfenster: true,
      maxDurationMs:       7200000,    // 2 Stunden
      cooldownMs:          1800000,    // 30 Minuten Pflichtpause
      autoStartKeys:       ['anwesenheit'],
      mutexKeys:           ['typ_b'],
      permissionKey:       'typ_a',
    },
    {
      key:                 'typ_b',
      label:               'Typ B',
      logType:             'typ_b',
      color:               'red',
      requiresZeitfenster: true,
      maxDurationMs:       21600000,   // 6 Stunden
      cooldownMs:          1800000,    // 30 Minuten Pflichtpause
      autoStartKeys:       ['anwesenheit'],
      mutexKeys:           ['typ_a'],
      permissionKey:       'typ_b',
    },
  ],

  /* ── Mitglieder ───────────────────────────────────────────── */
  // id          : eindeutiger interner Schlüssel (keine Leerzeichen)
  // name        : Anzeigename
  // pin         : 6-stellige PIN
  // permissions : welche permissionKey-Typen sichtbar sind
  //               → weglassen = alle Typen sichtbar
  removedUsers: [],

  defaultUsers: [
    {
      id:            'beispiel_person',
      name:          'Beispiel Person',
      pin:           '123456',
      mustChangePIN: true,
      permissions:   ['typ_a', 'typ_b'],
    },
  ],

  /* ── Cloud-Sync (Nextcloud / WebDAV) ──────────────────────── */
  cloud: {
    url:  '',   // z. B. 'https://cloud.example.com'
    user: '',   // Nextcloud-Benutzername
    pass: '',   // App-Passwort (Nextcloud → Einstellungen → Sicherheit)
  },

};
