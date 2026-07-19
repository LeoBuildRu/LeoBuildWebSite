@echo off
REM Запускает Chrome с включённым remote debugging для подключения парсера.
REM Использует отдельный профиль, чтобы не конфликтовать с обычным Chrome.

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

set "PROFILE=%LOCALAPPDATA%\ChromeCDPProfile"
if not exist "%PROFILE%" mkdir "%PROFILE%"

set "URL=https://xn--80az8a.xn--d1aqf.xn--p1ai/%D1%81%D0%B5%D1%80%D0%B2%D0%B8%D1%81%D1%8B/%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80/%D1%81%D0%BF%D0%B8%D1%81%D0%BE%D0%BA/69431?activeSort=price%2Casc&view=list&isSale=on"

"%CHROME%" --remote-debugging-port=9222 --user-data-dir="%PROFILE%" "%URL%"
