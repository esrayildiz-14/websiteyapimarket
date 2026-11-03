@echo off
REM Gunluk yedek: Gorev Zamanlayici bu dosyayi calistirir. Ciktilar logs\yedek.log dosyasina eklenir.
cd /d "%~dp0.."
call scripts\ortam.cmd
if not exist logs mkdir logs
echo ==== %date% %time% >> logs\yedek.log
node scripts\yedek.mjs >> logs\yedek.log 2>&1
exit /b %errorlevel%
