@echo off
setlocal
cd /d "%~dp0"

set "DEST=%APPDATA%\com.kurocat.pet\skins"

if not exist "%APPDATA%\com.kurocat.pet" (
  echo [WARN] KuroCat app data folder not found.
  echo Run KuroCat at least once, close it, then run this again.
  echo Expected: %APPDATA%\com.kurocat.pet
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"

copy /Y "skins\*.png" "%DEST%\" >nul
if exist "skins\skin.json" copy /Y "skins\skin.json" "%DEST%\" >nul

echo.
echo Skin copied to:
echo   %DEST%
echo.
dir /b "%DEST%"
echo.
echo Fully exit KuroCat from the tray icon, then start it again.
pause
