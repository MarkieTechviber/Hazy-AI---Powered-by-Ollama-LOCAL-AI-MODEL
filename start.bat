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

REM ─── Find Python ───
REM KOKORO_PY: Python 3.10-3.12 for Kokoro TTS  /  BASE_PY: any Python for backend
set "KOKORO_PY="
set "BASE_PY="

REM --- Method 1: uv python find (best — works even with spaces in username path) ---
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

REM --- Method 2: Windows py launcher (only sees officially installed Pythons) ---
if not defined KOKORO_PY (
    for %%V in (3.12 3.11 3.10) do (
        if not defined KOKORO_PY (
            for /f "usebackq delims=" %%P in (`py -%%V -c "import sys; print(sys.executable)" 2^>nul`) do (
                if exist "%%P" set "KOKORO_PY=%%P"
            )
        )
    )
)

REM --- Method 3: Standard Windows install folders (Python310/311/312) ---
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

REM --- BASE_PY: reuse KOKORO_PY if found, else fall back to any available Python ---
if defined KOKORO_PY (
    set "BASE_PY=%KOKORO_PY%"
) else (
    for /f "usebackq delims=" %%P in (`python -c "import sys; print(sys.executable)" 2^>nul`) do if not defined BASE_PY set "BASE_PY=%%P"
    if not defined BASE_PY (
        for /f "usebackq delims=" %%P in (`py -3 -c "import sys; print(sys.executable)" 2^>nul`) do if not defined BASE_PY set "BASE_PY=%%P"
    )
)


REM ─── Run Python for Hazy Backend ───
echo [2/3] Starting server...

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
    goto :kokoro
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

:kokoro
REM ─── Start Kokoro TTS ───
echo [3/4] Starting Kokoro TTS...
if not defined KOKORO_PY (
    echo  ⚠  No Python 3.10-3.12 found for Kokoro. Skipping TTS.
    echo     Install Python 3.11 or 3.12 from https://python.org to enable Kokoro TTS.
    goto :open
)
set "KOKORO_VENV=%~dp0.venv-kokoro"

REM If the existing venv is Python 3.13+, delete and recreate it with KOKORO_PY
if exist "%KOKORO_VENV%\Scripts\python.exe" (
    "%KOKORO_VENV%\Scripts\python.exe" -c "import sys; exit(0 if sys.version_info < (3,13) else 1)" >nul 2>&1
    if errorlevel 1 (
        echo  ⚠  Existing Kokoro venv has incompatible Python version. Rebuilding...
        rmdir /s /q "%KOKORO_VENV%"
    )
)

if not exist "%KOKORO_VENV%\Scripts\python.exe" (
    echo  Creating Kokoro virtual environment with %KOKORO_PY%...
    "%KOKORO_PY%" -m venv "%KOKORO_VENV%"
    if errorlevel 1 (
        echo  ❌  Failed to create Kokoro virtual environment. Skipping TTS.
        goto :open
    )
)
set "KPY=%KOKORO_VENV%\Scripts\python.exe"
REM Bootstrap pip if missing (uv-created venvs don't include pip by default)
"%KPY%" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo  Bootstrapping pip in Kokoro venv...
    "%KPY%" -m ensurepip --upgrade >nul 2>&1
)
"%KPY%" -m pip install --upgrade pip -q 2>nul

REM Check if all packages are already installed and verify CUDA if NVIDIA GPU exists
where nvidia-smi >nul 2>&1
if %errorlevel% equ 0 (
    "%KPY%" -c "import fastapi, uvicorn, kokoro, soundfile, torch; assert torch.cuda.is_available()" >nul 2>&1
) else (
    "%KPY%" -c "import fastapi, uvicorn, kokoro, soundfile, torch" >nul 2>&1
)
if errorlevel 1 (
    echo  Installing Kokoro dependencies — this may take several minutes the first time...
    where nvidia-smi >nul 2>&1
    if %errorlevel% equ 0 (
        echo  (NVIDIA GPU detected. Installing PyTorch with CUDA support...)
        "%KPY%" -m pip install --disable-pip-version-check torch --index-url https://download.pytorch.org/whl/cu121 2>&1
    )
    echo  (Installing other requirements...)
    "%KPY%" -m pip install --disable-pip-version-check fastapi uvicorn soundfile transformers numpy kokoro 2>&1
    if errorlevel 1 (
        echo.
        echo  ❌  Failed to install Kokoro dependencies. Skipping TTS.
        echo     You can try running manually: %KPY% -m pip install kokoro torch soundfile
        goto :open
    )
)
echo  ✓  Kokoro TTS ready. Starting server on port 8880...
start "Kokoro TTS" /min "%KPY%" "%~dp0kokoro_server.py"

:open
echo [4/4] Opening browser...
timeout /t 2 /nobreak > nul
start http://localhost:8080

echo.
echo  ✅  Hazy is running at http://localhost:8080
echo  Close this window or press Ctrl+C to stop.
echo.
pause
endlocal
