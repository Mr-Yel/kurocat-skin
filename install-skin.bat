@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem KuroCat's Rust side hardcodes %APPDATA%\kuro-cat-pet (src-tauri/src/config.rs),
rem while Tauri's $APPDATA resolves to the identifier folder %APPDATA%\com.kurocat.pet.
rem We write to BOTH so the asset-protocol scope matches whichever path the app reads.
rem
rem Layout:
rem   skins\idle.png ...          -> one character (root)
rem   skins\mychar\idle.png ...   -> one more character per sub-folder (use ASCII names)
rem characters.json is regenerated from whatever is actually present.

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
  pause
  exit /b 1
)

echo.
echo --------------------------------------------
echo Installed characters:
type "%APPDATA%\kuro-cat-pet\skins\characters.json" 2>nul
echo.
echo --------------------------------------------
echo.
echo 1. Fully exit KuroCat from the tray icon.
echo 2. Start KuroCat again.
echo 3. Open the menu - each character gets its own entry in the appearance list.
echo.
pause
exit /b 0

:install
set "DEST=%~1\skins"
if not exist "!DEST!" mkdir "!DEST!"
if exist "skins\idle.png" (
  copy /Y "skins\*.png" "!DEST!\" >nul
  if exist "skins\skin.json" copy /Y "skins\skin.json" "!DEST!\" >nul
)
for /d %%D in ("skins\*") do (
  if exist "%%D\idle.png" (
    if not exist "!DEST!\%%~nxD" mkdir "!DEST!\%%~nxD"
    copy /Y "%%D\*.png" "!DEST!\%%~nxD\" >nul
    if exist "%%D\skin.json" copy /Y "%%D\skin.json" "!DEST!\%%~nxD\" >nul
  )
)
call :manifest "!DEST!"
echo [OK] !DEST!
exit /b 0

:manifest
set "DEST=%~1"
set "MJ=%DEST%\characters.json"
set "FIRST=1"
>"%MJ%" echo {"characters":[
if exist "%DEST%\idle.png" (
  >>"%MJ%" echo {"dir":""}
  set "FIRST=0"
)
for /d %%D in ("%DEST%\*") do (
  if exist "%%D\idle.png" (
    if "!FIRST!"=="0" (
      >>"%MJ%" echo ,
    )
    >>"%MJ%" echo {"dir":"%%~nxD"}
    set "FIRST=0"
  )
)
>>"%MJ%" echo ]}
exit /b 0
