// 받아쓰기(whisper.cpp) 실제 확인. Windows·macOS 공통. 수동 실행, npm test에는 넣지 않는다.
// 사용: node scripts/stt-smoke.js <임시 폴더> --server <whisper-server 경로> --model <모델> [--vad-model <VAD 모델>] [--port 8178]
// - 마이크 없음: OS 음성 합성으로 만든 한국어 WAV를 ffmpeg로 16kHz로 바꿔 넣는다.
// - 서버는 127.0.0.1에만 띄우고 끝나면 끈다. 외부 전송 없음, 소리 없음.
// - 확인: 한국어 받아쓰기, 이름("자비스") 인식, 한글 깨짐(U+FFFD) 없음, 무음에서 말을 지어내지 않음.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSystemSpeaker } from '../src/voice/system-speaker.js';

const args = process.argv.slice(2);
const outDir = args[0];
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const server = flag('server');
const model = flag('model');
const vadModel = flag('vad-model');
const port = Number(flag('port') ?? 8178);
if (!outDir || !server || !model) {
  console.error('사용: node scripts/stt-smoke.js <임시 폴더> --server <whisper-server> --model <모델> [--vad-model <VAD>]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const p = (f) => resolve(join(outDir, f));

// 시험 음성 만들기(소리 없이 파일로)
const speaker = createSystemSpeaker();
const cases = [
  { name: 'meeting', text: '안녕하세요. 내일 오후 세 시에 회의 일정을 잡아 주세요.', expect: ['안녕하세요', '오후', '회의'] },
  { name: 'name', text: '자비스, 오늘 날씨 어때?', expect: ['자비스', '날씨'] },
];
for (const c of cases) {
  await speaker.synthesizeToFile(c.text, p(`${c.name}-raw.wav`));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', p(`${c.name}-raw.wav`), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', p(`${c.name}.wav`)]);
}
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-t', '3', '-i', 'anullsrc=r=16000:cl=mono', '-c:a', 'pcm_s16le', p('silence.wav')]);

// 서버 실행(127.0.0.1 전용). 영문 프롬프트를 쓴다: 한글 프롬프트는 v1.9.2 서버 출력에서 한글이 깨짐(2026-11-14 확인).
const sArgs = ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-l', 'ko', '--prompt', 'JARVIS'];
if (vadModel) sArgs.push('--vad', '-vm', vadModel);
const child = spawn(server, sArgs, { stdio: 'ignore', windowsHide: true });
const stop = () => { try { child.kill(); } catch { /* 이미 꺼짐 */ } };
process.on('exit', stop);

async function waitReady() {
  for (let i = 0; i < 120; i += 1) {
    try { await fetch(`http://127.0.0.1:${port}/`); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('서버가 60초 안에 열리지 않음');
}

async function transcribe(file) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'audio/wav' }), 'a.wav');
  form.append('response_format', 'json');
  const t0 = performance.now();
  const res = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form });
  const buf = Buffer.from(await res.arrayBuffer());
  return { ms: Math.round(performance.now() - t0), broken: buf.includes(Buffer.from('efbfbd', 'hex')), text: JSON.parse(buf.toString('utf8')).text.trim() };
}

const results = [];
try {
  await waitReady();
  await transcribe(p('silence.wav')); // 처음 한 번은 준비 시간이 섞이므로 버린다
  for (const c of cases) {
    const r = await transcribe(p(`${c.name}.wav`));
    results.push({ name: c.name, ...r, ok: !r.broken && c.expect.every((w) => r.text.includes(w)) });
  }
  const s = await transcribe(p('silence.wav'));
  results.push({ name: 'silence', ...s, ok: !s.broken && s.text === '' });
} catch (e) {
  results.push({ name: 'error', ok: false, error: e.message });
} finally {
  stop();
}
console.log(JSON.stringify({ platform: process.platform, vad: Boolean(vadModel), at: new Date().toISOString(), results }, null, 2));
if (!args.includes('--keep')) rmSync(outDir, { recursive: true, force: true });
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
