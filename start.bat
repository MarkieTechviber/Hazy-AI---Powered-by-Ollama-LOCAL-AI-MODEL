@echo off
title Hazy Local Companion
echo.
echo  ╔══════════════════════════════════════╗
echo  ║       Hazy Local Companion       ║
echo  ╚══════════════════════════════════════╝
echo.

REM ─── Check if Ollama is running ───
echo [1/3] Checking Ollama...
curl -s http://localhost:11434/api/tags > nul 2>&1
if %errorlevel% neq 0 (
    echo  ⚠  Ollama not detected. Attempting to start...
    start "" ollama serve
    timeout /t 3 /nobreak > nul
)

REM ─── Try Node.js first, then Python ───
echo [2/3] Starting server...

where node > nul 2>&1
if %errorlevel% == 0 (
    echo  ✓  Using Node.js backend
    cd backend
    start "Hazy Server" /min node server.js
    cd ..
    goto :open
)

where python > nul 2>&1
if %errorlevel% == 0 (
    echo  ✓  Using Python backend
    cd backend
    pip install -r requirements.txt -q
    start "Hazy Server" /min python server.py
    cd ..
    goto :open
)

echo  ❌  Neither Node.js nor Python found.
echo  Please install Node.js from https://nodejs.org
echo  or Python from https://python.org
pause
exit /b 1

:open
echo [3/3] Opening browser...
timeout /t 2 /nobreak > nul
start http://localhost:8080

echo.
echo  ✅  Hazy is running at http://localhost:8080
echo  Close this window or press Ctrl+C to stop.
echo.
pause
