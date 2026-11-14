// 회의 음성 파일 가져오기(US5) 검사. 실제 whisper 대신 127.0.0.1 가짜 서버(verbose_json 구간)를 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { MeetingStore } from '../src/meeting/meetings.js';
import { SpeechToText, dropSilentSegments } from '../src/voice/stt.js';
import { makeWav, parseWav } from '../src/voice/wav.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

const tone = (seconds) => makeWav(Array.from({ length: Math.round(seconds * 16000) }, (_, i) => 6000 * Math.sin(i / 9)));

async function fakeWhisper(t, segments) {
  const formats = [];
  const server = createServer((rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1');
      formats.push(/name="response_format"\r\n\r\n(\w+)/.exec(body)?.[1]);
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ text: segments.map((s) => s.text).join(' '), segments }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { formats, launcher: async () => ({ baseUrl: `http://127.0.0.1:${server.address().port}`, stop() {} }) };
}

test('받아쓰기 구간: 초를 ms로 바꾸고 빈 구간을 빼며 이름도 바로잡는다', async (t) => {
  const fake = await fakeWhisper(t, [
    { start: 0.0, end: 2.4, text: ' 회의를 시작하겠습니다. ' },
    { start: 2.4, end: 2.4, text: '' },
    { start: 2.6, end: 5.1, text: ' 차비스, 회의록 정리해 줘. ' },
  ]);
  const stt = new SpeechToText({ launcher: fake.launcher, ffmpeg: null });
  const r = await stt.transcribe(tone(6), { segments: true, keepWav: true, maxSeconds: 3600 });
  assert.equal(fake.formats[0], 'verbose_json');
  assert.deepEqual(r.segments, [
    { startMs: 0, endMs: 2400, text: '회의를 시작하겠습니다.' },
    { startMs: 2600, endMs: 5100, text: '자비스, 회의록 정리해 줘.' },
  ]);
  assert.equal(r.durationMs, 6000);
  assert.equal(parseWav(r.wav).sampleRate, 16000);
  const plain = await stt.transcribe(tone(1));
  assert.equal(plain.segments, undefined);
  assert.equal(plain.wav, undefined);
  assert.equal(fake.formats[1], 'json');
});

// 2026-11-14 실제 실행 QA: 실제 whisper가 마지막 마침표만 따로 구간으로 내놓아 회의록에 "00:08 ."이 보였다.
test('문장부호만 있는 구간은 앞 구간에 붙이고, 앞 구간이 없으면 뺀다', async (t) => {
  const fake = await fakeWhisper(t, [
    { start: 0.0, end: 0.3, text: ' . ' },
    { start: 0.4, end: 8.0, text: ' 담당자는 김 팀장입니다' },
    { start: 8.0, end: 8.6, text: '.' },
    { start: 9.0, end: 9.8, text: ' 다음 안건' },
  ]);
  const stt = new SpeechToText({ launcher: fake.launcher, ffmpeg: null });
  const r = await stt.transcribe(tone(10), { segments: true });
  assert.deepEqual(r.segments, [
    { startMs: 400, endMs: 8600, text: '담당자는 김 팀장입니다.' },
    { startMs: 9000, endMs: 9800, text: '다음 안건' },
  ]);
});

test('무음 구간은 지어낸 말로 보고 뺀다(VAD 없는 회의 받아쓰기)', async (t) => {
  // 앞 2초 소리, 뒤 2초 무음. 무음 쪽 "감사합니다."는 whisper가 지어낸 말(2026-11-14 실측과 같은 꼴).
  const wav = makeWav([...Array.from({ length: 32000 }, (_, i) => 6000 * Math.sin(i / 9)), ...new Array(32000).fill(0)]);
  assert.deepEqual(dropSilentSegments(wav, [{ startMs: 0, endMs: 1900, text: '안건' }, { startMs: 2100, endMs: 4000, text: '감사합니다.' }]),
    { kept: [{ startMs: 0, endMs: 1900, text: '안건' }], silent: 1 });
  const fake = await fakeWhisper(t, [{ start: 0.0, end: 1.9, text: '안건입니다.' }, { start: 2.1, end: 4.0, text: '감사합니다.' }]);
  const stt = new SpeechToText({ launcher: fake.launcher, ffmpeg: null });
  const r = await stt.transcribe(wav, { segments: true });
  assert.deepEqual(r.segments.map((s) => s.text), ['안건입니다.']);
  assert.equal(r.silentDropped, 1);
  assert.equal(r.text, '안건입니다.');
});

test('회의 파일은 회의용 받아쓰기(meetingStt)를 쓴다', async (t) => {
  const plain = await fakeWhisper(t, [{ start: 0, end: 1, text: '일반' }]);
  const meet = await fakeWhisper(t, [{ start: 0.5, end: 1.5, text: '회의용' }]);
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) }, stt: { launcher: plain.launcher, ffmpeg: null }, meetingStt: { launcher: meet.launcher, ffmpeg: null } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const res = await fetch(`http://127.0.0.1:${port}/api/meetings/import`, { method: 'POST', headers: { 'x-jarvis-token': app.token, 'content-type': 'audio/wav' }, body: tone(2) });
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(j.segments.map((s) => s.text), ['회의용']);
  assert.equal(plain.formats.length, 0);
  assert.notEqual(services.meetingStt, services.stt);
});

test('회의 가져오기: 원음 저장, 구간 저장, 길이 넘는 구간은 자르고 밖에서 시작한 구간은 지움', (t) => {
  const path = tempDbPath();
  const db = openDb(path);
  t.after(() => db.close());
  const store = new MeetingStore(db, { audioDir: join(dirname(path), 'meetings') });
  const wav = tone(5);
  const r = store.importAudio('주간 회의', {
    wav,
    durationMs: 5000,
    segments: [
      { startMs: 2600, endMs: 5400, text: '둘째 (길이 넘음)' },
      { startMs: 0, endMs: 2400, text: '첫째' },
      { startMs: 5200, endMs: 5600, text: '길이 밖' },
    ],
  });
  assert.equal(r.meeting.status, 'stopped');
  assert.equal(r.meeting.duration_ms, 5000);
  assert.deepEqual(r.segments.map((s) => [s.start_ms, s.end_ms, s.text]), [[0, 2400, '첫째'], [2600, 5000, '둘째 (길이 넘음)']]);
  assert.deepEqual([r.clamped, r.dropped], [1, 1]); // 하나는 길이에 맞춰 자르고, 길이 밖에서 시작한 하나는 지움
  assert.ok(existsSync(store.audioPath(r.meeting.id)));
  assert.deepEqual(store.readAudio(r.meeting.id), wav);
  assert.equal(store.seek(r.meeting.id, r.segments[1].id).offsetMs, 2600);
});

test('회의 가져오기 실패 시 반쪽 기록·원음을 남기지 않는다', (t) => {
  const path = tempDbPath();
  const db = openDb(path);
  t.after(() => db.close());
  const store = new MeetingStore(db, { audioDir: join(dirname(path), 'meetings') });
  assert.throws(() => store.importAudio('회의', { wav: tone(1), durationMs: 1000, segments: [{ startMs: 0, endMs: 500, text: ' ' }] }), { code: 'invalid_input' });
  assert.equal(store.list().length, 0);
  assert.equal(existsSync(join(dirname(path), 'meetings', 'meeting-1.wav')), false);
  assert.throws(() => store.importAudio('회의', { wav: Buffer.alloc(0), durationMs: 1000 }), { code: 'invalid_input' });
  const rec = store.start('녹음 중');
  assert.throws(() => store.importAudio('가져오기', { wav: tone(1), durationMs: 1000 }), { code: 'invalid_state' });
  assert.equal(store.list().length, 1);
  assert.equal(store.get(rec.id).status, 'recording');
});

test('화면 API: 회의 파일 가져오기 → 구간 목록 → 원음 받기(토큰 필요) → 삭제', async (t) => {
  const fake = await fakeWhisper(t, [{ start: 0.2, end: 1.8, text: '안건은 두 가지입니다.' }, { start: 2.0, end: 3.5, text: '다음 주에 다시 봅시다.' }]);
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) }, stt: { launcher: fake.launcher, ffmpeg: null } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, body, headers = {}) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, ...headers } }, (rs) => {
      const chunks = []; rs.on('data', (c) => chunks.push(c));
      rs.on('end', () => { const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* 음성 */ } resolve({ status: rs.statusCode, headers: rs.headers, buf, json }); });
    });
    rq.on('error', reject);
    rq.end(body);
  });
  const r = await call('POST', `/api/meetings/import?title=${encodeURIComponent('기획 회의')}`, tone(4), { 'content-type': 'audio/wav' });
  assert.equal(r.status, 200);
  assert.equal(r.json.meeting.title, '기획 회의');
  assert.deepEqual(r.json.segments.map((s) => [s.start_ms, s.end_ms]), [[200, 1800], [2000, 3500]]);
  const id = r.json.meeting.id;
  const audio = await call('GET', `/api/meetings/${id}/audio`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers['content-type'], 'audio/wav');
  assert.equal(parseWav(audio.buf).sampleRate, 16000);
  assert.equal((await call('GET', `/api/meetings/${id}/audio`, undefined, { 'x-jarvis-token': 'wrong' })).status, 403);
  assert.equal((await call('POST', '/api/meetings/import', '{}', { 'content-type': 'application/json' })).status, 400);
  assert.equal((await call('DELETE', `/api/meetings/${id}`)).json.deleted, true);
  assert.equal((await call('GET', `/api/meetings/${id}/audio`)).status, 404);
  const page = await call('GET', '/', undefined, { 'x-jarvis-token': '' });
  assert.match(page.headers['content-security-policy'], /media-src 'self' blob:/);
});
