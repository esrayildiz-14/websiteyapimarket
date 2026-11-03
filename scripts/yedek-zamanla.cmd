@echo off
REM Gunluk otomatik yedegi Windows Gorev Zamanlayicisina kaydeder (yonetici yetkisi gerekmez).
REM Bilgisayar o saatte kapaliysa, acildiginda ilk firsatta calisir (StartWhenAvailable).
REM Kullanim: scripts\yedek-zamanla.cmd [SS:DD]   (varsayilan 12:30)
set SAAT=%1
if "%SAAT%"=="" set SAAT=12:30
powershell -NoProfile -ExecutionPolicy Bypass -Command "$a = New-ScheduledTaskAction -Execute '%~dp0yedek-calistir.cmd'; $t = New-ScheduledTaskTrigger -Daily -At '%SAAT%'; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2); Register-ScheduledTask -TaskName 'OnerYapi-GunlukYedek' -Action $a -Trigger $t -Settings $s -Force | Out-Null; Write-Output 'ZAMANLANDI'"
