// 캐릭터 얼굴(T155 잠정안, FR-003a, T249~T251) 검사. 소리를 내지 않는 가짜 스피커만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { avatarState, mouthAt, renderAvatar, normalizeLook, DEFAULT_LOOK } from '../src/server/public/avatar.js';
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
