@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (
  echo Node.js 22.13 or newer is required.
  exit /b 1
)
node scripts\doctor.cjs
