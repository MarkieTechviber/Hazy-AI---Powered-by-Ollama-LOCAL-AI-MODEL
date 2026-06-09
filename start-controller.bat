@echo off
setlocal EnableExtensions
cd /d "%~dp0"

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

if not defined BASE_PY (
    echo Python 3 was not found.
    echo Install Python 3 from https://python.org and make sure the Python launcher ^(py.exe^) is enabled.
    pause
    exit /b 1
)

set "CONTROLLER_VENV=%~dp0.venv-controller"
if not exist "%CONTROLLER_VENV%\Scripts\python.exe" (
    echo Creating Hazy Controller virtual environment...
    "%BASE_PY%" -m venv "%CONTROLLER_VENV%"
    if errorlevel 1 (
        echo.
        echo Could not create the Hazy Controller virtual environment.
        echo Selected Python: "%BASE_PY%"
        echo If this points to another app's venv, install normal Python 3 and rerun this file.
        pause
        exit /b 1
    )
)

set "PYTHON=%CONTROLLER_VENV%\Scripts\python.exe"
"%PYTHON%" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo Enabling pip inside the Hazy Controller virtual environment...
    "%PYTHON%" -m ensurepip --upgrade
    if errorlevel 1 (
        echo.
        echo This Python installation cannot provide pip.
        echo Selected Python: "%BASE_PY%"
        echo Install the official Python 3 build from https://python.org, then run this again.
        pause
        exit /b 1
    )
)

"%PYTHON%" -c "import tkinter, PIL, psutil, pystray" >nul 2>&1
if errorlevel 1 (
    echo Installing Hazy Controller dependencies...
    "%PYTHON%" -m pip install --disable-pip-version-check -r controller-requirements.txt
    if errorlevel 1 (
        echo.
        echo Could not install the controller dependencies.
        echo Try deleting "%CONTROLLER_VENV%" and running this file again.
        pause
        exit /b 1
    )
)

where node >nul 2>&1
if errorlevel 1 (
    "%PYTHON%" -c "import fastapi, uvicorn, httpx, openai" >nul 2>&1
    if errorlevel 1 (
        echo Installing Python backend dependencies...
        "%PYTHON%" -m pip install --disable-pip-version-check -r backend\requirements.txt
        if errorlevel 1 (
            echo.
            echo Could not install the Python backend dependencies.
            echo Try installing Node.js from https://nodejs.org, or check your internet connection and rerun this file.
            pause
            exit /b 1
        )
    )
)

set "PYTHONW=%CONTROLLER_VENV%\Scripts\pythonw.exe"
if not exist "%PYTHONW%" set "PYTHONW=%PYTHON%"

start "" "%PYTHONW%" "%~dp0hazy_controller.py" --start-and-open
endlocal
