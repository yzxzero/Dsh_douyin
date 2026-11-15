@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Full screen borderless live view, for OBS display capture or the Douyin live companion.
rem The companion app still pushes the stream; this window only renders content, danmaku and scenes.
rem   --start-fullscreen          cover the whole screen with no chrome
rem   --disable-accelerated-video-decode        webm stays in software so window capture sees it
rem   --disable-features=CalculateNativeWinOcclusion  keep frames while covered
rem Keep every line plain ASCII: cmd.exe misparses long non-ASCII lines in .cmd files.

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome not found. Install Chrome, or edit CHROME in this file.
  pause
  exit /b 1
)

start "" "%CHROME%" --autoplay-policy=no-user-gesture-required --disable-accelerated-video-decode --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --start-fullscreen --app=http://127.0.0.1:8787/?auto=1 --window-size=1920,1080 --window-position=0,0 --user-data-dir="%~dp0data\chrome-live-fullscreen" --no-first-run --no-default-browser-check
