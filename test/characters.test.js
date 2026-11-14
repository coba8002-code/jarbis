// 캐릭터 설정 검사 (US4 기기 없는 부분). 가짜 스피커·가짜 공급자만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { request as httpRequest } from 'node:http';
import { openDb } from '../src/store/db.js';
import { Settings } from '../src/store/settings.js';
import { CharacterStore } from '../src/character/characters.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function store(t, path = tempDbPath()) {
  const db = openDb(path);
  t.after(() => { try { db.close(); } catch { /* 이미 닫힘 */ } });
  return { db, path, chars: new CharacterStore(db, new Settings(db)) };
}

const base = { name: '자비', persona: '차분하고 짧게 존댓말로 말함', voice: 'Microsoft Heami Desktop' };

test('캐릭터 만들기·조회·수정·삭제', (t) => {
  const { chars } = store(t);
  const c = chars.create({ ...base, assets: [{ name: '얼굴 그림', source: '직접 그림', license: '개인 사용' }] });
  assert.equal(c.name, '자비');
  assert.equal(c.assets[0].license, '개인 사용');
  assert.equal(chars.update(c.id, { persona: '밝고 친근함' }).persona, '밝고 친근함');
  assert.equal(chars.update(c.id, { voice: '' }).voice, null);
  assert.equal(chars.list().length, 1);
  assert.deepEqual(chars.delete(c.id), { id: c.id, deleted: true });
  assert.throws(() => chars.get(c.id), { code: 'not_found' });
});

test('자산은 출처와 이용 조건이 없으면 저장하지 않는다', (t) => {
  const { chars } = store(t);
  assert.throws(() => chars.create({ ...base, assets: [{ name: '그림', source: '인터넷' }] }), (e) => e.code === 'invalid_input' && /이용 조건/.test(e.message));
  assert.throws(() => chars.create({ ...base, assets: [{ name: '그림', license: '무료' }] }), (e) => e.code === 'invalid_input' && /출처/.test(e.message));
  assert.throws(() => chars.create({ ...base, assets: 'x' }), { code: 'invalid_input' });
  assert.equal(chars.list().length, 0);
});

test('빈 값·너무 긴 값·비밀 형태는 거부', (t) => {
  const { chars } = store(t);
  assert.throws(() => chars.create({ ...base, name: ' ' }), { code: 'invalid_input' });
  assert.throws(() => chars.create({ ...base, name: '가'.repeat(51) }), { code: 'invalid_input' });
  assert.throws(() => chars.create({ ...base, persona: `키는 sk-${'a1B2'.repeat(8)}` }), { code: 'rejected_secret' });
});

test('적용한 캐릭터는 재시작 후에도 유지되고, 지우면 적용이 풀린다', (t) => {
  const first = store(t);
  const a = first.chars.create(base);
  const b = first.chars.create({ ...base, name: '둘째' });
  assert.equal(first.chars.setActive(b.id).id, b.id);
  first.db.close();
  const second = store(t, first.path);
  assert.equal(second.chars.active().id, b.id);
  assert.deepEqual(second.chars.list().map((c) => c.active), [false, true]);
  second.chars.delete(b.id);
  assert.equal(second.chars.active(), null);
  assert.throws(() => second.chars.setActive(999), { code: 'not_found' });
  assert.equal(second.chars.setActive(a.id).name, '자비');
  assert.equal(second.chars.setActive(null), null);
});

function spyProvider(name, remote) {
  const sent = [];
  return {
    sent,
    provider: {
      name,
      describe: () => ({ name, baseUrl: remote ? 'https://cloud.example' : 'http://127.0.0.1:1', model: 'm', remote }),
      async *stream(req) { sent.push(req); yield { type: 'delta', text: '답. ' }; yield { type: 'done', finishReason: 'stop' }; },
    },
  };
}

function servicesWith(t, extra = {}) {
  const local = spyProvider('local', false);
  const cloud = spyProvider('cloud', true);
  const voicesUsed = [];
  const speakerFactory = (voice) => ({
    speak(text) { voicesUsed.push({ voice, text }); return { done: Promise.resolve({ killed: false }), kill() {} }; },
    listVoices: async () => [{ name: 'Microsoft Heami Desktop', culture: 'ko-KR' }],
  });
  const dataDir = extra.dataDir ?? dirname(tempDbPath());
  const services = createServices({ dataDir, providers: new ProviderRegistry({ local: local.provider, cloud: cloud.provider }), speakerFactory });
  t.after(() => { try { services.close(); } catch { /* 이미 닫힘 */ } });
  return { services, local, cloud, voicesUsed, dataDir };
}

test('적용한 캐릭터의 말투가 대화 첫 시스템 메시지로 들어간다', async (t) => {
  const { services, local } = servicesWith(t);
  await services.chat.ask({ provider: 'local', question: '안녕' });
  assert.deepEqual(local.sent[0].messages, [{ role: 'user', content: '안녕' }]);
  const c = services.characters.create(base);
  services.characters.setActive(c.id);
  const m = services.memory.add('아메리카노를 좋아함');
  await services.chat.ask({ provider: 'local', question: '추천해 줘', memoryIds: [m.id] });
  const msgs = local.sent[1].messages;
  assert.match(msgs[0].content, /"자비"/);
  assert.match(msgs[0].content, /차분하고 짧게/);
  assert.match(msgs[1].content, /아메리카노/);
  assert.equal(msgs[2].content, '추천해 줘');
});

test('외부 전송 미션에도 승인 당시 캐릭터가 담기고, 승인한 내용 그대로 보낸다', async (t) => {
  const { services, cloud } = servicesWith(t);
  const c = services.characters.create(base);
  services.characters.setActive(c.id);
  const m = services.memory.add('기억');
  const r = await services.chat.ask({ provider: 'cloud', question: 'q', memoryIds: [m.id] });
  assert.equal(r.status, 'approval_required');
  assert.deepEqual(r.mission.content.character, { name: '자비', persona: base.persona });
  services.characters.update(c.id, { persona: '바뀐 말투' });
  services.missions.approve(r.mission.id, r.mission.content_version);
  await services.missions.execute(r.mission.id);
  assert.deepEqual(cloud.sent[0], r.preview.request);
  assert.match(cloud.sent[0].messages[0].content, /차분하고 짧게/);
});

test('소리로 읽을 때 적용한 캐릭터의 목소리를 쓴다', async (t) => {
  const { services, voicesUsed } = servicesWith(t);
  services.voice.enabled = true;
  await services.chat.ask({ provider: 'local', question: 'q', speak: true });
  while (services.voice.turns.state !== 'idle') await tick();
  const c = services.characters.create(base);
  services.characters.setActive(c.id);
  await services.chat.ask({ provider: 'local', question: 'q', speak: true });
  while (services.voice.turns.state !== 'idle') await tick();
  assert.deepEqual(voicesUsed.map((v) => v.voice), [null, 'Microsoft Heami Desktop']);
  assert.equal(services.voice.status().character.name, '자비');
});

test('미리 듣기는 그 캐릭터의 목소리로 한 문장을 말한다', async (t) => {
  const { services, voicesUsed } = servicesWith(t);
  const c = services.characters.create({ ...base, voice: 'Microsoft Zira Desktop' });
  const r = await services.voice.preview(c.id);
  assert.equal(r.voice, 'Microsoft Zira Desktop');
  assert.deepEqual(voicesUsed, [{ voice: 'Microsoft Zira Desktop', text: r.text }]);
  await assert.rejects(services.voice.preview(999), { code: 'not_found' });
});

test('소리 읽기 설정과 적용 캐릭터는 앱을 다시 켜도 유지된다', async (t) => {
  const first = servicesWith(t);
  first.services.voice.enabled = true;
  const c = first.services.characters.create(base);
  first.services.characters.setActive(c.id);
  first.services.close();
  const second = servicesWith(t, { dataDir: first.dataDir });
  assert.equal(second.services.voice.enabled, true);
  assert.equal(second.services.voice.status().character.id, c.id);
});

test('화면 API: 캐릭터 만들기·적용·목소리 목록·미리 듣기·삭제', async (t) => {
  const { services, voicesUsed } = servicesWith(t);
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(() => app.close());
  const call = (method, path, body) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (d) => { text += d; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject);
    rq.end(body ? JSON.stringify(body) : undefined);
  });
  assert.deepEqual((await call('GET', '/api/voices')).json, [{ name: 'Microsoft Heami Desktop', culture: 'ko-KR' }]);
  const c = (await call('POST', '/api/characters', base)).json;
  assert.equal((await call('POST', '/api/characters', { ...base, assets: [{ name: 'x' }] })).status, 400);
  assert.equal((await call('POST', `/api/characters/${c.id}/activate`)).json.id, c.id);
  assert.equal((await call('GET', '/api/voice')).json.character.name, '자비');
  assert.equal((await call('POST', `/api/characters/${c.id}/preview`)).json.voice, base.voice);
  assert.equal(voicesUsed.length, 1);
  assert.equal((await call('PUT', `/api/characters/${c.id}`, { name: '새 이름' })).json.name, '새 이름');
  assert.deepEqual((await call('POST', '/api/characters/deactivate')).json, { active: null });
  assert.equal((await call('DELETE', `/api/characters/${c.id}`)).json.deleted, true);
  assert.equal((await call('GET', '/api/characters')).json.length, 0);
});
