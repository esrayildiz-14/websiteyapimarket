@echo off
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
echo === npm install (exceljs)
call npm install --no-audit --no-fund --loglevel=warn
echo NPM_KODU=%errorlevel%
call npx prisma generate
echo === Seed (icerik taslaklari, SSS, kategori SEO ve gorselleri)
call npm run db:seed
echo SEED_KODU=%errorlevel%
echo === Tip kontrolu
call npm run typecheck
echo TYPECHECK_KODU=%errorlevel%
echo === Birim testleri
call npm run test:unit
echo UNIT_KODU=%errorlevel%
echo === Uctan uca testler
call npx playwright test --reporter=list
echo E2E_KODU=%errorlevel%
exit /b 0
