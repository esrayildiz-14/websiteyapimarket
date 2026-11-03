@echo off
setlocal
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
echo === Uretim derlemesi (test veritabani ile)
for /f "tokens=1,* delims==" %%A in ('findstr /b "TEST_DATABASE_URL" .env') do set "DATABASE_URL=%%~B"
set NEXT_DIST_DIR=.next-prod
call npx next build
echo BUILD_KODU=%errorlevel%
echo === Performans olcumu
call node scripts\perf-check.mjs
echo PERF_KODU=%errorlevel%
endlocal
exit /b 0
