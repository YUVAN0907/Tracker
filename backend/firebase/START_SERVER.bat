@echo off
REM Start Flask server in the backend/firebase directory
REM This handles Python PATH issues on Windows

cd /d "%~dp0\backend\firebase"

echo.
echo ========================================
echo Starting Flask Server...
echo ========================================
echo.
echo Server will run on: http://127.0.0.1:3002
echo.

REM Try python first
python firebase_server.py
if errorlevel 1 (
    echo Python command failed, trying python3...
    python3 firebase_server.py
    if errorlevel 1 (
        echo Both python and python3 failed.
        echo.
        echo Troubleshooting:
        echo 1. Make sure Python is installed
        echo 2. Add Python to your PATH
        echo 3. Or specify full path to python.exe
        echo.
        echo Example:
        echo   "C:\Program Files\Python311\python.exe" firebase_server.py
        echo.
        pause
    )
)
