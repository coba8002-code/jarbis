// 화면 대화 ↔ 음성 출력 연결 검사. 가짜 스피커만 쓴다(소리 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function fakeSpeaker(ms = 20) {
  const log = [];
  return {
    log,
    spoken: () => log.filter((x) => x.op === 'done').map((x) => x.text),
    speak(text) {
      log.push({ op: 'start', text });
      let finish;
      const done = new Promise((resolve) => {
        const h = setTimeout(() => { log.push({ op: 'done', text }); resolve(); }, ms);
        finish = () => { clearTimeout(h); log.push({ op: 'killed', text }); resolve(); };
      });
      return { done, kill: () => finish() };
    },
  };
}

async function start(t, { chunks = ['첫 문장. ', '둘째 문장. ', '끝.'], delayMs = 5, speakMs } = {}) {
  const speaker = fakeSpeaker(speakMs);
  const providers = new ProviderRegistry({
    mock: createMockProvider('mock', { chunks, delayMs }),
    bad: createMockProvider('bad', { failWith: 'unavailable', failAfter: 0 }),
  });
  const services = createServices({ dataDir: dirname(tempDbPath()), providers, speaker });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, body) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = '';
      rs.on('data', (c) => { text += c; });
      rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject);
    rq.end(body ? JSON.stringify(body) : undefined);
  });
  return { call, speaker, services };
}

const ask = (call, question = '안녕') => call('POST', '/api/chat', { provider: 'mock', question });

test('기본은 소리 끔: 대화해도 스피커를 쓰지 않는다', async (t) => {
  const { call, speaker } = await start(t);
  assert.deepEqual((await call('GET', '/api/voice')).json, { enabled: false, state: 'idle', character: null, lastError: null });
  const r = (await ask(call)).json;
  assert.equal(r.status, 'sent');
  assert.equal(r.spoken, false);
  assert.equal(r.reply.text, '첫 문장. 둘째 문장. 끝.');
  await tick(50);
  assert.equal(speaker.log.length, 0);
});

test('소리 켜면 답을 문장 단위로 읽고 다 읽으면 대기로 돌아간다', async (t) => {
  const { call, speaker, services } = await start(t);
  assert.equal((await call('PUT', '/api/voice', { enabled: true })).json.enabled, true);
  const r = (await ask(call)).json;
  assert.equal(r.spoken, true);
  assert.equal(r.reply.text, '첫 문장. 둘째 문장. 끝.');
  while (services.voice.turns.state !== 'idle') await tick();
  assert.deepEqual(speaker.spoken(), ['첫 문장.', '둘째 문장.', '끝.']);
});

test('말 멈추기: 읽던 문장을 끊고 남은 문장은 읽지 않는다', async (t) => {
  const { call, speaker } = await start(t, { speakMs: 40 });
  await call('PUT', '/api/voice', { enabled: true });
  await ask(call);
  while (!speaker.log.length) await tick(1);
  const stop = (await call('POST', '/api/voice/stop')).json;
  assert.ok(stop.stopped);
  assert.equal(stop.state, 'idle');
  await tick(150);
  assert.deepEqual(speaker.log.map((x) => x.op), ['start', 'killed']);
  assert.equal((await call('POST', '/api/voice/stop')).json.stopped, null);
});

test('읽는 중 새 질문을 하면 옛 답 읽기를 끊는다', async (t) => {
  // 한 문장을 150ms 동안 읽게 해서 새 질문이 도착할 때 첫 문장이 아직 읽히는 중이 되게 한다.
  const { call, speaker, services } = await start(t, { speakMs: 150 });
  await call('PUT', '/api/voice', { enabled: true });
  await ask(call, '첫 질문');
  while (!speaker.log.length) await tick(1);
  await ask(call, '둘째 질문');
  while (services.voice.turns.state !== 'idle') await tick();
  assert.deepEqual(speaker.log.slice(0, 2).map((x) => x.op), ['start', 'killed']);
  // 끊긴 뒤에는 새 답의 세 문장만 읽는다(옛 답의 남은 두 문장은 읽지 않음).
  assert.equal(speaker.log.filter((x) => x.op === 'start').length, 4);
  assert.deepEqual(speaker.spoken(), ['첫 문장.', '둘째 문장.', '끝.']);
});

test('소리를 끄면 읽던 것을 멈춘다', async (t) => {
  const { call, speaker } = await start(t, { speakMs: 40 });
  await call('PUT', '/api/voice', { enabled: true });
  await ask(call);
  while (!speaker.log.length) await tick(1);
  const off = (await call('PUT', '/api/voice', { enabled: false })).json;
  assert.equal(off.enabled, false);
  await tick(150);
  assert.deepEqual(speaker.log.map((x) => x.op), ['start', 'killed']);
});

test('소리 켠 상태의 공급자 오류는 502로 알리고 대기로 돌아간다', async (t) => {
  const { call, services } = await start(t);
  await call('PUT', '/api/voice', { enabled: true });
  const r = await call('POST', '/api/chat', { provider: 'bad', question: 'q' });
  assert.equal(r.status, 502);
  assert.equal(r.json.error.code, 'unavailable');
  assert.equal(services.voice.turns.state, 'idle');
});

test('잘못된 설정 값은 거부', async (t) => {
  const { call } = await start(t);
  assert.equal((await call('PUT', '/api/voice', { enabled: 'yes' })).status, 400);
});

test('지원하지 않는 OS의 음성 오류는 상태에 남고 대화는 계속된다', async (t) => {
  const failing = { speak: () => ({ done: Promise.reject(Object.assign(new Error('지원 안 함'), { code: 'tts_unavailable' })), kill() {} }) };
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ mock: createMockProvider('mock', { chunks: ['한 문장.'] }) }), speaker: failing });
  t.after(() => services.close());
  services.voice.enabled = true;
  const r = await services.chat.ask({ provider: 'mock', question: 'q', speak: true });
  assert.equal(r.reply.text, '한 문장.');
  while (services.voice.turns.state !== 'idle') await tick();
  assert.equal(services.voice.status().lastError.code, 'tts_unavailable');
});
