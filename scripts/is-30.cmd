@echo off
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
call node scripts\yedek.mjs
if errorlevel 1 (echo YEDEK_ALINAMADI_DURDU & exit /b 0)
call npx tsx prisma\kategori-ek.ts
call npx tsx prisma\kategori-ek.ts --uygula
echo KATEGORI_KODU=%errorlevel%
call npm run typecheck
echo TYPECHECK_KODU=%errorlevel%
call npm run test:unit
echo UNIT_KODU=%errorlevel%
call npx playwright test --reporter=list
echo E2E_KODU=%errorlevel%
exit /b 0
