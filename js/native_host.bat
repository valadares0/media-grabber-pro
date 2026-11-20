@echo off
set "NODE_EXE=node"
for /f "delims=" %%I in ('where node 2^>nul') do (
  set "NODE_EXE=%%I"
  goto :found_node
)
if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
:found_node
"%NODE_EXE%" "%~dp0native_host.js"
