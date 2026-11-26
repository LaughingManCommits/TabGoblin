@echo off
rem Prints the pairing token for the extension's popup, and the server's first port. Made to be
rem double-clicked: it is "tabgoblin.cmd --show-token", and waits for a key so that the token
rem can be read and copied. It starts no server and no window. The token is a secret: close this
rem console when it is copied. The server's window copies it without showing it.
"%~dp0runtime\bin\java.exe" -jar "%~dp0browser-context-mcp.jar" --show-token %*
pause
