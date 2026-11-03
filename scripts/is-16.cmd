@echo off
chcp 65001 >nul
call scripts\ortam.cmd
if exist prisma\migrations\20261102113618_envanter_sepet_odeme_adres rmdir /s /q prisma\migrations\20261102113618_envanter_sepet_odeme_adres
call npx prisma migrate dev --create-only --name envanter_sepet_odeme_adres
echo CREATE_KODU=%errorlevel%
for /d %%D in (prisma\migrations\*envanter_sepet_odeme_adres) do echo KLASOR=%%~nxD
exit /b 0
