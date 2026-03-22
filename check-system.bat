@echo off
echo.
echo ===============================================================================
echo  HAZY NOVEL WRITER - DIAGNOSTIC TOOL
echo ===============================================================================
echo.

echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo Please download and install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
) else (
    echo [OK] Node.js is installed:
    node --version
)
echo.

echo [2/5] Checking if backend dependencies are installed...
if exist "backend\node_modules" (
    echo [OK] Dependencies are installed
) else (
    echo [WARNING] Dependencies not found. Installing now...
    cd backend
    call npm install
    cd ..
)
echo.

echo [3/5] Checking configuration file...
if exist "config\hazy-config.json" (
    echo [OK] Configuration file exists
) else (
    echo [ERROR] Configuration file missing!
    echo Please restore config\hazy-config.json
    pause
    exit /b 1
)
echo.

echo [4/5] Checking if Ollama is running (for local models)...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Ollama is running on port 11434
) else (
    echo [WARNING] Ollama is not running or not installed
    echo If you want to use local models:
    echo   1. Install Ollama from https://ollama.com
    echo   2. Run: ollama serve
    echo   3. Run: ollama pull llama3.2
    echo.
    echo Alternatively, you can use cloud providers (Claude, GPT-4, etc.)
    echo by adding your API key to config\hazy-config.json
)
echo.

echo [5/5] Checking if port 8080 is available...
netstat -an | find ":8080" | find "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port 8080 is already in use
    echo Either:
    echo   - Stop the other application using port 8080
    echo   - Or the Hazy server is already running (check your browser)
) else (
    echo [OK] Port 8080 is available
)
echo.

echo ===============================================================================
echo  DIAGNOSTIC COMPLETE
echo ===============================================================================
echo.
echo NEXT STEPS:
echo   1. If all checks passed: run start.bat to start the server
echo   2. If errors found: fix them using the instructions above
echo   3. Then open: http://localhost:8080/novel-writer.html
echo.
echo ===============================================================================
pause
