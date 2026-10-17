$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host '=== Serega V3 Windows build ===' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 20+ не найден. Установи Node.js LTS с https://nodejs.org/ и запусти скрипт снова.'
}
node --version
npm --version
npm install
npm run check
npm run dist:win
Write-Host ''
Write-Host 'Готово. Установщик находится в папке release.' -ForegroundColor Green
