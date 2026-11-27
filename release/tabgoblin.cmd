@echo off
rem Starts the TabGoblin server on the Java that came with it. This command is for you: setup,
rem the server's window, the pairing token. An agent that uses MCP is told the Java and the jar
rem themselves, and setup prints the line for that; an agent without MCP runs this command with
rem a tool's name ("tabgoblin tools" lists them). Arguments with quotes in them are easier given
rem with --args-file than on this command line.
"%~dp0runtime\bin\java.exe" -jar "%~dp0tabgoblin.jar" %*
