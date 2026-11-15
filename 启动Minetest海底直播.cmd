@echo off
chcp 65001 >nul
cd /d "%~dp0"
node tools/start-luanti.mjs
if errorlevel 1 pause
