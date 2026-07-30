@echo off
cd /d "%~dp0"
echo Starting local server for the Al-Drrass family site...
echo.
echo Once it starts, open this in your browser:
echo   http://localhost:8000/index.html
echo.
echo Press Ctrl+C to stop the server when you're done.
echo.
start "" http://localhost:8000/index.html
python -m http.server 8000
