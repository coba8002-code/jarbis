// 회의 마이크 녹음(T123) 검사. 마이크 대신 16kHz WAV 조각을, 실제 whisper 대신 127.0.0.1 가짜 서버를 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeWav, parseWav } from '../src/voice/wav.js';
import { pcmOf, firstLoudMs } from '../src/meeting/live.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

const tone = (seconds, rate = 16000) => makeWav(Array.from({ length: Math.round(seconds * rate) }, (_, i) => 6000 * Math.sin(i / 9)), rate);
const speaker = { speak: () => ({ done: Promise.resolve(), kill() {} }) };

// 부를 때마다 reply(n)이 돌려주는 구간(초)을 주는 가짜 whisper. reply가 null이면 500.
async function fakeWhisper(t, reply) {
  let n = 0;
  const server = createServer((rq, rs) => {
    rq.resume();
    rq.on('end', () => {
      n += 1;
      const segs = reply(n);
      if (!segs) { rs.writeHead(500); rs.end(); return; }
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ text: segs.map((s) => s.text).join(' '), segments: segs }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { calls: () => n, launcher: async () => ({ baseUrl: `http://127.0.0.1:${server.address().port}`, stop() {} }) };
}

async function startApp(t, reply, dataDir = dirname(tempDbPath())) {
  const fake = await fakeWhisper(t, reply);
  const services = createServices({ dataDir, providers: new ProviderRegistry({}), speaker, stt: { launcher: fake.launcher, ffmpeg: null }, meetingStt: { launcher: fake.launcher, ffmpeg: null } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); services.close(); } };
  t.after(close);
  const call = async (method, path, body, type = 'application/json') => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { 'x-jarvis-token': app.token, 'content-type': type },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const isWav = res.headers.get('content-type') === 'audio/wav';
    return { status: res.status, body: isWav ? Buffer.from(await res.arrayBuffer()) : await res.json() };
  };
  return { services, call, close, fake, dataDir };
}

test('녹음: 조각마다 원음을 붙이고, 구간 시간은 녹음 시작 기준으로 이어진다', async (t) => {
  const { call } = await startApp(t, (n) => [{ start: 0.2, end: 1.5, text: `조각 ${n} 첫 말` }, { start: 1.6, end: 9, text: `조각 ${n} 끝 말` }]);
  const m = (await call('POST', '/api/meetings/live', { title: '주간 회의' })).body;
  assert.equal(m.status, 'recording');
  assert.equal(m.title, '주간 회의');
  const c1 = await call('POST', `/api/meetings/${m.id}/chunk`, tone(3), 'audio/wav');
  assert.equal(c1.status, 200);
  assert.equal(c1.body.offsetMs, 0);
  assert.deepEqual(c1.body.segments.map((s) => [s.start_ms, s.end_ms, s.text]), [[200, 1500, '조각 1 첫 말'], [1600, 3000, '조각 1 끝 말']]);
  const c2 = await call('POST', `/api/meetings/${m.id}/chunk`, tone(2), 'audio/wav');
  assert.equal(c2.body.offsetMs, 3000);
  assert.equal(c2.body.durationMs, 5000);
  assert.deepEqual(c2.body.segments.map((s) => [s.start_ms, s.end_ms]), [[3200, 4500], [4600, 5000]]);
  // 녹음 중에는 다른 녹음·파일 가져오기·지우기를 막는다
  assert.equal((await call('POST', '/api/meetings/live', {})).status, 409);
  assert.equal((await call('POST', '/api/meetings/import', tone(1), 'audio/wav')).status, 409);
  assert.equal((await call('DELETE', `/api/meetings/${m.id}`)).status, 409);
  const stop = await call('POST', `/api/meetings/${m.id}/stop`, {});
  assert.equal(stop.status, 200);
  assert.equal(stop.body.meeting.status, 'stopped');
  assert.equal(stop.body.meeting.duration_ms, 5000);
  assert.equal(stop.body.segments.length, 4);
  // 원음: 머리글 크기가 실제 길이와 맞고 소리가 이어 붙어 있다
  const audio = await call('GET', `/api/meetings/${m.id}/audio`);
  const info = parseWav(audio.body);
  assert.equal(info.seconds, 5);
  assert.equal(audio.body.length, 44 + 5 * 32000);
  assert.deepEqual(pcmOf(audio.body).subarray(0, 96000), pcmOf(tone(3)));
  assert.equal((await call('POST', `/api/meetings/${m.id}/chunk`, tone(1), 'audio/wav')).status, 409);
  assert.equal((await call('POST', `/api/meetings/${m.id}/stop`, {})).status, 409);
});

test('구간 앞 무음은 건너뛰어 실제 말 시작에 맞춘다(whisper가 시작을 0으로 줄 때)', async (t) => {
  // 2초 무음 + 1초 말소리. whisper는 시작을 0으로 준다(실측과 같은 꼴).
  const wav = makeWav([...new Array(32000).fill(0), ...Array.from({ length: 16000 }, (_, i) => 6000 * Math.sin(i / 9))]);
  assert.equal(firstLoudMs(pcmOf(wav), 0, 3000), 2000);
  assert.equal(firstLoudMs(pcmOf(wav), 0, 1500), null);
  const { call } = await startApp(t, () => [{ start: 0, end: 3, text: '늦게 시작한 말' }]);
  const m = (await call('POST', '/api/meetings/live', {})).body;
  await call('POST', `/api/meetings/${m.id}/chunk`, tone(1), 'audio/wav');
  const c = await call('POST', `/api/meetings/${m.id}/chunk`, wav, 'audio/wav');
  assert.deepEqual(c.body.segments.map((s) => [s.start_ms, s.end_ms]), [[1000 + 1900, 4000]]);
});

test('받아쓰기가 실패한 조각도 원음은 남고 녹음은 계속된다', async (t) => {
  const { call } = await startApp(t, (n) => (n === 1 ? null : [{ start: 0, end: 1, text: '다시 됨' }]));
  const m = (await call('POST', '/api/meetings/live', {})).body;
  assert.match(m.title, /^회의 /);
  const c1 = await call('POST', `/api/meetings/${m.id}/chunk`, tone(2), 'audio/wav');
  assert.equal(c1.status, 200);
  assert.match(c1.body.sttError, /받아쓰기 실패/);
  assert.deepEqual(c1.body.segments, []);
  const c2 = await call('POST', `/api/meetings/${m.id}/chunk`, tone(1), 'audio/wav');
  assert.deepEqual(c2.body.segments.map((s) => [s.start_ms, s.text]), [[2000, '다시 됨']]);
  const stop = await call('POST', `/api/meetings/${m.id}/stop`, {});
  assert.equal(stop.body.meeting.duration_ms, 3000);
});

test('조각 형식 검사: 16kHz 모노 16비트 WAV만 받는다', async (t) => {
  const { call, fake } = await startApp(t, () => []);
  const m = (await call('POST', '/api/meetings/live', {})).body;
  assert.equal((await call('POST', `/api/meetings/${m.id}/chunk`, tone(1, 8000), 'audio/wav')).status, 400);
  assert.equal((await call('POST', `/api/meetings/${m.id}/chunk`, Buffer.from('not a wav at all, just some text here....'), 'audio/wav')).status, 400);
  assert.equal((await call('POST', `/api/meetings/${m.id}/chunk`, tone(1), 'audio/webm')).status, 400);
  assert.equal((await call('POST', '/api/meetings/999/chunk', tone(1), 'audio/wav')).status, 404);
  assert.equal(fake.calls(), 0);
  // 아무 소리도 못 받았으면 멈출 때 회의를 남기지 않는다
  const stop = await call('POST', `/api/meetings/${m.id}/stop`, {});
  assert.deepEqual(stop.body, { meeting: null, empty: true, segments: [] });
  assert.deepEqual((await call('GET', '/api/meetings')).body, []);
});

test('녹음 중 JARVIS가 꺼지면: 다시 켤 때 중단으로 두고, 그때까지의 원음을 재생할 수 있게 고친다', async (t) => {
  const first = await startApp(t, () => [{ start: 0, end: 1, text: '꺼지기 전 말' }]);
  const m = (await first.call('POST', '/api/meetings/live', {})).body;
  await first.call('POST', `/api/meetings/${m.id}/chunk`, tone(2), 'audio/wav');
  const path = first.services.meetings.audioPath(m.id);
  assert.equal(parseWav(readFileSync(path)).dataBytes, 0); // 녹음 중 머리글은 아직 0
  await first.close(); // 멈추지 않고 꺼짐
  const second = await startApp(t, () => [], first.dataDir);
  assert.deepEqual(second.services.recovered.meetings, [m.id]);
  const list = (await second.call('GET', '/api/meetings')).body;
  assert.equal(list[0].status, 'interrupted');
  assert.equal(parseWav((await second.call('GET', `/api/meetings/${m.id}/audio`)).body).seconds, 2);
  assert.deepEqual((await second.call('GET', `/api/meetings/${m.id}/segments`)).body.map((s) => s.text), ['꺼지기 전 말']);
  // 중단된 회의는 지울 수 있고, 새 녹음도 시작할 수 있다
  assert.equal((await second.call('DELETE', `/api/meetings/${m.id}`)).status, 200);
  assert.equal(existsSync(path), false);
  assert.equal((await second.call('POST', '/api/meetings/live', {})).status, 200);
});

test('회의 최대 길이를 넘는 조각은 받지 않는다', async (t) => {
  const { services } = await startApp(t, () => []);
  services.liveMeetings.maxMs = 2500;
  const m = services.liveMeetings.start('짧은 회의');
  await services.liveMeetings.append(m.id, tone(2));
  await assert.rejects(services.liveMeetings.append(m.id, tone(1)), { code: 'invalid_input' });
  const r = await services.liveMeetings.stop(m.id);
  assert.equal(r.meeting.duration_ms, 2000);
  assert.ok(existsSync(join(services.dataDir, 'meetings', `meeting-${m.id}.wav`)));
});

// T246·T247: 첫 /chunk 응답만 끊고(브라우저에는 실패로 보임) 같은 요청을 다시 보내는 상황(2026-11-14 독립 QA 재현).
async function startWithLostReply(t, reply) {
  const ctx = await startApp(t, reply);
  const { services } = ctx;
  const app = createAppServer(services);
  const orig = app.server.listeners('request')[0];
  app.server.removeAllListeners('request');
  let lost = 0;
  app.server.on('request', (req, res) => {
    if (/\/chunk/.test(req.url) && lost === 0) {
      lost += 1;
      res.end = () => res.destroy(); // 서버는 처리하지만 응답은 사라진다
    }
    return orig(req, res);
  });
  const { port } = await app.listen(0);
  t.after(() => app.close());
  const post = (path, body, type = 'audio/wav') => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'x-jarvis-token': app.token, 'content-type': type }, body })
    .then(async (r) => ({ status: r.status, json: await r.json() }));
  return { ...ctx, post, lostCount: () => lost };
}

test('응답이 사라져 같은 조각(seq)을 다시 보내도 원음·받아쓰기는 한 번만 한다', async (t) => {
  const { post, services, fake, lostCount } = await startWithLostReply(t, () => [{ start: 0.1, end: 0.9, text: '한 번만' }]);
  const m = (await post('/api/meetings/live', JSON.stringify({}), 'application/json')).json;
  const wav = tone(1);
  let firstLost = false;
  try { await post(`/api/meetings/${m.id}/chunk?seq=0`, wav); } catch { firstLost = true; }
  assert.equal(firstLost, true);
  assert.equal(lostCount(), 1);
  const retry = await post(`/api/meetings/${m.id}/chunk?seq=0`, wav);
  assert.equal(retry.status, 200);
  assert.equal(retry.json.duplicate, true);
  assert.equal(retry.json.offsetMs, 0);
  assert.equal(retry.json.durationMs, 1000);
  assert.deepEqual(retry.json.segments.map((s) => s.text), ['한 번만']);
  const next = await post(`/api/meetings/${m.id}/chunk?seq=1`, tone(1));
  assert.equal(next.json.offsetMs, 1000);
  const stop = await post(`/api/meetings/${m.id}/stop`, JSON.stringify({}), 'application/json');
  assert.equal(stop.json.meeting.duration_ms, 2000); // 고치기 전: 3000(첫 조각이 두 번 붙음)
  assert.equal(stop.json.segments.length, 2);
  assert.equal(fake.calls(), 2); // 받아쓰기도 조각당 한 번
  assert.equal(services.meetings.segments(m.id).filter((s) => s.text === '한 번만').length, 2);
});

test('조각 번호 규칙: 같은 번호 다른 내용·건너뛴 번호·잘못된 번호는 거부, 번호 없는 옛 호출은 그대로 붙인다', async (t) => {
  const { call, services } = await startApp(t, () => []);
  const m = (await call('POST', '/api/meetings/live', {})).body;
  assert.equal((await call('POST', `/api/meetings/${m.id}/chunk?seq=0`, tone(1), 'audio/wav')).status, 200);
  const conflict = await call('POST', `/api/meetings/${m.id}/chunk?seq=0`, tone(2), 'audio/wav');
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'invalid_state');
  const gap = await call('POST', `/api/meetings/${m.id}/chunk?seq=5`, tone(1), 'audio/wav');
  assert.equal(gap.status, 409);
  assert.match(gap.body.error.message, /다음 조각 번호는 1/);
  for (const bad of ['-1', '1.5', 'x', '']) assert.equal((await call('POST', `/api/meetings/${m.id}/chunk?seq=${bad}`, tone(1), 'audio/wav')).status, 400, bad);
  assert.equal(services.liveMeetings.lengthMs(m.id), 1000); // 거부한 것은 붙지 않음
  // 같은 회의에서 번호 있는 호출과 없는 호출을 섞지 않는다
  assert.equal((await call('POST', `/api/meetings/${m.id}/chunk`, tone(1), 'audio/wav')).status, 409);
  // 번호 없는 옛 호출만 쓰는 회의는 예전처럼 붙인다(중복 방지 없음)
  await call('POST', `/api/meetings/${m.id}/stop`, {});
  const old = (await call('POST', '/api/meetings/live', {})).body;
  await call('POST', `/api/meetings/${old.id}/chunk`, tone(1), 'audio/wav');
  await call('POST', `/api/meetings/${old.id}/chunk`, tone(1), 'audio/wav');
  assert.equal((await call('POST', `/api/meetings/${old.id}/stop`, {})).body.meeting.duration_ms, 2000);
});

test('조각 번호는 JARVIS를 다시 켜면 이어지지 않는다(꺼진 녹음은 중단, 새 조각 거부)', async (t) => {
  const first = await startApp(t, () => []);
  const m = (await first.call('POST', '/api/meetings/live', {})).body;
  await first.call('POST', `/api/meetings/${m.id}/chunk?seq=0`, tone(1), 'audio/wav');
  await first.close();
  const second = await startApp(t, () => [], first.dataDir);
  const r = await second.call('POST', `/api/meetings/${m.id}/chunk?seq=1`, tone(1), 'audio/wav');
  assert.equal(r.status, 409); // interrupted: 녹음 중이 아님
  assert.equal(parseWav((await second.call('GET', `/api/meetings/${m.id}/audio`)).body).seconds, 1);
});

test('같은 조각이 동시에 두 번 와도 한 번만 붙이고 받아 적는다', async (t) => {
  const { services, fake } = await startApp(t, () => [{ start: 0, end: 0.5, text: '동시' }]);
  const m = services.liveMeetings.start('동시 회의');
  const wav = tone(1);
  const [a, b] = await Promise.all([services.liveMeetings.append(m.id, wav, { seq: 0 }), services.liveMeetings.append(m.id, wav, { seq: 0 })]);
  assert.deepEqual([a.duplicate ?? false, b.duplicate ?? false].sort(), [false, true]);
  assert.equal(services.liveMeetings.lengthMs(m.id), 1000);
  assert.equal(fake.calls(), 1);
  assert.equal((await services.liveMeetings.stop(m.id)).segments.length, 1);
});
