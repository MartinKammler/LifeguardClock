@echo off
setlocal

set ADB=c:\Users\Martin\Downloads\platform-tools-latest-windows\platform-tools\adb.exe
set SRC=c:\GitHub\Stempeluhr\stempeluhr

echo.
echo LifeguardClock – Tablet-Deploy (nur Stempelfunktion)
echo =====================================================

%ADB% push "%SRC%\LifeguardClock.html"  /sdcard/LifeguardClock.html
%ADB% push "%SRC%\lifeguardclock.js"    /sdcard/lifeguardclock.js
%ADB% push "%SRC%\sw.js"               /sdcard/sw.js
%ADB% push "%SRC%\manifest.json"       /sdcard/manifest.json
%ADB% push "%SRC%\Logo.png"            /sdcard/Logo.png
%ADB% push "%SRC%\jsqr.min.js"        /sdcard/jsqr.min.js

echo.
echo Fertig. Bitte Seite im Browser neu laden (Cache leeren).
echo.
pause
