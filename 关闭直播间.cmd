@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0" || exit /b 1
title 大肥鱼 · 关闭直播间
set "DFY_NODE="
where.exe node.exe >nul 2>&1 && set "DFY_NODE=node.exe"
if not defined DFY_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "DFY_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined DFY_NODE (
  for /f "delims=" %%I in ('powershell.exe -NoProfile -Command "foreach ($pkg in (Get-AppxPackage 'OpenAI.CodexPrimaryRuntime*')) { $node = Join-Path $pkg.InstallLocation 'dependencies\node\bin\node.exe'; if (Test-Path -LiteralPath $node) { $node; break } }"') do set "DFY_NODE=%%I"
)
if not defined DFY_NODE (
  echo 找不到 Node.js，请检查直播服务所用的 Node.js 安装。
  pause
  exit /b 1
)
"%DFY_NODE%" tools\stop-live.mjs %*
if errorlevel 1 (
  pause
  exit /b 1
)
exit /b 0
