@echo off
setlocal
cd /d "%~dp0"

rem KuroCat stores its data under %APPDATA%\kuro-cat-pet (hardcoded in src-tauri/src/config.rs).
rem Older builds used %APPDATA%\com.kurocat.pet, so accept either.

set "BASE="
if exist "%APPDATA%\kuro-cat-pet" set "BASE=%APPDATA%\kuro-cat-pet"
if not defined BASE if exist "%APPDATA%\com.kurocat.pet" set "BASE=%APPDATA%\com.kurocat.pet"

if not defined BASE (
  echo [WARN] KuroCat data folder not found.
  echo.
  echo Start KuroCat once, quit it from the tray icon, then run this again.
  echo Looked for: %APPDATA%\kuro-cat-pet
  pause
  exit /b 1
)

set "DEST=%BASE%\skins"
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
