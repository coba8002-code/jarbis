// 이름("자비스") 받아쓰기 정확도 측정. Windows·macOS 공통, 수동 실행(npm test에는 넣지 않음).
// 사용: node scripts/name-check.js <임시 폴더> --server <whisper-server> --model <모델> [--vad-model <VAD>] [--prompts "JARVIS|Jarvis"]
// - 마이크 없음: OS 음성 합성으로 "자비스"가 들어간 문장을 만들어 넣는다(사람 목소리가 아님에 주의).
// - 서버는 127.0.0.1에만, 끝나면 끈다. 외부 전송·소리 없음. 결과 파일은 지운다(--keep 제외).
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createSystemSpeaker } from '../src/voice/system-speaker.js';
import { SpeechToText, createWhisperLauncher, normalizeTranscript } from '../src/voice/stt.js';

const args = process.argv.slice(2);
const outDir = args[0];
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const server = flag('server');
const model = flag('model');
const vadModel = flag('vad-model');
const prompts = (flag('prompts') ?? 'JARVIS').split('|');
if (!outDir || !server || !model) {
  console.error('사용: node scripts/name-check.js <폴더> --server <whisper-server> --model <모델> [--vad-model <VAD>] [--prompts "A|B"]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

// --holdout: 바로잡기 규칙을 고를 때 쓰지 않은 문장으로 확인한다.
const holdout = [
  '자비스, 불 좀 꺼 줘.',
  '자비스 오늘 할 일 정리해 줘.',
  '그건 자비스가 알려 줬어.',
  '자비스, 볼륨 낮춰.',
  '자비스야 고마워.',
  '자비스, 내일 비 와?',
  '음, 자비스, 메모 하나 남겨 줘.',
  '자비스 잠깐만.',
  '자비스, 이 문서 요약해 줘.',
  '나중에 자비스한테 다시 물어볼게.',
];
const base = [
  '자비스, 오늘 날씨 어때?',
  '자비스, 내일 아침 아홉 시에 알람 맞춰 줘.',
  '자비스 지금 몇 시야?',
  '안녕 자비스, 음악 좀 틀어 줘.',
  '자비스야, 회의 일정 알려 줘.',
  '고마워 자비스.',
  '자비스, 방금 한 말 다시 해 줘.',
  '자비스, 이메일 확인해 줘.',
  '이번 주말 계획을 자비스에게 물어봤어.',
  '자비스 멈춰.',
];
const sentences = args.includes('--holdout') ? holdout : base;

const speaker = createSystemSpeaker();
const files = [];
for (let i = 0; i < sentences.length; i += 1) {
  const p = resolve(join(outDir, `n${i}.wav`));
  await speaker.synthesizeToFile(sentences[i], p);
  files.push(p);
}

const report = [];
for (const prompt of prompts) {
  const stt = new SpeechToText({ launcher: createWhisperLauncher({ server, model, vadModel, prompt }), normalize: false });
  const rows = [];
  try {
    for (let i = 0; i < files.length; i += 1) {
      const r = await stt.transcribe(readFileSync(files[i]));
      const fixed = normalizeTranscript(r.text);
      rows.push({ said: sentences[i], heard: r.text, raw: r.text.includes('자비스'), normalized: fixed.includes('자비스'), fixed });
    }
  } finally {
    stt.close();
  }
  report.push({
    prompt,
    rawCorrect: rows.filter((r) => r.raw).length,
    normalizedCorrect: rows.filter((r) => r.normalized).length,
    total: rows.length,
    misses: rows.filter((r) => !r.raw).map((r) => ({ said: r.said, heard: r.heard, fixed: r.fixed })),
  });
}
console.log(JSON.stringify({ platform: process.platform, at: new Date().toISOString(), report }, null, 2));
if (!args.includes('--keep')) rmSync(outDir, { recursive: true, force: true });
