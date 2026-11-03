@echo off
chcp 65001 >nul
cd /d "%~dp0"
call scripts\ortam.cmd
title Oner Yapi - site (kapatmak icin bu pencereyi kapatin)
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
echo.
echo  Site aciliyor: http://localhost:3000   Yonetim paneli: http://localhost:3000/admin
echo  Ilk acilista sayfalarin hazirlanmasi 20-30 saniye surebilir.
echo.
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:3000/admin"
call npm run dev
