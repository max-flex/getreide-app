@echo off
rem Startet die Getreide-Wissensdatenbank im Standardbrowser.
echo Starte Getreide-Wissensdatenbank ...
start "Getreide-Server" powershell -ExecutionPolicy Bypass -WindowStyle Minimized -File "%~dp0serve.ps1" -Port 8123
timeout /t 2 >nul
start "" http://localhost:8123/
echo.
echo Die App laeuft jetzt im Browser unter http://localhost:8123/
echo Dieses Fenster kann geschlossen werden. Zum Beenden den minimierten
echo PowerShell-Server (Getreide-Server) schliessen.
echo.
echo Zugriff vom Handy im selben WLAN (falls Firewall/Rechte es erlauben):
powershell -NoProfile -Command "[System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -ne '127.0.0.1' } | ForEach-Object { Write-Host ('  http://' + $_.ToString() + ':8123/') }"
echo Falls keine Adresse erscheint oder das Handy sich nicht verbinden kann:
echo Start.bat einmalig per Rechtsklick "Als Administrator ausfuehren" starten.
