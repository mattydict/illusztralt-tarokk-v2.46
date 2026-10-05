@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nincs telepitve. Telepitsd a Node.js LTS valtozatot, majd inditsd ujra ezt a fajlt.
  pause
  exit /b 1
)
if not exist node_modules\ (
  echo Fuggosegek telepitese...
  call npm install
  if errorlevel 1 (
    echo A fuggosegek telepitese nem sikerult.
    pause
    exit /b 1
  )
)
echo Illusztralt Magyar Tarokk inditasa...
call npm run dev
pause
