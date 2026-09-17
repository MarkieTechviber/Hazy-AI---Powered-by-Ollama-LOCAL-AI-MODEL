@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22.13 or newer from https://nodejs.org then run npm ci --prefix backend
  exit /b 1
)
node scripts\start.cjs
exit /b %errorlevel%
