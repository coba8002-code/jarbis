// 음성 지연 기준 측정(SC-005). Windows·macOS 공통. 수동 실행, npm test에는 넣지 않는다.
// 사용: node scripts/latency-check.js <출력 폴더> [--model gemma4:12b] [--runs 3]
// - 실제 부품을 그대로 쓴다: 로컬 Ollama → 차례 관리(TurnManager) → 문장 나누기 → OS 음성 합성.
// - 소리는 내지 않는다: 각 문장을 스피커 대신 WAV 파일로 합성한다(합성 시간 = 소리 준비 시간).
// - 외부 전송 없음: Ollama는 이 기기(루프백) 주소만 허용한다. 녹음·마이크 없음.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform, cpus, totalmem, release } from 'node:os';
import { ProviderRegistry } from '../src/providers/registry.js';
import { isLoopback } from '../src/providers/http.js';
import { TurnManager } from '../src/conversation/turns.js';
import { SpeechPlayer } from '../src/voice/player.js';
import { createSystemSpeaker } from '../src/voice/system-speaker.js';

const args = process.argv.slice(2);
const outDir = args[0];
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
if (!outDir || outDir.startsWith('--')) {
  console.error('출력 폴더가 필요함: node scripts/latency-check.js <폴더> [--model 이름] [--runs 3]');
  process.exit(2);
}
const model = flag('model', process.env.JARVIS_OLLAMA_MODEL);
const runs = Number(flag('runs', 3));
// --think false: 빠른 답(생각 생략) 측정. 없으면 모델 기본값.
const thinkArg = flag('think');
const think = thinkArg === 'false' ? false : thinkArg === 'true' ? true : undefined;
const withThink = (r) => (think === undefined ? r : { ...r, think });
const baseUrl = process.env.JARVIS_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
if (!model) { console.error('--model 또는 JARVIS_OLLAMA_MODEL 필요'); process.exit(2); }
if (!isLoopback(baseUrl)) { console.error('이 측정은 이 기기 주소의 Ollama만 씀'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const system = createSystemSpeaker();
let fileNo = 0;
// 스피커 대신 WAV 파일로 합성하는 스피커. kill하면 합성을 멈춘다.
function fileSpeaker(log) {
  return {
    speak(text) {
      fileNo += 1;
      const path = resolve(join(outDir, `s${fileNo}.wav`));
      const t = performance.now();
      log.push({ op: 'start', at: t, chars: text.length });
      const h = system.synthesize(text, path);
      const done = h.done.then((r) => { log.push({ op: r.killed ? 'killed' : 'ready', at: performance.now(), start: t }); return r; });
      return { done, kill: () => h.kill() };
    },
  };
}

const providers = ProviderRegistry.fromEnv({ env: { JARVIS_OLLAMA_BASE_URL: baseUrl, JARVIS_OLLAMA_MODEL: model } });
const ms = (x) => (x == null ? null : Math.round(x));
const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };

async function oneRun(question) {
  const log = [];
  let tm;
  const player = new SpeechPlayer({ speaker: fileSpeaker(log), onEnded: (id) => tm.playbackEnded(id) });
  tm = new TurnManager({ providers, player });
  let firstDelta = null;
  tm.on((e) => { if (e.type === 'delta' && firstDelta == null) firstDelta = performance.now(); });
  const t0 = performance.now();
  const turn = await tm.submit('ollama', withThink({ messages: [{ role: 'user', content: question }] }));
  const generated = performance.now();
  while (tm.state !== 'idle') await new Promise((r) => setTimeout(r, 5));
  const firstStart = log.find((x) => x.op === 'start');
  const firstReady = log.find((x) => x.op === 'ready');
  return {
    status: turn.status,
    firstTextMs: ms(firstDelta && firstDelta - t0),
    firstSentenceToSpeakerMs: ms(firstStart && firstStart.at - t0),
    firstAudioReadyMs: ms(firstReady && firstReady.at - t0),
    firstSynthMs: ms(firstReady && firstReady.at - firstReady.start),
    generationMs: ms(generated - t0),
    sentences: log.filter((x) => x.op === 'start').length,
    answer: turn.text.trim().slice(0, 160),
  };
}

async function interruptRun() {
  const log = [];
  let tm;
  const player = new SpeechPlayer({ speaker: fileSpeaker(log), onEnded: (id) => tm.playbackEnded(id) });
  tm = new TurnManager({ providers, player });
  let deltasAfterCut = 0;
  let cutAt = null;
  tm.on((e) => { if (e.type === 'delta' && cutAt != null) deltasAfterCut += 1; });
  const run = tm.submit('ollama', withThink({ messages: [{ role: 'user', content: '1부터 200까지 한 줄에 하나씩, 각 숫자 뒤에 마침표를 붙여 써 줘.' }] }));
  while (!log.some((x) => x.op === 'start')) await new Promise((r) => setTimeout(r, 2));
  cutAt = performance.now();
  tm.userSpeechStarted();
  const turn = await run;
  const streamStopped = performance.now();
  // 끊는 순간 합성 중이던 문장이 멈출 때까지
  while (log.some((x) => x.op === 'start') && !log.some((x) => x.op === 'killed' || x.op === 'ready')) await new Promise((r) => setTimeout(r, 2));
  const audioEnd = log.find((x) => x.op === 'killed' || x.op === 'ready');
  return {
    status: turn.status,
    generationStopMs: ms(streamStopped - cutAt),
    audioStopMs: ms(audioEnd ? audioEnd.at - cutAt : null),
    audioStoppedBy: audioEnd?.op ?? null,
    deltasAfterCut,
    sentencesStartedAfterCut: log.filter((x) => x.op === 'start' && x.at > cutAt).length,
  };
}

const cpu0 = process.cpuUsage();
const wall0 = performance.now();
const results = [];
for (let i = 0; i < runs; i += 1) results.push(await oneRun('하늘이 파란 이유를 두 문장으로 설명해 줘.'));
const interrupts = [];
for (let i = 0; i < Math.max(1, Math.min(runs, 3)); i += 1) interrupts.push(await interruptRun());
const cpu = process.cpuUsage(cpu0);
const wall = performance.now() - wall0;

const summary = {
  platform: platform(),
  osRelease: release(),
  cpu: cpus()[0]?.model,
  cores: cpus().length,
  memoryGB: Math.round(totalmem() / 1e9),
  node: process.version,
  model,
  think: think ?? '(모델 기본값)',
  at: new Date().toISOString(),
  runs: results,
  interrupts,
  median: {
    firstTextMs: median(results.map((r) => r.firstTextMs)),
    firstAudioReadyMs: median(results.map((r) => r.firstAudioReadyMs)),
    firstSynthMs: median(results.map((r) => r.firstSynthMs)),
    generationStopMs: median(interrupts.map((r) => r.generationStopMs)),
    audioStopMs: median(interrupts.map((r) => r.audioStopMs)),
  },
  jarvisProcess: {
    rssMB: Math.round(process.memoryUsage().rss / 1e6),
    cpuPercentOfOneCore: Math.round(((cpu.user + cpu.system) / 1000 / wall) * 100),
    note: 'Ollama·음성 합성 프로세스의 CPU·메모리는 포함하지 않음',
  },
};
console.log(JSON.stringify(summary, null, 2));
if (!args.includes('--keep')) rmSync(outDir, { recursive: true, force: true });
const ok = results.every((r) => r.status === 'generated' && r.firstAudioReadyMs != null)
  && interrupts.every((r) => r.status === 'interrupted' && r.deltasAfterCut === 0 && r.sentencesStartedAfterCut === 0);
process.exitCode = ok ? 0 : 1;
