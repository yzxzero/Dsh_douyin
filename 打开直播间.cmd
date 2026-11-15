@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Live room window: no address bar, autoplay allowed, dedicated Chrome profile.
rem   --autoplay-policy=no-user-gesture-required   play audio without a click
rem   --app=...                                    no tab bar / address bar, ready for OBS or a 2nd screen
rem   --user-data-dir                              separate profile, normal Chrome untouched
rem   --disable-accelerated-video-decode           the character video is webm and OBS window capture
rem                                                misses the hardware decoded layer, keep it in software
rem   --disable-features=CalculateNativeWinOcclusion        keep rendering while the window is covered
rem   --disable-backgrounding-occluded-windows               do not throttle when occluded
rem   --disable-renderer-backgrounding                       same, keep the page at full frame rate
rem
rem Keep every line plain ASCII. cmd.exe misparses long non-ASCII lines in .cmd files
rem and silently skips the start command, which is why the window stopped opening.

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome not found. Install Chrome, or edit CHROME in this file.
  pause
  exit /b 1
)

start "" "%CHROME%" --autoplay-policy=no-user-gesture-required --disable-accelerated-video-decode --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --app=http://127.0.0.1:8787/?auto=1 --window-size=1920,1080 --window-position=0,0 --user-data-dir="%~dp0data\chrome-live" --no-first-run --no-default-browser-check
