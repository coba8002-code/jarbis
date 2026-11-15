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
# ---- 토스 프론트 내장 마이크·스피커 믹서(es8316, card1) 켜기 (2026-11-15) ----
# 기기 오디오 HAL이 믹서 설정을 card0(HDMI)에만 걸어 es8316의 마이크·스피커 경로가 꺼진 채로 남는다.
# 부팅할 때마다(부팅 ID가 바뀌면) 잠깐 adb root로 아래 값을 넣고 바로 adb unroot 한다. 파티션은 건드리지 않는다(재부팅하면 사라짐).
$MixerCmds = @(
  # 마이크 쪽만 넣는다. 입력 선택(Differential Mux)과 스피커 쪽(DAC 스위치·헤드폰 볼륨)은 오디오 HAL이 녹음·재생 때마다 직접 다시 맞춘다(2026-11-15 확인).
  "tinymix -D 1 'Digital Mic Mux' 'dmic disable'",
  "tinymix -D 1 'Mic Boost Switch' 1",
  "tinymix -D 1 'ADC PGA Gain Volume' 10",
  "tinymix -D 1 'ADC Capture Volume' 192",
  "tinymix -D 1 'ALC Capture Switch' 1",
  # 13:05 비교(스피커 음성 녹음): 기본(목표 11·최대 20)은 쉬익 잡음이 -35dBFS로 커서, 목표 8·최대 14(잡음 -48dBFS)로 낮춘다
  "tinymix -D 1 'ALC Capture Target Volume' 8",
  "tinymix -D 1 'ALC Capture Max Volume' 14",
  "tinymix -D 1 'ALC Capture Noise Gate Switch' 0"
)
function Set-TossMixer([string]$AdbExe, [string[]]$Target) {
  & $AdbExe @Target root 2>$null | Out-Null
  Start-Sleep -Seconds 3
  & $AdbExe @Target wait-for-device 2>$null
  $id = (& $AdbExe @Target shell id 2>$null) -join ''
  if ($id -notlike 'uid=0*') { return $false }
  & $AdbExe @Target shell ($MixerCmds -join '; ') 2>$null | Out-Null
  $check = (& $AdbExe @Target shell "tinymix -D 1 'ALC Capture Switch'" 2>$null) -join ''
  & $AdbExe @Target unroot 2>$null | Out-Null
  Start-Sleep -Seconds 3
  & $AdbExe @Target wait-for-device 2>$null
  return ($check -match 'On')
}
$lastBoot = ''
$loop = 0
while ($true) {
  $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*src/main.js*' }
  if (-not $running) {
    Start-Process -FilePath node -ArgumentList 'src/main.js', '--https', '--port', "$Port" -WorkingDirectory $root `
      -RedirectStandardOutput (Join-Path $logs 'server.out.txt') -RedirectStandardError (Join-Path $logs 'server.err.txt') -WindowStyle Hidden
  }
  # 기기가 새로 부팅됐으면(부팅 ID가 바뀌면) 믹서를 다시 켠다. 실패하면 다음 바퀴에 다시 해 본다.
  $boot = (& $Adb @target shell cat /proc/sys/kernel/random/boot_id 2>$null) -join ''
  if ($boot -and $boot -ne $lastBoot) {
    if (Set-TossMixer $Adb $target) { $lastBoot = $boot }
  }
  & $Adb @target reverse "tcp:$Port" "tcp:$Port" 2>$null | Out-Null
  # 5분마다 앱 마이크·카메라 권한을 다시 켠다(‘이번만 허용’이 풀려 마이크가 0으로만 들어온 일이 있었음, 2026-11-15). 이미 켜져 있으면 아무 일 없음.
  if ($loop % 20 -eq 0) {
    & $Adb @target shell pm grant com.jarvishybrid.app android.permission.RECORD_AUDIO 2>$null | Out-Null
    & $Adb @target shell pm grant com.jarvishybrid.app android.permission.CAMERA 2>$null | Out-Null
  }
  $loop++
  Start-Sleep -Seconds 15
}
