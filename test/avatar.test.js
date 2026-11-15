// 캐릭터 얼굴(T155 잠정안, FR-003a, T249~T251) 검사. 소리를 내지 않는 가짜 스피커만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { avatarState, mouthAt, renderAvatar, normalizeLook, DEFAULT_LOOK, levelMouth, syllableMouth, wordMouth, mouthAmount, wavEnvelope, envelopeAt, createLevelMeter, createBlinker } from '../src/server/public/avatar.js';
import { openDb } from '../src/store/db.js';
import { Settings } from '../src/store/settings.js';
import { CharacterStore } from '../src/character/characters.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('상태 판단: 녹음 중=듣기, 말하는 중=말하기, 답 기다림·생성 중=생각, 그 밖=대기', () => {
  assert.equal(avatarState({}), 'idle');
  assert.equal(avatarState({ voiceState: 'idle' }), 'idle');
  assert.equal(avatarState({ voiceState: 'listening' }), 'listening');
  assert.equal(avatarState({ voiceState: 'thinking' }), 'thinking');
  assert.equal(avatarState({ chatPending: true }), 'thinking');
  assert.equal(avatarState({ voiceState: 'speaking', chatPending: true }), 'speaking');
  assert.equal(avatarState({ voiceState: 'speaking', recording: true }), 'listening'); // 끼어들어 말하는 중이면 듣기
  assert.equal(avatarState({ voiceState: '이상한 값' }), 'idle');
});

test('입 박자: 말할 때만 일정한 간격으로 열고 닫는다, 움직임 줄이기면 멈춘다', () => {
  const seq = [0, 150, 300, 450, 600].map((t) => mouthAt('speaking', t, { intervalMs: 150 }));
  assert.deepEqual(seq, ['open', 'closed', 'open', 'closed', 'open']);
  for (const s of ['idle', 'listening', 'thinking']) assert.equal(mouthAt(s, 0), 'closed');
  assert.deepEqual([0, 150, 300].map((t) => mouthAt('speaking', t, { reducedMotion: true })), ['half', 'half', 'half']);
});

test('그리기: 모양·색·눈·상태가 SVG에 반영되고, 잘못된 값은 기본 얼굴로', () => {
  const svg = renderAvatar({ shape: 'drop', color: '#16A34A', eyes: 'line' }, 'speaking', { mouth: 'open', name: '자비' });
  assert.match(svg, /^<svg [^>]*data-state="speaking" data-shape="drop" data-eyes="line"/);
  assert.match(svg, /fill="#16a34a"/);
  assert.match(svg, /data-mouth="open"/);
  assert.match(svg, /<title>자비 · 말하는 중<\/title>/);
  assert.match(renderAvatar(DEFAULT_LOOK, 'thinking'), /data-state="thinking"/);
  assert.match(renderAvatar(DEFAULT_LOOK, 'listening'), /<title>듣는 중<\/title>/);
  // 색 칸에 글을 넣거나 이름에 꺾쇠를 넣어도 SVG가 깨지거나 스크립트가 들어가지 않는다
  const bad = renderAvatar({ shape: 'star', color: '"/><script>x</script>', eyes: 'x' }, 'nope', { name: '<b>이름</b>' });
  assert.equal(bad.includes('<script'), false);
  assert.equal(bad.includes('<b>'), false);
  assert.match(bad, /data-state="idle" data-shape="circle" data-eyes="round"/);
  assert.deepEqual(normalizeLook(undefined), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ shape: 'rounded', color: '#ABCDEF', eyes: 'dot' }), { shape: 'rounded', color: '#abcdef', eyes: 'dot' });
});

function chars(t, path = tempDbPath()) {
  const db = openDb(path);
  t.after(() => { try { db.close(); } catch { /* 닫힘 */ } });
  return { db, path, store: new CharacterStore(db, new Settings(db)) };
}

test('캐릭터 얼굴 저장·수정·검사, 없으면 기본 얼굴', (t) => {
  const { store } = chars(t);
  const plain = store.create({ name: '기본', persona: '차분' });
  assert.deepEqual(plain.look, DEFAULT_LOOK);
  const c = store.create({ name: '초록', persona: '밝게', look: { shape: 'rounded', color: '#16A34A', eyes: 'dot' } });
  assert.deepEqual(c.look, { shape: 'rounded', color: '#16a34a', eyes: 'dot' });
  assert.deepEqual(store.update(c.id, { look: { shape: 'drop', color: '#9333ea', eyes: 'line' } }).look, { shape: 'drop', color: '#9333ea', eyes: 'line' });
  assert.deepEqual(store.update(c.id, { name: '초록2' }).look.shape, 'drop'); // 얼굴을 안 보내면 그대로
  for (const look of [{ shape: 'star', color: '#000000', eyes: 'dot' }, { shape: 'drop', color: 'red', eyes: 'dot' }, { shape: 'drop', color: '#000000', eyes: 'x' }, [], 'circle']) {
    assert.throws(() => store.create({ name: 'x', persona: 'y', look }), { code: 'invalid_input' }, JSON.stringify(look));
  }
  assert.deepEqual(store.update(c.id, { look: null }).look, DEFAULT_LOOK); // null이면 기본 얼굴로
});

test('옛 DB(얼굴 열 없음)를 열면 열을 더하고 기존 캐릭터는 기본 얼굴로 보인다', (t) => {
  const path = tempDbPath();
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE characters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, persona TEXT NOT NULL, voice TEXT,
    assets TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  old.prepare("INSERT INTO characters (name, persona, created_at, updated_at) VALUES ('옛 캐릭터', '옛 말투', 'x', 'x')").run();
  old.close();
  const { store, db } = chars(t, path);
  assert.ok(db.prepare('PRAGMA table_info(characters)').all().some((c) => c.name === 'look'));
  const c = store.list()[0];
  assert.equal(c.name, '옛 캐릭터');
  assert.deepEqual(c.look, DEFAULT_LOOK);
  // 두 번 열어도 열을 또 더하지 않는다
  db.close();
  assert.doesNotThrow(() => openDb(path).close());
});

async function app(t, dataDir, speaker) {
  const providers = new ProviderRegistry({ mock: createMockProvider('mock', { chunks: ['첫 문장입니다. ', '둘째 문장입니다.'], delayMs: 1 }) });
  const services = createServices({ dataDir, providers, speaker: speaker ?? { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  const a = createAppServer(services);
  const { port } = await a.listen(0);
  let closed = false;
  const close = async () => { if (closed) return; closed = true; services.voice.turns.cancel(); await a.close(); services.close(); };
  t.after(close);
  const json = async (path, method = 'GET', body) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'x-jarvis-token': a.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
  };
  return { services, json, close, port };
}

test('API: 얼굴 저장 → 적용 → 대화 상태에 얼굴 → 다시 켜도 복원, 얼굴 스크립트는 토큰 없이 받음', async (t) => {
  const dataDir = dirname(tempDbPath());
  const first = await app(t, dataDir);
  const c = (await first.json('/api/characters', 'POST', { name: '파랑', persona: '짧게', look: { shape: 'rounded', color: '#0891B2', eyes: 'line' } })).json;
  assert.equal((await first.json('/api/characters', 'POST', { name: 'x', persona: 'y', look: { shape: 'cat', color: '#000000', eyes: 'dot' } })).status, 400);
  await first.json(`/api/characters/${c.id}/activate`, 'POST');
  assert.deepEqual((await first.json('/api/voice')).json.character.look, { shape: 'rounded', color: '#0891b2', eyes: 'line' });
  const js = await fetch(`http://127.0.0.1:${first.port}/static/avatar.js`);
  assert.equal(js.status, 200);
  assert.match(await js.text(), /export function renderAvatar/);
  await first.close();
  const second = await app(t, dataDir);
  const v = (await second.json('/api/voice')).json;
  assert.equal(v.character.name, '파랑');
  assert.deepEqual(v.character.look, { shape: 'rounded', color: '#0891b2', eyes: 'line' });
});

test('상태 흐름: 답 생성 → 말하기 → 멈추기면 대기, 재생이 끝나도 대기(소리 없는 가짜 스피커)', async (t) => {
  const handles = [];
  const speaker = { speak: (text) => { let end; const done = new Promise((r) => { end = r; }); handles.push({ text, end }); return { done, kill: () => end({ killed: true }) }; } };
  const { json } = await app(t, dirname(tempDbPath()), speaker);
  await json('/api/voice', 'PUT', { enabled: true });
  const face = async () => avatarState({ voiceState: (await json('/api/voice')).json.state });
  // 1) 말하는 중 → 멈추기 → 대기
  json('/api/chat', 'POST', { provider: 'mock', question: '안녕' });
  for (let i = 0; i < 400 && (await face()) !== 'speaking'; i += 1) await tick();
  assert.equal(await face(), 'speaking');
  const stop = (await json('/api/voice/stop', 'POST')).json;
  assert.equal(avatarState({ voiceState: stop.state }), 'idle');
  assert.equal(await face(), 'idle');
  // 2) 다시 말하기 → 문장 재생이 모두 끝나면 대기
  handles.length = 0;
  json('/api/chat', 'POST', { provider: 'mock', question: '또' });
  for (let i = 0; i < 400 && (await face()) !== 'speaking'; i += 1) await tick();
  assert.equal(await face(), 'speaking');
  for (let i = 0; i < 400 && (await face()) === 'speaking'; i += 1) { handles.forEach((h) => h.end()); await tick(); }
  assert.equal(await face(), 'idle');
});

// ---------- 립싱크·눈 깜빡임(2026-11-15) ----------
function wav16(samples, rate = 16000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((x, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([h, data]));
}

test('립싱크: 소리 크기 → 입 모양(작으면 다묾, 중간 반쯤, 크면 크게), 이상한 값은 다묾', () => {
  assert.equal(levelMouth(0), 'closed');
  assert.equal(levelMouth(0.4), 'half');
  assert.equal(levelMouth(0.9), 'open');
  assert.equal(levelMouth(NaN), 'closed');
  assert.deepEqual(['open', 'half', 'closed'].map(mouthAmount), [1, 0.5, 0]);
});

test('립싱크: WAV 소리 크기 표 — 조용한 구간은 다묾, 큰 구간은 크게, 모르는 형식은 null', () => {
  const rate = 16000; const s = [];
  for (let i = 0; i < rate * 0.2; i += 1) s.push(0); // 0.2초 조용
  for (let i = 0; i < rate * 0.2; i += 1) s.push(0.5 * Math.sin(i / 5)); // 0.2초 큰 소리
  for (let i = 0; i < rate * 0.2; i += 1) s.push(0.12 * Math.sin(i / 5)); // 0.2초 작은 소리
  const env = wavEnvelope(wav16(s, rate), 20);
  assert.equal(env.frameMs, 20);
  assert.equal(env.levels.length, 30);
  assert.equal(levelMouth(envelopeAt(env, 100)), 'closed');
  assert.equal(levelMouth(envelopeAt(env, 300)), 'open');
  assert.equal(levelMouth(envelopeAt(env, 500)), 'closed'); // 큰 소리의 1/4 → 다묾 쪽
  assert.equal(envelopeAt(env, 99999), 0); // 끝난 뒤
  assert.equal(wavEnvelope(new Uint8Array(10)), null);
  assert.equal(wavEnvelope(new TextEncoder().encode('RIFF....WAVEnot a real wav file at all, just text here')), null);
  const odd = wav16([0.1, 0.2]); odd[34] = 8; // 8비트는 지원 안 함
  assert.equal(wavEnvelope(odd), null);
});

test('립싱크: 소리 크기를 모를 때 말소리 박자(세 모양을 모두 쓰고 매번 같은 결과), 단어 알림 뒤에는 단어 길이만큼만 움직인다', () => {
  const seen = new Set(); for (let t = 0; t < 1500; t += 10) seen.add(syllableMouth(t));
  assert.deepEqual([...seen].sort(), ['closed', 'half', 'open']);
  assert.equal(syllableMouth(0), 'open');
  assert.equal(syllableMouth(-5), 'closed');
  assert.equal(syllableMouth(1234), syllableMouth(1234));
  assert.equal(wordMouth(0, 3), 'open');
  assert.equal(wordMouth(3 * 140 + 1, 3), 'closed'); // 세 글자 단어는 0.42초 뒤 다묾
  assert.equal(wordMouth(5000, 50), 'closed'); // 아주 긴 단어도 1.2초까지만
});

test('마이크 크기: 작게 말해도 0~1로 맞추고, 조용하면 0', () => {
  const m = createLevelMeter();
  for (let i = 0; i < 60; i += 1) m.push(0.03); // 3초쯤 말하면
  assert.ok(m.level() > 0.9, String(m.level()));
  for (let i = 0; i < 30; i += 1) m.push(0);
  assert.equal(m.level(), 0);
  assert.equal(m.push(NaN), 0);
});

test('눈 깜빡임: 정해진 간격 뒤 0.15초만 감고, 가끔 두 번 연달아', () => {
  const b = createBlinker({ rand: () => 0.5 }); // 간격 4250ms, 두 번 연달아 안 함(0.5 ≥ 0.2)
  assert.equal(b.at(0), false);
  assert.equal(b.at(4249), false);
  assert.equal(b.at(4250), true);
  assert.equal(b.at(4399), true);
  assert.equal(b.at(4400), false);
  assert.equal(b.at(8499), false);
  assert.equal(b.at(8500), true);
  let r = [0, 0.1, 0.9]; // 첫 간격 2500 → 두 번 연달아(0.1) → 다음 간격
  const d = createBlinker({ rand: () => r.shift() ?? 0.5 });
  assert.equal(d.at(0), false);
  assert.equal(d.at(2500), true);
  assert.equal(d.at(2650), false);
  assert.equal(d.at(2770), true); // 0.12초 쉬고 한 번 더
});

test('도형 얼굴: 눈 감기(blink)면 눈이 곡선, 잘못된 입 값은 다묾', () => {
  const svg = renderAvatar(DEFAULT_LOOK, 'idle', { blink: true });
  assert.equal((svg.match(/data-eye="closed"/g) ?? []).length, 2);
  assert.ok(!renderAvatar(DEFAULT_LOOK, 'idle').includes('data-eye="closed"'));
  assert.ok(renderAvatar(DEFAULT_LOOK, 'speaking', { mouth: '<x>' }).includes('data-mouth="closed"'));
});
