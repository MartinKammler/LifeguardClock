# Release Notes – LifeguardClock v0.9.1

## Sicherheits-Patch (Security-Review v0.9)

Dieses Release enthält ausschließlich Sicherheits- und Robustheitsfixes. Keine neuen Features, keine Änderungen an `config.js`-Struktur oder Cloud-Dateiformat.

### Sicherheitsfixes

**QR-Bootstrap-Bestätigung**: Beim Scannen eines Einrichtungs-QR-Codes erscheint jetzt ein Bestätigungsdialog mit Server-URL und Benutzername. Die Cloud-Konfiguration wird erst nach expliziter Bestätigung übernommen — ein gefälschter QR-Code kann das Gerät nicht mehr unbemerkt auf einen fremden Endpunkt umleiten.

**Rate-Limit für PIN und Admin-Passwort**: Nach 3 aufeinanderfolgenden Fehlversuchen am PIN-Keypad oder im Admin-Passwort-Dialog wird die Eingabe für 5 Minuten gesperrt. Die Fehlermeldung zeigt die verbleibenden Versuche bzw. die Restdauer der Sperre.

**Schema-Validierung Cloud-Daten**: Nutzer, Typen und Events aus der Cloud werden vor der Übernahme auf Pflichtfelder geprüft. Einträge ohne `id`/`name` (Nutzer), ohne `key`/`logType` (Typen) oder ohne gültiges ISO-Datum (Events) werden verworfen und per `console.warn` protokolliert.

**Nutzerdrift behoben**: Vom Admin gelöschte Nutzer tauchen auf anderen Geräten nicht mehr wieder auf. Die gelöschten IDs werden als Tombstone-Liste (`removedIds`) in `lgc_users.json` gespeichert und beim nächsten Sync berücksichtigt.

**CSS-Injection-Schutz**: Typ-Farben in der Admin-Oberfläche werden gegen eine Whitelist geprüft. Ungültige Werte können nicht mehr als CSS-Kontext-Injection eingeschleust werden.

### Sonstige Fixes

**admin-server.py**: Parallele Browser-Anfragen (z. B. PROPFIND + GET gleichzeitig) werden jetzt korrekt verarbeitet. Direktaufruf von `http://localhost:8080/` leitet automatisch auf `admin.html` weiter.

**Admin Auto-Load leere Typen**: Leere `lgc_types.json` in der Cloud wird beim Start jetzt korrekt als leere Typ-Liste behandelt (bisher wurde ein leeres Array ignoriert).

**CSS-Variablen im QR-Scanner-Overlay**: Zwei Tippfehler (`--surface2`, `--muted`) behoben — Eingabefeld und Trennlinie werden jetzt korrekt in der konfigurierten Theme-Farbe gerendert.

**jsQR-Ladefehlback**: Ist `jsqr.min.js` nicht verfügbar, wechselt der QR-Scanner-Overlay jetzt automatisch in den manuellen Eingabemodus statt in einem halbfertigen Zustand zu bleiben.

### Migration / Update

- Service Worker Cache wurde auf `lgc-shell-v14` erhöht → Browser-Update erfolgt automatisch nach Neustart.
- Hard Refresh (`Strg+Shift+R`) empfohlen, falls Änderungen nicht sofort sichtbar sind.
- Keine Änderungen an `config.js`-Struktur oder Cloud-Dateiformat erforderlich.
- `lgc_users.json` erhält beim nächsten Admin-Speichern ein neues `removedIds`-Feld — rückwärtskompatibel, ältere App-Versionen ignorieren das Feld.

### Bekannte Einschränkungen

- Cloud-Zugangsdaten liegen weiterhin im Klartext im Browser-Storage (localStorage). Empfehlung: dediziertes App-Passwort verwenden.
- Die Rate-Limit-Sperre lebt nur im Arbeitsspeicher — ein Seitenneuladen setzt sie zurück. Für den Kiosk-Betrieb ausreichend.
