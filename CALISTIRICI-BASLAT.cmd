@echo off
chcp 65001 >nul
title Oner Yapi - komut calistirici (kapatmak icin bu pencereyi kapatin)
cd /d "%~dp0"
if not exist komutlar mkdir komutlar
if not exist komutlar\tamamlanan mkdir komutlar\tamamlanan
if not exist logs mkdir logs
echo.
echo  Oner Yapi Market - komut calistirici
echo  -------------------------------------
echo  Bu pencere acik kaldigi surece, Claude'un bu proje klasorundeki
echo  "komutlar" klasorune biraktigi .cmd dosyalari sirayla calistirilir.
echo  Ciktilar "logs" klasorune yazilir. Durdurmak icin pencereyi kapatin.
echo.
:dongu
for %%F in ("komutlar\*.cmd") do (
  echo [%time%] Calisiyor: %%~nxF
  call "%%F" > "logs\%%~nF.log" 2>&1
  echo CIKIS_KODU=%errorlevel%>> "logs\%%~nF.log"
  move /y "%%F" "komutlar\tamamlanan\" >nul
  echo [%time%] Bitti: %%~nxF
)
timeout /t 2 /nobreak >nul
goto dongu
