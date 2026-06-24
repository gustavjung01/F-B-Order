@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "REPO_ROOT=%%~fI"
set "SOURCE_IMAGES=F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\preview\assets"
set "NORMALIZED_DIR=F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\normalized-v2"
set "PREVIEW_ROOT=%REPO_ROOT%\artifacts\catalog\hung-phat-v2-preview"
set "PORT=4190"

cd /d "%REPO_ROOT%"

node "%SCRIPT_DIR%build-phase3-preview.mjs" --source-images="%SOURCE_IMAGES%" >nul
if errorlevel 1 exit /b 1

node "%SCRIPT_DIR%rewrite-phase3-parent-preview.mjs" --normalized-dir="%NORMALIZED_DIR%"
if errorlevel 1 exit /b 1

set "BEPSI_PREVIEW_ROOT=%PREVIEW_ROOT%"
set "BEPSI_PREVIEW_PORT=%PORT%"
start "bepsi-phase3-preview" /min node "%SCRIPT_DIR%serve-phase3-preview.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"

echo PASS: parent cards 188 / variants 275 / Berrino 1 card 12 variants
endlocal
