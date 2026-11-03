@echo off
rem Ortak ortam: Node.js ve PostgreSQL araclarini PATH e ekler.
rem Onceki betiklerden kalmis test ayarlarini temizler (.env degerleri kullanilsin).
set "DATABASE_URL="
set "NEXT_DIST_DIR="
set "PATH=%CD%\.yerel\node;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files\PostgreSQL\18\bin;%PATH%"
for /d %%N in ("%CD%\.yerel\node-v*") do set "PATH=%%N;%PATH%"
set NEXT_TELEMETRY_DISABLED=1
set PRISMA_HIDE_UPDATE_MESSAGE=1
set NO_COLOR=1
set FORCE_COLOR=0
