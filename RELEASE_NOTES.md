# Release Notes – LifeguardClock v1.1.3

## Bugfix: Erster Tap nach Gerät-Wake

---

## Problem

Nach dem Aufwachen eines Tablets oder Smartphones aus dem OS-Schlaf (Bildschirm aus)
wurde der erste Tap auf eine PIN-Taste ignoriert. Erst der zweite Tap registrierte
eine Eingabe.

**Ursache:** Während des OS-Schlafs pausiert der Browser die JavaScript-Ausführung.
Der Screensaver-`setTimeout` (Standard: 60 Sekunden Inaktivität) wurde dabei aufgeschoben.
Beim Aufwachen feuerte dieser aufgeschobene Timer sofort und zeigte den Screensaver.
Der erste Tap des Nutzers wurde dann in der Capture-Phase vom Screensaver-Handler abgefangen
(`stopPropagation()`), um den Screensaver zu schließen — die PIN-Taste registrierte nichts.

---

## Fix

Im `visibilitychange → visible`-Handler (der synchron vor allen deferred Timer-Callbacks
läuft) wird `stopSsTimer()` aufgerufen. Das cancelt den aufgeschobenen Screensaver-Timer
via `clearTimeout()` bevor er als Macrotask ausgeführt wird.

```
Gerät wacht auf
  ↓ visibilitychange → visible (synchron)
      ├─ requestWakeLock()
      ├─ stopSsTimer()        ← cancelt deferred showScreensaver-Callback
      └─ startSsTimer()       ← startet frischen 60s-Countdown
  ↓ deferred Macrotasks
      └─ showScreensaver()    ← wurde gecancelt, läuft nicht mehr
  ↓ Nutzer tippt PIN-Taste
      └─ Ziffer registriert ✓
```

Das Verhalten des Screensavers bei normaler Inaktivität (ohne Wake-Event) bleibt
unverändert — der erste Tap dismisst ihn wie bisher.

---

## Service Worker

Cache-Version: **`lgc-shell-v22`** — alle installierten PWAs laden beim nächsten Start
die neue Version automatisch herunter.

---

## Migration / Update

Keine Konfigurationsänderungen notwendig.
