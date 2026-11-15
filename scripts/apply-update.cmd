@echo off
rem 토스 프론트 옆 PC(JARVIS 사본)에 새 코드 넣기(2026-11-15).
rem 사용: 이 파일과 jarvis-update.zip을 같은 폴더에 두고 더블클릭(또는 apply-update.cmd [JARVIS 폴더]).
rem 하는 일: 1) 꾸러미 해시 보여 주기  2) 켜져 있는 JARVIS 서버·USB 다리 끄기  3) 지금 코드 백업
rem         4) 새 코드 덮어쓰기(data·tools·logs·.env.local은 그대로)  5) USB 다리 다시 켜기(시작프로그램의 .cmd)
rem         6) 같은 폴더에 jarvis-debug.apk가 있으면 기기 앱 새 판 설치, 앱에 서버 저장, 지금 친구 다시 골라 새 그림 채우기(scripts\post-update.mjs)
rem 관리자 권한·방화벽·실행 정책 변경은 하지 않는다. 되돌리기: 백업 폴더 내용을 JARVIS 폴더에 다시 복사.
setlocal EnableExtensions
chcp 65001 >nul
set "ZIP=%~dp0jarvis-update.zip"
set "DEST=%USERPROFILE%\jarvis-hybrid"
if not "%~1"=="" set "DEST=%~1"
if not exist "%ZIP%" ( echo [중단] 꾸러미가 없음: %ZIP% & goto :fail )
if not exist "%DEST%\package.json" ( echo [중단] JARVIS 폴더가 아님: %DEST% & goto :fail )
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
set "TMPDIR=%TEMP%\jarvis-update-%STAMP%"
set "BACKUP=%DEST%-backup-%STAMP%"

echo [1/6] 꾸러미 SHA-256(전달받은 값과 같은지 확인)
certutil -hashfile "%ZIP%" SHA256 | findstr /v /c:"CertUtil" /c:"SHA256"

echo [2/6] JARVIS 서버·USB 다리 끄기
powershell -NoProfile -Command "$d = $env:DEST; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($d) -and ($_.CommandLine -match 'src[\\/]main\.js' -or $_.CommandLine -match 'tossfront-bridge\.ps1') } | ForEach-Object { Write-Output ('  끔: ' + $_.ProcessId + ' ' + $_.Name); Stop-Process -Id $_.ProcessId -Force }"

echo [3/6] 지금 코드 백업: %BACKUP%
robocopy "%DEST%" "%BACKUP%" /E /XD "%DEST%\data" "%DEST%\tools" "%DEST%\logs" "%DEST%\node_modules" "%DEST%\.git" /XF .env.local /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 ( echo [중단] 백업 실패 & goto :fail )

echo [4/6] 새 코드 넣기
mkdir "%TMPDIR%" >nul 2>&1
tar -xf "%ZIP%" -C "%TMPDIR%"
if errorlevel 1 ( echo [중단] 꾸러미 풀기 실패 & goto :fail )
if not exist "%TMPDIR%\package.json" ( echo [중단] 꾸러미 안에 package.json이 없음 & goto :fail )
robocopy "%TMPDIR%" "%DEST%" /E /XD data tools logs /XF .env.local /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 ( echo [중단] 복사 실패. 백업에서 되돌리세요: %BACKUP% & goto :fail )
rmdir /s /q "%TMPDIR%" >nul 2>&1

echo [5/6] USB 다리 다시 켜기
set "STARTED="
for %%F in ("%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\*.cmd") do (
  findstr /i "tossfront-bridge" "%%~F" >nul && ( start "" /min "%%~F" & set "STARTED=1" & echo   켬: %%~nxF )
)
if not defined STARTED echo   시작프로그램에서 다리 .cmd를 찾지 못함. 예전처럼 다리를 직접 켜 주세요.

echo [6/6] 기기 앱 새 판 설치·서버 저장·친구 그림 채우기
set "APK=%~dp0jarvis-debug.apk"
if exist "%APK%" ( node "%DEST%\scripts\post-update.mjs" --apk "%APK%" ) else ( node "%DEST%\scripts\post-update.mjs" )

echo.
echo 끝. 1분쯤 뒤 토스 기기 화면이 다시 연결돼요.
echo 되돌리기: %BACKUP% 내용을 %DEST%에 다시 복사.
pause
exit /b 0
:fail
pause
exit /b 1
