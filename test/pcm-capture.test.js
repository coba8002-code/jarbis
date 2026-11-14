// 녹음 앞부분 잘림 대책(T232): 마이크 소리를 미리 담아 두고 녹음 시작 때 앞 소리부터 넣는지 검사한다(마이크·소리 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSegmenter, createPcmCapture, downsample, encodeWav, rmsOf } from '../src/server/public/voice-input.js';
import { parseWav, isWhisperReady } from '../src/voice/wav.js';

const RATE = 48000;
const CHUNK = 4096; // 화면의 ScriptProcessor 단위

// ms 길이의 일정한 값 소리를 CHUNK 단위로 나눠 돌려준다.
function chunksOf(value, ms) {
  const total = Math.round((RATE * ms) / 1000);
  const out = [];
  for (let at = 0; at < total; at += CHUNK) out.push(new Float32Array(Math.min(CHUNK, total - at)).fill(value));
  return out;
}
const samplesOf = (wav) => {
  const b = Buffer.from(wav);
  const n = (b.length - 44) / 2;
  return Array.from({ length: n }, (_, i) => b.readInt16LE(44 + i * 2));
};

test('WAV는 받아쓰기 엔진이 바로 쓰는 16kHz 모노 16비트이고 길이가 맞다', () => {
  const cap = createPcmCapture({ inputRate: RATE });
  cap.start({ preRoll: false });
  for (const c of chunksOf(0.5, 1000)) cap.push(c);
  const info = parseWav(Buffer.from(cap.stop()));
  assert.ok(isWhisperReady(info));
  assert.ok(Math.abs(info.seconds - 1) < 0.01, `${info.seconds}초`);
});

test('녹음 시작 전 소리를 최대 0.8초만 앞에 넣는다', () => {
  const cap = createPcmCapture({ inputRate: RATE });
  for (const c of chunksOf(0.1, 2000)) cap.push(c); // 오래된 소리(넣으면 안 됨)
  for (const c of chunksOf(0.4, 600)) cap.push(c); // 말 시작(알아채기 전)
  cap.start();
  for (const c of chunksOf(0.8, 1000)) cap.push(c);
  const s = samplesOf(cap.stop());
  assert.ok(Math.abs(s.length / 16000 - 1.8) < 0.01, `${s.length / 16000}초`);
  const first = s.slice(0, 3200); // 앞 0.2초는 오래된 소리, 그 뒤 0.6초는 말 시작
  assert.ok(first.every((v) => Math.abs(v - 0.1 * 0x7fff) < 2));
  assert.ok(s.slice(3200, 12800).every((v) => Math.abs(v - 0.4 * 0x7fff) < 2));
  assert.ok(s.slice(12800).every((v) => Math.abs(v - 0.8 * 0x7fff) < 2));
});

test('preRoll:false(말하기 버튼)는 누른 뒤 소리만 담는다', () => {
  const cap = createPcmCapture({ inputRate: RATE });
  for (const c of chunksOf(0.3, 1000)) cap.push(c);
  cap.start({ preRoll: false });
  for (const c of chunksOf(0.6, 500)) cap.push(c);
  const s = samplesOf(cap.stop());
  assert.ok(Math.abs(s.length / 16000 - 0.5) < 0.01);
  assert.ok(s.every((v) => Math.abs(v - 0.6 * 0x7fff) < 2));
});

test('최대 길이를 넘으면 더 담지 않고, 멈춘 뒤에는 다시 미리 담기부터 한다', () => {
  const cap = createPcmCapture({ inputRate: RATE, maxMs: 1000 });
  cap.start({ preRoll: false });
  for (const c of chunksOf(0.2, 3000)) cap.push(c);
  assert.ok(cap.recordedMs < 1100, `${cap.recordedMs}ms`);
  cap.stop();
  assert.equal(cap.recording, false);
  for (const c of chunksOf(0.2, 300)) cap.push(c);
  cap.start();
  assert.ok(Math.abs(cap.recordedMs - 300) < 90, `${cap.recordedMs}ms`);
});

test('wav()는 녹음을 멈추지 않는다(에코 확인 중에도 계속 녹음)', () => {
  const cap = createPcmCapture({ inputRate: RATE });
  cap.start({ preRoll: false });
  for (const c of chunksOf(0.2, 500)) cap.push(c);
  const mid = parseWav(Buffer.from(cap.wav()));
  for (const c of chunksOf(0.2, 500)) cap.push(c);
  assert.equal(cap.recording, true);
  assert.ok(parseWav(Buffer.from(cap.stop())).seconds > mid.seconds + 0.4);
});

test('발화 감지와 함께: 말 시작을 알아챈 시점보다 앞선 말머리가 녹음에 들어간다', () => {
  // 0.5초 조용 → 말(알아채기까지 startMs 150ms + 처리 단위 지연). 녹음 시작 전에 이미 지난 말소리가 들어가야 한다.
  const seg = createSegmenter();
  const cap = createPcmCapture({ inputRate: RATE });
  const plan = [...chunksOf(0.001, 500), ...chunksOf(0.3, 1500), ...chunksOf(0.001, 1500)];
  let t = 0;
  let speechAt = null;
  let startedAt = null;
  for (const c of plan) {
    if (c[0] === 0.3 && speechAt === null) speechAt = t;
    cap.push(c);
    t += (c.length / RATE) * 1000;
    const ev = seg.push(rmsOf(c), t);
    if (ev === 'start') { startedAt = t; cap.start(); }
    if (ev === 'end') break;
  }
  assert.ok(startedAt - speechAt >= 150, `알아챈 지연 ${startedAt - speechAt}ms`);
  const s = samplesOf(cap.stop());
  const firstLoud = s.findIndex((v) => v > 0.2 * 0x7fff);
  const quietBefore = (firstLoud / 16000) * 1000;
  assert.ok(firstLoud > 0 && quietBefore > 100, `말 앞 조용한 부분 ${quietBefore}ms(말머리가 잘리지 않음)`);
});

test('표본 줄이기와 WAV 머리글', () => {
  assert.equal(downsample(new Float32Array(480), 48000, 16000).length, 160);
  assert.equal(downsample(new Float32Array(441), 44100, 16000).length, 160);
  assert.deepEqual(Array.from(downsample(new Float32Array([2, -2, 2]), 16000, 16000)), [0x7fff, -0x8000, 0x7fff]);
  const info = parseWav(Buffer.from(encodeWav(new Int16Array(16000), 16000)));
  assert.equal(info.seconds, 1);
  assert.ok(isWhisperReady(info));
});
