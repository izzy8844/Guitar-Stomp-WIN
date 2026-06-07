@echo off
REM ============================================================
REM Guitar AutoStomp — Windows Full Build Script
REM 
REM Prerequisites:
REM   - Node.js 20+ (with npm)
REM   - Python 3.13+ (with pip)
REM   - ffmpeg.exe and ffprobe.exe in backend/ directory
REM
REM This script will:
REM   1. Install Python dependencies
REM   2. Build Python backend with PyInstaller
REM   3. Install Node.js dependencies
REM   4. Build Next.js static export
REM   5. Package with electron-builder (NSIS installer)
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ====================================
echo  Guitar AutoStomp — Windows Build
echo ====================================
echo.

REM --- Check prerequisites ---
echo [1/6] Checking prerequisites...

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python not found. Please install Python 3.13+
    echo        https://www.python.org/downloads/
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js 20+
    echo        https://nodejs.org/
    exit /b 1
)

python --version
node --version
echo Prerequisites OK.
echo.

REM --- Install Python dependencies ---
echo [2/6] Installing Python dependencies...
cd backend
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    exit /b 1
)
pip install pyinstaller --quiet
if %errorlevel% neq 0 (
    echo ERROR: Failed to install PyInstaller
    exit /b 1
)
echo Python dependencies OK.
echo.

REM --- Check for ffmpeg ---
if not exist ffmpeg.exe (
    echo WARNING: ffmpeg.exe not found in backend/ directory.
    echo          Audio waveform extraction may not work.
    echo          Download from: https://github.com/BtbN/FFmpeg-Builds/releases
    echo.
)

REM --- Build backend with PyInstaller ---
echo [3/6] Building Python backend with PyInstaller...
if not exist mappings mkdir mappings
pyinstaller guitar-autostomp-backend.spec --noconfirm
if %errorlevel% neq 0 (
    echo ERROR: PyInstaller build failed
    cd ..
    exit /b 1
)

REM Copy to dist-backend
if not exist ..\dist-backend mkdir ..\dist-backend
if exist ..\dist-backend\guitar-autostomp-backend rmdir /s /q ..\dist-backend\guitar-autostomp-backend 2>nul
xcopy /E /I /Y dist\guitar-autostomp-backend ..\dist-backend\guitar-autostomp-backend >nul
echo Backend build OK.
cd ..
echo.

REM --- Install Node.js dependencies ---
echo [4/6] Installing Node.js dependencies...
call npm install --silent
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    exit /b 1
)
echo Node.js dependencies OK.
echo.

REM --- Build Next.js ---
echo [5/6] Building Next.js static export...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Next.js build failed
    exit /b 1
)
echo Next.js build OK.
echo.

REM --- Package with electron-builder ---
echo [6/6] Packaging with electron-builder (NSIS)...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo ERROR: electron-builder packaging failed
    exit /b 1
)
echo.

echo ====================================
echo  BUILD COMPLETE!
echo ====================================
echo.
echo Output: release\Guitar-AutoStomp-Setup-1.0.0.exe
echo.

endlocal
