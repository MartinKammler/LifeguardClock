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
  // Cloud-Sync-Verzögerung in Sekunden nach dem letzten Stempel (Batching)
  // Im localhost-Betrieb (admin-server) wird dieser Wert ignoriert → sofortiger Sync
  cloudSyncDebounceSeconds: 60,

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
  // Ab v0.6: Typen werden zentral in lgc_types.json in der Cloud verwaltet
  // (admin.html → Karte „Stempel-Typen"). Das types-Array hier dient nur noch
  // als lokaler Fallback, wenn die Cloud noch nicht konfiguriert ist.
  //
  // Fallback-Minimal-Konfiguration (wird durch Cloud-Typen überschrieben):
  types: [
    {
      key:     'anwesenheit',
      label:   'Anwesenheit',
      logType: 'anwesenheit',
      color:   'blue',
      pinned:  true,
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
