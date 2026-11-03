@echo off
call scripts\ortam.cmd
call node scripts\iyzico-kontrol.mjs
echo KODU=%errorlevel%
exit /b 0
