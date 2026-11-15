import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wavLevels, logAudioDiag } from '../src/server/audio-diag.js';

function wav(samples, rate = 16000) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(s, 44 + i * 2));
  return b;
}

test('완전히 0인 녹음은 peak 0, zeros 100%', () => {
  const l = wavLevels(wav(new Array(1600).fill(0)));
  assert.equal(l.ok, true); assert.equal(l.ms, 100); assert.equal(l.peak, 0); assert.equal(l.zeros, 1);
});

test('소리가 있으면 rms·peak가 잡힌다', () => {
  const l = wavLevels(wav(Array.from({ length: 1600 }, (_, i) => Math.round(8000 * Math.sin(i / 5)))));
  assert.ok(l.rms > 0.15 && l.rms < 0.2); assert.ok(l.peak > 0.24); assert.ok(l.zeros < 0.01);
});

test('WAV가 아니면 not_wav, 진단 끔이면 기록 안 함', () => {
  assert.equal(wavLevels(Buffer.from('hello world!')).reason, 'not_wav');
  const lines = [];
  assert.equal(logAudioDiag('/api/stt', wav([0, 1]), {}, (s) => lines.push(s)), null);
  logAudioDiag('/api/stt', wav([0, 0]), { JARVIS_AUDIO_DIAG: '1' }, (s) => lines.push(s));
  assert.equal(lines.length, 1); assert.match(lines[0], /peak=0\.0000 zeros=100\.0%/);
});
