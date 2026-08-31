@echo off
rem Kill whatever is listening on a TCP port, so a server can bind it.
rem Usage: scripts\free-port.cmd [PORT]   (default 8000). A free port is a no-op.
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=8000

for /f "tokens=5" %%a in ('netstat -ano -p TCP ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  echo port %PORT%: killing %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo port %PORT%: free
