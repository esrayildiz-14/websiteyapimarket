@echo off
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
call npm run typecheck
echo TYPECHECK_KODU=%errorlevel%
call npx playwright test --reporter=list
echo E2E_KODU=%errorlevel%
exit /b 0
