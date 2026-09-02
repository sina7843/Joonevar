@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required. Install it and reopen the terminal.
 exit /b 1
)
powershell.exe -NoLogo -NoProfile -File "%~dp0runner.ps1" %*
exit /b %ERRORLEVEL%
