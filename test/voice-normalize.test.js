// 작은 녹음 키우기(normalizeGain)와 녹음의 normalize 옵션 검사(2026-11-15, 토스 프론트 내장 마이크 감도 대책)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGain, createPcmCapture } from '../src/server/public/voice-input.js';

test('작은 소리는 가장 큰 소리가 0.9가 되도록 키우되 최대 16배까지만', () => {
  const r = normalizeGain(Float32Array.from([0.1, -0.05, 0.02]));
  assert.ok(Math.abs(r.gain - 9) < 1e-4);
  assert.ok(Math.abs(r.samples[0] - 0.9) < 1e-4);
  const tiny = normalizeGain(Float32Array.from([0.001, -0.001]));
  assert.equal(tiny.gain, 16);
});

test('이미 큰 소리·무음은 그대로 둔다', () => {
  const loud = Float32Array.from([0.95, -0.5]);
  assert.equal(normalizeGain(loud).gain, 1);
  assert.equal(normalizeGain(loud).samples, loud);
  assert.equal(normalizeGain(new Float32Array(4)).gain, 1);
});

test('녹음 stop({ normalize: true })는 키운 WAV를 만들고 배율을 남긴다', () => {
  const cap = createPcmCapture({ inputRate: 16000, outputRate: 16000 });
  cap.start({ preRoll: false });
  cap.push(new Float32Array(1600).fill(0.05));
  const wav = cap.stop({ normalize: true });
  assert.ok(Math.abs(cap.lastGain - 16) < 1e-4);
  const v = new DataView(wav.buffer);
  assert.ok(Math.abs(v.getInt16(44, true) / 0x7fff - 0.8) < 0.01);
  const cap2 = createPcmCapture({ inputRate: 16000, outputRate: 16000 });
  cap2.start({ preRoll: false });
  cap2.push(new Float32Array(160).fill(0.05));
  const plain = cap2.stop();
  assert.equal(cap2.lastGain, 1);
  assert.ok(Math.abs(new DataView(plain.buffer).getInt16(44, true) / 0x7fff - 0.05) < 0.001);
});
