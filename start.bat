@echo off
setlocal EnableExtensions
title Hazy Local Companion
echo.
echo  ╔══════════════════════════════════════╗
echo  ║       Hazy Local Companion           ║
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

set "BASE_PY="
for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
if not defined BASE_PY if defined LOCALAPPDATA (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%LOCALAPPDATA%\Programs\Python\Python*\python.exe" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
)
if not defined BASE_PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%ProgramFiles%\Python*\python.exe" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
)
if not defined BASE_PY (
    for /f "delims=" %%P in ('dir /b /s /a:-d "%ProgramFiles(x86)%\Python*\python.exe" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
)
if not defined BASE_PY (
    for /f "delims=" %%P in ('python -c "import sys; print(sys.executable)" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
)
if not defined BASE_PY (
    for /f "delims=" %%P in ('python3 -c "import sys; print(sys.executable)" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
)

if defined BASE_PY (
    echo  ✓  Using Python backend
    set "BACKEND_VENV=%~dp0.venv-backend"
    if not exist "%BACKEND_VENV%\Scripts\python.exe" (
        echo  Creating Hazy backend virtual environment...
        "%BASE_PY%" -m venv "%BACKEND_VENV%"
        if errorlevel 1 goto :python_error
    )
    set "PYTHON=%BACKEND_VENV%\Scripts\python.exe"
    "%PYTHON%" -m pip --version >nul 2>&1
    if errorlevel 1 (
        echo  Enabling pip inside the Hazy backend virtual environment...
        "%PYTHON%" -m ensurepip --upgrade
        if errorlevel 1 goto :python_error
    )
    "%PYTHON%" -c "import fastapi, uvicorn, httpx, openai" >nul 2>&1
    if errorlevel 1 (
        echo  Installing Python backend dependencies...
        "%PYTHON%" -m pip install --disable-pip-version-check -r backend\requirements.txt -q
        if errorlevel 1 goto :python_error
    )
    cd backend
    start "Hazy Server" /min "%PYTHON%" server.py
    cd ..
    goto :open
)

echo  ❌  Neither Node.js nor a usable Python 3 installation was found.
echo  Please install Node.js from https://nodejs.org
echo  or Python from https://python.org
pause
exit /b 1

:python_error
echo.
echo  ❌  Python setup failed.
echo  Selected Python: "%BASE_PY%"
echo  If this points to another app's virtual environment, install the official Python 3 build and rerun this file.
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
endlocal
