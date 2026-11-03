@echo off
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
echo === 4. Prisma client
call npx prisma generate
echo GENERATE_KODU=%errorlevel%
echo === 5. Migration
call npx prisma migrate dev --name init
echo MIGRATE_KODU=%errorlevel%
echo === 6. Seed
call npm run db:seed
echo SEED_KODU=%errorlevel%
echo === 7. Tip kontrolu
call npm run typecheck
echo TYPECHECK_KODU=%errorlevel%
echo === 8. Birim testleri
call npm run test:unit
echo UNIT_KODU=%errorlevel%
exit /b 0
