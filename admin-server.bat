@echo off
echo.
echo  LifeguardClock Admin-Server
echo  ---------------------------
echo  Startet lokalen Webserver mit Nextcloud-Proxy.
echo  Oeffne nach dem Start: http://localhost:8080/admin.html
echo.
python admin-server.py
pause
