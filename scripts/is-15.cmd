@echo off
chcp 65001 >nul
call scripts\ortam.cmd
pg_ctl -D "%CD%\.yerel\pgdata" status >nul 2>&1
if errorlevel 1 pg_ctl -D "%CD%\.yerel\pgdata" -l "%CD%\.yerel\postgres.log" -o "-p 5432" -w start
echo === Sema dogrulama
call npx prisma validate
echo VALIDATE_KODU=%errorlevel%
echo === Migration taslagi (uygulanmaz)
call npx prisma migrate dev --create-only --name envanter_sepet_odeme_adres
echo CREATE_KODU=%errorlevel%
dir /b prisma\migrations
echo === Mevcut urun sayisi
node -e "require('dotenv/config');const pg=require('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query('select count(*)::int n, coalesce(sum(stock),0)::int s from products')).then(r=>{console.log('URUN='+r.rows[0].n+' TOPLAM_STOK='+r.rows[0].s);return c.end()})"
exit /b 0
