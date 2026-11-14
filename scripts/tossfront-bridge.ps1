# 토스 프론트(USB로 연결된 LineageOS 기기)용 PC 다리(2026-11-15).
# 하는 일: JARVIS 서버(127.0.0.1:4780, HTTPS)를 켜 두고, 기기에 `adb reverse tcp:4780 tcp:4780`을 15초마다 다시 건다.
# 그래서 기기 앱은 https://127.0.0.1:4780 으로 PC에 붙는다. 와이파이 공개·방화벽 열기가 필요 없다(USB만).
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tossfront-bridge.ps1 -Adb <adb.exe 경로> -Serial <기기 일련번호>
# 로그인할 때 자동으로: 시작프로그램 폴더에 이 명령을 부르는 .cmd를 둔다. 끄기: 이 PowerShell과 node(src/main.js)를 끝내고 .cmd를 지운다.
param(
  [string]$Adb = 'adb',
  [string]$Serial = '',
  [int]$Port = 4780
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$target = if ($Serial) { @('-s', $Serial) } else { @() }
while ($true) {
  $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*src/main.js*' }
  if (-not $running) {
    Start-Process -FilePath node -ArgumentList 'src/main.js', '--https', '--port', "$Port" -WorkingDirectory $root `
      -RedirectStandardOutput (Join-Path $logs 'server.out.txt') -RedirectStandardError (Join-Path $logs 'server.err.txt') -WindowStyle Hidden
  }
  & $Adb @target reverse "tcp:$Port" "tcp:$Port" 2>$null | Out-Null
  Start-Sleep -Seconds 15
}
