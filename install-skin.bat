@echo off
setlocal
cd /d "%~dp0"

rem KuroCat's Rust side hardcodes %APPDATA%\kuro-cat-pet (src-tauri/src/config.rs),
rem while Tauri's $APPDATA resolves to the identifier folder %APPDATA%\com.kurocat.pet.
rem We write to BOTH so the asset-protocol scope matches whichever path the app reads.

echo ============================================
echo  KuroCat custom skin installer
echo ============================================
echo.

if not exist "skins\idle.png" (
  echo [FAIL] skins\idle.png not found next to this script.
  pause
  exit /b 1
)

set "FOUND=0"

if exist "%APPDATA%\kuro-cat-pet" (
  call :install "%APPDATA%\kuro-cat-pet"
  set "FOUND=1"
)

if exist "%APPDATA%\com.kurocat.pet" (
  call :install "%APPDATA%\com.kurocat.pet"
  set "FOUND=1"
)

if "%FOUND%"=="0" (
  echo [WARN] No KuroCat data folder found.
  echo.
  echo Start KuroCat once, quit it from the tray icon, then run this again.
  echo Looked for:
  echo   %APPDATA%\kuro-cat-pet
  echo   %APPDATA%\com.kurocat.pet
  pause
  exit /b 1
)

echo.
echo --------------------------------------------
echo Installed files:
dir /b "%APPDATA%\kuro-cat-pet\skins" 2>nul
echo --------------------------------------------
echo.
echo 1. Fully exit KuroCat from the tray icon.
echo 2. Start KuroCat again.
echo 3. The sprite character should appear.
echo.
pause
exit /b 0

:install
set "DEST=%~1\skins"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "skins\*.png" "%DEST%\" >nul
if exist "skins\skin.json" copy /Y "skins\skin.json" "%DEST%\" >nul
echo [OK] %DEST%
exit /b 0
