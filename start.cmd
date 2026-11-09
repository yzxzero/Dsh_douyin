@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0" || exit /b 1
title 大肥鱼 · 直播页服务

set "DFY_NODE="
where.exe node.exe >nul 2>&1 && set "DFY_NODE=node.exe"
if not defined DFY_NODE if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  set "DFY_NODE=node.exe"
)
if not defined DFY_NODE (
  rem 从桌面双击时，PATH 可能没有 Codex 自带的 Node.js。
  for /f "delims=" %%I in ('powershell.exe -NoProfile -Command "foreach ($pkg in (Get-AppxPackage 'OpenAI.CodexPrimaryRuntime*')) { $node = Join-Path $pkg.InstallLocation 'dependencies\node\bin\node.exe'; if (Test-Path -LiteralPath $node) { $node; break } }"') do set "DFY_NODE=%%I"
)
if not defined DFY_NODE (
  echo   找不到 Node.js。请安装 Node.js 18 或更高版本，再双击 start.cmd。
  goto :failed
)
"%DFY_NODE%" -e "process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)" >nul 2>&1
if errorlevel 1 (
  echo   无法运行 Node.js 18 或更高版本。请检查 Node.js 安装。
  goto :failed
)

if not exist "node_modules\ws\package.json" goto :install
if not exist "node_modules\protobufjs\package.json" goto :install
goto :start

:install
where.exe npm.cmd >nul 2>&1
if errorlevel 1 (
  echo   项目依赖不完整，且找不到 npm。请安装带 npm 的 Node.js，再双击 start.cmd。
  goto :failed
)
echo   正在安装项目依赖...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto :failed

:start
echo.
echo   正在启动大肥鱼直播页服务，访问地址见下方。
echo.
"%DFY_NODE%" server.mjs
set "DFY_EXIT=%ERRORLEVEL%"
echo.
echo   服务已退出，退出码 %DFY_EXIT%。如有报错请查看上方信息。
pause
exit /b %DFY_EXIT%

:failed
pause
exit /b 1
