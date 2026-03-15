/**
 * LifeguardClock – Preset für DLRG-Ortsgruppen
 * ==========================================
 * Stempel-Typen: Anwesenheit, Wachdienst, Sanitätsdienst
 *
 * Regeln:
 *  - Wachdienst:     max. 2h pro Sitzung, danach 30 min Pause
 *  - Sanitätsdienst: max. 6h pro Sitzung, danach 30 min Pause
 *  - Wachdienst ↔ Sanitätsdienst schließen sich gegenseitig aus
 *  - Start von Wachdienst oder Sanitätsdienst startet Anwesenheit automatisch
 *  - Berechtigung: 'wachdienst' bzw. 'sanitaet' je nach Qualifikation
 *
 * Kopiere diese Datei als config.js in das Hauptverzeichnis und passe
 * adminPin, defaultUsers und cloud-Konfiguration an.
 */

const CONFIG = {

  deviceId:          'geraet1',   // <-- je Gerät anpassen: 'steg', 'boot', 'halle' …
  dayBoundaryHour:   4,

  pinClearSeconds:    5,
  autoLogoutSeconds:  15,
  screensaverSeconds: 60,

  zeitfensterDefaults: {
    mo: { start: '07:00', end: '21:00' },
    di: { start: '07:00', end: '21:00' },
    mi: { start: '07:00', end: '21:00' },
    do: { start: '07:00', end: '21:00' },
    fr: { start: '07:00', end: '21:00' },
    sa: { start: '07:00', end: '21:00' },
    so: { start: '07:00', end: '21:00' },
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
    {
      key:                 'wachdienst',
      label:               'Wachdienst',
      logType:             'wachdienst',
      color:               'amber',
      requiresZeitfenster: true,
      maxDurationMs:       7200000,    // 2 Stunden
      cooldownMs:          1800000,    // 30 Minuten Pflichtpause
      autoStartKeys:       ['anwesenheit'],
      mutexKeys:           ['sanitaet'],
      permissionKey:       'wachdienst',
    },
    {
      key:                 'sanitaet',
      label:               'Sanitätsdienst',
      logType:             'sanitaetsdienst',
      color:               'red',
      requiresZeitfenster: true,
      maxDurationMs:       21600000,   // 6 Stunden
      cooldownMs:          1800000,    // 30 Minuten Pflichtpause
      autoStartKeys:       ['anwesenheit'],
      mutexKeys:           ['wachdienst'],
      permissionKey:       'sanitaet',
    },
  ],

  removedUsers: [],

  defaultUsers: [
    {
      id:            'beispiel_rs',
      name:          'Beispiel Rettungsschwimmer',
      pin:           '123456',
      mustChangePIN: true,
      permissions:   ['wachdienst'],
    },
    {
      id:            'beispiel_san',
      name:          'Beispiel Sanitäter',
      pin:           '234567',
      mustChangePIN: true,
      permissions:   ['sanitaet'],
    },
    {
      id:            'beispiel_beide',
      name:          'Beispiel RS+San',
      pin:           '345678',
      mustChangePIN: true,
      permissions:   ['wachdienst', 'sanitaet'],
    },
  ],

  cloud: {
    url:  '',
    user: '',
    pass: '',
  },

};
