@echo off
setlocal

set "CURRENT_BRANCH="
for /f "usebackq delims=" %%I in (`git branch --show-current 2^>nul`) do set "CURRENT_BRANCH=%%I"

if not "%CURRENT_BRANCH%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0validate-branch.ps1" -BranchName "%CURRENT_BRANCH%"
  if errorlevel 1 exit /b 1
)

exit /b 0
