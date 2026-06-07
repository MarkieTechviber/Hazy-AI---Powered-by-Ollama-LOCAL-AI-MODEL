@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo Python was not found. Install Python 3 from https://python.org
    pause
    exit /b 1
)

python -c "import tkinter, PIL, psutil, pystray" >nul 2>&1
if errorlevel 1 (
    echo Installing Hazy Controller dependencies...
    python -m pip install -r controller-requirements.txt
    if errorlevel 1 (
        echo.
        echo Could not install the controller dependencies.
        pause
        exit /b 1
    )
)

where node >nul 2>&1
if errorlevel 1 (
    python -c "import fastapi, uvicorn, httpx, openai" >nul 2>&1
    if errorlevel 1 (
        echo Installing Python backend dependencies...
        python -m pip install -r backend\requirements.txt
        if errorlevel 1 (
            echo.
            echo Could not install the Python backend dependencies.
            pause
            exit /b 1
        )
    )
)

for /f "delims=" %%P in ('python -c "import os,sys; print(os.path.join(os.path.dirname(sys.executable), 'pythonw.exe'))"') do set "PYTHONW=%%P"
if not exist "%PYTHONW%" set "PYTHONW=python"

start "" "%PYTHONW%" "%~dp0hazy_controller.py" --start-and-open
endlocal
