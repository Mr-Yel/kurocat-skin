@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo  KuroCat custom-skin build installer
echo ============================================
echo.

echo [1/4] Closing running KuroCat...
taskkill /IM KuroCat.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] Installing custom build silently...
start /wait "" "KuroCat-custom-skin-setup.exe" /S
timeout /t 4 /nobreak >nul

echo [3/4] Locating installed exe...
set "TARGET="
if exist "F:\my-project\pet\KuroCat\KuroCat.exe" set "TARGET=F:\my-project\pet\KuroCat\KuroCat.exe"
if not defined TARGET if exist "%LOCALAPPDATA%\Programs\KuroCat\KuroCat.exe" set "TARGET=%LOCALAPPDATA%\Programs\KuroCat\KuroCat.exe"
if not defined TARGET if exist "%APPDATA%\..\Local\Programs\KuroCat\KuroCat.exe" set "TARGET=%APPDATA%\..\Local\Programs\KuroCat\KuroCat.exe"

if not defined TARGET (
  echo   [FAIL] KuroCat.exe not found. Silent install may have been blocked.
  echo   Please run KuroCat-custom-skin-setup.exe manually and click Next.
  pause
  exit /b 1
)

for %%A in ("%TARGET%") do set "SIZE=%%~zA"
echo   path = %TARGET%
echo   size = %SIZE% bytes
echo   official build = 5234176 bytes

if "%SIZE%"=="5234176" (
  echo.
  echo   [FAIL] This is still the OFFICIAL build - install did not replace it.
  echo   Run KuroCat-custom-skin-setup.exe manually.
  pause
  exit /b 1
)

echo   [OK] custom build in place.
echo.

echo [4/4] Skin files check...
if exist "%APPDATA%\kuro-cat-pet\skins\idle.png" (
  echo   idle.png found
) else if exist "%APPDATA%\com.kurocat.pet\skins\idle.png" (
  echo   idle.png found ^(legacy dir^)
) else (
  echo   [WARN] no idle.png. Run install-skin.bat first.
)

echo.
echo Starting KuroCat...
start "" "%TARGET%"
echo.
echo Expect an orange-hair chibi on the desktop, not the fish.
echo If it is still the fish: press F12 and send the [KuroCat] console lines.
pause
