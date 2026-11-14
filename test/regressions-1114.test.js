// 2026-11-14 경계 상황 결함 재현 검사(D1~D6). 127.0.0.1 가짜 공급자·가짜 스피커만 쓴다(소리·외부 전송 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { openDb } from '../src/store/db.js';
import { MissionControl } from '../src/mission/missions.js';
import { MeetingStore } from '../src/meeting/meetings.js';
import { tempDbPath } from './helpers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const FAKE_KEY = `sk-${'a1B2'.repeat(8)}`;

async function start(t) {
  const spoken = [];
  const speaker = {
    speak(text) {
      spoken.push(text);
      let finish;
      const done = new Promise((r) => { const h = setTimeout(r, 200); finish = () => { clearTimeout(h); r({ killed: true }); }; });
      return { done, kill: () => finish() };
    },
  };
  const providers = new ProviderRegistry({ mock: createMockProvider('mock', { chunks: ['첫 문장. ', '둘째 문장. ', '셋째 문장. ', '넷째.'], delayMs: 40 }) });
  const dataDir = dirname(tempDbPath());
  const services = createServices({ dataDir, providers, speaker });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, raw) => new Promise((resolve) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; });
      rs.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* 본문 없음 */ } resolve({ status: rs.statusCode, json }); });
    });
    rq.on('error', (e) => resolve({ status: 'ERR', error: e.code }));
    if (raw !== undefined) rq.write(raw);
    rq.end();
  });
  const fileHas = (s) => ['jarvis.db', 'jarvis.db-wal'].map((f) => join(dataDir, f)).some((p) => existsSync(p) && readFileSync(p).includes(Buffer.from(s)));
  return { call, services, spoken, fileHas };
}

test('D1 본문이 객체가 아니면(null·숫자·배열·문자열) 400 invalid_input, 아무것도 만들지 않음', async (t) => {
  const { call, services } = await start(t);
  const routes = [['POST', '/api/memories'], ['POST', '/api/characters'], ['POST', '/api/quick/echo'], ['POST', '/api/missions/1/approve'], ['PUT', '/api/voice'], ['POST', '/api/chat']];
  for (const [method, path] of routes) {
    for (const raw of ['null', '5', '[]', '"글"']) {
      const r = await call(method, path, raw);
      assert.equal(r.status, 400, `${method} ${path} ${raw}`);
      assert.equal(r.json.error.code, 'invalid_input', `${method} ${path} ${raw}`);
    }
  }
  assert.equal(services.missions.list().length, 0);
  assert.equal(services.memory.list().length, 0);
});

test('D2 빠른 작업·작업 내용에 비밀 키 형태가 있으면 작업을 만들지 않고 기록에도 남기지 않음', async (t) => {
  const { call, services, fileHas } = await start(t);
  const r = await call('POST', '/api/quick/echo', JSON.stringify({ params: { text: `내 키 ${FAKE_KEY}` } }));
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'rejected_secret');
  assert.equal(services.missions.list().length, 0);
  assert.equal(fileHas(FAKE_KEY), false);
  const ok = services.quick.request('echo', { text: '평범한 글' });
  assert.throws(() => services.missions.update(ok.id, { content: { text: FAKE_KEY } }), { code: 'rejected_secret' });
  assert.throws(() => services.missions.update(ok.id, { target: `token=${'Ab1'.repeat(6)}` }), { code: 'rejected_secret' });
  assert.equal(services.missions.get(ok.id).content.text, '평범한 글');
});

test('D3 캐릭터를 고친 뒤 옛 말투·자산 원문이 DB·WAL 파일에 남지 않음', async (t) => {
  const { call, fileHas } = await start(t);
  const c = (await call('POST', '/api/characters', JSON.stringify({ name: '이름OLDNAME3', persona: '옛말투 OLDPERSONA3', assets: [{ name: 'OLDASSET3', source: 's', license: 'l' }] }))).json;
  await call('PUT', `/api/characters/${c.id}`, JSON.stringify({ name: '새 이름', persona: '새 말투', assets: [] }));
  for (const s of ['OLDNAME3', 'OLDPERSONA3', 'OLDASSET3']) assert.equal(fileHas(s), false, s);
});

test('D4 말 멈추기로 끊긴 대화는 옛 답 글을 돌려주지 않음', async (t) => {
  const { call, spoken } = await start(t);
  await call('PUT', '/api/voice', JSON.stringify({ enabled: true }));
  const chat = call('POST', '/api/chat', JSON.stringify({ provider: 'mock', question: '안녕' }));
  while (!spoken.length) await tick();
  await call('POST', '/api/voice/stop');
  const r = await chat;
  assert.equal(r.status, 200);
  assert.equal(r.json.reply.finishReason, 'interrupted');
  assert.equal(r.json.reply.text, '');
  assert.equal(r.json.reply.discarded, true);
});

test('D4 새 질문으로 끊긴 첫 질문도 옛 답 글을 돌려주지 않고, 새 답만 온전함', async (t) => {
  const { call } = await start(t);
  await call('PUT', '/api/voice', JSON.stringify({ enabled: true }));
  const first = call('POST', '/api/chat', JSON.stringify({ provider: 'mock', question: '첫 질문' }));
  await tick(60);
  const second = call('POST', '/api/chat', JSON.stringify({ provider: 'mock', question: '둘째 질문' }));
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.json.reply.finishReason, 'interrupted');
  assert.equal(a.json.reply.text, '');
  assert.equal(b.json.reply.finishReason, 'stop');
  assert.equal(b.json.reply.text, '첫 문장. 둘째 문장. 셋째 문장. 넷째.');
  await call('POST', '/api/voice/stop');
});

test('D5 1MB 넘는 요청은 연결을 끊지 않고 413 오류로 알림, 서버는 계속 동작', async (t) => {
  const { call, services } = await start(t);
  const r = await call('POST', '/api/memories', JSON.stringify({ content: 'x'.repeat(1_100_000) }));
  assert.equal(r.status, 413);
  assert.equal(r.json.error.code, 'payload_too_large');
  assert.equal(services.memory.list().length, 0);
  assert.equal((await call('GET', '/api/memories')).status, 200);
});

test('D6 회의 녹취 시간·길이는 안전한 정수만 받음', (t) => {
  const path = tempDbPath();
  const db = openDb(path);
  t.after(() => db.close());
  const meetings = new MeetingStore(db, { audioDir: join(dirname(path), 'meetings') });
  const m = meetings.start('회의');
  for (const bad of [1e300, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    assert.throws(() => meetings.addSegment(m.id, { startMs: 0, endMs: bad, text: 'x' }), { code: 'invalid_input' }, String(bad));
  }
  assert.throws(() => meetings.stop(m.id, 1e300), { code: 'invalid_input' });
  assert.equal(meetings.segments(m.id).length, 0);
  assert.equal(meetings.stop(m.id, 5000).meeting.duration_ms, 5000);
});

test('D2 MissionControl 직접 생성에도 비밀 거부가 적용됨', (t) => {
  const db = openDb(tempDbPath());
  t.after(() => db.close());
  const mc = new MissionControl(db);
  assert.throws(() => mc.create({ kind: 'mock.echo', title: 't', target: 'local:mock', impact: '없음', content: { nested: [{ k: FAKE_KEY }] } }), { code: 'rejected_secret' });
  assert.throws(() => mc.create({ kind: 'mock.echo', title: `api_key=${'z9'.repeat(6)}`, target: 'local:mock', impact: '없음' }), { code: 'rejected_secret' });
  assert.equal(mc.list().length, 0);
});
