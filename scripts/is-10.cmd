@echo off
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
echo === Tip kontrolu
call npm run typecheck
echo TYPECHECK_KODU=%errorlevel%
echo === Birim testleri
call npm run test:unit
echo UNIT_KODU=%errorlevel%
echo === Tarayici
set "PW_CHANNEL=chrome"
if not exist "C:\Program Files\Google\Chrome\Application\chrome.exe" if not exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "PW_CHANNEL=msedge"
echo PW_CHANNEL=%PW_CHANNEL%
echo === Uctan uca testler
call npx playwright test --reporter=list
echo E2E_KODU=%errorlevel%
exit /b 0
