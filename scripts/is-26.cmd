@echo off
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
call node scripts\urun-kontrol.mjs
echo KODU=%errorlevel%
endlocal
exit /b 0
