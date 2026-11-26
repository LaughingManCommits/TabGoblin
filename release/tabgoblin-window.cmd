@echo off
rem Opens the TabGoblin server's window, and starts the server first if none runs. Made to be
rem double-clicked: it is "tabgoblin.cmd --panel". The server is a process of its own, so this
rem console closes by itself; it stays open only when the window could not be opened, so that
rem what was said about it can be read. Further options can follow, such as --port.
"%~dp0runtime\bin\java.exe" -jar "%~dp0browser-context-mcp.jar" --panel %*
if errorlevel 1 pause
