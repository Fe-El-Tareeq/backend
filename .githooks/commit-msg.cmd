@echo off
setlocal

set "MESSAGE_FILE=%~1"
if not "%MESSAGE_FILE%"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0validate-commit.ps1" -CommitMessageFile "%MESSAGE_FILE%"
  if errorlevel 1 exit /b 1
)

exit /b 0
