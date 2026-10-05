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
echo Multiplayer authority inditasa...
start "Illusztralt Tarokk Authority" cmd /k "cd /d \"%~dp0\" && npm run server"
timeout /t 1 /nobreak >nul
echo Multiplayer webfelulet inditasa...
start "Illusztralt Tarokk Web" cmd /k "cd /d \"%~dp0\" && npm run dev"
timeout /t 2 /nobreak >nul
start "" http://localhost:5173/multiplayer.html
exit /b 0
