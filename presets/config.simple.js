/**
 * LifeguardClock – Simple-Preset (nur Anwesenheit)
 * =============================================
 * Minimale Konfiguration für reine Anwesenheitsverfolgung.
 * Kein Zeitfenster, keine Zeitlimits, keine Berechtigungen.
 *
 * Geeignet für:
 *  - Vereine ohne spezielle Dienst-Typen
 *  - Erste Tests der App
 *
 * Kopiere diese Datei als config.js in das Hauptverzeichnis und passe
 * adminPin, defaultUsers und cloud-Konfiguration an.
 */

const CONFIG = {

  deviceId:          'geraet1',   // <-- je Gerät anpassen
  dayBoundaryHour:   4,

  pinClearSeconds:    5,
  autoLogoutSeconds:  15,
  screensaverSeconds: 60,

  zeitfensterDefaults: {
    mo: null,
    di: null,
    mi: null,
    do: null,
    fr: null,
    sa: null,
    so: null,
  },

  adminPin: '000000',   // <-- sicheren PIN setzen!

  types: [
    {
      key:     'anwesenheit',
      label:   'Anwesenheit',
      logType: 'anwesenheit',
      color:   'blue',
      pinned:  true,
    },
  ],

  removedUsers: [],

  defaultUsers: [
    {
      id:            'beispiel_person',
      name:          'Beispiel Person',
      pin:           '123456',
      mustChangePIN: true,
      // permissions weggelassen → alle Typen sichtbar
    },
  ],

  cloud: {
    url:  '',
    user: '',
    pass: '',
  },

};
