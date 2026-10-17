@echo off
setlocal
cd /d "%~dp0\.."
echo === Serega V3 Windows build ===
where node >nul 2>nul || (echo Node.js 20+ is required. Install from https://nodejs.org/ & pause & exit /b 1)
node --version
npm --version
call npm install || (echo Dependency installation failed. Check your internet connection. & pause & exit /b 1)
call npm run check || (echo Syntax checks failed. & pause & exit /b 1)
call npm run dist:win || (echo Windows packaging failed. See the error above. & pause & exit /b 1)
echo.
echo Build complete. Installer is in the release folder.
pause
