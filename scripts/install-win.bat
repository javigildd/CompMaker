@echo off
REM ===========================================================================
REM  CompMaker - Windows dev install
REM  Creates a directory symlink (mklink /D) from the CEP extensions folder to
REM  this project, and enables PlayerDebugMode so edits show up live in AE.
REM
REM  RUN THIS SCRIPT AS ADMINISTRATOR (mklink requires elevation).
REM ===========================================================================
setlocal

set "EXT_ID=com.compmaker"
REM Project root = parent of this script's folder.
set "SRC=%~dp0.."
for %%I in ("%SRC%") do set "SRC=%%~fI"
set "DEST_DIR=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%DEST_DIR%\%EXT_ID%"

echo CompMaker - installing dev symlink
echo   source: %SRC%
echo   target: %DEST%

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

if exist "%DEST%" (
    echo   removing existing link/folder
    rmdir "%DEST%" 2>nul
)

mklink /D "%DEST%" "%SRC%"
if errorlevel 1 (
    echo ERROR: mklink failed. Re-run this script as Administrator.
    exit /b 1
)
echo   symlink created.

echo Enabling PlayerDebugMode (unsigned extensions)...
for %%V in (9 10 11 12) do (
    reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)
echo   done.

echo.
echo All set. Restart After Effects, then open:
echo   Window ^> Extensions ^> CompMaker
endlocal
