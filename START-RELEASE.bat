@echo off
setlocal
cd /d "%~dp0"
echo Building release web assets...
call npm run build
if errorlevel 1 exit /b 1
echo Starting Illusztralt Tarokk v2.46 on http://localhost:8787/
set PORT=8787
set HOST=0.0.0.0
call npm run server
