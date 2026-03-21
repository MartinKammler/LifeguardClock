# LifeguardClock – Release-Paket erstellen
# Aufruf: .\make-release.ps1 [-Version "0.4"]

param(
    [string]$Version = "0.8"
)

$ErrorActionPreference = 'Stop'
$root    = $PSScriptRoot
$outFile = Join-Path $root "LifeguardClock-v$Version.zip"

# Dateien im Release-Paket
$include = @(
    "LifeguardClock.html",
    "admin.html",
    "dashboard.html",
    "editor.html",
    # einmalpins.html enthält echte Namen/PINs → wird nicht ins Release gepackt
    "sw.js",
    "lifeguardclock.js",
    "admin-app.js",
    "dashboard-app.js",
    "editor-app.js",
    "jsqr.min.js",
    "qrcode.min.js",
    "manifest.json",
    "Logo.png",
    "Logo-icon.png",
    "config.example.js",
    "admin_config.example.js",
    "admin-server.py",
    "admin-server.bat",
    # fully-settings.json enthält persönliche Daten (Kiosk-PIN, Admin-PW, Nutzername) → nicht im Release
    "README.md",
    "DOKUMENTATION.md",
    "CHANGELOG.md",
    "LICENSE",
    "presets\config.dlrg.js",
    "presets\config.simple.js",
    "tests\test_LifeguardClock.html",
    "tests\test_admin.html",
    "tests\test_dashboard.html",
    "tests\test_editor.html",
    "tests\test_sw.html"
)

# Alte ZIP entfernen falls vorhanden
if (Test-Path $outFile) { Remove-Item $outFile }

# Temporäres Verzeichnis mit Paketstruktur
$tmp = Join-Path $env:TEMP "lgc-release-$Version"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
New-Item -ItemType Directory -Path "$tmp\presets" | Out-Null
New-Item -ItemType Directory -Path "$tmp\tests"   | Out-Null

foreach ($rel in $include) {
    $src = Join-Path $root $rel
    $dst = Join-Path $tmp $rel
    if (-not (Test-Path $src)) {
        Write-Warning "Nicht gefunden, wird übersprungen: $rel"
        continue
    }
    Copy-Item $src $dst
}

# ZIP erzeugen
Compress-Archive -Path "$tmp\*" -DestinationPath $outFile
Remove-Item $tmp -Recurse -Force

$size = [math]::Round((Get-Item $outFile).Length / 1KB, 1)
Write-Host ""
Write-Host "  Release erstellt: LifeguardClock-v$Version.zip  ($size KB)" -ForegroundColor Green
Write-Host "  Pfad:  $outFile"
Write-Host ""
Write-Host "  Enthaltene Dateien:"
foreach ($rel in $include) {
    $marker = if (Test-Path (Join-Path $root $rel)) { "  ok" } else { "  FEHLT" }
    Write-Host "$marker  $rel"
}
Write-Host ""
