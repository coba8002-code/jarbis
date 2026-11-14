#!/usr/bin/env node
// 앱 실행: 로컬 화면 서버를 켠다. Windows·macOS 공통.
// 사용: node src/main.js [--port 4780] [--data 폴더] [--open]
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServices } from './app/services.js';
import { createAppServer } from './server/server.js';
import { createWhisperLauncher } from './voice/stt.js';
import { shutdown as stopApp } from './app/shutdown.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, '.env.local');
if (!process.env.JARVIS_NO_ENV_FILE && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(flag('port') ?? process.env.JARVIS_PORT ?? 4780);
const dataDir = resolve(flag('data') ?? process.env.JARVIS_DATA ?? join(ROOT, 'data'));
// --host <이 PC의 와이파이 주소>: 같은 와이파이의 다른 기기에서 접속 허용(집처럼 믿는 망에서만). 없으면 이 기기 전용.
const host = flag('host') ?? process.env.JARVIS_HOST;

function openBrowser(url) {
  // 사용자가 --open을 줬을 때만. OS 기본 브라우저로 연다.
  const cmd = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
}

// 받아쓰기(whisper.cpp) 설정. Windows는 프로젝트의 tools/whisper, macOS는 brew로 설치한 whisper-server(PATH).
// 환경 변수로 바꿀 수 있다: JARVIS_WHISPER_SERVER, JARVIS_WHISPER_MODEL, JARVIS_WHISPER_VAD, JARVIS_FFMPEG.
const whisperDir = join(ROOT, 'tools', 'whisper');
const whisperBase = {
  server: process.env.JARVIS_WHISPER_SERVER
    ?? (process.platform === 'win32' ? join(whisperDir, 'v1.9.2', 'Release', 'whisper-server.exe') : 'whisper-server'),
  model: process.env.JARVIS_WHISPER_MODEL ?? join(whisperDir, 'models', 'ggml-large-v3-turbo-q5_0.bin'),
};
const ffmpeg = process.env.JARVIS_FFMPEG ?? 'ffmpeg';
const sttConfig = {
  launcher: createWhisperLauncher({ ...whisperBase, vadModel: process.env.JARVIS_WHISPER_VAD ?? join(whisperDir, 'models', 'ggml-silero-v6.2.0.bin') }),
  ffmpeg,
};
// 회의 파일용: VAD를 켜면 v1.9.2에서 구간 시간이 무음을 뺀 시간으로 틀어진다(2026-11-14 실측). 그래서 VAD 없이 따로 띄우고,
// 무음에서 지어낸 구간은 소리 크기로 뺀다(stt.js dropSilentSegments). 회의 파일을 처음 가져올 때만 뜬다.
const meetingSttConfig = { launcher: createWhisperLauncher(whisperBase), ffmpeg };

// 같은 데이터 폴더를 다른 JARVIS가 쓰는 중이면 DB를 열거나 복원하지 않고 끝낸다(data-lock.js).
let services;
try {
  services = createServices({ dataDir, stt: sttConfig, meetingStt: meetingSttConfig });
} catch (e) {
  console.error(e.code === 'data_in_use' ? e.message : `시작하지 못함: ${e.message}`);
  process.exit(1);
}
const app = createAppServer(services);
try {
  const { url, lan } = await app.listen(port, { host });
  console.log(`JARVIS 화면: ${url}`);
  if (lan) console.log('※ 같은 와이파이의 다른 기기에서도 이 주소로 접속할 수 있음(토큰 필요). 집처럼 믿는 망에서만 쓰세요.');
  console.log(`데이터 폴더: ${dataDir}`);
  if (services.recovered.missions.length || services.recovered.meetings.length) {
    console.log(`재시작 복원: 중단 처리한 작업 ${services.recovered.missions.length}개, 회의 ${services.recovered.meetings.length}개`);
  }
  console.log('끄려면 Ctrl+C');
  if (args.includes('--open')) openBrowser(url);
} catch (e) {
  console.error(e.code === 'EADDRINUSE' ? `포트 ${port}이(가) 이미 사용 중. --port로 다른 번호를 주세요.` : e.message);
  services.close();
  process.exit(1);
}

// 끄기: 진행 중인 일을 먼저 끊고, 화면 서버를 최대 3초 안에 닫은 뒤 DB·자식 프로세스를 닫는다(src/app/shutdown.js).
// SIGHUP: Windows에서 콘솔 창을 닫을 때 오는 신호. SIGBREAK: Windows Ctrl+Break. 여러 번 와도 한 번만 끈다.
let closing = false;
const onSignal = async () => {
  if (closing) return;
  closing = true;
  await stopApp(app, services, { timeoutMs: 3000 });
  process.exit(0);
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);
process.on('SIGHUP', onSignal);
if (process.platform === 'win32') process.on('SIGBREAK', onSignal);
