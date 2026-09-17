@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Hazy Controller Setup

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     Hazy Desktop Controller Setup    ║
echo  ╚══════════════════════════════════════╝
echo.

REM ═══════════════════════════════════════════
REM  Step 1: Check / Start Ollama
REM ═══════════════════════════════════════════
echo [1/5] Checking Ollama...
curl -s http://localhost:11434/api/tags > nul 2>&1
if %errorlevel% neq 0 (
    echo  ⚠  Ollama not detected. Attempting to start...
    where ollama > nul 2>&1
    if %errorlevel% == 0 (
        start "" ollama serve
        timeout /t 3 /nobreak > nul
        curl -s http://localhost:11434/api/tags > nul 2>&1
        if %errorlevel% == 0 (
            echo  ✓  Ollama started successfully
        ) else (
            echo  ⚠  Ollama may still be loading. The controller will retry.
        )
    ) else (
        echo  ⚠  Ollama not found on PATH. Install from https://ollama.com
        echo     The controller will show Ollama as stopped.
    )
) else (
    echo  ✓  Ollama is running
)

REM ═══════════════════════════════════════════
REM  Step 2: Find Python
REM ═══════════════════════════════════════════
echo [2/5] Finding Python...

REM --- KOKORO_PY: Python 3.10-3.12 for Kokoro TTS ---
set "KOKORO_PY="
set "BASE_PY="

REM Method 1: uv python find (works even with spaces in paths)
where uv >nul 2>&1
if %errorlevel% == 0 (
    for %%V in (3.12 3.11 3.10) do (
        if not defined KOKORO_PY (
            for /f "usebackq delims=" %%P in (`uv python find --system %%V 2^>nul`) do (
                if exist "%%P" set "KOKORO_PY=%%P"
            )
        )
    )
)

REM Method 2: Windows py launcher
if not defined KOKORO_PY (
    for %%V in (3.12 3.11 3.10) do (
        if not defined KOKORO_PY (
            for /f "usebackq delims=" %%P in (`py -%%V -c "import sys; print(sys.executable)" 2^>nul`) do (
                if exist "%%P" set "KOKORO_PY=%%P"
            )
        )
    )
)

REM Method 3: Standard Windows install folders
if not defined KOKORO_PY if defined LOCALAPPDATA (
    for %%V in (312 311 310) do (
        if not defined KOKORO_PY (
            if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe" (
                set "KOKORO_PY=%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe"
            )
        )
    )
)
if not defined KOKORO_PY (
    for %%V in (312 311 310) do (
        if not defined KOKORO_PY (
            if exist "%ProgramFiles%\Python%%V\python.exe" set "KOKORO_PY=%ProgramFiles%\Python%%V\python.exe"
        )
    )
)

REM --- BASE_PY: reuse KOKORO_PY if found, else fall back to any Python 3 ---
if defined KOKORO_PY (
    set "BASE_PY=%KOKORO_PY%"
    echo  ✓  Kokoro-compatible Python found: %KOKORO_PY%
) else (
    for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
    if not defined BASE_PY (
        for /f "delims=" %%P in ('python -c "import sys; print(sys.executable)" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
    )
    if not defined BASE_PY (
        for /f "delims=" %%P in ('python3 -c "import sys; print(sys.executable)" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
    )
    if not defined BASE_PY if defined LOCALAPPDATA (
        for /f "delims=" %%P in ('dir /b /s /a:-d "%LOCALAPPDATA%\Programs\Python\Python*\python.exe" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
    )
    if not defined BASE_PY (
        for /f "delims=" %%P in ('dir /b /s /a:-d "%ProgramFiles%\Python*\python.exe" 2^>nul') do if not defined BASE_PY set "BASE_PY=%%P"
    )
)

if not defined BASE_PY (
    echo  ❌  Python 3 was not found.
    echo  Install Python 3 from https://python.org and make sure the Python launcher ^(py.exe^) is enabled.
    pause
    exit /b 1
)
echo  ✓  Base Python: %BASE_PY%

REM ═══════════════════════════════════════════
REM  Step 3: Controller venv + GUI dependencies
REM ═══════════════════════════════════════════
echo [3/5] Setting up Controller GUI...

set "CONTROLLER_VENV=%~dp0.venv-controller"
if not exist "%CONTROLLER_VENV%\Scripts\python.exe" (
    echo  Creating Controller virtual environment...
    "%BASE_PY%" -m venv "%CONTROLLER_VENV%"
    if errorlevel 1 (
        echo.
        echo  ❌  Could not create the Controller virtual environment.
        echo  Selected Python: "%BASE_PY%"
        echo  If this points to another app's venv, install normal Python 3 and rerun this file.
        pause
        exit /b 1
    )
)

set "PYTHON=%CONTROLLER_VENV%\Scripts\python.exe"
"%PYTHON%" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo  Enabling pip inside the Controller virtual environment...
    "%PYTHON%" -m ensurepip --upgrade
    if errorlevel 1 (
        echo.
        echo  ❌  This Python installation cannot provide pip.
        echo  Selected Python: "%BASE_PY%"
        echo  Install the official Python 3 build from https://python.org, then run this again.
        pause
        exit /b 1
    )
)

"%PYTHON%" -c "import tkinter, PIL, psutil, pystray" >nul 2>&1
if errorlevel 1 (
    echo  Installing Controller GUI dependencies...
    "%PYTHON%" -m pip install --disable-pip-version-check -r controller-requirements.txt -q
    if errorlevel 1 (
        echo.
        echo  ❌  Could not install controller dependencies.
        echo  Try deleting "%CONTROLLER_VENV%" and running this file again.
        pause
        exit /b 1
    )
)
echo  ✓  Controller GUI ready

REM ═══════════════════════════════════════════
REM  Step 4: Canonical Node backend
REM ═══════════════════════════════════════════
echo [4/5] Checking Node backend...
where node >nul 2>&1
if errorlevel 1 (
    echo  ❌  Node.js 22.13 or newer is required for the full Hazy backend.
    echo     Install Node.js, then run this launcher again.
    pause
    exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
    echo  ❌  Node.js 22.13 or newer is required. Current version:
    node --version
    pause
    exit /b 1
)
if not exist "%~dp0backend\node_modules\playwright\package.json" (
    echo  Installing the locked Node dependencies...
    call npm ci --prefix "%~dp0backend"
    if errorlevel 1 (
        echo  ❌  Could not install backend dependencies with npm ci.
        pause
        exit /b 1
    )
)
echo  ✓  Canonical Node backend ready

REM ═══════════════════════════════════════════
REM  Step 5: Optional Kokoro TTS
REM ═══════════════════════════════════════════
echo [5/5] Checking optional Kokoro TTS...
if exist "%~dp0.venv-kokoro\Scripts\python.exe" (
    "%~dp0.venv-kokoro\Scripts\python.exe" -c "import fastapi, uvicorn, kokoro, soundfile" >nul 2>&1
    if not errorlevel 1 (
        echo  ✓  Existing Kokoro environment is ready. Set HAZY_TTS=1 to start it.
        goto :launch
    )
)
echo  -  Kokoro is not configured. Text chat will work normally.
echo     To enable speech later, see README.md and requirements-kokoro.txt.

:launch
REM ═══════════════════════════════════════════
REM  Launch the Controller GUI
REM ═══════════════════════════════════════════
echo.
echo  ════════════════════════════════════════
echo   Launching Hazy Desktop Controller...
echo   The controller will start Ollama and Hazy.
echo   Kokoro starts only when HAZY_TTS=1 and is configured.
echo  ════════════════════════════════════════
echo.

set "PYTHONW=%CONTROLLER_VENV%\Scripts\pythonw.exe"
if not exist "%PYTHONW%" set "PYTHONW=%PYTHON%"

start "" "%PYTHONW%" "%~dp0hazy_controller.py" --start-and-open
endlocal
