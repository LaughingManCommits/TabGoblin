@echo off
rem Starts the TabGoblin server on the Java that came with it. This command is for you: setup,
rem the server's window, the pairing token. Your agent is told the Java and the jar themselves,
rem and setup prints the line for that.
"%~dp0runtime\bin\java.exe" -jar "%~dp0browser-context-mcp.jar" %*
