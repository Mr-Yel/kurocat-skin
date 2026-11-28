@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem KuroCat's Rust side hardcodes %APPDATA%\kuro-cat-pet (src-tauri/src/config.rs),
rem while Tauri's $APPDATA resolves to the identifier folder %APPDATA%\com.kurocat.pet.
rem We write to BOTH so the asset-protocol scope matches whichever path the app reads.
rem
rem Layout:
rem   skins\idle.png ...          -> one legacy character (root)
rem   skins\character.json ...    -> one layered/multi-frame character (root)
rem   skins\mychar\...            -> one character per sub-folder (use ASCII names)
rem characters.json is regenerated from whatever is actually present.

echo ============================================
echo  KuroCat custom skin installer
echo ============================================
echo.

set "HAS_SOURCE=0"
if exist "skins\idle.png" set "HAS_SOURCE=1"
if exist "skins\character.json" set "HAS_SOURCE=1"
for /d %%D in ("skins\*") do (
  if exist "%%D\idle.png" set "HAS_SOURCE=1"
  if exist "%%D\character.json" set "HAS_SOURCE=1"
)
if "!HAS_SOURCE!"=="0" (
  echo [FAIL] No character found next to this script.
  echo Add a root or nested character folder with idle.png / character.json.
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
if exist "skins\idle.png" call :copyCharacter "skins" "!DEST!"
if not exist "skins\idle.png" if exist "skins\character.json" call :copyCharacter "skins" "!DEST!"
for /d %%D in ("skins\*") do (
  if exist "%%D\idle.png" call :copyCharacter "%%D" "!DEST!\%%~nxD"
  if not exist "%%D\idle.png" if exist "%%D\character.json" call :copyCharacter "%%D" "!DEST!\%%~nxD"
)
call :manifest "!DEST!"
echo [OK] !DEST!
exit /b 0

:copyCharacter
set "SRC=%~1"
set "CDEST=%~2"
if not exist "!CDEST!" mkdir "!CDEST!"
xcopy "!SRC!\*" "!CDEST!\" /E /I /Y /Q >nul
if exist "!SRC!\skin.json" copy /Y "!SRC!\skin.json" "!CDEST!\" >nul
if exist "!SRC!\character.json" copy /Y "!SRC!\character.json" "!CDEST!\" >nul
if exist "!SRC!\pack.json" copy /Y "!SRC!\pack.json" "!CDEST!\" >nul
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
if not exist "%DEST%\idle.png" if exist "%DEST%\character.json" (
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
  if not exist "%%D\idle.png" if exist "%%D\character.json" (
    if "!FIRST!"=="0" (
      >>"%MJ%" echo ,
    )
    >>"%MJ%" echo {"dir":"%%~nxD"}
    set "FIRST=0"
  )
)
>>"%MJ%" echo ]}
exit /b 0
