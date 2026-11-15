// 받아쓰기 엔진 연결이 끊기면 한 번 다시 띄워 재시도(2026-11-15)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechToText } from '../src/voice/stt.js';

function wav16k(ms = 500) {
  const n = Math.round(16 * ms); const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) b.writeInt16LE(Math.round(Math.sin(i / 5) * 8000), 44 + i * 2);
  return b;
}

test('첫 연결이 끊기면 엔진을 다시 띄워 한 번 재시도한다', async () => {
  let launches = 0; let stops = 0; let calls = 0;
  const launcher = async () => { launches += 1; return { baseUrl: `http://e${launches}`, stop: () => { stops += 1; }, isAlive: () => true }; };
  const fetchImpl = async (url) => {
    calls += 1;
    if (calls === 1) { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; }
    assert.equal(url, 'http://e2/inference');
    return new Response(JSON.stringify({ text: '오늘 할 일 알려줘' }), { status: 200 });
  };
  const stt = new SpeechToText({ launcher, fetchImpl });
  const r = await stt.transcribe(wav16k());
  assert.equal(r.text, '오늘 할 일 알려줘');
  assert.equal(launches, 2); assert.equal(stops, 1);
});

test('재시도도 끊기면 stt_failed', async () => {
  const launcher = async () => ({ baseUrl: 'http://e', stop() {}, isAlive: () => true });
  const fetchImpl = async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; };
  const stt = new SpeechToText({ launcher, fetchImpl });
  await assert.rejects(stt.transcribe(wav16k()), (e) => e.code === 'stt_failed' && /ECONNRESET/.test(e.message));
});
