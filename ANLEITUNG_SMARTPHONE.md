# Stempeluhr auf dem Smartphone einrichten

Diese Anleitung beschreibt, wie ein Mitglied die LifeguardClock-App auf dem eigenen Smartphone
installiert und mit der gemeinsamen Nextcloud verknüpft.

---

## Voraussetzungen

- Die App ist unter einer `https://`-Adresse erreichbar (z. B. GitHub Pages oder eigener Server).  
  Beispiel: `https://MartinKammler.github.io/LifeguardClock/LifeguardClock.html`
- Du hast Zugriff auf die Nextcloud-Verwaltung deines Vereins.
- Du kennst den Admin-PIN der App.

---

## Schritt 1 – Nextcloud: App-Passwort erstellen

Die App speichert Cloud-Zugangsdaten im Browser-Speicher des Smartphones. Verwende deshalb
**kein persönliches Nextcloud-Passwort**, sondern ein dediziertes App-Passwort.

> **Empfehlung:** Alle Geräte (Kiosk-Tablet + Smartphones) teilen sich **einen** Nextcloud-Nutzer
> (z. B. `lifeguardclock`). Jedes Gerät bekommt ein eigenes App-Passwort, damit man einzelne
> Geräte bei Verlust sperren kann, ohne die anderen zu stören.

**Im Nextcloud-Browser-Interface als Admin:**

1. **Nextcloud aufrufen** → oben rechts auf dein Profil-Icon klicken → **„Einstellungen"**
2. Links → **„Sicherheit"**
3. Ganz unten: Abschnitt **„Neue App-Spezifisches Passwort erstellen"**
4. Namen eingeben, z. B. `Smartphone Max Muster`
5. Auf **„Erstellen"** klicken
6. Das angezeigte Passwort **sofort kopieren** — es wird nur einmal angezeigt

> **Falls noch kein gemeinsamer Nextcloud-Nutzer existiert:**  
> Nextcloud-Admin-Oberfläche → **Benutzer** (oben rechts Menü) → **„Neuer Benutzer"**  
> Benutzername z. B. `lifeguardclock`, Gruppe nach Bedarf. Dann wie oben ein App-Passwort anlegen.

---

## Schritt 2 – App auf dem Smartphone installieren

### Android (Chrome / Samsung Internet)

1. App-URL im Browser öffnen:  
   `https://MartinKammler.github.io/LifeguardClock/LifeguardClock.html`
2. Browser-Menü öffnen (drei Punkte oben rechts)
3. **„Zum Startbildschirm hinzufügen"** tippen → bestätigen
4. Die App erscheint als Icon auf dem Startbildschirm und läuft ohne Browser-Leiste

### iPhone / iPad (Safari)

1. App-URL in **Safari** öffnen (anderen Browser geht nicht für PWA-Installation)
2. Teilen-Symbol tippen (Quadrat mit Pfeil nach oben)
3. **„Zum Home-Bildschirm"** tippen → bestätigen

---

## Schritt 3 – Cloud einrichten

1. App öffnen → Admin-PIN eingeben (Standard: `000000`, falls noch nicht geändert)
2. Im Admin-Bereich auf den Tab **„Cloud-Sync"** tippen
3. Felder ausfüllen:

   | Feld | Wert |
   |---|---|
   | **URL** | Nextcloud-Adresse, z. B. `https://cloud.beispiel.de` |
   | **Benutzer** | Nextcloud-Benutzername, z. B. `lifeguardclock` |
   | **Passwort** | Das App-Passwort aus Schritt 1 |

4. **„Verbinden"** oder **„Speichern"** tippen — die App legt automatisch den Ordner
   `LifeguardClock/` auf dem Server an, falls er noch nicht existiert

---

## Schritt 4 – Nutzer laden

Nach der Cloud-Konfiguration:

1. Noch im Admin-Bereich → Tab **„Nutzerverwaltung"**
2. **„Aus Cloud laden"** tippen
3. Alle Mitglieder erscheinen jetzt in der Liste

Ab sofort synchronisiert die App nach jedem Stempel automatisch mit der Cloud.

---

## Gerätename (optional)

Jedes Gerät schreibt seine Stempeldaten in eine eigene Backup-Datei auf dem Server
(`lgc_<geraetname>_DATUM.json`). Der Gerätename wird automatisch generiert (z. B. `android-9b2c`).

Falls du einen sprechenden Namen möchtest (z. B. `handy-max`): im Admin-Bereich →
**„Cloud-Sync"** → Feld **„Geräte-ID"** eintragen, dann App neu laden.

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| „Verbindung fehlgeschlagen" | URL prüfen (kein Schrägstrich am Ende), Benutzername und App-Passwort prüfen |
| Nutzer werden nicht geladen | Sicherstellen, dass `lgc_users.json` in `LifeguardClock/` auf der Cloud existiert (einmalig von einem anderen Gerät hochladen) |
| Stempel werden nicht synchronisiert | Internet-Verbindung prüfen; die App speichert auch offline und synchronisiert beim nächsten Online-Gang |
| App zeigt alten Stand | App schließen und neu öffnen; oder im Browser: Seite mit Strg+Shift+R neu laden |
