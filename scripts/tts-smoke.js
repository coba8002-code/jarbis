// OS 내장 음성 합성 실제 검사. 기본은 WAV 파일로만 만든다(스피커 소리 없음).
// 사용: node scripts/tts-smoke.js <출력 폴더> [--speak]
//   --speak 를 주면 마지막에 한 문장을 스피커로 실제 말한다.
// 외부 전송 없음, 녹음 없음.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSystemSpeaker } from '../src/voice/system-speaker.js';

const outDir = process.argv[2];
if (!outDir) {
  console.error('출력 폴더가 필요함: node scripts/tts-smoke.js <폴더> [--speak]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const speaker = createSystemSpeaker();
const results = [];

async function check(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - t0), ...detail });
  } catch (e) {
    results.push({ name, ok: false, ms: Math.round(performance.now() - t0), error: `${e.code ?? ''} ${e.message}` });
  }
}

function wavInfo(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('WAV 형식이 아님');
  const rate = b.readUInt32LE(24);
  const byteRate = b.readUInt32LE(28);
  const dataIdx = b.indexOf('data', 12);
  const dataLen = b.readUInt32LE(dataIdx + 4);
  return { bytes: b.length, sampleRate: rate, seconds: Number((dataLen / byteRate).toFixed(2)) };
}

await check('설치된 음성', async () => {
  const voices = await speaker.listVoices();
  const ko = voices.filter((v) => v.culture === 'ko-KR');
  if (!ko.length) throw new Error(`한국어 음성 없음: ${voices.map((v) => v.name).join(', ')}`);
  return { voices: voices.map((v) => `${v.name}(${v.culture})`), korean: ko[0].name };
});

await check('한국어 문장을 WAV로 합성', async () => {
  const path = resolve(join(outDir, 'ko.wav'));
  await speaker.synthesizeToFile('안녕하세요. 저는 자비스입니다. 오늘 일정을 알려 드릴까요?', path);
  const info = wavInfo(path);
  if (info.seconds < 1) throw new Error(`너무 짧음: ${info.seconds}초`);
  return { file: path, ...info };
});

await check('특수 문자가 섞인 글도 그대로 합성', async () => {
  const path = resolve(join(outDir, 'special.wav'));
  await speaker.synthesizeToFile('따옴표 "와" \'작은따옴표\', $env:PATH; & | < > 기호도 글자일 뿐입니다.', path);
  return { file: path, ...wavInfo(path) };
});

await check('합성 도중 끊기', async () => {
  const path = resolve(join(outDir, 'long.wav'));
  // 파일 합성은 실제 말하기보다 훨씬 빨라서, 아주 긴 글을 일찍 끊는다.
  const long = '이것은 끊기 검사를 위한 아주 긴 문장입니다. '.repeat(600);
  const t0 = performance.now();
  const h = speaker.synthesize(long, path);
  setTimeout(() => h.kill(), 150);
  const r = await h.done;
  const ms = Math.round(performance.now() - t0);
  if (!r.killed) throw new Error('끊기지 않고 끝남');
  let size = 0;
  try { size = statSync(path).size; } catch { /* 파일이 없을 수 있음 */ }
  return { killed: r.killed, stoppedAfterMs: ms, partialBytes: size };
});

if (process.argv.includes('--speak')) {
  await check('스피커로 말하기', async () => {
    await speaker.speak('자비스 음성 출력 검사입니다.').done;
    return {};
  });
}

console.log(JSON.stringify({ platform: process.platform, at: new Date().toISOString(), results }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
