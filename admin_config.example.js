/**
 * LifeguardClock – Admin-Konfiguration (Vorlage)
 * ===========================================
 * Diese Datei als "admin_config.js" kopieren und anpassen.
 * Die echte admin_config.js wird von Git ignoriert (enthält Cloud-Passwort).
 *
 * Wird vom lokalen Python-Proxy (admin-server.py) gelesen.
 * Alle Apps (admin.html, LifeguardClock.html, editor.html, dashboard.html) können
 * über http://localhost:8080 betrieben werden – Nextcloud-Zugriff ohne CORS.
 */

const ADMIN_CONFIG = {

  /* ── Cloud-Zugangsdaten ──────────────────────────────────────
     Nextcloud-URL, Benutzername und App-Passwort.
     App-Passwort erstellen: Nextcloud → Einstellungen → Sicherheit → App-Passwörter
  */
  cloud: {
    url:  'https://cloud.example.com',   // Nextcloud-URL (ohne Pfad)
    user: 'benutzername',
    pass: 'xxxx-xxxx-xxxx-xxxx',         // App-Passwort (nicht das Hauptpasswort!)
  },

};
