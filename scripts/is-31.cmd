@echo off
REM Yeni surumu yerel veritabanina uygular ve tum testleri calistirir.
REM Sira: veritabani yedegi -> prisma generate -> migration (yalniz ekleme) -> rol/yetki seed -> kategori eki -> testler -> gunluk yedek zamanlama
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
echo ===== 1 VERITABANI YEDEGI
call node scripts\yedek.mjs
if errorlevel 1 (echo YEDEK_ALINAMADI_DURDU & exit /b 0)
echo ===== 2 PRISMA GENERATE
call npx prisma generate
echo GENERATE_KODU=%errorlevel%
echo ===== 3 MIGRATION
call npx prisma migrate deploy
echo MIGRATE_KODU=%errorlevel%
if errorlevel 1 (echo MIGRATION_HATASI_DURDU & exit /b 0)
echo ===== 4 SEED (roller ve yetkiler; mevcut veri degismez)
call npx prisma db seed
echo SEED_KODU=%errorlevel%
echo ===== 5 KATEGORI EKI
call npx tsx prisma\kategori-ek.ts --uygula
echo KATEGORI_KODU=%errorlevel%
echo ===== 6 TIP KONTROLU
call npm run typecheck
echo TYPECHECK_KODU=%errorlevel%
echo ===== 7 BIRIM TESTLERI
call npm run test:unit
echo UNIT_KODU=%errorlevel%
echo ===== 8 TARAYICI TESTLERI
call npx playwright test --reporter=list
echo E2E_KODU=%errorlevel%
echo ===== 9 ENTEGRASYON TESTLERI (test veritabani)
call npm run test:integration
echo INTEGRATION_KODU=%errorlevel%
echo ===== 10 GUNLUK YEDEK ZAMANLAMA (12:30)
call scripts\yedek-zamanla.cmd 12:30
echo ZAMANLAMA_KODU=%errorlevel%
exit /b 0
